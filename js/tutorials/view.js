// Renders derived state onto the server-rendered listing. No imports:
// helpers that depend on other modules are passed in by main.js.

const FACET_ORDER = ['beast', 'workflow', 'domain', 'package'];

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function statusText(summary, state, ftStatus, searching) {
  const { total, metaCount, textOnlyCount, deprecatedHidden } = summary;
  let text = plural(total, 'tutorial');
  if (state.q.trim()) {
    if (searching) {
      text += ' - searching tutorial text...';
    } else if (ftStatus === 'unavailable') {
      text += ' (titles and tags only - text search unavailable)';
    } else if (textOnlyCount > 0) {
      text += ` - ${metaCount} in titles/tags, ${textOnlyCount} in tutorial text`;
    }
  }
  if (deprecatedHidden > 0) text += ` (+${deprecatedHidden} deprecated)`;
  return text;
}

// One checkbox option, same markup as the Liquid-rendered ones.
function optionLabel(doc, name, value, text, extra) {
  const label = doc.createElement('label');
  label.className = 'form-check tl-opt';
  const input = doc.createElement('input');
  input.className = 'form-check-input';
  input.type = 'checkbox';
  input.name = name;
  input.value = value;
  const span = doc.createElement('span');
  span.className = 'tl-opt__label';
  span.textContent = text;
  label.append(input, ' ', span);
  if (extra) {
    const small = doc.createElement('span');
    small.className = 'tl-opt__extra';
    small.textContent = extra;
    label.append(' ', small);
  }
  const count = doc.createElement('span');
  count.className = 'tl-count';
  const pre = doc.createElement('span');
  pre.className = 'visually-hidden';
  pre.textContent = ', ';
  const n = doc.createElement('span');
  n.dataset.n = '';
  const post = doc.createElement('span');
  post.className = 'visually-hidden';
  post.textContent = ' tutorials';
  count.append(pre, n, post);
  label.append(' ', count);
  return label;
}

// BEAST version options (values already ordered newest first, 'none' last).
export function buildBeastOptions(container, values, current) {
  if (!container) return;
  const doc = container.ownerDocument;
  container.replaceChildren(...values.map(v => optionLabel(
    doc, 'beast', v,
    v === 'none' ? 'Not specified' : v,
    v === current ? 'current' : '',
  )));
}

const FACET_NAMES = { workflow: 'Workflow', domain: 'Domain', package: 'Package' };

export function chipLabel(facet, value, labelText) {
  if (facet === 'q') return `Text: ${value}`;
  if (facet === 'beast') return value === 'none' ? 'BEAST: not specified' : `BEAST ${value}`;
  return `${FACET_NAMES[facet] || facet}: ${labelText || value}`;
}

// Reorder grid children only when the order actually changed.
function applyOrder(parent, wanted) {
  const current = [...parent.children];
  if (current.length === wanted.length && current.every((el, k) => el === wanted[k])) return;
  const frag = parent.ownerDocument.createDocumentFragment();
  wanted.forEach(el => frag.appendChild(el));
  parent.appendChild(frag);
}

// Package list: selected packages pinned to the top, then by count, then
// by name. While the user is working inside the list (opts.freeze) the
// order is kept, so the row under the pointer or keyboard focus never
// moves; it is re-sorted when the panel opens or the filter box changes.
function renderPackages(ui, state, counts, freeze) {
  if (!ui.packageOptions) return;
  const filter = (ui.packageFilter ? ui.packageFilter.value : '').trim().toLowerCase();
  const c = counts.package || new Map();
  const labels = [...ui.packageOptions.children];
  const info = labels.map(label => {
    const input = label.querySelector('input');
    return { label, value: input.value, checked: state.package.has(input.value), n: c.get(input.value) || 0 };
  });
  // Checked first (pinned), then by count, then by name.
  if (!freeze) {
    info.sort((a, b) => (b.checked - a.checked) || (b.n - a.n) || a.value.localeCompare(b.value));
    const focused = ui.packageOptions.contains(document.activeElement) ? document.activeElement : null;
    applyOrder(ui.packageOptions, info.map(i => i.label));
    if (focused && document.activeElement !== focused) focused.focus({ preventScroll: true });
  }
  for (const i of info) {
    i.label.hidden = !i.checked && filter !== '' && !i.value.toLowerCase().includes(filter);
  }
}

