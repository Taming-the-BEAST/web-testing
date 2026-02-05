# Todo 

## Content
- ~~Update programme for London~~ - **done**
- ~~Add paper link and citation to the website~~ - **done**
- ~~Add paper news item~~
- Update contribute help (lower priority)
- Update frontpage with new splash figure and updated text

---

## Functionality
- Remove statistics from tutorial sidebar (is it necessary?)
- ~~Add RSS feed for tutorials~~
- ~~Add RSS feed for workshop information~~ - **not necessary**
- ~~Add subscribe buttons for feeds~~
- Header and footer do not rescale properly when the site is resized, and does not display properly on mobile devices (low priority)
- Floating header/footer (only appears on scrolling, disappears otherwise) (low priority)
- Sidebar in tutorials scrolls with tutorial (low priority)
- Better search functionality for tutorials (low priority)
- Check and add markdown to latex script
- Check and add latex to markdown script
- Check and add latex template
- Modify markdown to latex script to automatically add in page.beastversion etc.
- favicon does not exist

---

## Bugs
- ~~Check tutorial names are displayed correctly everywhere (also in recently updated tutorials). There were issues when the tutorial name and the github repository were not the same.~~
	- Updated the whole tutorial structure


## Tutorial display

- ~~Packages are missing from selection~~ - **done** (dynamic package filter from tutorial data)
- ~~search should display available keywords~~ - **done** (HTML5 datalist autocomplete + keyword chips)
- ~~limit min/max number of keywords~~ - **done** (schema validation: min 3, max 10)
- ~~show domain (epi/macro/etc) as selection or keyword?~~ - **done** (domain filter added)
- ~~check for required fields~~ - **done** (validation script checks required fields)
- ~~warn about not having recommended fields~~ - **done** (validation script warns about missing recommended fields)
- how to force update when we don't host the branch?
- ~~allow for several packages to be selected~~ - **done** (multi-select filters with OR logic)
- should we leave only type, no experience?
- ~~make the whole text instead of description searcheable~~ - **done** (Pagefind full-text search)
- ~~pull keywords out of search and have them as category~~ - **done** (keyword autocomplete + popular keyword chips)
- ~~should we add sorting?~~ - **done**
	- ~~created/updated~~ - **done** (sort by date)
	- ~~alphabetical~~ - **done** (sort by title A-Z)
	- ~~difficulty~~ - **done** (sort by level: Beginner → Intermediate → Professional)

### Implemented features:
- Bootstrap 5 upgrade (from Bootstrap 4)
- Multi-select filters (level, type, package, domain)
- Dual search modes: keyword search + Pagefind full-text search
- Keyword autocomplete with datalist
- Popular keyword chips for quick filtering
- Sort by: date, title, difficulty
- URL parameter persistence for shareable filtered views
- Muted Wes Anderson-inspired color palette
- Dynamic filter generation from tutorial data
- Legacy tutorial toggle (hidden by default)
- Tutorial metadata schema and validation
