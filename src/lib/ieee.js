const BASE = 'https://ieeexploreapi.ieee.org/api/v1/search/articles'

function parseArticle(a) {
  const authors = (a.authors?.authors ?? []).map(x => x.full_name).filter(Boolean)
  const keywords = [
    ...(a.index_terms?.author_terms?.terms ?? []),
    ...(a.index_terms?.ieee_terms?.terms ?? []),
  ].map(k => k.toLowerCase())

  return {
    id: `ieee-${a.article_number}`,
    title: (a.title ?? '').replace(/\s+/g, ' ').trim(),
    authors,
    abstract: (a.abstract ?? '').replace(/\s+/g, ' ').trim(),
    published: a.publication_date ?? '',
    url: a.pdf_url ?? `https://ieeexplore.ieee.org/document/${a.article_number}`,
    source: 'ieee',
    keywords: [...new Set(keywords)],
    doi: a.doi ?? null,
  }
}

export async function fetchIEEEPapers(searchTerm, apiKey, maxResults = 20) {
  if (!apiKey?.trim()) return []

  const params = new URLSearchParams({
    apikey: apiKey.trim(),
    querytext: searchTerm,
    max_records: maxResults,
    start_record: 1,
    sort_order: 'desc',
    sort_field: 'publication_date',
  })

  const res = await fetch(`${BASE}?${params}`)
  if (!res.ok) throw new Error(`IEEE API ${res.status}`)
  const data = await res.json()
  return (data.articles ?? []).map(parseArticle)
}
