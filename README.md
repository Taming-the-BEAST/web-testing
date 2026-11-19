# Taming the BEAST website

Taming the BEAST is a platform for collating a comprehensive and cohesive set of BEAST 2 tutorials in one location, providing researchers the resources necessary to learn how to perform analyses in BEAST 2. This GitHub repository stores the source code for the Taming the BEAST website. The site is based on Trevor Bedford's lab website ([http://bedford.io](http://bedford.io)).

## Build site

You can choose to set up a build environment locally or use a container image. Building and publishing with a container image can also be done directly on GitHub. You may also first use the testing set up to check any changes.

The repositories whose tutorials are included in the build are listed under `tutorials:` in `_config.yml`. Edit that list to add or remove tutorials.

### Build and test within GitHub

#### Build and publish TESTING version of the site within GitHub

  All changes should be made to [blotter_test](https://github.com/Taming-the-BEAST/blotter_test) repository first:
  - sync [blotter_test](https://github.com/Taming-the-BEAST/blotter_test) with [blotter](https://github.com/Taming-the-BEAST/blotter)
  - push changes to [blotter_test](https://github.com/Taming-the-BEAST/blotter_test)
  - publish testing version of the website (this also tests that current container can build it):
    - go to the https://github.com/Taming-the-BEAST/web-testing repository
    - select `Actions` tab
    - select `Publish TTB website` action
    - click `Run workflow` and wait for it to finish.
  - Alternativelly, directly edit this repository and it will generate new file. But no changes will be saved to [blotter_test](https://github.com/Taming-the-BEAST/blotter_test), so you may loose them the next time you use `Publish TTB website` action to build and publish the site. 
  - On [web_testing](https://github.com/Taming-the-BEAST/web-testing) you can edit _config.yaml to have `baseurl: /web-testing` at the top, right after `url` line. This will make so you can avoid always adding `/web-testing/` to the url while testing your changes locally. **NEVER** commit and push this change to [blotter](https://github.com/Taming-the-BEAST/blotter)!!!s
  
  Hopefully, you can see your changes now on the [taming-the-beast.org/web-testing/](https://taming-the-beast.org/web-testing/)  

#### Build and publish PRODUCTION version of the site within GitHub   

  If you are ready to publish the public version of the website, repeat the same steps as above but from the https://github.com/Taming-the-BEAST/Taming-the-BEAST.github.io repository:
  - go to the [https://github.com/Taming-the-BEAST/web-testing](https://github.com/Taming-the-BEAST/web-testing) repository
  - select `Actions` tab
  - select `Publish TTB website` action
  - click `Run workflow` and wait for it to finish. 
  
  You should see the changes on the https://taming-the-beast.org website.

### Build site locally

#### Prerequisites

  The site requires:
  - **Ruby 3.2 or newer** and **Bundler 4.0.18** (the version in `Gemfile.lock`) -- for Jekyll
  - **Node.js 22 or newer** and **npm** -- for Pagefind and for the JavaScript unit tests
  - **Pagefind 1.5.2** -- for full-text search indexing (optional; the same version as in the `Dockerfile`)
  - A **GitHub token** in `GITHUB_TOKEN` -- only for fetching tutorials (step 1 below)

  Using Docker avoids installing these manually. Otherwise install Ruby, then Bundler and the Ruby dependencies:
  ```
  gem install bundler -v 4.0.18
  bundle install
  ```

  On macOS, do not use the system Ruby (2.6, too old). Install a current one with Homebrew and put it first on the `PATH`:
  ```
  brew install ruby
  export PATH="/opt/homebrew/opt/ruby/bin:$PATH"
  export PATH="$(gem environment gemdir)/bin:$PATH"
  ```
  (Add the two `export` lines to `~/.zshrc` to keep them.)

  Pagefind can be installed as a binary (see the `Dockerfile`), or run through npm without installing it:
  ```
  npx -y pagefind@1.5.2 --site _site --glob "tutorials/**/*.html"
  ```

#### Using Docker (recommended)

  Pull the pre-built image from GitHub Container Registry:
  ```
  docker pull ghcr.io/taming-the-beast/ttb-web-build-env:latest
  ```

  You may need to authenticate first (requires a personal access token with `read:packages` permission):
  ```
  echo YOUR_TOKEN | docker login ghcr.io -u USERNAME --password-stdin
  ```

  Alternatively, build the image locally from Dockerfile:
  ```
  docker build -t ttb-web-build-env .
  ```

  All of the commands below can be run inside the Docker container. Either prefix them with `docker run`, or start an interactive shell:
  ```
  docker run -it --rm -p 4000:4000 -v $(pwd):/page ttb-web-build-env bash
  ```

  The `-v $(pwd):/page` flag mounts your local files into the container. The `-p 4000:4000` flag exposes the Jekyll server to your browser at `http://localhost:4000/`.

#### Build pipeline

  Building the site has up to five stages. Depending on your needs, some can be skipped. See below for shortcuts, if you have npm (Node.js) available.

  **1. Fetch tutorials** (needed when tutorials are missing locally or should be updated):
  ```
  export GITHUB_TOKEN=ghp_your_token_here
  ruby _scripts/update-and-preprocess.rb
  ```
  Clones missing tutorial repos from GitHub into `tutorials/`, runs preprocessing, generates licence pages and writes `_data/tutorials.yml`, `_data/popular_keywords.yml`, `_data/popular_packages.yml` and `_data/tutorial_workflows.yml` (the workflow filter options, in schema order).

  **Existing clones are reset to their upstream version** (`git fetch`, `git reset --hard`, `git clean -fdx`), so the site always shows the current tutorials. This discards any local changes inside `tutorials/<name>/`. To keep local edits (for example while working on a tutorial), skip the refresh:
  ```
  TTB_NO_REFRESH=1 ruby _scripts/update-and-preprocess.rb
  ```
  Folders under `tutorials/` that are not their own git clone are never reset.

  The script prints warnings for metadata problems (unknown packages or domains, unquoted or unparsable versions, fields that are now defined in the tutorial itself and can be removed from `tutorials_metadata.yml`) and lists tutorials without `beastversion_package`.

  **2. Preprocess tutorial markdown** (required before each build):

  Note: if you ran step 1, preprocessing was already included -- you can skip this step.

  ```
  ruby _scripts/preprocess-tutorial-markdown.rb
  ```
  Tutorials are stored as `README.md` in their repos. This script injects permalinks and layout metadata into the front matter so Jekyll renders them correctly. It also converts `.md` links to `.html`.

  **3. Build the site with Jekyll:**
  ```
  bundle exec jekyll build
  ```
  Generates the static site in `_site/`. To build for a sub-path deployment such as the testing site, pass the base URL:
  ```
  bundle exec jekyll build --baseurl /web-testing
  ```

  **4. Index for full-text search** (optional):
  ```
  pagefind --site _site --glob "tutorials/**/*.html"
  ```
  Generates the Pagefind search index in `_site/pagefind/`. Only the main page of each tutorial is indexed (not licence pages or the citation block). Without this step, the tutorial search still finds titles, tags, packages, domains and authors, and says that text search is unavailable.

  **5. Serve the site:**
  ```
  bundle exec jekyll serve --host 0.0.0.0
  ```
  Starts a local server at `http://localhost:4000/`. The `--host 0.0.0.0` flag is needed when running inside Docker.

  `_site/pagefind/` is kept when Jekyll rebuilds (`keep_files` in `_config.yml`), so the search index survives `jekyll serve`. The index is not updated by Jekyll, though: after changing tutorial content, run step 4 again. Use `--skip-initial-build` to serve an existing `_site/` without rebuilding:
  ```
  bundle exec jekyll serve --host 0.0.0.0 --skip-initial-build
  ```

#### npm shortcuts

  If you have npm available, `package.json` provides shortcuts that combine the steps above:

  | Command | What it does |
  |---------|-------------|
  | `npm run fetch` | Step 1: clone/refresh tutorial repos + preprocess + generate data |
  | `npm run preprocess` | Step 2: preprocess tutorial markdown |
  | `npm run build` | Steps 2+3+4: preprocess + Jekyll build + Pagefind indexing |
  | `npm run build:quick` | Steps 2+3: preprocess + Jekyll build (no search indexing) |
  | `npm run serve:indexed` | Steps 2+3+4+5: full build + serve with full-text search |
  | `npm run serve:quick` | Steps 2+3+5: quick build + serve (no full-text search) |
  | `npm run index` | Step 4 only: run Pagefind indexing on existing `_site/` |
  | `npm run serve` | Step 5 only: start Jekyll dev server |

  `npm run build` and `npm run build:quick` use the `BASEURL` environment variable as the base URL, if set.

  Common workflows:
  ```
  # Tutorials already present locally -- build and serve with search
  npm run serve:indexed

  # Fetch (and refresh) tutorials from GitHub first, then build and serve
  GITHUB_TOKEN=ghp_your_token_here npm run fetch && npm run serve:indexed

  # Keep local edits in tutorials/ while fetching data
  TTB_NO_REFRESH=1 GITHUB_TOKEN=ghp_your_token_here npm run fetch

  # Quick iteration -- no search indexing
  npm run serve:quick

  # Build as for the testing site (sub-path /web-testing)
  BASEURL=/web-testing npm run build
  ```

  See [Building a local copy of the site](https://taming-the-beast.github.io/contribute/Building-a-local-copy-of-the-site/) for more information.

## Testing

#### JavaScript unit tests

  The tutorial listing (`tutorials/index.html`) is driven by the ES modules in `js/tutorials/`. Their search, filter, sort and URL logic has unit tests that need no dependencies (Node.js 22 or newer):
  ```
  node --test js/tutorials/tests/*.test.mjs
  ```
  (Pass the files: `node --test` with a bare directory does not work on Node 22.) The tests are excluded from the built site.

#### Tutorial metadata

  Check a tutorial's front matter against `tutorials/tutorial_schema.yml`:
  ```
  ruby _scripts/validate_tutorial_metadata.rb tutorials/<Tutorial-name>/README.md
  ```
  It reports errors (for example an unknown workflow or domain, or a version that cannot be read) and warnings (legacy field names, unquoted versions, version ranges, missing recommended fields).

  Notes for tutorial metadata:
  - The **BEAST version** shown on the tutorial cards, and used by the BEAST version filter and sort, is `beastversion_package`: the newest BEAST 2 version the tutorial's packages are available for. Tutorials without it use `beastversion_tutorial` (the version the tutorial was written for) instead; the card's tooltip says which. Tutorials with neither are listed under "Not specified".
  - Write versions as quoted strings (`'2.7'`, `'2.7.x'`), not as numbers: an unquoted `2.10` is read as `2.1`.
  - A field in the tutorial's own `README.md` front matter takes precedence. `tutorials_metadata.yml` only fills in fields a tutorial does not define yet.
  - The current BEAST release is set by `beast_current` in `_config.yml` and marked "current" in the filter.

#### Checking the tutorial listing by hand

  After `npm run build` (or a build with `--baseurl /web-testing`), open `/tutorials/` and check:
  - search for a title word, a package, a domain and a word that only appears in tutorial text;
  - open Filters, tick options in several groups, remove them again through the chips; the browser Back button undoes the last change;
  - open "Deprecated tutorials" at the bottom of the list;
  - keyboard only: Tab reaches the search box, the Filters panel and its options, the sort menu and every card (in Safari, Option+Tab is needed to reach links);
  - with JavaScript disabled: all current tutorials are listed and the deprecated section opens;
  - on a phone (or at 320-375px wide): no sideways scrolling, and "Show N results" stays visible while scrolling the open Filters panel.

## License

  All source code in this repository, consisting of files with extensions `.html`, `.css`, `.less`, `.rb` or `.js`, is freely available under an MIT license, unless otherwise noted within a file. 

  **The MIT License (MIT)**

  Copyright (c) 2016-2017 Louis du Plessis, 2013-2016 Trevor Bedford

  Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR  PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


## TODOs

### Website source
  - Add RSS/Atom feed for updated tutorials
  - Add link for RSS/Atom feeds
  - Add BEAST version to tutorial layout page
  - Clean up repository and remove unnecessary files


### Website contents
  - Write a proper style guide for tutorials (current style guide is just a markdown syntax cheatsheet)
  - Rewrite documentation on adding tutorials (mentioning style to be followed)
  - Add documentation for converting between Markdown and Latex
  - Need new news posts (funding for future, new style guide etc.)
  - About page should be rewritten to make sure it is concurrent with the paper.


### Tutorials
  - Update Latex and layout for all latex tutorials (should use auto-generated latex from markdown tutorial)
  - Fix Structured coalescent tutorial (estimate gamma shape)
  - Fix Structured birth-death tutorial (estimate gamma shape)
  - Add FBD tutorial (need precooked runs and xml)
  - Structured coalescent tutorial markdown
  - FBD tutorial markdown
