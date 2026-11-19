// Listing state and its URL form. No DOM access, no imports.
//
// URL scheme (defaults omitted, multiple values comma-joined; repeated
// params are also accepted):
//   q           search text as typed            (legacy alias: search)
//   beast       2.7,2.6,none                     (whitelisted)
//   workflow    display values                   (whitelisted)
//   domain      domain values                    (whitelisted)
//   package     package names, case-insensitive  (whitelisted)
//   deprecated  1                                (legacy alias: legacy=1)
//   sort        updated | title | beast | relevance, only when chosen
//               (legacy: date -> updated, beastversion -> beast)

export const SORTS = ['relevance', 'updated', 'title', 'beast'];
const LEGACY_SORTS = { date: 'updated', beastversion: 'beast' };
const LIST_PARAMS = ['beast', 'workflow', 'domain', 'package'];

export function createState() {
  return {
    q: '',
    beast: new Set(),
    workflow: new Set(),
    domain: new Set(),
    package: new Set(),
    showDeprecated: false,
    sort: 'updated',
    sortExplicit: false,
    fulltext: { q: '', status: 'idle', hits: null },
  };
}

function splitValues(params, name) {
  return params.getAll(name)
    .flatMap(v => v.split(','))
    .map(v => v.trim())
    .filter(Boolean);
}

// Parse a query string against the known option sets.
// known = { beast: [...], workflow: [...], domain: [...], package: [...] }
// Returns { state, canonical } where canonical is the query string the URL
// should be rewritten to (legacy names, unknown values and duplicates removed).
export function parseURL(search, known, base = createState()) {
  const params = new URLSearchParams(search || '');
  const state = { ...base, fulltext: base.fulltext };

  state.q = (params.has('q') ? params.get('q') : params.get('search')) || '';

  for (const name of LIST_PARAMS) {
    const allowed = known[name] || [];
    const byLower = new Map(allowed.map(v => [String(v).toLowerCase(), v]));
    const set = new Set();
    for (const raw of splitValues(params, name)) {
      const hit = allowed.includes(raw) ? raw : byLower.get(raw.toLowerCase());
      if (hit !== undefined) set.add(hit);
    }
    state[name] = set;
  }

  state.showDeprecated = params.get('deprecated') === '1' || params.get('legacy') === '1';

  const rawSort = params.get('sort');
  const sort = LEGACY_SORTS[rawSort] || rawSort;
  if (SORTS.includes(sort)) {
    state.sort = sort;
    state.sortExplicit = true;
  } else {
    state.sort = 'updated';
    state.sortExplicit = false;
  }

  return { state, canonical: toURL(state) };
}

// Canonical query string (without '?'), or '' when everything is default.
export function toURL(state) {
  const params = new URLSearchParams();
  if (state.q && state.q.trim()) params.set('q', state.q);
  for (const name of LIST_PARAMS) {
    if (state[name] && state[name].size) params.set(name, [...state[name]].join(','));
  }
  if (state.showDeprecated) params.set('deprecated', '1');
  if (state.sortExplicit) params.set('sort', state.sort);
  return params.toString();
}

// True when any facet filter is active.
export function hasFacetFilters(state) {
  return LIST_PARAMS.some(name => state[name] && state[name].size > 0);
}
