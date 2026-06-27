const BASE = 'https://export.arxiv.org/api/query'

function parseAtom(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const ns = 'http://www.w3.org/2005/Atom'
  return Array.from(doc.getElementsByTagNameNS(ns, 'entry')).map(e => {
    const get = tag => e.getElementsByTagNameNS(ns, tag)[0]?.textContent?.trim() ?? ''
    const id = get('id')
      .replace('http://arxiv.org/abs/', '')
      .replace('https://arxiv.org/abs/', '')
      .replace(/v\d+$/, '')  // strip version (v1, v2…) so IDs match OpenAlex/dedup
    const authors = Array.from(e.getElementsByTagNameNS(ns, 'author'))
      .map(a => a.getElementsByTagNameNS(ns, 'name')[0]?.textContent?.trim())
      .filter(Boolean)
    // per-paper cross-listed categories
    const categories = Array.from(e.getElementsByTagNameNS(ns, 'category'))
      .map(c => c.getAttribute('term'))
      .filter(Boolean)
    return {
      id: `arxiv-${id}`,
      title: get('title').replace(/\s+/g, ' '),
      authors,
      abstract: get('summary').replace(/\s+/g, ' '),
      published: get('published'),
      updated: get('updated'),
      url: `https://arxiv.org/abs/${id}`,
      source: 'arxiv',
      keywords: categories,  // arXiv cross-listed categories as structured keywords
    }
  })
}

// arXiv sends CORS headers, so direct fetch normally works; corsproxy.io is a fallback.
async function fetchArxivXml(params) {
  try {
    const res = await fetch(`${BASE}?${params}`)
    if (!res.ok) throw new Error('direct fetch failed')
    return await res.text()
  } catch {
    const target = encodeURIComponent(`${BASE}?${params}`)
    const res = await fetch(`https://corsproxy.io/?url=${target}`)
    if (!res.ok) throw new Error(`proxy fetch failed: ${res.status}`)
    return await res.text()
  }
}

// query: 'cat:cs.LG' | 'all:deep+learning' | bare category 'cs.LG' (compat)
// Category browsing → newest first; free-keyword search → relevance (IEEE-Xplore-like).
export async function fetchArxivPapers(query, maxResults = 20) {
  const searchQuery = /^(cat:|all:|ti:|abs:)/.test(query) ? query : `cat:${query}`
  const byKeyword = /^(all:|ti:|abs:)/.test(searchQuery)
  const params = new URLSearchParams({
    search_query: searchQuery,
    start: 0,
    max_results: maxResults,
    sortBy: byKeyword ? 'relevance' : 'submittedDate',
    sortOrder: 'descending',
  })
  return parseAtom(await fetchArxivXml(params))
}

// Fetch accurate metadata for specific arXiv IDs (bare ids, no 'arxiv-' prefix).
export async function fetchArxivByIds(ids) {
  if (!ids.length) return []
  const params = new URLSearchParams({
    id_list: ids.join(','),
    max_results: ids.length,
  })
  return parseAtom(await fetchArxivXml(params))
}
