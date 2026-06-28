```
                 ____      _      _____   _   _
 n  ____  n     / ___|    / \    |_   _| | | | |
 | |o  o| |    | |       / _ \     | |   | | | |
 |_|    |_|    | |___   / ___ \    | |   | |_| |
   |    |       \____| /_/   \_\   |_|    \___/
```

> Visualize research papers as a personal knowledge graph — papers linked by
> **meaning**, with state-of-the-art work surfaced automatically.

**Live:** https://gleipnir99.github.io/catu/

Add an arXiv category (`cs.CV`, `cs.LG`, …) or a free-text keyword (e.g. `surgical`).
catu fetches recent papers, lays them out in a d3-force graph, links them by semantic
similarity (in-browser sentence embeddings — nothing leaves your browser), and detects
state-of-the-art papers from Papers with Code leaderboards. No backend, no API key.

## Features

- **Semantic graph edges.** Related work connects even with no shared keywords, via
  sentence-embedding cosine similarity (`all-MiniLM-L6-v2`, run in the browser, cached
  locally). The graph appears instantly with a keyword fallback, then upgrades to
  semantic links once vectors are ready.
- **SOTA tiers.** *current* (#1 on a benchmark), *former* (ranked 2–10), and a
  high-citation *fallback* — gold / slate / blue, with leaders pulled to the center.
- **Citation shade.** Color nodes by citation count (darker = more cited).
- **Filter & sort.** Full-text search and AND/OR keyword chips narrow the graph itself;
  the list paginates and sorts by newest or most-cited.
- **Save & mark.** Keep papers, toggle SOTA manually, mark read.
- **Themes.** *Night Owl* / *noon*.

## Usage tips

- **Start a topic** by typing an arXiv code (`cs.CV`) for newest-first, or any keyword
  (`diffusion`, `surgical`) for relevance-ranked results.
- **First load** downloads the embedding model (~23 MB, then cached). Watch the
  "Analyzing meaning…" status — edges sharpen to semantic similarity when it finishes.
  Revisiting a topic is instant (vectors are cached).
- **Read the edges:** thicker / shorter links = more related papers. Gold-ringed nodes
  at the center are current SOTA.
- **Click a node** to focus it and jump the list to that paper.
- **Narrow things down** with the search box and keyword chips (AND/OR) — they prune the
  graph, not just the list.
- **Toggle "Citation shade"** to spot the most-cited papers at a glance.
- **☾ / ☀** switches between night and noon themes.

> IEEE Xplore is optional and off by default (needs an API key + a CORS proxy); catu
> runs on arXiv + OpenAlex without it.
