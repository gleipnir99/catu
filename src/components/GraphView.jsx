import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { computeLinks } from '../lib/keywords'
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

export default function GraphView({ papers, savedPapers, sotaTier, citationCounts, selectedId, onSelect, matchIds }) {
  const svgRef = useRef(null)
  const simRef = useRef(null)
  const nodeSelRef = useRef(null)
  const zoomRef = useRef(null)
  const nodesRef = useRef([])
  const [citationShade, setCitationShade] = useState(false)

  const savedMap = new Map(savedPapers.map(p => [p.arxivId, p]))

  useEffect(() => {
    const svgEl = svgRef.current
    const svg = d3.select(svgEl)
    const { width, height } = svgEl.getBoundingClientRect()
    svg.selectAll('*').remove()
    nodeSelRef.current = null
    nodesRef.current = []

    const nodes = papers.map(p => {
      const saved = savedMap.get(p.id)
      const tier = sotaTier?.get(p.id) ?? null  // 'current' | 'former' | 'fallback' | null
      return {
        id: p.id,
        title: p.title,
        status: tier ? `sota_${tier}` : (saved?.status ?? 'default'),
        tier,
        ring: isRingTier(tier),
        cited: citationCounts?.get(p.id) ?? p.citedByCount ?? 0,
      }
    })
    nodesRef.current = nodes

    if (nodes.length === 0) {
      svg.append('text')
        .attr('x', width / 2).attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', '#9aaabb')
        .attr('font-size', 13)
        .text('Select a topic to see papers')
      return
    }

    const links = computeLinks(papers)
    const g = svg.append('g')

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
      .force('collide', d3.forceCollide(d => d.ring ? 30 : 22))
      .force('link', d3.forceLink(links)
        .id(d => d.id)
        .distance(d => 120 - d.strength * 70)
        .strength(d => Math.min(d.strength * 1.2, 0.5))
      )
      // SOTA papers pulled toward center ring (radius 80 gives spread without full collapse);
      // current SOTA sits tightest, former a bit looser, others free.
      .force('sota-radial', d3.forceRadial(80, width / 2, height / 2)
        .strength(d => d.tier === 'current' ? 0.5 : d.tier === 'former' ? 0.25 : 0)
      )

    simRef.current = sim

    const linkSel = g.selectAll('line.link')
      .data(links)
      .join('line')
      .attr('class', 'link')
      .attr('stroke', '#6080a8')
      .attr('stroke-opacity', d => 0.15 + d.strength * 0.5)
      .attr('stroke-width', d => 0.8 + d.strength * 2.5)
      .attr('stroke-linecap', 'round')

    const node = g.selectAll('g.node')
      .data(nodes, d => d.id)
      .join('g')
      .attr('class', 'node')
      .style('cursor', 'pointer')
      .on('click', (_, d) => onSelect(d.id === selectedId ? null : d.id))
      .call(
        d3.drag()
          .on('start', (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
          .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y })
          .on('end', (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null })
      )

    // Outer ring for current/former SOTA nodes — gold solid for current, slate dashed for former
    node.filter(d => d.ring)
      .append('circle')
      .attr('r', 16)
      .attr('fill', 'none')
      .attr('stroke', d => d.tier === 'current' ? SOTA_RING : STATUS_FILL.sota_former)
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', d => d.tier === 'current' ? null : '3 2')
      .attr('opacity', d => d.tier === 'current' ? 0.8 : 0.55)

    const shadeScale = buildShadeScale(nodes)
    node.append('circle')
      .attr('r', d => d.tier === 'current' ? 12 : d.ring ? 11 : 10)
      .style('fill', d => fillFor(d, citationShade, shadeScale))
      .attr('stroke', 'none')
      .attr('stroke-width', 2)

    node.append('text')
      .attr('dy', d => d.ring ? 26 : 22)
      .attr('text-anchor', 'middle')
      .attr('font-size', 9)
      .attr('fill', '#7a8a9a')
      .text(d => d.title.slice(0, 24) + (d.title.length > 24 ? '…' : ''))

    sim.on('tick', () => {
      linkSel
        .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y)
      node.attr('transform', d => `translate(${d.x},${d.y})`)
    })

    nodeSelRef.current = node

    return () => sim.stop()
  }, [papers, savedPapers, sotaTier]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const node = nodeSelRef.current
    if (!node) return

    node.select('circle:last-of-type')
      .attr('r', d => {
        const base = d.tier === 'current' ? 12 : d.ring ? 11 : 10
        return d.id === selectedId ? base + 4 : base
      })
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

  useEffect(() => {
    const node = nodeSelRef.current
    if (!node) return
    node.attr('opacity', d => !matchIds || matchIds.has(d.id) ? 1 : 0.18)
  }, [matchIds])

  // Recolor on shade toggle (and after citation counts arrive) without rebuilding the sim.
  useEffect(() => {
    const node = nodeSelRef.current
    if (!node) return
    // Refresh cited values from the latest counts, then recolor.
    nodesRef.current.forEach(d => { d.cited = citationCounts?.get(d.id) ?? d.cited })
    const scale = buildShadeScale(nodesRef.current)
    node.select('circle:last-of-type').style('fill', d => fillFor(d, citationShade, scale))
  }, [citationShade, citationCounts, papers])

  return (
    <div className={styles.wrapper}>
      <svg ref={svgRef} className={styles.svg} />
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
