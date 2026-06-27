// SOTA detection via OpenAlex (https://api.openalex.org)
// Finds highly-cited recent arXiv papers for a given arXiv category.
// (CORS-friendly, no API key required.)

import { fetchArxivByIds } from './arxiv'
import sotaIndex from '../data/sota-index.json'

const BASE = 'https://api.openalex.org'
const ARXIV_SOURCE = 'S4306400194'  // OpenAlex source ID for arXiv
const ENRICH_COUNT = 10  // how many top SOTA papers to pull real arXiv metadata for

// arXiv category → OpenAlex concept ID
const CONCEPT_MAP = {
  'cs.CV': 'C31972630',   // Computer vision
  'cs.CL': 'C204321447',  // Natural language processing
  'cs.LG': 'C119857082',  // Machine learning
  'cs.AI': 'C154945302',  // Artificial intelligence
  'cs.NE': 'C50644808',   // Artificial neural networks
  'cs.RO': 'C154945302',  // Robotics → AI concept
  'cs.IR': 'C204321447',  // Information retrieval → NLP
  'cs.MM': 'C31972630',   // Multimedia → CV
  'cs.SD': 'C119857082',  // Sound → ML
  'eess.AS': 'C119857082',
  'eess.IV': 'C31972630',
  'stat.ML': 'C119857082',
}

/**
 * Papers with Code benchmark tier for a paper id ('arxiv-XXXX').
 * 'current' = #1 on a benchmark leaderboard, 'former' = ranked 2..10, null = not tracked.
 * (Built offline by scripts/build-sota.mjs from the PwC archive.)
 */
export function getPwcTier(paperId) {
  return sotaIndex[paperId]?.tier ?? null
}

/** Benchmark detail for a paper id: { tier, benchmark, task, metric, value, rank, date } or null. */
export function getPwcInfo(paperId) {
  return sotaIndex[paperId] ?? null
}

function extractArxivId(url) {
  if (!url) return null
  // .../abs/2403.17888  or  .../abs/2403.17888v2
  let m = url.match(/arxiv\.org\/abs\/(\d{4}\.\d{4,5})/i)
  if (m) return m[1]
  // doi.org/10.48550/arxiv.2502.12524
  m = url.match(/arxiv\.(\d{4}\.\d{4,5})/i)
  if (m) return m[1]
  return null
}

/**
 * Fetches highly-cited recent arXiv papers for the given category.
 * Returns { sotaIds: Set<string>, sotaPapers: Array }:
 *   - sotaIds: all matched 'arxiv-XXXX' IDs (for highlighting existing list papers)
 *   - sotaPapers: top papers with ACCURATE arXiv metadata (title/abstract/keywords),
 *     enriched from arXiv since OpenAlex titles are sometimes mislabeled.
 */
export async function fetchSotaPapers(category) {
  const conceptId = CONCEPT_MAP[category]
  if (!conceptId) return { sotaIds: new Set(), sotaPapers: [] }

  try {
    const filter = [
      `concepts.id:${conceptId}`,
      `locations.source.id:${ARXIV_SOURCE}`,
      'publication_year:2023-2026',
      'cited_by_count:>8',
    ].join(',')

    const url = `${BASE}/works?filter=${filter}&sort=cited_by_count:desc` +
      `&select=locations,cited_by_count&per-page=80`

    const res = await fetch(url)
    if (!res.ok) throw new Error(`OpenAlex ${res.status}`)
    const data = await res.json()

    const sotaIds = new Set()
    const ordered = []  // [{ arxivId, cited }] in citation-desc order

    for (const work of data.results || []) {
      let arxivId = null
      for (const loc of work.locations || []) {
        const id = extractArxivId(loc.landing_page_url)
        if (id) { arxivId = id; break }
      }
      if (!arxivId) continue
      const paperId = `arxiv-${arxivId}`
      if (sotaIds.has(paperId)) continue
      sotaIds.add(paperId)
      ordered.push({ arxivId, cited: work.cited_by_count })
    }

    // Enrich the top N with real arXiv metadata for correct titles + keywords
    const topIds = ordered.slice(0, ENRICH_COUNT).map(o => o.arxivId)
    const citedMap = new Map(ordered.map(o => [`arxiv-${o.arxivId}`, o.cited]))
    const enriched = await fetchArxivByIds(topIds)

    // Preserve citation-desc ordering and attach citation counts
    const byId = new Map(enriched.map(p => [p.id, p]))
    const sotaPapers = topIds
      .map(aid => byId.get(`arxiv-${aid}`))
      .filter(Boolean)
      .map(p => ({ ...p, citedByCount: citedMap.get(p.id) }))

    return { sotaIds, sotaPapers }
  } catch {
    return { sotaIds: new Set(), sotaPapers: [] }
  }
}
