import { useEffect, useState, useCallback, useMemo } from 'react'
import CategoryPanel from './components/CategoryPanel'
import GraphView from './components/GraphView'
import PapersPanel from './components/PapersPanel'
import { fetchArxivPapers } from './lib/arxiv'
import { fetchIEEEPapers } from './lib/ieee'
import { getArxivQuery, getIEEESearchTerm } from './lib/topics'
import { extractKeywords } from './lib/keywords'
import { embedPapers } from './lib/embeddings'
import { addCategory, removeCategory, getCategories, savePaper, getPapers, toggleSota } from './lib/db'
import { fetchSotaPapers, getPwcTier, loadPwcIndex } from './lib/sota'
import { fetchCitationCounts } from './lib/citations'
import './App.css'

const IEEE_KEY_STORAGE = 'ieee_api_key'
const THEME_STORAGE = 'rg_theme'
const RESULTS_PER_SOURCE = 300  // papers fetched per source (arXiv / IEEE)
const PAGE_SIZE = 20  // papers per list page (graph still shows all)

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
  const [searchInput, setSearchInput] = useState('')  // instant value bound to the input
  const [search, setSearch] = useState('')            // debounced value that drives filtering
  const [kwFilter, setKwFilter] = useState(new Set())
  const [kwMode, setKwMode] = useState('and')  // 'and' | 'or'
  const [sortBy, setSortBy] = useState('recent')  // 'recent' | 'citations'
  const [page, setPage] = useState(1)
  // IEEE Xplore key lives in localStorage only (never in the public repo);
  // set via the 🔑 popover in the top bar. Fetches re-run automatically on change.
  const [ieeeKey, setIeeeKey] = useState(() => localStorage.getItem(IEEE_KEY_STORAGE) ?? '')
  const [keyPanelOpen, setKeyPanelOpen] = useState(false)
  const [keyInput, setKeyInput] = useState('')
  const [autoSotaIds, setAutoSotaIds] = useState(new Set())
  const [citationCounts, setCitationCounts] = useState(new Map())
  const [embeddings, setEmbeddings] = useState(new Map())
  const [embedStatus, setEmbedStatus] = useState('idle')  // 'idle' | 'loading' | 'ready' | 'error'
  const [embedProgress, setEmbedProgress] = useState(null)  // { done, total } | null
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_STORAGE) || 'night')
  const [pwcReady, setPwcReady] = useState(false)
  const [fetchTick, setFetchTick] = useState(0)  // bumped by Retry to re-run the fetch effect

  // The PwC SOTA index (~1MB JSON) loads as its own chunk so it stays out of the
  // initial bundle; tiers appear as soon as it resolves.
  useEffect(() => {
    loadPwcIndex().then(() => setPwcReady(true)).catch(() => {})
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(THEME_STORAGE, theme)
  }, [theme])

  // Debounce typing so the graph (which rebuilds on filter change) only updates
  // after the user pauses — keeps searching smooth instead of rebuilding per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 250)
    return () => clearTimeout(t)
  }, [searchInput])

  useEffect(() => {
    getCategories().then(cats => {
      // Don't clobber categories the user added while this initial read was pending.
      setCategories(prev => (prev.length > 0 ? prev : cats))
      if (cats.length > 0) setSelected(prev => prev ?? cats[0].id)
    })
    getPapers().then(setSavedPapers)
  }, [])

  useEffect(() => {
    if (!selected) {
      // Reset everything: a stale in-flight fetch is ignored on cleanup, so its
      // finally() can't clear `loading` — without this the spinner sticks forever.
      setPapers([])
      setLoading(false)
      setError(null)
      setAutoSotaIds(new Set())
      setCitationCounts(new Map())
      setSelectedPaperId(null)
      return
    }
    let ignore = false
    setLoading(true)
    setError(null)
    setPapers([])
    setAutoSotaIds(new Set())
    setCitationCounts(new Map())
    setSelectedPaperId(null)
    setSearchInput('')
    setSearch('')
    setKwFilter(new Set())

    const arxivQuery = getArxivQuery(selected)
    const ieeeQuery = getIEEESearchTerm(selected)

    Promise.allSettled([
      fetchArxivPapers(arxivQuery, RESULTS_PER_SOURCE),
      fetchIEEEPapers(ieeeQuery, ieeeKey, RESULTS_PER_SOURCE),
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

      // IEEE resolves to [] without an API key, so "both rejected" almost never fires —
      // treat "a source failed and we got nothing" as the error case instead.
      if (merged.length === 0 && (arxivRes.status === 'rejected' || ieeeRes.status === 'rejected')) {
        setError('Failed to fetch papers — please try again later.')
      }

      // Enrich with per-paper citation counts (OpenAlex) for shade mode + badges.
      // Kept as a separate map so it doesn't trigger a graph re-layout when it arrives.
      fetchCitationCounts(merged.map(p => p.id)).then(counts => {
        if (!ignore && counts.size > 0) setCitationCounts(counts)
      })
    }).finally(() => { if (!ignore) setLoading(false) })

    return () => { ignore = true }
  }, [selected, ieeeKey, fetchTick])

  // Compute semantic embeddings for the current papers, then the graph links by meaning.
  // Runs after papers load; cached vectors (IndexedDB) make topic re-visits instant.
  useEffect(() => {
    if (papers.length === 0) {
      setEmbeddings(new Map())
      setEmbedStatus('idle')
      setEmbedProgress(null)
      return
    }
    let ignore = false
    setEmbeddings(new Map())
    setEmbedStatus('loading')
    setEmbedProgress(null)
    embedPapers(papers, (done, total) => {
      if (!ignore) setEmbedProgress({ done, total })
    })
      .then(map => {
        if (ignore) return
        setEmbeddings(map)
        setEmbedStatus('ready')
        setEmbedProgress(null)
      })
      .catch(err => {
        if (ignore) return
        console.error('embedding failed', err)
        setEmbedStatus('error')
        setEmbedProgress(null)
      })
    return () => { ignore = true }
  }, [papers])

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

  const savedIds = useMemo(() => new Set(savedPapers.map(p => p.arxivId)), [savedPapers])

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
  }, [papers, savedPapers, autoSotaIds, pwcReady])  // eslint-disable-line react-hooks/exhaustive-deps -- pwcReady re-runs this once the async index lands

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

  const handleClearKeywords = useCallback(() => setKwFilter(new Set()), [])

  const handleRetry = useCallback(() => setFetchTick(t => t + 1), [])

  const handleOpenKeyPanel = useCallback(() => {
    setKeyInput(localStorage.getItem(IEEE_KEY_STORAGE) ?? '')
    setKeyPanelOpen(open => !open)
  }, [])

  const handleSaveKey = useCallback(() => {
    const key = keyInput.trim()
    if (key) localStorage.setItem(IEEE_KEY_STORAGE, key)
    else localStorage.removeItem(IEEE_KEY_STORAGE)
    setIeeeKey(key)  // fetch effect depends on ieeeKey, so papers reload with IEEE results
    setKeyPanelOpen(false)
  }, [keyInput])

  // Graph set: the filtered papers (unsorted), so re-sorting doesn't re-lay-out the graph.
  const graphPapers = useMemo(
    () => (matchIds ? papers.filter(p => matchIds.has(p.id)) : papers),
    [papers, matchIds],
  )

  // List set: same papers sorted by newest (published date) or citation count.
  const sortedPapers = useMemo(() => {
    const arr = [...graphPapers]
    if (sortBy === 'citations') {
      const cited = p => citationCounts.get(p.id) ?? p.citedByCount ?? 0
      arr.sort((a, b) => cited(b) - cited(a))
    } else {
      // Parse each date once (not per comparison — Date parsing is the sort's hot path).
      const ts = new Map(arr.map(p => [p.id, Date.parse(p.published) || 0]))
      arr.sort((a, b) => ts.get(b.id) - ts.get(a.id))
    }
    return arr
  }, [graphPapers, sortBy, citationCounts])

  // The list paginates (20/page); the graph shows the whole filtered set.
  const pageCount = Math.max(1, Math.ceil(sortedPapers.length / PAGE_SIZE))
  const pagedPapers = useMemo(
    () => sortedPapers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [sortedPapers, page],
  )

  // Reset to page 1 whenever the filtered set changes (new topic / search / filter / sort).
  useEffect(() => { setPage(1) }, [selected, search, kwFilter, kwMode, sortBy])

  // Clicking a graph node jumps the list to the page holding that paper.
  useEffect(() => {
    if (!selectedPaperId) return
    const idx = sortedPapers.findIndex(p => p.id === selectedPaperId)
    if (idx >= 0) setPage(Math.floor(idx / PAGE_SIZE) + 1)
  }, [selectedPaperId]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="app">
      <header className="topbar">
        <span className="logo">
          {/* Same ASCII cactus as the favicon, but inline & background-free so it blends with the header */}
          <svg className="logo-cactus" viewBox="0 7 48 36" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
            <text x="24" y="15" fill="#56d364" textAnchor="middle"
                  fontFamily="'Courier New', ui-monospace, monospace"
                  fontSize="6.4" fontWeight="bold" xmlSpace="preserve">
              <tspan x="24" dy="0"> n  ____  n </tspan>
              <tspan x="24" dy="7.4"> | |o  o| | </tspan>
              <tspan x="24" dy="7.4"> |_|    |_| </tspan>
              <tspan x="24" dy="7.4">   |    |   </tspan>
            </text>
          </svg>
          catu
        </span>
        {selected && <span className="cat-tag">{selected}</span>}
        <div className="topbar-right">
          {keyPanelOpen && (
            <span className="key-panel">
              <input
                className="key-input"
                type="password"
                placeholder="IEEE Xplore API key"
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSaveKey()}
                autoFocus
              />
              <button className="key-save" onClick={handleSaveKey}>Save</button>
            </span>
          )}
          <button
            className={`theme-toggle ${ieeeKey ? 'key-set' : ''}`}
            onClick={handleOpenKeyPanel}
            title={ieeeKey ? 'IEEE Xplore API key is set — click to change' : 'Set IEEE Xplore API key'}
          >
            🔑
          </button>
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
          papers={graphPapers}
          savedPapers={savedPapers}
          sotaTier={sotaTier}
          citationCounts={citationCounts}
          embeddings={embeddings}
          embedStatus={embedStatus}
          embedProgress={embedProgress}
          selectedId={selectedPaperId}
          onSelect={setSelectedPaperId}
        />
        <PapersPanel
          papers={pagedPapers}
          totalCount={papers.length}
          filteredCount={sortedPapers.length}
          page={page}
          pageCount={pageCount}
          onPage={setPage}
          loading={loading}
          error={error}
          onRetry={handleRetry}
          savedIds={savedIds}
          sotaTier={sotaTier}
          citationCounts={citationCounts}
          onSave={handleSave}
          onToggleSota={handleToggleSota}
          selectedId={selectedPaperId}
          onSelect={setSelectedPaperId}
          search={searchInput}
          onSearch={setSearchInput}
          sortBy={sortBy}
          onSortBy={setSortBy}
          topKeywords={topKeywords}
          kwFilter={kwFilter}
          kwMode={kwMode}
          onToggleKeyword={handleToggleKeyword}
          onKwMode={setKwMode}
          onClearKeywords={handleClearKeywords}
        />
      </main>
    </div>
  )
}
