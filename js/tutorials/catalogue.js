// Reads the server-rendered cards and filter controls into plain data.
// The only module that reads data-* attributes. No imports.

const SEP = '|';

function list(value) {
  return (value || '').split(SEP).map(v => v.trim()).filter(Boolean);
}

// Lowercase without diacritics, matching match.js fold(): "Muller" finds
// the name written with an umlaut.
function lc(value) {
  return (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// One item per `.tutorial-card` element.
export function buildCatalogue(root) {
  const items = [];
  for (const el of root.querySelectorAll('.tutorial-card')) {
    const d = el.dataset;
    const packages = list(d.packages);
    const domains = list(d.domains);
    const keywords = list(d.keywords);
    const title = d.title || '';
    const tags = [...keywords, ...packages].join(' ');
    const other = [d.authors, domains.join(' '), d.workflow, d.beastPkg ? 'beast ' + d.beastPkg : ''].join(' ');
    items.push({
      el,
      slug: d.slug || '',
      title,
      titleSort: lc(title),
      date: d.date || '',
      beastPkg: d.beastPkg || '',
      workflow: d.workflow || '',
      packages,
      domains,
      keywords,
      deprecated: d.status === 'deprecated',
      text: {
        title: lc(title),
        tags: lc(tags),
        desc: lc(d.desc),
        other: lc(other),
        all: lc([title, tags, d.desc, other].join(' ')),
      },
    });
  }
  return items;
}

// Known option values per facet, for URL whitelisting and counts.
// Workflow/domain/package come from the rendered checkboxes; BEAST versions
// from the cards themselves, newest first, 'none' (not specified) last.
export function knownOptions(root, items, versionKey) {
  const fromInputs = facet => [...root.querySelectorAll('input[type="checkbox"][name]')]
    .filter(input => input.name === facet)
    .map(input => input.value)
    .filter(Boolean);
  const versions = [...new Set(items.map(i => i.beastPkg).filter(Boolean))]
    .sort((a, b) => versionKey(b) - versionKey(a));
  const beast = items.some(i => !i.beastPkg) ? [...versions, 'none'] : versions;
  return {
    beast,
    workflow: fromInputs('workflow'),
    domain: fromInputs('domain'),
    package: [...new Set([...fromInputs('package'), ...items.flatMap(i => i.packages)])],
  };
}
