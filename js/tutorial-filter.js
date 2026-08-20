(function() {
  'use strict';

  // Filters now support multiple selections (arrays)
  const filters = {
    workflow: [],   // empty = all
    package: [],
    domain: [],
    search: '',
    fulltextSearch: '',
    fulltextResults: null,  // null = no search active, else Map<slug, excerpt> in relevance order
    showLegacy: false
  };

  let currentSort = 'date';
  let searchMode = 'keyword';
  let pagefind = null;
  let searchDebounceTimer = null;

  // Initialize
  document.addEventListener('DOMContentLoaded', function() {
    loadFiltersFromURL();
    setupFilterButtons();
    setupSortButtons();
    setupSearch();
    setupSearchModeToggle();
    setupKeywordChips();
    setupPackageShowAll();
    setupLegacyToggle();
    initPagefind();
    applyFilters();
  });

  async function initPagefind() {
    try {
      console.log('Loading Pagefind...');
      // Get baseurl from data attribute (for subpath deployments like /web-testing/)
      const baseurl = document.querySelector('.tutorial-index')?.dataset?.baseurl || '';
      const pagefindPath = baseurl + '/pagefind/pagefind.js';
      console.log('Pagefind path:', pagefindPath);
      pagefind = await import(pagefindPath);
      console.log('Pagefind module loaded:', pagefind);
      await pagefind.init();
      console.log('Pagefind initialized');
      return true;
    } catch (e) {
      console.error('Pagefind not available:', e);
      pagefind = null;
      return false;
    }
  }

  function setupFilterButtons() {
    document.querySelectorAll('[data-filter]').forEach(btn => {
      btn.addEventListener('click', function() {
        const filterType = this.dataset.filter;
        const value = this.dataset.value;

        if (value === 'all') {
          // Clear all selections for this filter
          filters[filterType] = [];
          document.querySelectorAll(`[data-filter="${filterType}"]`)
            .forEach(b => b.classList.remove('active'));
          this.classList.add('active');
        } else {
          // Toggle this value
          const index = filters[filterType].indexOf(value);
          if (index > -1) {
            // Remove from selection
            filters[filterType].splice(index, 1);
            this.classList.remove('active');
          } else {
            // Add to selection
            filters[filterType].push(value);
            this.classList.add('active');
          }

          // Update "All" button state
          const allBtn = document.querySelector(`[data-filter="${filterType}"][data-value="all"]`);
          if (allBtn) {
            if (filters[filterType].length === 0) {
              allBtn.classList.add('active');
            } else {
              allBtn.classList.remove('active');
            }
          }
        }

        applyFilters();
      });
    });
  }

  function setupSortButtons() {
    document.querySelectorAll('[data-sort]').forEach(btn => {
      btn.addEventListener('click', function() {
        const sortType = this.dataset.sort;

        document.querySelectorAll('[data-sort]')
          .forEach(b => b.classList.remove('active'));
        this.classList.add('active');

        currentSort = sortType;
        sortCards();
      });
    });
  }

  function sortCards() {
    const grid = document.getElementById('tutorial-grid');
    if (!grid) return;

    const cards = Array.from(grid.querySelectorAll('.tutorial-card'));

    cards.sort((a, b) => {
      switch (currentSort) {
        case 'date':
          const dateA = a.dataset.date || '0';
          const dateB = b.dataset.date || '0';
          return dateB.localeCompare(dateA);

        case 'title':
          const titleA = a.dataset.title || '';
          const titleB = b.dataset.title || '';
          return titleA.localeCompare(titleB);

        default:
          return 0;
      }
    });

    cards.forEach(card => grid.appendChild(card));
  }

  function setupSearch() {
    const searchInput = document.getElementById('tutorial-search');
    if (searchInput) {
      searchInput.addEventListener('input', function() {
        filters.search = this.value.trim().toLowerCase();
        syncKeywordChips();
        applyFilters();
      });
    }
  }

  function setupLegacyToggle() {
    const toggle = document.getElementById('show-legacy');
    if (toggle) {
      toggle.addEventListener('change', function() {
        filters.showLegacy = this.checked;
        applyFilters();
      });
    }
  }

  function setupSearchModeToggle() {
    const modeRadios = document.querySelectorAll('input[name="search-mode"]');
    const keywordContainer = document.getElementById('keyword-search-container');
    const fulltextContainer = document.getElementById('fulltext-search-container');
    const fulltextInput = document.getElementById('fulltext-search');
    const fulltextStatus = document.getElementById('fulltext-status');

    // Setup fulltext search input
    if (fulltextInput) {
      fulltextInput.addEventListener('input', function() {
        const query = this.value.trim();

        // Debounce search
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
          performFulltextSearch(query);
        }, 300);
      });
    }

    modeRadios.forEach(radio => {
      radio.addEventListener('change', function() {
        searchMode = this.value;

        if (searchMode === 'keyword') {
          keywordContainer.style.display = 'block';
          fulltextContainer.style.display = 'none';
          // Clear fulltext search when switching back
          filters.fulltextSearch = '';
          filters.fulltextResults = null;
          if (fulltextInput) fulltextInput.value = '';
          if (fulltextStatus) fulltextStatus.textContent = '';
          applyFilters();
        } else {
          keywordContainer.style.display = 'none';
          fulltextContainer.style.display = 'block';
          // Clear keyword search when switching
          filters.search = '';
          const keywordInput = document.getElementById('tutorial-search');
          if (keywordInput) keywordInput.value = '';
          syncKeywordChips();

          if (!pagefind) {
            initPagefind().then((success) => {
              if (fulltextStatus && !success) {
                fulltextStatus.textContent = 'Full-text search not available';
              }
            });
          }
          applyFilters();
        }
      });
    });
  }

  async function performFulltextSearch(query) {
    const fulltextStatus = document.getElementById('fulltext-status');
    console.log('performFulltextSearch called with query:', query);

    if (!query) {
      filters.fulltextSearch = '';
      filters.fulltextResults = null;
      if (fulltextStatus) fulltextStatus.textContent = '';
      applyFilters();
      return;
    }

    if (!pagefind) {
      console.log('pagefind not available, attempting to initialize...');
      const success = await initPagefind();
      if (!success) {
        if (fulltextStatus) fulltextStatus.textContent = 'Full-text search not available';
        return;
      }
    }

    filters.fulltextSearch = query;
    if (fulltextStatus) fulltextStatus.textContent = 'Searching...';

    try {
      // Build filter object for Pagefind
      const pfFilters = {};
      if (filters.workflow.length > 0) {
        pfFilters.workflow = { any: filters.workflow };
      }
      if (filters.package.length > 0) {
        pfFilters.package = { any: filters.package };
      }
      if (filters.domain.length > 0) {
        pfFilters.domain = { any: filters.domain };
      }

      console.log('Searching with filters:', pfFilters);
      const search = await pagefind.search(query, { filters: pfFilters });
      console.log('Search results:', search.results.length, 'results');

      // Collect results as a slug -> excerpt Map, in Pagefind's relevance order.
      // Membership (is this tutorial a match?) and excerpt lookup are now both O(1).
      const results = new Map();
      for (const result of search.results) {
        const data = await result.data();
        results.set(slugFromUrl(data.url), data.excerpt);
      }

      filters.fulltextResults = results;
      console.log('fulltextResults set to:', [...results.keys()]);

      if (fulltextStatus) {
        fulltextStatus.textContent = `${search.results.length} result${search.results.length !== 1 ? 's' : ''} found`;
      }

      applyFilters();
    } catch (e) {
      console.error('Search error:', e);
      if (fulltextStatus) fulltextStatus.textContent = 'Search error';
    }
  }

  // Highlight the chip matching the current search term, and show the clear
  // button only when there is something to clear.
  function syncKeywordChips() {
    const current = (filters.search || '').trim().toLowerCase();
    document.querySelectorAll('.keyword-chip').forEach(chip => {
      chip.classList.toggle('active', chip.dataset.keyword.toLowerCase() === current);
    });
    const clearBtn = document.getElementById('keyword-clear');
    if (clearBtn) clearBtn.classList.toggle('d-none', current === '');
  }

  // Single entry point for changing the keyword search, so the input, the
  // filter state and the chip highlighting never drift apart.
  function setKeywordSearch(value) {
    const searchInput = document.getElementById('tutorial-search');
    if (searchInput) searchInput.value = value;
    filters.search = value.trim().toLowerCase();
    syncKeywordChips();
    applyFilters();
  }

  function setupKeywordChips() {
    document.querySelectorAll('.keyword-chip').forEach(chip => {
      chip.addEventListener('click', function() {
        // Clicking the active chip clears the search, like the other filters.
        setKeywordSearch(this.classList.contains('active') ? '' : this.dataset.keyword);
      });
    });

    const clearBtn = document.getElementById('keyword-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => setKeywordSearch(''));
    }

    syncKeywordChips();
  }

  // Toggle the hidden overflow package buttons.
  function setupPackageShowAll() {
    const btn = document.getElementById('package-show-all');
    if (!btn) return;
    btn.addEventListener('click', function() {
      const expanded = this.dataset.expanded === 'true';
      document.querySelectorAll('.package-extra').forEach(el => el.classList.toggle('d-none', expanded));
      this.dataset.expanded = expanded ? 'false' : 'true';
      this.textContent = expanded
        ? `Show all (${document.querySelectorAll('[data-filter="package"]:not([data-value="all"])').length})`
        : 'Show fewer';
    });
  }

  // Every tutorial is uniquely identified by its slug (the last path segment),
  // regardless of baseurl prefix, trailing slash, or index.html.
  function slugFromUrl(url) {
    return url
      .replace(/index\.html$/, '')
      .split('/')
      .filter(Boolean)
      .pop() || '';
  }

  // In full-text mode, Pagefind returns results already sorted by relevance.
  // Reorder the card grid to match so the strongest match sits first. Iterating
  // the results Map (insertion-ordered by relevance) gives the ranking directly.
  function reorderCardsByRelevance() {
    const grid = document.getElementById('tutorial-grid');
    if (!grid || !filters.fulltextResults) return;

    const rankBySlug = new Map(
      [...filters.fulltextResults.keys()].map((slug, i) => [slug, i])
    );
    const rankFor = (card) => {
      const link = card.querySelector('.card-title a');
      const slug = link ? slugFromUrl(link.getAttribute('href')) : '';
      // non-matching (hidden) cards have no rank → sink to the bottom
      return rankBySlug.has(slug) ? rankBySlug.get(slug) : Infinity;
    };

    const cards = Array.from(grid.querySelectorAll('.tutorial-card'));
    cards.sort((a, b) => rankFor(a) - rankFor(b));
    cards.forEach(card => grid.appendChild(card));
  }

  function updateCardExcerpt(card, excerptHtml) {
    const cardBody = card.querySelector('.card-body');
    if (!cardBody) return;

    let excerptEl = cardBody.querySelector('.tutorial-fulltext-excerpt');

    if (!excerptHtml) {
      // Nothing to show: clear/hide the excerpt element (but keep it removed, not lingering)
      if (excerptEl) {
        excerptEl.innerHTML = '';
        excerptEl.style.display = 'none';
      }
      return;
    }

    if (!excerptEl) {
      excerptEl = document.createElement('div');
      excerptEl.className = 'tutorial-fulltext-excerpt text-muted small mt-2';
      cardBody.appendChild(excerptEl);
    }

    excerptEl.innerHTML = excerptHtml;
    excerptEl.style.display = 'block';
  }

  function applyFilters() {
    const cards = document.querySelectorAll('.tutorial-card');
    let visibleCount = 0;

    if (searchMode === 'fulltext') {
      console.log('applyFilters: searchMode=fulltext, matches=',
        filters.fulltextResults ? [...filters.fulltextResults.keys()] : null);
    }

    cards.forEach(card => {
      let show = true;

      // Workflow filter (OR logic - match any selected)
      if (filters.workflow.length > 0) {
        if (!filters.workflow.includes(card.dataset.workflow)) {
          show = false;
        }
      }

      // Package filter (OR logic - card matches if it has ANY of the selected packages)
      if (filters.package.length > 0) {
        const cardPackages = (card.dataset.packages || '').split(',').filter(p => p);
        const hasMatch = filters.package.some(pkg => cardPackages.includes(pkg));
        if (!hasMatch) {
          show = false;
        }
      }

      // Domain filter (OR logic)
      if (filters.domain.length > 0) {
        const cardDomains = (card.dataset.domains || '').split(',').filter(d => d);
        const hasMatch = filters.domain.some(dom => cardDomains.includes(dom));
        if (!hasMatch) {
          show = false;
        }
      }

      // Keyword search filter (simple text match)
      if (searchMode === 'keyword' && filters.search) {
        const searchText = (card.dataset.search || '').toLowerCase();
        if (!searchText.includes(filters.search)) {
          show = false;
        }
      }

      // Fulltext search filter (Pagefind results)
      let fulltextExcerpt = null;
      if (searchMode === 'fulltext' && filters.fulltextResults !== null) {
        const link = card.querySelector('.card-title a');
        const slug = link ? slugFromUrl(link.getAttribute('href')) : '';
        if (filters.fulltextResults.has(slug)) {
          fulltextExcerpt = filters.fulltextResults.get(slug);
        } else {
          show = false;
        }
      }

      // Deprecated filter
      if (!filters.showLegacy && card.dataset.status === 'deprecated') {
        show = false;
      }

      card.style.display = show ? 'block' : 'none';
      if (show) visibleCount++;

      // Render (or clear) the fulltext match excerpt
      updateCardExcerpt(card, (searchMode === 'fulltext' && show) ? fulltextExcerpt : null);
    });

    // Update count
    const countEl = document.getElementById('tutorial-count');
    if (countEl) {
      countEl.textContent = visibleCount;
    }

    // Order cards: by Pagefind relevance in full-text mode, else by the active sort.
    if (searchMode === 'fulltext' && filters.fulltextResults) {
      reorderCardsByRelevance();
    } else {
      sortCards();
    }

    updateURL();
  }

  function updateURL() {
    const params = new URLSearchParams();

    if (filters.workflow.length > 0) params.set('workflow', filters.workflow.join(','));
    if (filters.package.length > 0) params.set('package', filters.package.join(','));
    if (filters.domain.length > 0) params.set('domain', filters.domain.join(','));
    if (filters.search) params.set('search', filters.search);
    if (filters.showLegacy) params.set('legacy', '1');
    if (currentSort !== 'date') params.set('sort', currentSort);

    const newURL = window.location.pathname +
      (params.toString() ? '?' + params.toString() : '');

    window.history.replaceState({}, '', newURL);
  }

  function loadFiltersFromURL() {
    const params = new URLSearchParams(window.location.search);

    // Parse comma-separated values into arrays
    if (params.has('workflow')) {
      filters.workflow = params.get('workflow').split(',');
    }
    if (params.has('package')) {
      filters.package = params.get('package').split(',');
    }
    if (params.has('domain')) {
      filters.domain = params.get('domain').split(',');
    }
    if (params.has('search')) {
      filters.search = params.get('search');
      setTimeout(function() {
        const searchInput = document.getElementById('tutorial-search');
        if (searchInput) {
          searchInput.value = filters.search;
        }
      }, 100);
    }
    if (params.has('legacy')) {
      filters.showLegacy = true;
      const legacyToggle = document.getElementById('show-legacy');
      if (legacyToggle) {
        legacyToggle.checked = true;
      }
    }
    if (params.has('sort')) {
      currentSort = params.get('sort');
      const sortBtn = document.querySelector(`[data-sort="${currentSort}"]`);
      if (sortBtn) {
        document.querySelectorAll('[data-sort]').forEach(b => b.classList.remove('active'));
        sortBtn.classList.add('active');
      }
    }

    // Activate filter buttons from URL
    ['workflow', 'package', 'domain'].forEach(filterType => {
      if (filters[filterType].length > 0) {
        // Deactivate "All" button
        const allBtn = document.querySelector(`[data-filter="${filterType}"][data-value="all"]`);
        if (allBtn) allBtn.classList.remove('active');

        // Activate selected buttons
        filters[filterType].forEach(value => {
          const btn = document.querySelector(`[data-filter="${filterType}"][data-value="${value}"]`);
          if (btn) btn.classList.add('active');
        });
      }
    });

    setTimeout(sortCards, 100);
  }
})();
