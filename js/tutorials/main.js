// Tutorial listing: entry point.
// One update path: event -> mutate state -> derive() -> render() -> URL.
//
// Modules are loaded with the same ?v= query as this file, so a new site
// build busts the browser cache for all of them. The other modules have no
// imports of their own (they stay importable from node --test).

const v = new URL(import.meta.url).search;

const FT_MIN_CHARS = 3;
const FT_DEBOUNCE_MS = 250;
const URL_TYPING_MS = 300;
const STATUS_MS = 400;

async function start() {
  const root = document.querySelector('.tutorial-index');
  if (!root) return;

  const [match, stateMod, catalogue, fulltextMod, view] = await Promise.all([
    import('./match.js' + v),
    import('./state.js' + v),
    import('./catalogue.js' + v),
    import('./fulltext.js' + v),
    import('./view.js' + v),
  ]);

  const byId = id => document.getElementById(id);
  const ui = {
    grid: byId('tutorial-grid'),
    form: byId('tl-search-form'),
    q: byId('tl-q'),
    clear: byId('tl-clear'),
    tryRow: byId('tl-try'),
    filters: byId('tl-filters'),
    filterCount: byId('tl-filter-count'),
    filterCountSr: byId('tl-filter-count-sr'),
    beastOptions: byId('tl-beast-options'),
    packageOptions: byId('tl-package-options'),
    packageFilter: byId('tl-package-filter'),
    resetFilters: byId('tl-reset-filters'),
    showResults: byId('tl-show-results'),
    active: byId('tl-active'),
    activeChips: byId('tl-active-chips'),
    clearAll: byId('tl-clear-all'),
    resultsHeading: byId('tl-results-h'),
    sort: byId('tl-sort'),
    depGrid: byId('tl-deprecated-grid'),
    deprecated: byId('tl-deprecated'),
    deprecatedN: byId('tl-deprecated-n'),
    emptyText: byId('tl-empty-text'),
    emptyDeprecated: byId('tl-empty-deprecated'),
    emptyDeprecatedN: byId('tl-empty-deprecated-n'),
    showDeprecated: byId('tl-show-deprecated'),
    status: byId('tl-status'),
    empty: byId('tl-empty'),
    reset: byId('tl-reset'),
    facetInputs: () => ui.filters.querySelectorAll('input[type="checkbox"][name]'),
  };
  const required = ['grid', 'form', 'q', 'clear', 'filters', 'filterCount', 'filterCountSr',
    'active', 'activeChips', 'sort', 'status'];
  if (required.some(k => !ui[k])) return;

  const items = catalogue.buildCatalogue(root);
  const options = catalogue.knownOptions(root, items, match.versionKey);
  view.buildBeastOptions(ui.beastOptions, options.beast, root.dataset.beastCurrent || '');

  // Display text of each option, for the chips (e.g. capitalised domains).
  const optionText = new Map();
  for (const input of ui.facetInputs()) {
    const label = input.closest('.tl-opt');
    const text = label && label.querySelector('.tl-opt__label');
    optionText.set(input.name + '\u0000' + input.value, text ? text.textContent.trim() : input.value);
  }
  const labelFor = (facet, value) => optionText.get(facet + '\u0000' + value) || value;

  const fulltext = fulltextMod.createFulltext(
    root.dataset.pagefindUrl || '/pagefind/pagefind.js',
    new Set(items.map(i => i.slug)),
  );

  let state = stateMod.parseURL(location.search, options).state;

  // ---- status line (debounced live region) ----
  let statusTimer = null;
  let firstStatus = true;
  function setStatus(text) {
    clearTimeout(statusTimer);
    if (firstStatus) {
      ui.status.textContent = text;
      firstStatus = false;
      return;
    }
    statusTimer = setTimeout(() => {
      if (ui.status.textContent !== text) ui.status.textContent = text;
    }, STATUS_MS);
  }

  // ---- full-text search ----
  // "Searching" is derived, never stored: a text search is pending when the
  // query is long enough, text search may still work, and the results for
  // this exact query have not arrived (or failed) yet.
  let ftTimer = null;
  let ftFailedQ = null;

  function isSearching() {
    const q = match.normaliseQuery(state.q);
    if (q.length < FT_MIN_CHARS || fulltext.status === 'unavailable') return false;
    if (ftFailedQ === q) return false;
    return !(state.fulltext.q === q && state.fulltext.hits);
  }

  function scheduleFulltext() {
    clearTimeout(ftTimer);
    const q = match.normaliseQuery(state.q);
    if (q.length < FT_MIN_CHARS) {
      fulltext.cancel();
      return;
    }
    if (state.fulltext.q === q && state.fulltext.hits) {
      fulltext.cancel();   // results for this query are already shown
      return;
    }
    if (fulltext.status === 'unavailable') return;
    ftTimer = setTimeout(async () => {
      let result;
      try {
        result = await fulltext.search(q);
      } catch (e) {
        result = { error: true };   // never leave the status on "searching"
      }
      if (match.normaliseQuery(state.q) !== q) return;   // query moved on
      if (result === null) return;                        // superseded by a newer search
      if (result.error) {
        ftFailedQ = q;                                    // show metadata results only
      } else {
        ftFailedQ = null;
        state.fulltext = { q, status: fulltext.status, hits: result.hits };
      }
      update({ history: 'none' });
    }, FT_DEBOUNCE_MS);
  }

  // ---- URL / history ----
  let urlTimer = null;
  function currentURL() {
    const qs = stateMod.toURL(state);
    return location.pathname + (qs ? '?' + qs : '') + location.hash;
  }
  function syncURL(mode) {
    // 'none' (async full-text results, popstate) must not cancel a pending
    // typing update, or the query would never reach the URL.
    if (mode === 'none') return;
    const url = currentURL();
    clearTimeout(urlTimer);
    if (url === location.pathname + location.search + location.hash) return;
    if (mode === 'push') history.pushState(null, '', url);
    else if (mode === 'replace') history.replaceState(null, '', url);
    else if (mode === 'typing') urlTimer = setTimeout(() => history.replaceState(null, '', currentURL()), URL_TYPING_MS);
  }

  // ---- the single update path ----
  function update({ history: mode = 'push', freezePackages = false } = {}) {
    const derived = match.derive(items, state, { options });
    view.render(ui, items, state, derived, {
      sanitiseExcerpt: html => fulltextMod.sanitiseExcerpt(html),
      ftStatus: ftFailedQ && ftFailedQ === match.normaliseQuery(state.q) ? 'unavailable' : fulltext.status,
      searching: isSearching(),
      setStatus,
      labelFor,
      freezePackages,
    });
    syncURL(mode);
  }

  function setQuery(q, mode) {
    state.q = q;
    scheduleFulltext();
    update({ history: mode });
  }

  function setFacet(facet, value, on) {
    const set = new Set(state[facet]);
    if (on) set.add(value); else set.delete(value);
    state[facet] = set;
  }

  function clearFacets() {
    for (const facet of match.FACETS) state[facet] = new Set();
  }

  // ---- events: search ----
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const scrollBehavior = () =>
    (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) ? 'auto' : 'smooth';
  ui.form.addEventListener('submit', e => {
    e.preventDefault();
    // On touch devices, Enter closes the keyboard and shows the results.
    if (coarse) {
      ui.q.blur();
      ui.grid.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
    }
  });

  ui.q.addEventListener('input', () => setQuery(ui.q.value, 'typing'));
  ui.q.addEventListener('focus', () => { fulltext.load(); }, { once: true });
  ui.q.addEventListener('keydown', e => {
    if (e.key === 'Escape' && ui.q.value) {
      e.preventDefault();
      setQuery('', 'push');
    }
  });

  ui.clear.addEventListener('click', () => {
    setQuery('', 'push');
    ui.q.focus();
  });

  // "/" focuses the search box unless the user is typing somewhere.
  document.addEventListener('keydown', e => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    e.preventDefault();
    ui.q.focus();
  });

  if (ui.tryRow) {
    ui.tryRow.addEventListener('click', e => {
      const chip = e.target.closest('.keyword-chip');
      if (!chip) return;
      setQuery(chip.dataset.keyword || '', 'push');
      // The Try row hides once there is a query; keep focus in the search box.
      ui.q.focus();
    });
  }

  // ---- events: filters panel ----
  ui.filters.addEventListener('change', e => {
    const input = e.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'checkbox') return;
    if (match.FACETS.includes(input.name)) {
      setFacet(input.name, input.value, input.checked);
    } else {
      return;
    }
    // Keep the package order while the user works inside the package list.
    update({ history: 'push', freezePackages: !!(ui.packageOptions && ui.packageOptions.contains(input)) });
  });

  // Re-sort the package list (pin selected ones) whenever the panel opens.
  ui.filters.addEventListener('toggle', () => {
    if (ui.filters.open) update({ history: 'none' });
  });

  if (ui.packageFilter) {
    ui.packageFilter.addEventListener('input', () => update({ history: 'none' }));
    // Enter in the package box must not submit anything or toggle the panel.
    ui.packageFilter.addEventListener('keydown', e => { if (e.key === 'Enter') e.preventDefault(); });
  }

  if (ui.resetFilters) {
    ui.resetFilters.addEventListener('click', () => {
      clearFacets();
      if (ui.packageFilter) ui.packageFilter.value = '';
      update({ history: 'push' });
      ui.q.focus();
    });
  }

  if (ui.showResults) {
    ui.showResults.addEventListener('click', () => {
      ui.filters.open = false;
      if (ui.resultsHeading) {
        ui.resultsHeading.focus({ preventScroll: true });
        ui.resultsHeading.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
      }
    });
  }

  // ---- events: active chips ----
  ui.activeChips.addEventListener('click', e => {
    const chip = e.target.closest('.tl-chip');
    if (!chip) return;
    const chips = [...ui.activeChips.querySelectorAll('.tl-chip')];
    const index = chips.indexOf(chip);
    if (chip.dataset.facet === 'q') {
      state.q = '';
      scheduleFulltext();
    } else {
      setFacet(chip.dataset.facet, chip.dataset.value, false);
    }
    update({ history: 'push' });
    // Focus the chip now at the same position, else the previous one, else search.
    const after = [...ui.activeChips.querySelectorAll('.tl-chip')];
    const next = after[index] || after[index - 1];
    (next || ui.q).focus();
  });

  if (ui.clearAll) {
    ui.clearAll.addEventListener('click', () => {
      clearFacets();
      state.q = '';
      scheduleFulltext();
      update({ history: 'push' });
      ui.q.focus();
    });
  }

  // ---- events: deprecated section ----
  if (ui.deprecated) {
    // Opening or closing the section is part of the state (URL deprecated=1).
    // render() also sets .open, which fires 'toggle' again: ignore that echo.
    ui.deprecated.addEventListener('toggle', () => {
      if (ui.deprecated.open === state.showDeprecated) return;
      state.showDeprecated = ui.deprecated.open;
      update({ history: 'push' });
    });
  }

  if (ui.showDeprecated && ui.deprecated) {
    ui.showDeprecated.addEventListener('click', () => {
      state.showDeprecated = true;
      update({ history: 'push' });
      const summary = ui.deprecated.querySelector('summary');
      ui.deprecated.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
      if (summary) summary.focus({ preventScroll: true });
    });
  }

  // ---- events: sort, empty-state reset, history ----
  ui.sort.addEventListener('change', () => {
    state.sort = ui.sort.value;
    state.sortExplicit = true;
    update({ history: 'push' });
  });

  if (ui.reset) {
    ui.reset.addEventListener('click', () => {
      // Like Clear all: the deprecated section keeps its open state.
      const keep = { sort: state.sort, sortExplicit: state.sortExplicit, fulltext: state.fulltext, showDeprecated: state.showDeprecated };
      state = { ...stateMod.createState(), ...keep };
      if (ui.packageFilter) ui.packageFilter.value = '';
      scheduleFulltext();
      update({ history: 'push' });
      ui.q.focus();
    });
  }

  window.addEventListener('popstate', () => {
    const ft = state.fulltext;
    state = stateMod.parseURL(location.search, options).state;
    state.fulltext = ft;
    scheduleFulltext();
    update({ history: 'none' });
  });

  // Keep the mobile "Show N results" button above the site footer when the
  // footer is position: fixed (it is static on small screens, see style.scss).
  const siteFooter = document.querySelector('.footer');
  const syncFooterHeight = () => {
    const h = siteFooter && getComputedStyle(siteFooter).position === 'fixed' ? siteFooter.offsetHeight : 0;
    root.style.setProperty('--tl-fixed-footer-h', h + 'px');
  };
  syncFooterHeight();
  window.addEventListener('resize', syncFooterHeight);

  // ---- start ----
  // Open the filters panel when the page was opened with filters in the URL.
  if (stateMod.hasFacetFilters(state)) ui.filters.open = true;
  if (match.normaliseQuery(state.q).length >= FT_MIN_CHARS) fulltext.load();
  scheduleFulltext();
  update({ history: 'replace' });   // also rewrites legacy URLs to the canonical form
  // Reveal the controls only once the first render has succeeded.
  root.querySelectorAll('[data-tl-control]').forEach(el => { el.hidden = false; });
}

start().catch(() => {
  // On any failure leave the no-JS page as it is: controls stay hidden and
  // all current tutorials stay visible.
});
