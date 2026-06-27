# catu

Visualize research papers as a personal knowledge graph. Add an arXiv category
(`cs.CV`, `cs.LG`, …) or a free keyword (e.g. `surgical`) and catu fetches papers,
links them by keyword similarity in a d3-force graph, and auto-detects
state-of-the-art papers from Papers with Code benchmark leaderboards (with an
OpenAlex high-citation fallback). Pure front end — no backend.

## Features

- **3-source fetch** (arXiv + IEEE Xplore + OpenAlex SOTA), de-duplicated.
- **SOTA tiers**: current (#1 on a benchmark), former (ranked 2–10), and
  high-citation fallback — colored gold / slate / blue.
- **Graph**: keyword-similarity (Jaccard) edges; search / keyword chips narrow
  the graph itself; optional "citation shade" mode.
- **List**: 20-per-page pagination, AND/OR keyword filter, newest / most-cited
  sort; clicking a node jumps to that paper.
- **Themes**: Night Owl (night / noon), persisted to `localStorage`.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173/catu/
npm run build
npm run lint
```

## SOTA index

`src/data/sota-index.json` is generated offline from the Papers with Code
archive and committed (the app has no runtime dependency on it). To regenerate:

```bash
npm run build:sota
```

## Deploy (GitHub Pages)

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds and
publishes to GitHub Pages. In the repo settings, set **Settings → Pages →
Source → GitHub Actions**. The `base` in `vite.config.js` must match the repo
name (`/catu/`).
