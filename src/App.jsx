import { useEffect, useState, useCallback, useMemo } from 'react'
import CategoryPanel from './components/CategoryPanel'
import GraphView from './components/GraphView'
import PapersPanel from './components/PapersPanel'
import { fetchArxivPapers } from './lib/arxiv'
import { fetchIEEEPapers } from './lib/ieee'
import { getArxivQuery, getIEEESearchTerm } from './lib/topics'
import { extractKeywords } from './lib/keywords'
import { addCategory, removeCategory, getCategories, savePaper, getPapers, toggleSota } from './lib/db'
import { fetchSotaPapers, getPwcTier } from './lib/sota'
import { fetchCitationCounts } from './lib/citations'
import './App.css'

const IEEE_KEY_STORAGE = 'ieee_api_key'
const THEME_STORAGE = 'rg_theme'

function normalizeTitle(t) {
  return t.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60)
}

function deduplicatePapers(papers) {
  const seen = new Set()
  return papers.filter(p => {
    const key = normalizeTitle(p.title)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export default function App() {
  const [categories, setCategories] = useState([])
  const [selected, setSelected] = useState(null)
  const [papers, setPapers] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [savedPapers, setSavedPapers] = useState([])
  const [selectedPaperId, setSelectedPaperId] = useState(null)
  const [search, setSearch] = useState('')
  const [kwFilter, setKwFilter] = useState(new Set())
  const [kwMode, setKwMode] = useState('and')  // 'and' | 'or'
  const [sortBy, setSortBy] = useState('recent')  // 'recent' | 'citations'
  // IEEE Xplore key is injected in code (see IEEE_KEY_STORAGE); no in-app UI.
  const [ieeeKey] = useState(() => localStorage.getItem(IEEE_KEY_STORAGE) ?? '')
  const [autoSotaIds, setAutoSotaIds] = useState(new Set())
  const [citationCounts, setCitationCounts] = useState(new Map())
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_STORAGE) || 'night')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(THEME_STORAGE, theme)
  }, [theme])

  useEffect(() => {
    getCategories().then(cats => {
      setCategories(cats)
      if (cats.length > 0) setSelected(cats[0].id)
    })
    getPapers().then(setSavedPapers)
  }, [])

  useEffect(() => {
    if (!selected) return
    let ignore = false
    setLoading(true)
    setError(null)
    setPapers([])
    setAutoSotaIds(new Set())
    setCitationCounts(new Map())
    setSelectedPaperId(null)
    setSearch('')
    setKwFilter(new Set())

    const arxivQuery = getArxivQuery(selected)
    const ieeeQuery = getIEEESearchTerm(selected)

    Promise.allSettled([
      fetchArxivPapers(arxivQuery, 20),
      fetchIEEEPapers(ieeeQuery, ieeeKey, 20),
      fetchSotaPapers(selected),
    ]).then(([arxivRes, ieeeRes, sotaRes]) => {
      if (ignore) return
      const arxivPapers = arxivRes.status === 'fulfilled' ? arxivRes.value : []
      const ieeePapers = ieeeRes.status === 'fulfilled' ? ieeeRes.value : []
      const { sotaIds: autoIds, sotaPapers } =
        sotaRes.status === 'fulfilled' ? sotaRes.value : { sotaIds: new Set(), sotaPapers: [] }

      // citation lookup so SOTA papers already in the arXiv list still show evidence
      const citedMap = new Map(sotaPapers.map(p => [p.id, p.citedByCount]))

      // Add top SOTA papers not already in the list (up to 8)
      const merged = deduplicatePapers([...arxivPapers, ...ieeePapers, ...sotaPapers.slice(0, 8)])
        .map(p => citedMap.has(p.id) ? { ...p, citedByCount: citedMap.get(p.id) } : p)
      setPapers(merged)
      setAutoSotaIds(autoIds)

      if (arxivRes.status === 'rejected' && ieeeRes.status === 'rejected') {
        setError('논문을 가져오지 못했습니다.')
      }

      // Enrich with per-paper citation counts (OpenAlex) for shade mode + badges.
      // Kept as a separate map so it doesn't trigger a graph re-layout when it arrives.
      fetchCitationCounts(merged.map(p => p.id)).then(counts => {
        if (!ignore && counts.size > 0) setCitationCounts(counts)
      })
    }).finally(() => { if (!ignore) setLoading(false) })

    return () => { ignore = true }
  }, [selected, ieeeKey])

  const handleAddCategory = useCallback(async id => {
    if (categories.find(c => c.id === id)) return
    await addCategory(id, id)
    const updated = await getCategories()
    setCategories(updated)
    setSelected(id)
  }, [categories])

  const handleRemoveCategory = useCallback(async id => {
    await removeCategory(id)
    const updated = await getCategories()
    setCategories(updated)
    if (selected === id) setSelected(updated[0]?.id ?? null)
  }, [selected])

  const handleSave = useCallback(async paper => {
    await savePaper(paper)
    const updated = await getPapers()
    setSavedPapers(updated)
  }, [])

  const handleToggleSota = useCallback(async paper => {
    await toggleSota(paper.id)
    const updated = await getPapers()
    setSavedPapers(updated)
  }, [])

  const savedIds = new Set(savedPapers.map(p => p.arxivId))

  // SOTA tier per paper, in priority order:
  //   Papers with Code benchmark rank (current/former) > manual toggle (current) > OpenAlex high-citation (fallback)
  const sotaTier = useMemo(() => {
    const manual = new Set(savedPapers.filter(p => p.status === 'sota').map(p => p.arxivId))
    const m = new Map()
    for (const p of papers) {
      const pwc = getPwcTier(p.id)
      if (pwc) m.set(p.id, pwc)
      else if (manual.has(p.id)) m.set(p.id, 'current')
      else if (autoSotaIds.has(p.id)) m.set(p.id, 'fallback')
    }
    return m
  }, [papers, savedPapers, autoSotaIds])

  // Most frequent extracted keywords across the current papers, for the chip filter.
  const topKeywords = useMemo(() => {
    const freq = new Map()
    for (const p of papers) {
      for (const k of extractKeywords(p)) {
        if (k.length > 3) freq.set(k, (freq.get(k) || 0) + 1)
      }
    }
    return [...freq.entries()]
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 16)
  }, [papers])

  const matchIds = useMemo(() => {
    const q = search.trim().toLowerCase()
    const kws = [...kwFilter]
    if (!q && kws.length === 0) return null
    const ids = papers
      .filter(p => {
        if (q) {
          const hit =
            p.title.toLowerCase().includes(q) ||
            p.authors.join(' ').toLowerCase().includes(q) ||
            p.abstract.toLowerCase().includes(q) ||
            p.keywords?.some(k => k.includes(q))
          if (!hit) return false
        }
        if (kws.length === 0) return true
        const pk = extractKeywords(p)
        return kwMode === 'and' ? kws.every(k => pk.has(k)) : kws.some(k => pk.has(k))
      })
      .map(p => p.id)
    return new Set(ids)
  }, [papers, search, kwFilter, kwMode])

  const handleToggleKeyword = useCallback(k => {
    setKwFilter(prev => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }, [])

  const filteredPapers = useMemo(() => {
    const base = matchIds ? papers.filter(p => matchIds.has(p.id)) : papers
    if (sortBy !== 'citations') return base
    const cited = p => citationCounts.get(p.id) ?? p.citedByCount ?? 0
    return [...base].sort((a, b) => cited(b) - cited(a))
  }, [papers, matchIds, sortBy, citationCounts])

  return (
    <div className="app">
      <header className="topbar">
        <span className="logo">
          <svg className="logo-owl" viewBox="0 0 48 48" aria-hidden="true">
            <g fill="#c8962a">
              <path d="M10 5 L21 14 L8 17 Z" />
              <path d="M38 5 L27 14 L40 17 Z" />
              <path d="M24 8 C12.5 8 8 16.5 8 25.5 C8 36.5 15 44 24 44 C33 44 40 36.5 40 25.5 C40 16.5 35.5 8 24 8 Z" />
            </g>
            <circle cx="17.3" cy="22" r="6.6" fill="#0b1622" />
            <circle cx="30.7" cy="22" r="6.6" fill="#0b1622" />
            <circle cx="17.3" cy="22" r="2.7" fill="#f1d98c" />
            <circle cx="30.7" cy="22" r="2.7" fill="#f1d98c" />
            <path d="M24 25.5 L20.2 30 L27.8 30 Z" fill="#0b1622" />
          </svg>
          research-graph
        </span>
        {selected && <span className="cat-tag">{selected}</span>}
        <div className="topbar-right">
          <button
            className="theme-toggle"
            onClick={() => setTheme(t => t === 'night' ? 'noon' : 'night')}
            title={theme === 'night' ? 'Switch to Noon theme' : 'Switch to Night theme'}
          >
            {theme === 'night' ? '☾' : '☀'}
          </button>
        </div>
      </header>
      <main className="layout">
        <CategoryPanel
          categories={categories}
          selected={selected}
          onSelect={setSelected}
          onAdd={handleAddCategory}
          onRemove={handleRemoveCategory}
        />
        <GraphView
          papers={papers}
          savedPapers={savedPapers}
          sotaTier={sotaTier}
          citationCounts={citationCounts}
          selectedId={selectedPaperId}
          onSelect={setSelectedPaperId}
          matchIds={matchIds}
        />
        <PapersPanel
          papers={filteredPapers}
          totalCount={papers.length}
          loading={loading}
          error={error}
          savedIds={savedIds}
          sotaTier={sotaTier}
          citationCounts={citationCounts}
          onSave={handleSave}
          onToggleSota={handleToggleSota}
          selectedId={selectedPaperId}
          onSelect={setSelectedPaperId}
          search={search}
          onSearch={setSearch}
          sortBy={sortBy}
          onSortBy={setSortBy}
          topKeywords={topKeywords}
          kwFilter={kwFilter}
          kwMode={kwMode}
          onToggleKeyword={handleToggleKeyword}
          onKwMode={setKwMode}
          onClearKeywords={() => setKwFilter(new Set())}
        />
      </main>
    </div>
  )
}
