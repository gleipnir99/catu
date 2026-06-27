import styles from './PapersPanel.module.css'
import { getPwcInfo } from '../lib/sota'

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000

function isNew(published) {
  return Date.now() - new Date(published).getTime() < ONE_WEEK_MS
}

export default function PapersPanel({
  papers, totalCount, loading, error,
  savedIds, sotaTier, citationCounts, onSave, onToggleSota,
  selectedId, onSelect,
  search, onSearch,
  topKeywords, kwFilter, kwMode, onToggleKeyword, onKwMode, onClearKeywords,
}) {
  return (
    <aside className={styles.panel}>
      <div className={styles.header}>
        <h2 className={styles.heading}>
          논문 목록
          {totalCount > 0 && (
            <span className={styles.count}>
              {papers.length !== totalCount ? `${papers.length}/${totalCount}` : totalCount}
            </span>
          )}
        </h2>
        <input
          className={styles.searchInput}
          type="search"
          placeholder="키워드 검색…"
          value={search}
          onChange={e => onSearch(e.target.value)}
        />

        {topKeywords?.length > 0 && (
          <div className={styles.kwFilter}>
            <div className={styles.kwHead}>
              <span className={styles.kwLabel}>키워드 필터</span>
              <div className={styles.kwModeToggle}>
                <button
                  className={`${styles.kwModeBtn} ${kwMode === 'and' ? styles.kwModeActive : ''}`}
                  onClick={() => onKwMode('and')}
                  title="선택한 키워드를 모두 포함"
                >AND</button>
                <button
                  className={`${styles.kwModeBtn} ${kwMode === 'or' ? styles.kwModeActive : ''}`}
                  onClick={() => onKwMode('or')}
                  title="선택한 키워드 중 하나라도 포함"
                >OR</button>
              </div>
              {kwFilter.size > 0 && (
                <button className={styles.kwClear} onClick={onClearKeywords}>초기화</button>
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

      {loading && <p className={styles.state}>불러오는 중…</p>}
      {error && <p className={styles.stateError}>{error}</p>}
      {!loading && !error && totalCount === 0 && (
        <p className={styles.state}>분야를 선택하세요.</p>
      )}
      {!loading && !error && totalCount > 0 && papers.length === 0 && (
        <p className={styles.state}>검색 결과가 없습니다.</p>
      )}

      <ul className={styles.list}>
        {papers.map(p => {
          const isSaved = savedIds.has(p.id)
          const tier = sotaTier.get(p.id)  // 'current' | 'former' | 'fallback' | undefined
          const isSota = !!tier
          const pwc = (tier === 'current' || tier === 'former') ? getPwcInfo(p.id) : null
          const itemTierClass = tier === 'current' ? styles.sotaCurrent
            : tier === 'former' ? styles.sotaFormer
            : tier === 'fallback' ? styles.sotaFallback : ''
          return (
            <li
              key={p.id}
              className={`${styles.item} ${selectedId === p.id ? styles.active : ''} ${itemTierClass}`}
              onClick={() => onSelect(p.id === selectedId ? null : p.id)}
            >
              <div className={styles.titleRow}>
                <span className={styles.title}>{p.title}</span>
                {tier === 'current' && (
                  <span className={`${styles.sotaBadge} ${styles.sotaCurrentBadge}`}
                    title={pwc ? `${pwc.benchmark} · ${pwc.metric} 1위 (Papers with Code)` : '현재 SOTA'}>
                    SOTA{pwc?.benchmark ? ` · ${pwc.benchmark}` : ''}
                  </span>
                )}
                {tier === 'former' && (
                  <span className={`${styles.sotaBadge} ${styles.sotaFormerBadge}`}
                    title={pwc ? `${pwc.benchmark} · ${pwc.metric} ${pwc.rank}위 (Papers with Code)` : '과거 SOTA'}>
                    former SOTA
                  </span>
                )}
                {tier === 'fallback' && (() => {
                  const cited = citationCounts?.get(p.id) ?? p.citedByCount
                  return (
                    <span className={`${styles.sotaBadge} ${styles.sotaFallbackBadge}`}
                      title="OpenAlex 고인용 (벤치마크 미등재)">
                      고인용{cited ? ` ${cited}` : ''}
                    </span>
                  )
                })()}
                {isNew(p.published) && <span className={styles.badge}>NEW</span>}
                {p.source === 'ieee' && <span className={styles.sourceBadge}>IEEE</span>}
              </div>
              <div className={styles.meta}>
                <span className={styles.authors}>
                  {p.authors.slice(0, 2).join(', ')}{p.authors.length > 2 ? ' 外' : ''}
                </span>
                <span className={styles.date}>{p.published.slice(0, 10)}</span>
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
                        {isSota ? 'SOTA ✓' : 'SOTA 표시'}
                      </button>
                    ) : (
                      <button
                        className={styles.saveBtn}
                        onClick={e => { e.stopPropagation(); onSave(p) }}
                      >
                        담기
                      </button>
                    )}
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
