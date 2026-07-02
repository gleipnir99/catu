import { memo, useEffect, useRef } from 'react'
import styles from './PapersPanel.module.css'
import { getPwcInfo } from '../lib/sota'

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000

function isNew(published) {
  return Date.now() - new Date(published).getTime() < ONE_WEEK_MS
}

function PapersPanel({
  papers, totalCount, filteredCount, page, pageCount, onPage, loading, error, onRetry,
  savedIds, sotaTier, citationCounts, onSave, onToggleSota,
  selectedId, onSelect,
  search, onSearch,
  sortBy, onSortBy,
  topKeywords, kwFilter, kwMode, onToggleKeyword, onKwMode, onClearKeywords,
}) {
  const selectedRef = useRef(null)

  // Scroll the list to the selected paper (e.g. when a graph node is clicked).
  // Depends on `papers` too: a selected paper on another page only renders (and gets
  // the ref) after App flips to its page, so we must re-run once that page is shown.
  useEffect(() => {
    if (selectedId) selectedRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedId, papers])

  return (
    <aside className={styles.panel}>
      <div className={styles.header}>
        <h2 className={styles.heading}>
          Papers
          {totalCount > 0 && (
            <span className={styles.count}>
              {filteredCount !== totalCount ? `${filteredCount}/${totalCount}` : totalCount}
            </span>
          )}
        </h2>
        <input
          className={styles.searchInput}
          type="search"
          placeholder=""
          value={search}
          onChange={e => onSearch(e.target.value)}
        />

        <div className={styles.sortRow}>
          <span className={styles.kwLabel}>Sort</span>
          <div className={styles.kwModeToggle}>
            <button
              className={`${styles.kwModeBtn} ${sortBy === 'recent' ? styles.kwModeActive : ''}`}
              onClick={() => onSortBy('recent')}
            >Newest</button>
            <button
              className={`${styles.kwModeBtn} ${sortBy === 'citations' ? styles.kwModeActive : ''}`}
              onClick={() => onSortBy('citations')}
            >Most cited</button>
          </div>
        </div>

        {topKeywords?.length > 0 && (
          <div className={styles.kwFilter}>
            <div className={styles.kwHead}>
              <span className={styles.kwLabel}>Keyword filter</span>
              <div className={styles.kwModeToggle}>
                <button
                  className={`${styles.kwModeBtn} ${kwMode === 'and' ? styles.kwModeActive : ''}`}
                  onClick={() => onKwMode('and')}
                  title="Match all selected keywords"
                >AND</button>
                <button
                  className={`${styles.kwModeBtn} ${kwMode === 'or' ? styles.kwModeActive : ''}`}
                  onClick={() => onKwMode('or')}
                  title="Match any selected keyword"
                >OR</button>
              </div>
              {kwFilter.size > 0 && (
                <button className={styles.kwClear} onClick={onClearKeywords}>Clear</button>
              )}
            </div>
            <div className={styles.kwChips}>
              {topKeywords.map(([k, c]) => (
                <button
                  key={k}
                  className={`${styles.kwChip} ${kwFilter.has(k) ? styles.kwChipActive : ''}`}
                  onClick={() => onToggleKeyword(k)}
                >
                  {k}<span className={styles.kwCount}>{c}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {loading && <p className={styles.state}>Loading…</p>}
      {error && (
        <p className={styles.stateError}>
          {error}
          <button className={styles.retryBtn} onClick={onRetry}>Retry</button>
        </p>
      )}
      {!loading && !error && totalCount === 0 && (
        <p className={styles.state}>Select a topic to begin.</p>
      )}
      {!loading && !error && totalCount > 0 && filteredCount === 0 && (
        <p className={styles.state}>No matching papers.</p>
      )}

      <ul className={styles.list}>
        {papers.map(p => {
          const isSaved = savedIds.has(p.id)
          const tier = sotaTier.get(p.id)  // 'current' | 'former' | 'fallback' | undefined
          const isSota = !!tier
          const pwc = (tier === 'current' || tier === 'former') ? getPwcInfo(p.id) : null
          const cited = citationCounts?.get(p.id) ?? p.citedByCount
          const itemTierClass = tier === 'current' ? styles.sotaCurrent
            : tier === 'former' ? styles.sotaFormer
            : tier === 'fallback' ? styles.sotaFallback : ''
          return (
            <li
              key={p.id}
              ref={selectedId === p.id ? selectedRef : null}
              className={`${styles.item} ${selectedId === p.id ? styles.active : ''} ${itemTierClass}`}
              onClick={() => onSelect(p.id === selectedId ? null : p.id)}
            >
              <div className={styles.titleRow}>
                <span className={styles.title}>{p.title}</span>
                {tier === 'current' && (
                  <span className={`${styles.sotaBadge} ${styles.sotaCurrentBadge}`}
                    title={pwc ? `#1 on ${pwc.benchmark} · ${pwc.metric} (Papers with Code)` : 'Current SOTA'}>
                    SOTA{pwc?.benchmark ? ` · ${pwc.benchmark}` : ''}
                  </span>
                )}
                {tier === 'former' && (
                  <span className={`${styles.sotaBadge} ${styles.sotaFormerBadge}`}
                    title={pwc ? `#${pwc.rank} on ${pwc.benchmark} · ${pwc.metric} (Papers with Code)` : 'Former SOTA'}>
                    former SOTA
                  </span>
                )}
                {tier === 'fallback' && (
                  <span className={`${styles.sotaBadge} ${styles.sotaFallbackBadge}`}
                    title="High citations (OpenAlex; not on a benchmark)">
                    Cited{cited ? ` ${cited}` : ''}
                  </span>
                )}
                {isNew(p.published) && <span className={styles.badge}>NEW</span>}
                {p.source === 'ieee' && <span className={styles.sourceBadge}>IEEE</span>}
              </div>
              <div className={styles.meta}>
                <span className={styles.authors}>
                  {p.authors.slice(0, 2).join(', ')}{p.authors.length > 2 ? ' et al.' : ''}
                </span>
                <span className={styles.metaRight}>
                  {sortBy === 'citations' && (
                    <span className={styles.cites}>{cited != null ? `${cited} cited` : '— cited'}</span>
                  )}
                  <span className={styles.date}>{p.published.slice(0, 10)}</span>
                </span>
              </div>
              {selectedId === p.id && (
                <div className={styles.detail}>
                  <p className={styles.abstract}>{p.abstract.slice(0, 300)}…</p>
                  <div className={styles.actions}>
                    <a className={styles.link} href={p.url} target="_blank" rel="noreferrer">
                      {p.source === 'ieee' ? 'IEEE ↗' : 'arXiv ↗'}
                    </a>
                    {isSaved ? (
                      <button
                        className={`${styles.sotaBtn} ${isSota ? styles.sotaActive : ''}`}
                        onClick={e => { e.stopPropagation(); onToggleSota(p) }}
                      >
                        {isSota ? 'SOTA ✓' : 'Mark SOTA'}
                      </button>
                    ) : (
                      <button
                        className={styles.saveBtn}
                        onClick={e => { e.stopPropagation(); onSave(p) }}
                      >
                        Save
                      </button>
                    )}
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {pageCount > 1 && (
        <div className={styles.pager}>
          <button
            className={styles.pageBtn}
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
            aria-label="Previous page"
          >‹</button>
          {Array.from({ length: pageCount }, (_, i) => i + 1).map(n => (
            <button
              key={n}
              className={`${styles.pageBtn} ${n === page ? styles.pageActive : ''}`}
              onClick={() => onPage(n)}
            >{n}</button>
          ))}
          <button
            className={styles.pageBtn}
            disabled={page >= pageCount}
            onClick={() => onPage(page + 1)}
            aria-label="Next page"
          >›</button>
        </div>
      )}
    </aside>
  )
}

// Memoized so App re-renders that don't touch the list (embedding progress ticks,
// graph-only state) skip re-rendering the paper items.
export default memo(PapersPanel)
