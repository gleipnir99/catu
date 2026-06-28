import { openDB } from 'idb'

// Semantic paper similarity using in-browser sentence embeddings.
// Model: all-MiniLM-L6-v2 (384-dim), quantized, runs via WASM/WebGPU — no backend, no API key.
// Vectors are L2-normalized, so cosine similarity == dot product.

const MODEL = 'Xenova/all-MiniLM-L6-v2'
const ABSTRACT_CHARS = 600
const BATCH = 16

let extractorPromise = null
// transformers.js is large, so load it lazily (its own chunk) only when we actually embed —
// this keeps it out of the initial bundle so the UI/graph render first.
function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers')
      env.allowLocalModels = false  // always fetch the model from the HF CDN
      return pipeline('feature-extraction', MODEL, { dtype: 'q8' })
    })()
  }
  return extractorPromise
}

function paperText(p) {
  return (p.title + '. ' + (p.abstract || '').slice(0, ABSTRACT_CHARS)).trim()
}

// ---- cache: a separate IndexedDB so the main app DB (db.js) version stays untouched ----
const CACHE_DB = 'catu-embeddings'
const STORE = 'vec'
let cacheDbPromise = null
function cacheDB() {
  if (!cacheDbPromise) {
    cacheDbPromise = openDB(CACHE_DB, 1, {
      upgrade(db) { db.createObjectStore(STORE) },
    })
  }
  return cacheDbPromise
}

async function readCache(ids) {
  const db = await cacheDB()
  const tx = db.transaction(STORE, 'readonly')
  const out = new Map()
  await Promise.all(ids.map(async id => {
    const v = await tx.store.get(id)
    if (v) out.set(id, v)  // Float32Array
  }))
  return out
}

async function writeCache(entries) {
  if (entries.length === 0) return
  const db = await cacheDB()
  const tx = db.transaction(STORE, 'readwrite')
  for (const [id, vec] of entries) tx.store.put(vec, id)
  await tx.done
}

// Embed all papers → Map<id, Float32Array>. Reuses cached vectors; computes the rest in batches.
// onProgress(done, total) reports embedding progress for the uncached papers.
export async function embedPapers(papers, onProgress) {
  if (papers.length === 0) return new Map()
  const ids = papers.map(p => p.id)
  const result = await readCache(ids)
  const todo = papers.filter(p => !result.has(p.id))
  if (todo.length === 0) return result

  const extractor = await getExtractor()
  const fresh = []
  for (let i = 0; i < todo.length; i += BATCH) {
    const chunk = todo.slice(i, i + BATCH)
    const out = await extractor(chunk.map(paperText), { pooling: 'mean', normalize: true })
    const dim = out.dims[1]
    chunk.forEach((p, k) => {
      const vec = out.data.slice(k * dim, (k + 1) * dim)  // Float32Array
      result.set(p.id, vec)
      fresh.push([p.id, vec])
    })
    onProgress?.(Math.min(i + BATCH, todo.length), todo.length)
  }
  writeCache(fresh).catch(() => {})  // best-effort; failures don't block the graph
  return result
}

function dot(a, b) {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

// Build graph links from embeddings via cosine similarity.
// Keeps each paper's top-K most-similar neighbors above `threshold` to avoid a hairball.
// strength is rescaled to [0,1] (0 at threshold, 1 at identical) so it reuses the
// distance/width/opacity formulas in GraphView the same way Jaccard strength did.
export function computeLinksSemantic(papers, embeddings, { threshold = 0.4, topK = 6 } = {}) {
  const n = papers.length
  if (n < 2) return []
  const vecs = papers.map(p => embeddings.get(p.id))
  const neighbors = Array.from({ length: n }, () => [])

  for (let i = 0; i < n; i++) {
    const a = vecs[i]
    if (!a) continue
    for (let j = i + 1; j < n; j++) {
      const b = vecs[j]
      if (!b) continue
      const sim = dot(a, b)
      if (sim >= threshold) {
        neighbors[i].push([j, sim])
        neighbors[j].push([i, sim])
      }
    }
  }

  const seen = new Set()
  const links = []
  for (let i = 0; i < n; i++) {
    neighbors[i].sort((x, y) => y[1] - x[1])
    for (const [j, sim] of neighbors[i].slice(0, topK)) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`
      if (seen.has(key)) continue
      seen.add(key)
      const strength = Math.min(1, (sim - threshold) / (1 - threshold))
      links.push({ source: papers[i].id, target: papers[j].id, strength })
    }
  }
  return links
}
