// Per-paper citation counts via OpenAlex (CORS-friendly, no API key).
// Used for the "citation shade" graph mode and richer high-citation badges.
//
// arXiv papers carry the DataCite DOI 10.48550/arXiv.<id>, so we batch-query
// OpenAlex by DOI and map results back to our 'arxiv-<id>' paper ids.

const BASE = 'https://api.openalex.org'
const BATCH = 50  // OpenAlex OR-filter / per-page limit

function arxivIdFromDoi(doi) {
  if (!doi) return null
  const m = doi.match(/arxiv\.(\d{4}\.\d{4,5})/i)
  return m ? m[1] : null
}

async function fetchBatch(arxivIds, counts) {
  const filter = `doi:${arxivIds.map(id => `10.48550/arxiv.${id}`).join('|')}`
  const url = `${BASE}/works?filter=${encodeURIComponent(filter)}` +
    `&select=doi,cited_by_count&per-page=${BATCH}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`OpenAlex ${res.status}`)
  const data = await res.json()
  for (const work of data.results || []) {
    const aid = arxivIdFromDoi(work.doi)
    if (aid) counts.set(`arxiv-${aid}`, work.cited_by_count ?? 0)
  }
}

/**
 * Fetches citation counts for the given paper ids ('arxiv-XXXX' / 'ieee-...').
 * Only arXiv ids are resolvable; returns Map<paperId, citedByCount>.
 * Never throws — partial/empty results on failure.
 */
export async function fetchCitationCounts(paperIds) {
  const arxivIds = paperIds
    .filter(id => id.startsWith('arxiv-'))
    .map(id => id.slice('arxiv-'.length))
  const counts = new Map()
  if (!arxivIds.length) return counts

  const batches = []
  for (let i = 0; i < arxivIds.length; i += BATCH) {
    batches.push(fetchBatch(arxivIds.slice(i, i + BATCH), counts).catch(() => {}))
  }
  await Promise.all(batches)
  return counts
}
