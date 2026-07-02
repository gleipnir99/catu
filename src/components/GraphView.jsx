import { memo, useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { computeLinks } from '../lib/keywords'
import { computeLinksSemantic } from '../lib/embeddings'
import styles from './GraphView.module.css'

// SOTA tier colors map to CSS vars so they track the Night/Noon theme.
const STATUS_FILL = {
  sota_current: 'var(--sota-current)',    // gold — #1 on a benchmark
  sota_former: 'var(--sota-former)',      // slate — former / contender SOTA
  sota_fallback: 'var(--sota-fallback)',  // blue — OpenAlex high-citation fallback
  read: '#5b7fa6',
  saved: '#8aa4c0',
  default: '#c8d4e0',
}

const SOTA_RING = '#e8b84b'
const FOCUS_SCALE = 1.3

// 'current' | 'former' carry the SOTA ring + central pull; 'fallback' is just colored.
const isRingTier = (tier) => tier === 'current' || tier === 'former'

// Citation-shade mode: darker = more cited (log scale; uncited stay muted).
const buildShadeScale = (nodes) => {
  const max = d3.max(nodes, d => d.cited) || 0
  return d3.scaleSequentialLog(d3.interpolateOranges).domain([1, Math.max(max, 10)])
}
const fillFor = (d, shade, scale) =>
  shade ? (d.cited > 0 ? scale(d.cited) : 'var(--surface-hover)') : STATUS_FILL[d.status]

const linkId = d => (typeof d === 'object' ? d.id : d)

// Draw/update the edge lines on a dedicated layer; strength drives distance, width, opacity.
const drawLinks = (layer, links) =>
  layer.selectAll('line.link')
    .data(links, d => `${linkId(d.source)}|${linkId(d.target)}`)
    .join('line')
    .attr('class', 'link')
    .attr('stroke', '#6080a8')
    .attr('stroke-opacity', d => 0.15 + d.strength * 0.5)
    .attr('stroke-width', d => 0.8 + d.strength * 2.5)
    .attr('stroke-linecap', 'round')

// Semantic links when vectors cover every paper, else the lexical keyword fallback.
// Lets a rebuild (when the paper set changes) keep semantic edges instead of reverting.
const linksFor = (papers, embMap) =>
  embMap && embMap.size > 0 && papers.every(p => embMap.has(p.id))
    ? computeLinksSemantic(papers, embMap)
    : computeLinks(papers)

const collideRadius = d => d.ring ? 30 : 22
const radialStrength = d => d.tier === 'current' ? 0.5 : d.tier === 'former' ? 0.25 : 0
const dotRadius = (d, selectedId) => {
  const base = d.tier === 'current' ? 12 : d.ring ? 11 : 10
  return d.id === selectedId ? base + 4 : base
}

function GraphView({
  papers, savedPapers, sotaTier, citationCounts,
  embeddings, embedStatus, embedProgress,
  selectedId, onSelect,
}) {
  const svgRef = useRef(null)
  const simRef = useRef(null)
  const nodeSelRef = useRef(null)
  const linkSelRef = useRef(null)
  const linkLayerRef = useRef(null)
  const zoomRef = useRef(null)
  const nodesRef = useRef([])
  const selectedIdRef = useRef(selectedId)  // latest selection for the (non-rebuilt) click handler
  const embeddingsRef = useRef(embeddings)  // latest vectors, read by the build effect without re-laying out
  const stylePropsRef = useRef(null)        // latest status/tier/citation inputs for in-place styling
  const [citationShade, setCitationShade] = useState(false)

  // Keep latest-value refs current before any other effect reads them this commit.
  useEffect(() => {
    selectedIdRef.current = selectedId
    embeddingsRef.current = embeddings
    stylePropsRef.current = { savedPapers, sotaTier, citationCounts, citationShade }
  })

  // Recompute status/tier/citation fields on the existing node datums.
  // Returns true when a tier/ring changed (those alter forces, so the sim needs a reheat).
  const decorateNodes = nodes => {
    const { savedPapers, sotaTier, citationCounts } = stylePropsRef.current
    const savedMap = new Map(savedPapers.map(p => [p.arxivId, p]))
    let forcesChanged = false
    for (const d of nodes) {
      const tier = sotaTier?.get(d.id) ?? null  // 'current' | 'former' | 'fallback' | null
      const ring = isRingTier(tier)
      if (tier !== d.tier || ring !== d.ring) forcesChanged = true
      d.tier = tier
      d.ring = ring
      d.status = tier ? `sota_${tier}` : (savedMap.get(d.id)?.status ?? 'default')
      d.cited = citationCounts?.get(d.id) ?? d.cited
    }
    return forcesChanged
  }

  // Restyle rings/fills/labels from the current datums — no layout, no DOM rebuild.
  const styleNodes = () => {
    const node = nodeSelRef.current
    if (!node) return
    const { citationShade } = stylePropsRef.current
    const scale = buildShadeScale(nodesRef.current)
    node.select('circle.ring')
      .style('display', d => d.ring ? null : 'none')
      .attr('stroke', d => d.tier === 'current' ? SOTA_RING : STATUS_FILL.sota_former)
      .attr('stroke-dasharray', d => d.tier === 'current' ? null : '3 2')
      .attr('opacity', d => d.tier === 'current' ? 0.8 : 0.55)
    node.select('circle.dot')
      .attr('r', d => dotRadius(d, selectedIdRef.current))
      .style('fill', d => fillFor(d, citationShade, scale))
    node.select('text').attr('dy', d => d.ring ? 26 : 22)
  }

  useEffect(() => {
    const svgEl = svgRef.current
    const svg = d3.select(svgEl)
    const { width, height } = svgEl.getBoundingClientRect()
    svg.selectAll('*').remove()
    nodeSelRef.current = null
    nodesRef.current = []

    const nodes = papers.map(p => ({
      id: p.id,
      title: p.title,
      status: 'default',
      tier: null,
      ring: false,
      cited: p.citedByCount ?? 0,
    }))
    nodesRef.current = nodes
    decorateNodes(nodes)

    if (nodes.length === 0) {
      svg.append('text')
        .attr('x', width / 2).attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', '#9aaabb')
        .attr('font-size', 13)
        .text('Select a topic to see papers')
      return
    }

    // Use semantic links if vectors are ready (so rebuilds keep them); otherwise start
    // with lexical links and let the embeddings effect upgrade them in place when ready.
    const links = linksFor(papers, embeddingsRef.current)
    const g = svg.append('g')
    const linkLayer = g.append('g')  // dedicated layer keeps edges behind nodes
    linkLayerRef.current = linkLayer

    const zoom = d3.zoom()
      .scaleExtent([0.3, 4])
      .filter(e => e.type === 'wheel' || e.type === 'mousedown' || e.type === 'touchstart')
      .on('zoom', e => g.attr('transform', e.transform))

    svg.call(zoom)
    svg.on('dblclick.zoom', null)
    zoomRef.current = zoom

    if (simRef.current) simRef.current.stop()

    const sim = d3.forceSimulation(nodes)
      .force('charge', d3.forceManyBody().strength(-160))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide(collideRadius))
      .force('link', d3.forceLink(links)
        .id(d => d.id)
        .distance(d => 120 - d.strength * 70)
        .strength(d => Math.min(d.strength * 1.2, 0.5))
      )
      // SOTA papers pulled toward center ring (radius 80 gives spread without full collapse);
      // current SOTA sits tightest, former a bit looser, others free.
      .force('sota-radial', d3.forceRadial(80, width / 2, height / 2)
        .strength(radialStrength)
      )

    simRef.current = sim

    linkSelRef.current = drawLinks(linkLayer, links)

    const node = g.selectAll('g.node')
      .data(nodes, d => d.id)
      .join('g')
      .attr('class', 'node')
      .style('cursor', 'pointer')
      .on('click', (_, d) => onSelect(d.id === selectedIdRef.current ? null : d.id))
      .call(
        d3.drag()
          .on('start', (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
          .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y })
          .on('end', (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null })
      )

    // Outer ring for current/former SOTA nodes — gold solid for current, slate dashed for
    // former. Appended for every node (hidden via display) so tier changes never need
    // DOM insertion — styleNodes just toggles visibility/stroke in place.
    node.append('circle')
      .attr('class', 'ring')
      .attr('r', 16)
      .attr('fill', 'none')
      .attr('stroke-width', 1.5)

    node.append('circle')
      .attr('class', 'dot')
      .attr('stroke', 'none')
      .attr('stroke-width', 2)

    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('font-size', 9)
      .attr('fill', '#7a8a9a')
      .text(d => d.title.slice(0, 24) + (d.title.length > 24 ? '…' : ''))

    nodeSelRef.current = node
    styleNodes()

    sim.on('tick', () => {
      linkSelRef.current
        .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y)
      node.attr('transform', d => `translate(${d.x},${d.y})`)
    })

    return () => sim.stop()
  }, [papers]) // eslint-disable-line react-hooks/exhaustive-deps

  // Save / SOTA-tier / citation changes restyle nodes in place — the layout, node
  // positions, and semantic edges all persist (no simulation rebuild). Only a tier
  // change reheats the sim, since the radial pull and collide radius depend on it.
  useEffect(() => {
    const sim = simRef.current
    if (!sim || !nodeSelRef.current || nodesRef.current.length === 0) return
    const forcesChanged = decorateNodes(nodesRef.current)
    styleNodes()
    if (forcesChanged) {
      sim.force('collide', d3.forceCollide(collideRadius))
      sim.force('sota-radial').strength(radialStrength)  // re-resolves per-node strengths
      sim.alpha(0.2).restart()
    }
  }, [savedPapers, sotaTier, citationCounts, citationShade]) // eslint-disable-line react-hooks/exhaustive-deps

  // Swap lexical edges for semantic ones once embeddings arrive — updates links + the
  // link force in place, so node positions persist (no full re-layout, just a gentle reheat).
  useEffect(() => {
    const sim = simRef.current
    if (!sim || !linkLayerRef.current || nodesRef.current.length === 0) return
    if (!embeddings || embeddings.size === 0) return
    // Only proceed once vectors cover the current papers (avoids stale/partial maps).
    if (!papers.every(p => embeddings.has(p.id))) return

    const links = computeLinksSemantic(papers, embeddings)
    sim.force('link').links(links)  // re-resolves source/target to node objects
    linkSelRef.current = drawLinks(linkLayerRef.current, links)
    sim.alpha(0.3).restart()
  }, [embeddings]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const node = nodeSelRef.current
    if (!node) return

    node.select('circle.dot')
      .attr('r', d => dotRadius(d, selectedId))
      .attr('stroke', d => d.id === selectedId ? '#3a6fa8' : 'none')

    if (!selectedId) return
    const target = nodesRef.current.find(d => d.id === selectedId)
    if (!target?.x) return

    const { width, height } = svgRef.current.getBoundingClientRect()
    const tx = width / 2 - FOCUS_SCALE * target.x
    const ty = height / 2 - FOCUS_SCALE * target.y

    d3.select(svgRef.current)
      .transition().duration(450).ease(d3.easeCubicOut)
      .call(zoomRef.current.transform, d3.zoomIdentity.translate(tx, ty).scale(FOCUS_SCALE))
  }, [selectedId])

  const embedLabel =
    embedStatus === 'loading'
      ? (embedProgress
          ? `Analyzing meaning… ${embedProgress.done}/${embedProgress.total}`
          : 'Loading semantic model…')
      : embedStatus === 'error'
        ? 'Semantic links unavailable — showing keyword links'
        : null

  return (
    <div className={styles.wrapper}>
      <svg ref={svgRef} className={styles.svg} />
      {embedLabel && <div className={styles.embedStatus}>{embedLabel}</div>}
      <button
        className={`${styles.shadeBtn} ${citationShade ? styles.shadeActive : ''}`}
        onClick={() => setCitationShade(v => !v)}
        title="Shade nodes by citation count (darker = more cited)"
      >
        Citation shade
      </button>
      <div className={styles.legend}>
        <span style={{ '--c': STATUS_FILL.sota_current }}>Current SOTA</span>
        <span style={{ '--c': STATUS_FILL.sota_former }}>Former SOTA</span>
        <span style={{ '--c': STATUS_FILL.sota_fallback }}>Cited</span>
        <span style={{ '--c': STATUS_FILL.read }}>Read</span>
        <span style={{ '--c': STATUS_FILL.saved }}>Saved</span>
      </div>
    </div>
  )
}

// Memoized so App re-renders during typing (debounced search input) skip the graph.
export default memo(GraphView)
