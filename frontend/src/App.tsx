import cytoscape, { type Core } from 'cytoscape'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import './App.css'

type Summary = {
  nodes: number
  edges: number
  transactions: number
  observed_turnover_kzt: number
  clusters: number
  role_counts: Record<string, number>
}

type GraphNode = {
  gid: string
  role: string
  role_score: number
  priority_score: number
  cluster_id: number
  depth: number
  is_seed: boolean
  truncated_by_depth: boolean
}

type GraphEdge = { src: string; dst: string; sum_kzt: number; n_tx: number }
type GraphData = { nodes: GraphNode[]; edges: GraphEdge[] }
type TopNode = { rank: number; gid: string; role: string; priority_score: number; why: string }
type NodeDetail = GraphNode & {
  evidence: string
  in_deg: number
  out_deg: number
  in_kzt: number
  out_kzt: number
  in_tx: number
  out_tx: number
  pagerank: number
  betweenness: number
  seed_reach_count: number
  pass_through: number | null
  coverage_warning: string | null
}
type Neighbor = GraphEdge & { counterparty_role: string }
type Neighbors = { incoming: Neighbor[]; outgoing: Neighbor[] }
type EdgeDetail = GraphEdge & {
  first_date: string
  last_date: string
  transactions: { date: string; sum_kzt: number }[]
}
type Cluster = {
  cluster_id: number
  n_nodes: number
  n_seed: number
  sum_kzt_internal: number
  top_gids: string
  hypothesis: string
}

const roleColors: Record<string, string> = {
  consolidator: '#f3b33d',
  transit: '#52c7b8',
  distributor: '#77a7ff',
  terminal: '#d68ae8',
  coordinator: '#ef6a62',
  peripheral: '#687786',
}

const roleNames: Record<string, string> = {
  consolidator: 'Consolidator',
  transit: 'Transit',
  distributor: 'Distributor',
  terminal: 'Terminal candidate',
  coordinator: 'Coordinator candidate',
  peripheral: 'Peripheral',
}

const kzt = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })
const pct = (value: number) => `${Math.round(value * 100)}%`

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload.detail ?? `Request failed: ${response.status}`)
  }
  return response.json()
}

