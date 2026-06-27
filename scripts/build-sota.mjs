// Build a compact SOTA index from the Papers with Code archive.
//
// Papers with Code was sunset by Meta in 2025-07; its benchmark leaderboards
// live on as a static dump (sota-extractor format) on Hugging Face. This script
// downloads that dump once, extracts per-benchmark rankings, and emits a small
// { "arxiv-XXXX": { tier, benchmark, metric, value, rank, date } } index that
// the app bundles. The index is committed so the app has zero runtime dependency
// on Papers with Code.
//
//   current = #1 on at least one benchmark leaderboard
//   former  = ranked 2..FORMER_MAX_RANK on a benchmark (a former / contender SOTA)
//
// Papers outside this index fall back to OpenAlex high-citation detection at
// runtime (see src/lib/sota.js).
//
// Usage:  node scripts/build-sota.mjs
//   Optional: pass a local evaluation-tables.json(.gz) path as argv[2].

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const CACHE_DIR = path.join(__dirname, '.cache')
const CACHE_JSON = path.join(CACHE_DIR, 'evaluation-tables.json')
const OUT = path.join(ROOT, 'src', 'data', 'sota-index.json')
const DUMP_URL =
  'https://huggingface.co/datasets/pwc-archive/files/resolve/main/jul-28-evaluation-tables.json.gz'

// Only keep papers recent enough to plausibly appear in the app (arXiv 2023+ /
// OpenAlex 2023-2026). Trims the index from ~10k to ~5.6k entries.
const MIN_YEAR = 2022
const FORMER_MAX_RANK = 10

// Metrics where a LOWER value is better; everything else assumed higher-is-better.
const LOWER_BETTER = [
  'error', 'wer', 'cer', 'der', 'eer', 'mae', 'mse', 'rmse', 'nmse', 'fid', 'kid',
  'lpips', 'loss', 'perplex', 'ppl', 'nme', 'mpjpe', 'mpve', 'epe', 'distance',
  'chamfer', 'latency', 'flops', 'param', 'time', 'emission', 'co2', 'drift',
  'nll', 'bpc', 'bpd', 'mad', 'rank-1 err',
]

const lowerIsBetter = (metric) => {
  const m = (metric || '').toLowerCase()
  return LOWER_BETTER.some((k) => m.includes(k))
}
const parseVal = (v) => {
  if (v == null) return NaN
  const m = String(v).replace(/,/g, '').match(/-?\d+\.?\d*/)
  return m ? parseFloat(m[0]) : NaN
}
const arxivId = (url) => {
  if (!url) return null
  let m = url.match(/arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5})/i)
  if (m) return m[1]
  m = url.match(/arxiv\.(\d{4}\.\d{4,5})/i)
  if (m) return m[1]
  return null
}
const yearOf = (date) => {
  const m = (date || '').match(/^(\d{4})/)
  return m ? +m[1] : 0
}

async function loadDump() {
  const local = process.argv[2]
  if (local) return JSON.parse(fs.readFileSync(local, 'utf8'))
  if (fs.existsSync(CACHE_JSON)) return JSON.parse(fs.readFileSync(CACHE_JSON, 'utf8'))

  console.log(`Downloading PwC dump → ${DUMP_URL}`)
  const res = await fetch(DUMP_URL)
  if (!res.ok) throw new Error(`download failed: ${res.status}`)
  const gz = Buffer.from(await res.arrayBuffer())
  const json = zlib.gunzipSync(gz).toString('utf8')
  fs.mkdirSync(CACHE_DIR, { recursive: true })
  fs.writeFileSync(CACHE_JSON, json)
  return JSON.parse(json)
}

function buildIndex(data) {
  const index = {} // arxiv-XXXX -> best entry

  const consider = (aid, entry) => {
    const id = `arxiv-${aid}`
    const cur = index[id]
    // prefer current over former, then smaller rank, then newer paper
    const better =
      !cur ||
      (entry.tier === 'current' && cur.tier !== 'current') ||
      (entry.tier === cur.tier && entry.rank < cur.rank) ||
      (entry.tier === cur.tier && entry.rank === cur.rank && (entry.date || '') > (cur.date || ''))
    if (better) index[id] = entry
  }

  const walk = (tasks) => {
    for (const t of tasks || []) {
      for (const d of t.datasets || []) {
        const sota = d.sota
        if (!sota || !sota.rows || !sota.rows.length) continue
        const metric = (sota.metrics || [])[0]
        if (!metric) continue
        const dir = lowerIsBetter(metric) ? 1 : -1
        const ranked = sota.rows
          .map((r) => ({
            aid: arxivId(r.paper_url),
            val: parseVal(r.metrics && r.metrics[metric]),
            date: r.paper_date,
            raw: r.metrics && r.metrics[metric],
          }))
          .filter((r) => !Number.isNaN(r.val))
          .sort((a, b) => dir * (a.val - b.val))

        ranked.forEach((r, i) => {
          if (!r.aid) return
          if (yearOf(r.date) < MIN_YEAR) return
          const rank = i + 1
          const tier = rank === 1 ? 'current' : 'former'
          if (tier === 'former' && rank > FORMER_MAX_RANK) return
          consider(r.aid, {
            tier,
            benchmark: d.dataset,
            task: t.task,
            metric,
            value: String(r.raw ?? r.val),
            rank,
            date: r.date,
          })
        })
      }
      walk(t.subtasks)
    }
  }

  walk(data)
  return index
}

const data = await loadDump()
const index = buildIndex(data)
fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, JSON.stringify(index))

const entries = Object.values(index)
const current = entries.filter((e) => e.tier === 'current').length
console.log(
  `Wrote ${path.relative(ROOT, OUT)} — ${entries.length} entries ` +
    `(${current} current / ${entries.length - current} former), ${fs.statSync(OUT).size} bytes`,
)
