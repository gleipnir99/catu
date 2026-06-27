const ARXIV_CAT_RE = /^[a-z]{1,6}\.[a-z]{2,3}$/i

const IEEE_MAP = {
  'cs.LG': 'machine learning',
  'cs.CV': 'computer vision',
  'cs.CL': 'natural language processing',
  'cs.AI': 'artificial intelligence',
  'cs.RO': 'robotics',
  'cs.NE': 'neural networks',
  'cs.IR': 'information retrieval',
  'cs.CR': 'cybersecurity',
  'cs.DB': 'database systems',
  'cs.SE': 'software engineering',
  'cs.HC': 'human computer interaction',
  'stat.ML': 'machine learning',
  'eess.IV': 'image processing',
  'eess.AS': 'speech signal processing',
}

export function isArxivCategory(topic) {
  return ARXIV_CAT_RE.test(topic.trim())
}

export function getArxivQuery(topic) {
  const t = topic.trim()
  if (isArxivCategory(t)) return `cat:${t}`
  return `all:${t.replace(/\s+/g, '+')}`
}

export function getIEEESearchTerm(topic) {
  const t = topic.trim()
  if (isArxivCategory(t)) return IEEE_MAP[t] ?? t.replace('.', ' ')
  return t
}
