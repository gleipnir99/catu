# catu

Visualize research papers as a personal knowledge graph.

Add an arXiv category (`cs.CV`, `cs.LG`, …) or a free-text keyword (e.g. `surgical`)
and catu fetches recent papers, lays them out in a **d3-force graph**, links them by
**semantic similarity** (in-browser sentence embeddings), and auto-detects
**state-of-the-art** papers from Papers with Code leaderboards. Pure front end — no
backend, no API key required.

**Live:** https://gleipnir99.github.io/catu/

## Features

- **Semantic graph edges.** Papers are connected by sentence-embedding cosine
  similarity (`all-MiniLM-L6-v2` via transformers.js), so related work links up even
  when it shares no keywords. Embeddings run entirely in the browser and are cached in
  IndexedDB — nothing is sent to a server. The graph renders instantly with a keyword
  fallback, then upgrades edges in place once vectors are ready.
- **SOTA tiers.** *current* (#1 on a benchmark), *former* (ranked 2–10), and a
  high-citation *fallback* — colored gold / slate / blue, with the leaders pulled
  toward the center. Sourced from Papers with Code, with an OpenAlex citation fallback.
- **Multi-source fetch.** arXiv + IEEE Xplore + OpenAlex, fetched in parallel and
  de-duplicated by title.
- **Citation shade.** Toggle node coloring by citation count (darker = more cited).
- **Filter & sort.** Full-text search and AND/OR keyword chips narrow the graph itself;
  the list paginates (20/page) and sorts by newest or most-cited. Clicking a graph node
  jumps the list to that paper.
- **Themes.** Night Owl *night* / *noon*, persisted to `localStorage`.

## Tech stack

React 19 · Vite 8 · d3-force (v7) · transformers.js · IndexedDB (`idb`) ·
deployed to GitHub Pages via GitHub Actions.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173/catu/
npm run build
npm run lint
```

## SOTA index

`src/data/sota-index.json` is generated offline from the Papers with Code archive and
committed (the app has no runtime dependency on it). To regenerate:

```bash
npm run build:sota
```

## Deploy (GitHub Pages)

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds and publishes to
GitHub Pages. In repo settings, set **Settings → Pages → Source → GitHub Actions**. The
`base` in `vite.config.js` must match the repo name (`/catu/`).

## Notes

- **IEEE Xplore** is optional and off by default. Its API needs a key and is not
  CORS-enabled for browsers, so enabling it requires an API key plus a proxy (e.g. a
  Cloudflare Worker that injects the key server-side). Without a key, catu runs on
  arXiv + OpenAlex.
- First visit downloads the embedding model (~23 MB, then cached by the browser).
