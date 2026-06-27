const STOP = new Set([
  'a','an','the','in','on','at','to','for','of','and','or','is','are','was',
  'with','from','by','as','we','our','this','that','these','those','it','its',
  'be','can','have','has','not','which','their','into','while','also','both',
  'than','then','when','such','each','via','two','one','more','most','over',
  'been','being','were','will','would','could','should','may','might','must',
  'they','them','there','here','what','where','how','why','who',
  'very','just','but','yet','so','if','do','does','did','get','gets','got',
  'about','after','through','however','therefore','thus','hence',
])

export function extractKeywords(paper) {
  // IEEE: use structured index_terms (precise, curated)
  if (paper.source === 'ieee' && paper.keywords?.length) {
    return new Set(paper.keywords.filter(k => k.length > 2 && !STOP.has(k)))
  }
  // arXiv / fallback: NLP on title + abstract only
  const text = (paper.title + ' ' + (paper.abstract || '').slice(0, 500)).toLowerCase()
  return new Set(
    text.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w))
  )
}

export function computeLinks(papers, threshold = 0.08) {
  if (papers.length < 2) return []
  const kws = papers.map(extractKeywords)
  const links = []
  for (let i = 0; i < papers.length; i++) {
    for (let j = i + 1; j < papers.length; j++) {
      const a = kws[i], b = kws[j]
      let inter = 0
      for (const w of a) if (b.has(w)) inter++
      const union = a.size + b.size - inter
      const sim = union > 0 ? inter / union : 0
      if (sim >= threshold) {
        links.push({ source: papers[i].id, target: papers[j].id, strength: sim })
      }
    }
  }
  return links
}