function renderChips(ui, state, labelFor) {
  const chips = [];
  if (state.q.trim()) chips.push({ facet: 'q', value: state.q.trim(), text: chipLabel('q', state.q.trim()) });
  for (const facet of FACET_ORDER) {
    for (const value of state[facet]) {
      chips.push({ facet, value, text: chipLabel(facet, value, labelFor(facet, value)) });
    }
  }
  const key = JSON.stringify(chips.map(c => [c.facet, c.value]));
  if (ui.activeChips.dataset.key !== key) {
    const doc = ui.activeChips.ownerDocument;
    ui.activeChips.replaceChildren(...chips.map(c => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'tl-chip';
      b.dataset.facet = c.facet;
      b.dataset.value = c.value;
      b.setAttribute('aria-label', `Remove filter: ${c.text}`);
      const t = doc.createElement('span');
      t.textContent = c.text;
      const x = doc.createElement('i');
      x.className = 'bi bi-x';
      x.setAttribute('aria-hidden', 'true');
      b.append(t, x);
      return b;
    }));
    ui.activeChips.dataset.key = key;
  }
  ui.active.hidden = chips.length === 0;
  return chips.length;
}

export function render(ui, items, state, derived, opts) {
  const { visible, order, counts, excerpts, sort, summary } = derived;

  // Cards: visibility, order, excerpts
  for (const item of items) {
    item.el.hidden = !visible.has(item);
    const slot = item.el.querySelector('.tutorial-fulltext-excerpt');
    if (!slot) continue;
    const excerpt = excerpts.get(item);
    if (excerpt) {
      if (slot.dataset.excerpt !== excerpt) {
        slot.replaceChildren(opts.sanitiseExcerpt(excerpt));
        slot.dataset.excerpt = excerpt;
      }
      slot.hidden = false;
    } else if (!slot.hidden) {
      slot.hidden = true;
      slot.replaceChildren();
      delete slot.dataset.excerpt;
    }
  }
  applyOrder(ui.grid, order.filter(i => !i.deprecated).map(i => i.el));
  if (ui.depGrid) applyOrder(ui.depGrid, order.filter(i => i.deprecated).map(i => i.el));

  // Search box
  if (ui.q.value !== state.q) ui.q.value = state.q;
  ui.clear.hidden = state.q === '';
  if (ui.tryRow) ui.tryRow.hidden = state.q.trim() !== '';

  // Facet checkboxes and counts. Zero-count options stay enabled and
  // focusable; their accessible name includes "0 tutorials".
  for (const input of ui.facetInputs()) {
    const facet = input.name;
    const checked = state[facet].has(input.value);
    if (input.checked !== checked) input.checked = checked;
    const n = (counts[facet] && counts[facet].get(input.value)) || 0;
    const label = input.closest('.tl-opt');
    if (!label) continue;
    const nEl = label.querySelector('[data-n]');
    if (nEl && nEl.textContent !== String(n)) nEl.textContent = String(n);
    label.classList.toggle('is-empty', !checked && n === 0);
  }
  renderPackages(ui, state, counts, opts.freezePackages);

  // Active filters: summary badge and chips
  renderChips(ui, state, opts.labelFor);
  const active = FACET_ORDER.reduce((n, f) => n + state[f].size, 0);
  ui.filterCount.hidden = active === 0;
  ui.filterCount.textContent = String(active);
  ui.filterCountSr.textContent = active ? `, ${active} active` : '';
  if (ui.showResults) {
    const label = `Show ${plural(summary.total, 'result')}`;
    if (ui.showResults.textContent !== label) ui.showResults.textContent = label;
  }

  // Sort
  const relevanceOpt = ui.sort.querySelector('option[value="relevance"]');
  if (relevanceOpt) relevanceOpt.hidden = relevanceOpt.disabled = !state.q.trim();
  if (ui.sort.value !== sort) ui.sort.value = sort;

  // Deprecated section: count of matches, hidden when none match.
  if (ui.deprecated) {
    ui.deprecated.hidden = summary.deprecatedMatches === 0;
    if (ui.deprecated.open !== state.showDeprecated) ui.deprecated.open = state.showDeprecated;
    if (ui.deprecatedN) ui.deprecatedN.textContent = String(summary.deprecatedMatches);
  }

  // Status (debounced live region, see main.js) and empty state
  opts.setStatus(statusText(summary, state, opts.ftStatus, opts.searching));
  if (ui.empty) {
    ui.empty.hidden = summary.currentCount > 0;
    if (ui.emptyText) {
      ui.emptyText.textContent = summary.deprecatedMatches > 0 ? 'No current tutorials match.' : 'No tutorials match.';
    }
    const offer = summary.deprecatedMatches > 0 && !state.showDeprecated;
    if (ui.emptyDeprecated) ui.emptyDeprecated.hidden = !offer;
    if (offer && ui.emptyDeprecatedN) {
      ui.emptyDeprecatedN.textContent = `show ${summary.deprecatedMatches} matching deprecated tutorial${summary.deprecatedMatches === 1 ? '' : 's'}`;
    }
  }
}
