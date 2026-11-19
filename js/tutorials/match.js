// Pure matching, counting and ordering for the tutorial listing.
// No DOM access, no imports: importable from `node --test`.

export const FACETS = ['beast', 'workflow', 'domain', 'package'];

// '2.7' -> 2007, so 2.10 sorts above 2.7. Missing or unparsable -> -1.
export function versionKey(version) {
  const m = /^(\d+)(?:\.(\d+))?/.exec(version || '');
  if (!m) return -1;
  return Number(m[1]) * 1000 + Number(m[2] || 0);
}

// Lowercase and strip diacritics, so "Muller" or "Pecerska" find the
// names written with an umlaut or caron. ("Mueller" is a different
// spelling and is not folded.) catalogue.js folds the card text the same way.
export function fold(text) {
  return (text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// Fold, collapse whitespace, split into tokens.
export function tokenize(q) {
  return fold(q).trim().split(/\s+/).filter(Boolean);
}

// Key for full-text search and its cache: lowercase, whitespace collapsed,
// diacritics KEPT. Pagefind matches diacritics itself and ranks exact
// spellings first, so folding here would only hurt its ranking.
export function normaliseQuery(q) {
  return (q || '').toLowerCase().trim().split(/\s+/).filter(Boolean).join(' ');
}

// Metadata match score for one item, or -1 when not every token matches.
// item.text = { title, tags, desc, other, all } (all lowercase strings).
export function metaScore(item, tokens) {
  if (!tokens.length) return 0;
  const t = item.text;
  let score = 0;
  for (const tok of tokens) {
    if (!t.all.includes(tok)) return -1;
    if (t.tags.includes(tok)) score += 4;
    else if (t.desc.includes(tok)) score += 2;
    else score += 1;
  }
  if (tokens.every(tok => t.title.includes(tok))) score += 8;
  return score;
}

// Values an item has for a facet ('none' stands for "not specified").
export function facetValues(item, facet) {
  switch (facet) {
    case 'beast': return [item.beastPkg || 'none'];
    case 'workflow': return item.workflow ? [item.workflow] : [];
    case 'domain': return item.domains;
    case 'package': return item.packages;
    default: return [];
  }
}

// OR within a facet, AND across facets. `skipFacet` ignores one facet
// (used for disjunctive counts).
export function matchesFacets(item, state, skipFacet = null) {
  for (const facet of FACETS) {
    if (facet === skipFacet) continue;
    const selected = state[facet];
    if (!selected || selected.size === 0) continue;
    if (!facetValues(item, facet).some(v => selected.has(v))) return false;
  }
  return true;
}

// The sort actually applied: an explicit choice sticks; otherwise relevance
// while there is a query and "recently updated" without one.
export function effectiveSort(state) {
  const hasQuery = tokenize(state.q).length > 0;
  if (state.sortExplicit) {
    if (state.sort === 'relevance' && !hasQuery) return 'updated';
    return state.sort;
  }
  return hasQuery ? 'relevance' : 'updated';
}

function byTitle(a, b) {
  return a.titleSort.localeCompare(b.titleSort);
}

const COMPARATORS = {
  updated: (a, b) => (b.date || '').localeCompare(a.date || '') || byTitle(a, b),
  title: byTitle,
  beast: (a, b) => versionKey(b.beastPkg) - versionKey(a.beastPkg) || byTitle(a, b),
};

// Full-text hits only count while they belong to the current query.
export function currentHits(state) {
  const ft = state.fulltext;
  if (!ft || !ft.hits || ft.q !== normaliseQuery(state.q)) return null;
  return ft.hits;
}

// Compute everything the view needs from the catalogue and the state.
export function derive(items, state, options = {}) {
  const tokens = tokenize(state.q);
  const hits = currentHits(state);
  const info = new Map();

  for (const item of items) {
    const meta = tokens.length ? metaScore(item, tokens) : 0;
    const hit = hits ? hits.get(item.slug) : undefined;
    const textOk = !tokens.length || meta >= 0 || hit !== undefined;
    const inScope = !item.deprecated || state.showDeprecated;
    info.set(item, { meta, hit, textOk, inScope });
  }

  // `visible`: every matching card, current and deprecated. Deprecated cards
  // live in their own collapsed section; they count towards the totals only
  // while that section is open (state.showDeprecated).
  const visible = new Set();
  let total = 0;
  let currentCount = 0;
  let metaCount = 0;
  let textOnlyCount = 0;
  let deprecatedMatches = 0;
  for (const item of items) {
    const i = info.get(item);
    if (!i.textOk || !matchesFacets(item, state)) continue;
    visible.add(item);
    if (item.deprecated) deprecatedMatches++;
    else currentCount++;
    if (!i.inScope) continue;
    total++;
    if (tokens.length) {
      if (i.meta >= 0) metaCount++;
      else textOnlyCount++;
    }
  }
  const deprecatedHidden = state.showDeprecated ? 0 : deprecatedMatches;

  // Disjunctive counts: how many cards an option would show if it were the
  // only selection in its facet, with everything else applied.
  const counts = {};
  const optionSets = options.options || {};
  for (const facet of FACETS) {
    const values = optionSets[facet] || [];
    const c = new Map(values.map(v => [v, 0]));
    for (const item of items) {
      const i = info.get(item);
      if (!i.textOk || !i.inScope || !matchesFacets(item, state, facet)) continue;
      for (const v of facetValues(item, facet)) {
        if (c.has(v)) c.set(v, c.get(v) + 1);
      }
    }
    counts[facet] = c;
  }

  const sort = effectiveSort(state);
  let order;
  if (sort === 'relevance') {
    const rank = item => {
      const h = info.get(item).hit;
      return h ? h.rank : Infinity;
    };
    order = [...items].sort((a, b) => {
      const ia = info.get(a), ib = info.get(b);
      const ma = ia.meta >= 0, mb = ib.meta >= 0;
      if (ma !== mb) return ma ? -1 : 1;
      if (ma && ia.meta !== ib.meta) return ib.meta - ia.meta;
      return rank(a) - rank(b) || byTitle(a, b);
    });
  } else {
    order = [...items].sort(COMPARATORS[sort] || COMPARATORS.updated);
  }

  const excerpts = new Map();
  if (hits) {
    for (const item of visible) {
      const i = info.get(item);
      if (i.hit && i.hit.excerpt) excerpts.set(item, i.hit.excerpt);
    }
  }

  return {
    visible,
    order,
    counts,
    excerpts,
    sort,
    summary: { total, currentCount, metaCount, textOnlyCount, deprecatedMatches, deprecatedHidden },
  };
}