function App() {
  const graphElement = useRef<HTMLDivElement>(null)
  const cy = useRef<Core | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [graph, setGraph] = useState<GraphData | null>(null)
  const [topNodes, setTopNodes] = useState<TopNode[]>([])
  const [clusters, setClusters] = useState<Cluster[]>([])
  const [cluster, setCluster] = useState<Cluster | null>(null)
  const [selected, setSelected] = useState<NodeDetail | null>(null)
  const [neighbors, setNeighbors] = useState<Neighbors>({ incoming: [], outgoing: [] })
  const [edge, setEdge] = useState<EdgeDetail | null>(null)
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<'overview' | 'focus' | 'cluster'>('overview')
  const [error, setError] = useState('')

  const showNode = useCallback(async (gid: string) => {
    try {
      setError('')
      const [detail, relations, ego] = await Promise.all([
        getJson<NodeDetail>(`/api/nodes/${gid}`),
        getJson<Neighbors>(`/api/nodes/${gid}/neighbors`),
        getJson<GraphData>(`/api/graph?gid=${gid}`),
      ])
      setSelected(detail)
      setNeighbors(relations)
      setGraph(ego)
      setEdge(null)
      setCluster(null)
      setMode('focus')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load this GID')
    }
  }, [])

  const showEdge = useCallback(async (src: string, dst: string) => {
    try {
      setEdge(await getJson<EdgeDetail>(`/api/edges/${src}/${dst}`))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load this flow')
    }
  }, [])

  const showOverview = useCallback(async () => {
    setGraph(await getJson<GraphData>('/api/graph'))
    setCluster(null)
    setMode('overview')
  }, [])

  const showCluster = useCallback(async (clusterId: number) => {
    if (!clusterId) {
      await showOverview()
      return
    }
    const [data, detail] = await Promise.all([
      getJson<GraphData>(`/api/graph?cluster_id=${clusterId}`),
      getJson<Cluster>(`/api/clusters/${clusterId}`),
    ])
    setGraph(data)
    setCluster(detail)
    setMode('cluster')
  }, [showOverview])

  useEffect(() => {
    Promise.all([
      getJson<Summary>('/api/summary'),
      getJson<TopNode[]>('/api/top-nodes?limit=50'),
      getJson<Cluster[]>('/api/clusters'),
      getJson<GraphData>('/api/graph'),
    ])
      .then(([summaryData, topData, clusterData, graphData]) => {
        setSummary(summaryData)
        setTopNodes(topData)
        setClusters(clusterData)
        setGraph(graphData)
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'Backend unavailable'))
  }, [])

  useEffect(() => {
    if (!graphElement.current || !graph) return
    cy.current?.destroy()
    const depthCounts = new Map<number, number>()
    const totals = new Map<number, number>()
    graph.nodes.forEach((node) => totals.set(node.depth, (totals.get(node.depth) ?? 0) + 1))
    const elements = [
      ...graph.nodes.map((node) => {
        const index = depthCounts.get(node.depth) ?? 0
        depthCounts.set(node.depth, index + 1)
        const count = totals.get(node.depth) ?? 1
        return {
          data: {
            id: String(node.gid), ...node, color: roleColors[node.role],
            clusterColor: `hsl(${(node.cluster_id * 47) % 360}, 48%, 58%)`,
          },
          position: {
            x: 90 + node.depth * 220 + ((index * 37) % 90) - 45,
            y: 40 + (index * Math.max(5, 620 / count)) % 620,
          },
        }
      }),
      ...graph.edges.map((flow) => ({
        data: {
          id: `${flow.src}-${flow.dst}`, source: String(flow.src), target: String(flow.dst), ...flow,
          width: Math.max(0.6, Math.log10(flow.sum_kzt) - 3),
        },
      })),
    ]
    cy.current = cytoscape({
      container: graphElement.current,
      elements,
      layout: { name: 'preset', fit: true, padding: 32 },
      minZoom: 0.25,
      maxZoom: 3,
      style: [
        { selector: 'node', style: {
          width: 'mapData(priority_score, 0, 1, 5, 18)', height: 'mapData(priority_score, 0, 1, 5, 18)',
          'background-color': 'data(color)', 'border-color': 'data(clusterColor)', 'border-width': 1.5, opacity: 0.82,
        } },
        { selector: 'edge', style: {
          width: 'data(width)', 'line-color': '#51606d', 'target-arrow-color': '#7e8b97',
          'target-arrow-shape': 'triangle', 'curve-style': 'bezier', opacity: mode === 'overview' ? 0.17 : 0.52,
        } },
        { selector: ':selected', style: {
          'border-color': '#fff3d6', 'border-width': 4, opacity: 1, label: 'data(id)', color: '#f7f8fa',
          'font-size': '10px', 'text-background-color': '#0b0f14', 'text-background-opacity': 0.9,
          'text-background-padding': '3px',
        } },
      ],
    })
    cy.current.on('tap', 'node', (event) => void showNode(event.target.id()))
    cy.current.on('tap', 'edge', (event) => {
      const data = event.target.data()
      void showEdge(data.src, data.dst)
    })
    if (selected) cy.current.$id(String(selected.gid)).select()
    return () => cy.current?.destroy()
  }, [graph, mode, selected, showEdge, showNode])

  const search = (event: FormEvent) => {
    event.preventDefault()
    const gid = query.trim()
    if (!/^\d+$/.test(gid)) {
      setError('Enter the complete numeric GID')
      return
    }
    void showNode(gid)
  }

  return (
    <main>
      <header className="masthead">
        <div className="identity"><span className="mark" aria-hidden="true">MG</span><div><h1>Money Graph</h1><p>AML network investigation</p></div></div>
        <div className="totals" aria-label="Dataset summary">
          <span><b>{summary?.nodes.toLocaleString() ?? '—'}</b> nodes</span>
          <span><b>{summary?.edges.toLocaleString() ?? '—'}</b> flows</span>
          <span><b>{summary?.transactions.toLocaleString() ?? '—'}</b> transactions</span>
          <span><b>{summary ? kzt.format(summary.observed_turnover_kzt) : '—'}</b> KZT observed</span>
        </div>
        <form className="search" onSubmit={search}><label htmlFor="gid-search">Find any GID</label><div><input id="gid-search" value={query} onChange={(event) => setQuery(event.target.value)} inputMode="numeric" placeholder="100000…" /><button>Find</button></div></form>
      </header>

      {error && <div className="error" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}

      <section className="workspace">
        <aside className="queue panel">
          <div className="panel-title"><div><p>Analyst queue</p><h2>Top priorities</h2></div><span>50</span></div>
          <div className="queue-list">
            {topNodes.map((node) => <button key={node.gid} className={selected?.gid === node.gid ? 'queue-row active' : 'queue-row'} onClick={() => void showNode(node.gid)}>
              <span className="rank">{String(node.rank).padStart(2, '0')}</span>
              <span className="queue-main"><b>GID {node.gid}</b><small><i style={{ background: roleColors[node.role] }} />{roleNames[node.role]}</small></span>
              <strong>{pct(node.priority_score)}</strong>
            </button>)}
          </div>
        </aside>

        <section className="graph-panel panel">
          <div className="graph-toolbar">
            <div><p>Observed network</p><h2>{mode === 'focus' ? `Ego network · GID ${selected?.gid}` : mode === 'cluster' ? `Cluster ${cluster?.cluster_id}` : 'Four-hop overview'}</h2></div>
            <div className="graph-actions">
              <select aria-label="Filter by cluster" value={cluster?.cluster_id ?? ''} onChange={(event) => void showCluster(Number(event.target.value))}>
                <option value="">All clusters</option>
                {clusters.map((item) => <option key={item.cluster_id} value={item.cluster_id}>Cluster {item.cluster_id} · {item.n_nodes} nodes</option>)}
              </select>
              {mode !== 'overview' && <button className="ghost" onClick={() => void showOverview()}>Show all</button>}
            </div>
          </div>
          {cluster && <p className="cluster-note"><b>{cluster.n_seed} seed · {kzt.format(cluster.sum_kzt_internal)} KZT internal.</b> {cluster.hypothesis}</p>}
          <div className="depth-axis" aria-hidden="true">{[0, 1, 2, 3, 4].map((depth) => <span key={depth}>Depth {depth}{depth < 4 && <i>→</i>}</span>)}</div>
          {!graph && !error && <div className="loading">Loading observed flows…</div>}
          <div className="graph" ref={graphElement} aria-label="Directed transaction network" />
          <div className="graph-status"><span>{graph?.nodes.length.toLocaleString() ?? 0} nodes visible</span><span>{graph?.edges.length.toLocaleString() ?? 0} directed flows</span><span>Scroll to zoom · drag to pan</span></div>
        </section>

        <aside className="detail panel">
          {!selected ? <div className="empty-detail"><span>◎</span><h2>Select a GID</h2><p>Choose a priority, search an exact identifier, or click a node to inspect the observed evidence.</p></div> : <>
            <div className="detail-head"><div><p>Selected client</p><h2>GID {selected.gid}</h2></div><strong style={{ color: roleColors[selected.role] }}>{pct(selected.priority_score)}</strong></div>
            <div className="role-line"><i style={{ background: roleColors[selected.role] }} /><div><b>{roleNames[selected.role]}</b><small>Role confidence {pct(selected.role_score)} · Cluster {selected.cluster_id}</small></div></div>
            {selected.coverage_warning && <div className="warning"><b>Coverage limit</b>{selected.coverage_warning}</div>}
            <blockquote>{selected.evidence}</blockquote>
            <div className="flow-grid"><div><small>Observed incoming</small><b>{kzt.format(selected.in_kzt)} KZT</b><span>{selected.in_deg} counterparties · {selected.in_tx} tx</span></div><div><small>Observed outgoing</small><b>{kzt.format(selected.out_kzt)} KZT</b><span>{selected.out_deg} counterparties · {selected.out_tx} tx</span></div></div>
            <dl className="metrics"><div><dt>Depth</dt><dd>{selected.depth}</dd></div><div><dt>Seed reach</dt><dd>{selected.seed_reach_count}</dd></div><div><dt>PageRank</dt><dd>{selected.pagerank.toExponential(2)}</dd></div><div><dt>Betweenness</dt><dd>{selected.betweenness.toFixed(4)}</dd></div></dl>
            <div className="relations"><h3>Observed relationships</h3>
              {[...neighbors.incoming.slice(0, 4), ...neighbors.outgoing.slice(0, 4)].map((flow) => {
                const incoming = flow.dst === selected.gid
                return <button key={`${flow.src}-${flow.dst}`} onClick={() => void showEdge(flow.src, flow.dst)}><span>{incoming ? `${flow.src} →` : `→ ${flow.dst}`}</span><b>{kzt.format(flow.sum_kzt)} KZT</b></button>
              })}
              {neighbors.incoming.length + neighbors.outgoing.length > 8 && <small>Showing 8 of {neighbors.incoming.length + neighbors.outgoing.length} relationships</small>}
            </div>
            {edge && <div className="edge-detail"><div><small>Selected flow</small><button onClick={() => setEdge(null)} aria-label="Close flow">×</button></div><h3>{edge.src} → {edge.dst}</h3><p><b>{kzt.format(edge.sum_kzt)} KZT</b> · {edge.n_tx} tx · {edge.first_date}—{edge.last_date}</p><ul>{edge.transactions.map((tx, index) => <li key={`${tx.date}-${index}`}><span>{tx.date}</span><b>{kzt.format(tx.sum_kzt)} KZT</b></li>)}</ul></div>}
          </>}
        </aside>
      </section>

      <footer className="coverage"><div><b>Coverage, not verdict.</b><span>Scores prioritize analyst attention inside this observed graph.</span></div><ul><li>Outgoing-only crawl</li><li>Stops at depth 4</li><li>Transfers &lt;5,000 KZT absent</li><li>Seed incoming incomplete</li></ul><div className="legend">{Object.entries(roleColors).map(([role, color]) => <span key={role}><i style={{ background: color }} />{roleNames[role]}</span>)}</div></footer>
    </main>
  )
}

export default App
