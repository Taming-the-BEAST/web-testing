// Pagefind full-text search: lazy loading, stale-result guard, cache and
// excerpt sanitising. No imports.

// Above the size of the catalogue (one indexed page per tutorial), so no
// matching tutorial is cut off before the slug check.
const MAX_RESULTS = 100;
const CACHE_SIZE = 30;

// Slug of a tutorial's main page: /tutorials/<slug>/ or /tutorials/<slug>/index.html.
// Anything else (LICENSE pages, sub-pages, other sites) gives ''.
export function slugFromUrl(url) {
  const path = String(url || '').split(/[?#]/)[0];
  const m = /\/tutorials\/([^/]+)\/(?:index\.html)?$/.exec(path);
  if (!m) return '';
  try {
    return decodeURIComponent(m[1]);
  } catch (e) {
    return '';   // malformed percent-escape: not one of our tutorial URLs
  }
}

// Turn a Pagefind excerpt (HTML with <mark>) into a DocumentFragment that
// contains only text nodes and <mark> elements. The excerpt is parsed in an
// inert document (no scripts run, nothing loads) and rebuilt node by node.
export function sanitiseExcerpt(html, doc = document) {
  const frag = doc.createDocumentFragment();
  const parsed = new DOMParser().parseFromString(`<body>${html || ''}</body>`, 'text/html');
  const walk = (node, inMark) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) {
        if (inMark) {
          const mark = doc.createElement('mark');
          mark.textContent = child.textContent;
          frag.appendChild(mark);
        } else {
          frag.appendChild(doc.createTextNode(child.textContent));
        }
      } else if (child.nodeType === 1) {
        walk(child, inMark || child.nodeName === 'MARK');
      }
    }
  };
  walk(parsed.body, false);
  return frag;
}

// createFulltext(url) -> { status, load(), cancel(), search(q) }
// status: 'idle' | 'loading' | 'ready' | 'unavailable'
// search(q) resolves to:
//   { hits: Map<slug, {rank, excerpt}> }  results for q
//   { error: true }                       loading or searching failed
//   null                                  superseded by a newer search or cancel()
export function createFulltext(url, knownSlugs) {
  let pagefind = null;
  let loading = null;
  let seq = 0;
  const cache = new Map();

  const api = {
    status: 'idle',

    load() {
      if (loading) return loading;
      api.status = 'loading';
      loading = import(url)
        .then(async mod => {
          await mod.init();
          pagefind = mod;
          api.status = 'ready';
          return true;
        })
        .catch(() => {
          api.status = 'unavailable';
          return false;
        });
      return loading;
    },

    // Invalidate any search in flight.
    cancel() {
      seq++;
    },

    async search(q) {
      const mySeq = ++seq;
      if (cache.has(q)) {
        const hits = cache.get(q);
        cache.delete(q);
        cache.set(q, hits);
        return { hits };
      }
      const ok = await api.load();
      if (mySeq !== seq) return null;
      if (!ok) return { error: true };

      let found;
      try {
        found = await pagefind.search(q);
      } catch (e) {
        return mySeq === seq ? { error: true } : null;
      }
      if (mySeq !== seq) return null;
      if (!found) return { error: true };

      let data;
      try {
        data = await Promise.all(found.results.slice(0, MAX_RESULTS).map(r => r.data()));
      } catch (e) {
        return mySeq === seq ? { error: true } : null;
      }
      if (mySeq !== seq) return null;

      const hits = new Map();
      data.forEach((d, i) => {
        const slug = slugFromUrl(d.url);
        if (!slug || hits.has(slug)) return;
        if (knownSlugs && !knownSlugs.has(slug)) return;
        hits.set(slug, { rank: i, excerpt: d.excerpt || '' });
      });

      cache.set(q, hits);
      if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value);
      return { hits };
    },
  };
  return api;
}
