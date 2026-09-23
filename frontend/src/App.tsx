import cytoscape, { type Core } from 'cytoscape'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import './App.css'
import { depthLabel, formatGid, kzt, roleColors, roleNames, score100, sortClusters, topPercent, type ClusterSortKey } from './domain'

type Summary = { nodes: number; edges: number; transactions: number; observed_turnover_kzt: number; clusters: number; role_counts: Record<string, number> }
type GraphNode = { gid: string; role: string; role_score: number; priority_score: number; cluster_id: number; depth: number; is_seed: boolean; truncated_by_depth: boolean }
type GraphEdge = { src: string; dst: string; sum_kzt: number; n_tx: number }
type GraphData = { nodes: GraphNode[]; edges: GraphEdge[] }
type TopNode = { rank: number; gid: string; role: string; priority_score: number; why: string }
type RoleComponent = { label: string; value: number | null; percentile: number | null }
type NodeDetail = GraphNode & {
  evidence: string; in_deg: number; out_deg: number; in_kzt: number; out_kzt: number; in_tx: number; out_tx: number
  pagerank_pct: number; betweenness_pct: number; seed_reach_count: number; pass_through: number | null
  coverage_warning: string | null; role_components: RoleComponent[]
}
type Neighbor = GraphEdge & { counterparty_role: string; counterparty_cluster: number }
type Neighbors = { incoming: Neighbor[]; outgoing: Neighbor[] }
type EdgeDetail = GraphEdge & { first_date: string; last_date: string; transactions: { date: string; sum_kzt: number }[] }
type ClusterNode = { gid: string; role: string; role_score: number; priority_score: number; evidence: string }
type Cluster = {
  cluster_id: number; n_nodes: number; n_seed: number; sum_kzt_internal: number; max_priority: number
  avg_priority: number; top_role: string; top_gids: string; hypothesis: string; nodes?: ClusterNode[]
}
type ClusterEdge = { src_cluster: number; dst_cluster: number; sum_kzt: number; n_tx: number; n_edges: number }
type ClusterGraph = { nodes: (Cluster & { id: string; role_counts: Record<string, number> })[]; edges: ClusterEdge[] }
type SignalGroup = { label: string; nodes: { gid: string; role: string; priority_score: number; value: number }[] }
type Analytics = { depth_counts: Record<string, number>; seed_count: number; boundary_count: number; signals: SignalGroup[] }
type DiscoveryNode = GraphNode & { in_deg: number; out_deg: number; seed_reach_count: number; turnover: number; evidence: string }
type FilterState = {
  role: string; cluster_id: string; depth: string; min_priority: string; min_turnover: string; max_turnover: string
  min_in_deg: string; min_out_deg: string; min_seed_reach: string; is_seed: string; truncated_by_depth: string
}

const emptyFilters: FilterState = {
  role: '', cluster_id: '', depth: '', min_priority: '', min_turnover: '', max_turnover: '', min_in_deg: '',
  min_out_deg: '', min_seed_reach: '', is_seed: '', truncated_by_depth: '',
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload.detail ?? `Ошибка запроса: ${response.status}`)
  }
  return response.json()
}

function App() {
  const graphElement = useRef<HTMLDivElement>(null)
  const cy = useRef<Core | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [graph, setGraph] = useState<GraphData | null>(null)
  const [clusterGraph, setClusterGraph] = useState<ClusterGraph | null>(null)
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [topNodes, setTopNodes] = useState<TopNode[]>([])
  const [clusters, setClusters] = useState<Cluster[]>([])
  const [cluster, setCluster] = useState<Cluster | null>(null)
  const [selected, setSelected] = useState<NodeDetail | null>(null)
  const [neighbors, setNeighbors] = useState<Neighbors>({ incoming: [], outgoing: [] })
  const [edge, setEdge] = useState<EdgeDetail | null>(null)
  const [clusterEdge, setClusterEdge] = useState<ClusterEdge | null>(null)
  const [query, setQuery] = useState('')
  const [graphLevel, setGraphLevel] = useState<'nodes' | 'clusters'>('nodes')
  const [mode, setMode] = useState<'overview' | 'focus' | 'cluster'>('overview')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filters, setFilters] = useState<FilterState>(emptyFilters)
  const [discovery, setDiscovery] = useState<DiscoveryNode[]>([])
  const [analyticsTab, setAnalyticsTab] = useState<'structure' | 'clusters' | 'signals' | 'flows'>('structure')
  const [clusterSort, setClusterSort] = useState<ClusterSortKey>('max_priority')
  const [clusterMinNodes, setClusterMinNodes] = useState('')
  const [clusterMinSeeds, setClusterMinSeeds] = useState('')
  const [error, setError] = useState('')

  const showNode = useCallback(async (gid: string) => {
    try {
      setError('')
      const [detail, relations, ego] = await Promise.all([
        getJson<NodeDetail>(`/api/nodes/${gid}`), getJson<Neighbors>(`/api/nodes/${gid}/neighbors`), getJson<GraphData>(`/api/graph?gid=${gid}`),
      ])
      setSelected(detail); setNeighbors(relations); setGraph(ego); setGraphLevel('nodes'); setEdge(null)
      setCluster(null); setClusterEdge(null); setMode('focus'); setFiltersOpen(false)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Не удалось загрузить GID') }
  }, [])

  const showEdge = useCallback(async (src: string, dst: string) => {
    try { setEdge(await getJson<EdgeDetail>(`/api/edges/${src}/${dst}`)) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Не удалось загрузить поток') }
  }, [])

  const showOverview = useCallback(async () => {
    setGraph(await getJson<GraphData>('/api/graph')); setGraphLevel('nodes'); setCluster(null); setClusterEdge(null); setMode('overview')
  }, [])

  const showClusterNodes = useCallback(async (clusterId: number) => {
    if (!clusterId) return void showOverview()
    const [data, detail] = await Promise.all([getJson<GraphData>(`/api/graph?cluster_id=${clusterId}`), getJson<Cluster>(`/api/clusters/${clusterId}`)])
    setGraph(data); setCluster(detail); setGraphLevel('nodes'); setMode('cluster')
  }, [showOverview])

  const selectCluster = useCallback(async (clusterId: number) => {
    setCluster(await getJson<Cluster>(`/api/clusters/${clusterId}`)); setClusterEdge(null)
  }, [])

  const showClusterGraph = useCallback(async () => {
    setGraphLevel('clusters'); setClusterEdge(null)
    try {
      const initial = clusters[0] ?? (await getJson<Cluster[]>('/api/clusters'))[0]
      if (initial) { setCluster(initial); await selectCluster(initial.cluster_id) }
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Не удалось загрузить кластеры') }
  }, [clusters, selectCluster])

  useEffect(() => {
    Promise.all([
      getJson<Summary>('/api/summary'), getJson<TopNode[]>('/api/top-nodes?limit=50'), getJson<Cluster[]>('/api/clusters'),
      getJson<GraphData>('/api/graph'), getJson<ClusterGraph>('/api/cluster-graph'), getJson<Analytics>('/api/analytics'),
    ]).then(([summaryData, topData, clusterData, graphData, clusterGraphData, analyticsData]) => {
      setSummary(summaryData); setTopNodes(topData); setClusters(clusterData); setGraph(graphData)
      setClusterGraph(clusterGraphData); setAnalytics(analyticsData)
    }).catch((caught) => setError(caught instanceof Error ? caught.message : 'Backend недоступен'))
  }, [])

  useEffect(() => {
    if (!graphElement.current || (graphLevel === 'nodes' ? !graph : !clusterGraph)) return
    cy.current?.destroy()
    const elements = graphLevel === 'nodes' && graph ? nodeElements(graph) : clusterElements(clusterGraph as ClusterGraph)
    cy.current = cytoscape({
      container: graphElement.current, elements, layout: { name: 'preset', fit: true, padding: 30 }, minZoom: 0.2, maxZoom: 3,
      style: [
        { selector: 'node', style: {
          width: graphLevel === 'clusters' ? 'mapData(size, 1, 300, 20, 66)' : 'mapData(priority_score, 0, 1, 5, 18)',
          height: graphLevel === 'clusters' ? 'mapData(size, 1, 300, 20, 66)' : 'mapData(priority_score, 0, 1, 5, 18)',
          'background-color': 'data(color)', 'border-color': 'data(clusterColor)', 'border-width': 1.5, opacity: 0.84,
          label: graphLevel === 'clusters' ? 'data(label)' : '', color: '#dce4eb', 'font-size': '8px',
          'text-background-color': '#0b0f14', 'text-background-opacity': graphLevel === 'clusters' ? 0.72 : 0, 'text-background-padding': '2px',
        } },
        { selector: 'edge', style: {
          width: 'data(width)', 'line-color': '#51606d', 'target-arrow-color': '#7e8b97', 'target-arrow-shape': 'triangle',
          'curve-style': 'bezier', opacity: graphLevel === 'clusters' ? 0.52 : mode === 'overview' ? 0.17 : 0.55,
        } },
        { selector: ':selected', style: {
          'border-color': '#fff3d6', 'border-width': 4, opacity: 1, label: 'data(label)', color: '#f7f8fa', 'font-size': '10px',
          'text-background-color': '#0b0f14', 'text-background-opacity': 0.9, 'text-background-padding': '3px',
        } },
      ],
    })
    cy.current.on('tap', 'node', (event) => {
      const data = event.target.data()
      if (graphLevel === 'clusters') void selectCluster(data.cluster_id)
      else void showNode(event.target.id())
    })
    cy.current.on('tap', 'edge', (event) => {
      const data = event.target.data()
      if (graphLevel === 'clusters') setClusterEdge(data as ClusterEdge)
      else void showEdge(data.src, data.dst)
    })
    if (graphLevel === 'nodes' && selected) cy.current.$id(selected.gid).select()
    if (graphLevel === 'clusters' && cluster) cy.current.$id(`cluster-${cluster.cluster_id}`).select()
    return () => cy.current?.destroy()
  }, [cluster, clusterGraph, graph, graphLevel, mode, selectCluster, selected, showEdge, showNode])

  const search = (event: FormEvent) => {
    event.preventDefault(); const gid = query.trim()
    if (!/^\d+$/.test(gid)) return setError('Введите полный числовой GID')
    void showNode(gid)
  }

  const applyFilters = async (event: FormEvent) => {
    event.preventDefault(); const params = new URLSearchParams({ limit: '100' })
    Object.entries(filters).forEach(([key, value]) => { if (value !== '') params.set(key, value) })
    try { setDiscovery(await getJson<DiscoveryNode[]>(`/api/nodes?${params}`)) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Не удалось применить фильтры') }
  }

  const visibleClusters = useMemo(() => sortClusters(clusters.filter((item) =>
    item.n_nodes >= Number(clusterMinNodes || 0) && item.n_seed >= Number(clusterMinSeeds || 0),
  ), clusterSort), [clusterMinNodes, clusterMinSeeds, clusterSort, clusters])

  return <main>
    <header className="masthead">
      <div className="identity"><span className="mark" aria-hidden="true">MG</span><div><h1>Граф денег</h1><p>Рабочее место AML-аналитика</p></div></div>
      <div className="totals" aria-label="Сводка набора данных">
        <span><b>{summary?.nodes.toLocaleString('ru-RU') ?? '—'}</b> узлов</span><span><b>{summary?.edges.toLocaleString('ru-RU') ?? '—'}</b> потоков</span>
        <span><b>{summary?.transactions.toLocaleString('ru-RU') ?? '—'}</b> транзакций</span><span><b>{summary ? kzt.format(summary.observed_turnover_kzt) : '—'}</b> KZT наблюдаемо</span>
      </div>
      <div className="search-tools"><form className="search" onSubmit={search}><label htmlFor="gid-search">Точный поиск GID</label><div><input data-testid="gid-search" id="gid-search" value={query} onChange={(event) => setQuery(event.target.value)} inputMode="numeric" placeholder="100000…" /><button>Найти</button></div></form><button className={filtersOpen ? 'filter-toggle active' : 'filter-toggle'} onClick={() => setFiltersOpen(!filtersOpen)}>Фильтры</button></div>
    </header>

    {filtersOpen && <FilterDrawer filters={filters} setFilters={setFilters} clusters={clusters} results={discovery} onApply={applyFilters} onOpen={showNode} onClose={() => setFiltersOpen(false)} />}
    {error && <div className="error" role="alert">{error}<button onClick={() => setError('')} aria-label="Закрыть ошибку">×</button></div>}

    <section className="workspace">
      <aside className="queue panel"><div className="panel-title"><div><p>Очередь аналитика</p><h2>Приоритеты проверки</h2></div><span>50</span></div><div className="queue-list">{topNodes.map((node) => <button key={node.gid} className={selected?.gid === node.gid ? 'queue-row active' : 'queue-row'} onClick={() => void showNode(node.gid)}><span className="rank">{String(node.rank).padStart(2, '0')}</span><span className="queue-main"><b>GID {node.gid}</b><small><i style={{ background: roleColors[node.role] }} />{roleNames[node.role]}</small></span><strong>{score100(node.priority_score)}</strong></button>)}</div></aside>

      <section className="graph-panel panel">
        <div className="graph-toolbar"><div><p>Наблюдаемая сеть</p><h2>{graphLevel === 'clusters' ? 'Структура кластеров' : mode === 'focus' ? `Окружение GID ${selected?.gid}` : mode === 'cluster' ? `Кластер ${cluster?.cluster_id}` : 'Четыре колена переводов'}</h2></div><div className="graph-actions"><div className="view-switch" aria-label="Уровень графа"><button className={graphLevel === 'nodes' ? 'active' : ''} onClick={() => void showOverview()}>Узлы</button><button data-testid="cluster-view" className={graphLevel === 'clusters' ? 'active' : ''} onClick={() => void showClusterGraph()}>Кластеры</button></div>{graphLevel === 'nodes' && <select aria-label="Фильтр по кластеру" value={cluster?.cluster_id ?? ''} onChange={(event) => void showClusterNodes(Number(event.target.value))}><option value="">Все кластеры</option>{clusters.map((item) => <option key={item.cluster_id} value={item.cluster_id}>Кластер {item.cluster_id} · {item.n_nodes}</option>)}</select>}{graphLevel === 'nodes' && mode !== 'overview' && <button className="ghost" onClick={() => void showOverview()}>Вся сеть</button>}</div></div>
        {graphLevel === 'nodes' && cluster && <p className="cluster-note"><b>{cluster.n_seed} seed · {kzt.format(cluster.sum_kzt_internal)} KZT внутри.</b> {cluster.hypothesis}</p>}
        {graphLevel === 'nodes' && <div className="depth-axis">{[0, 1, 2, 3, 4].map((depth) => <span key={depth} className={depth === 4 ? 'boundary' : ''}>{depthLabel(depth)}</span>)}</div>}
        {!graph && !error && <div className="loading">Загрузка наблюдаемых потоков…</div>}
        <div className={graphLevel === 'nodes' ? 'graph depth-zones' : 'graph'} ref={graphElement} aria-label={graphLevel === 'nodes' ? 'Направленная сеть транзакций' : 'Направленная сеть кластеров'} />
        <div className="graph-status">{graphLevel === 'nodes' ? <><span>{graph?.nodes.length.toLocaleString('ru-RU') ?? 0} узлов</span><span>{graph?.edges.length.toLocaleString('ru-RU') ?? 0} направленных потоков</span></> : <><span>{clusterGraph?.nodes.length ?? 0} кластеров</span><span>{clusterGraph?.edges.length ?? 0} межкластерных потоков</span></>}<span>Колесо — масштаб · перетаскивание — обзор</span></div>
      </section>

      <aside className="detail panel">{graphLevel === 'clusters' ? <ClusterDetail cluster={cluster} edge={clusterEdge} onNode={showNode} /> : <NodePanel selected={selected} neighbors={neighbors} edge={edge} onNode={showNode} onEdge={showEdge} onCloseEdge={() => setEdge(null)} />}</aside>
    </section>

    <AnalyticsSection summary={summary} analytics={analytics} clusters={visibleClusters} clusterGraph={clusterGraph} tab={analyticsTab} setTab={setAnalyticsTab} sort={clusterSort} setSort={setClusterSort} minNodes={clusterMinNodes} setMinNodes={setClusterMinNodes} minSeeds={clusterMinSeeds} setMinSeeds={setClusterMinSeeds} onCluster={showClusterNodes} onNode={showNode} onFlow={(flow) => { setGraphLevel('clusters'); setClusterEdge(flow); setCluster(null); window.scrollTo({ top: 0, behavior: 'smooth' }) }} />

    <footer className="coverage"><div><b>Покрытие, а не вердикт.</b><span>Score определяет приоритет проверки только внутри наблюдаемого графа.</span></div><ul><li>Только исходящий обход</li><li>Граница на 4-м колене</li><li>Переводы &lt;5 000 KZT не видны</li><li>Входящие seed неполны</li></ul><div className="legend">{Object.entries(roleColors).map(([role, color]) => <span key={role}><i style={{ background: color }} />{roleNames[role]}</span>)}</div></footer>
  </main>
}

function nodeElements(graph: GraphData) {
  const counts = new Map<number, number>(), totals = new Map<number, number>()
  graph.nodes.forEach((node) => totals.set(node.depth, (totals.get(node.depth) ?? 0) + 1))
  return [...graph.nodes.map((node) => { const index = counts.get(node.depth) ?? 0; counts.set(node.depth, index + 1); const count = totals.get(node.depth) ?? 1; return { data: { id: node.gid, label: node.gid, ...node, color: roleColors[node.role], clusterColor: `hsl(${(node.cluster_id * 47) % 360}, 48%, 58%)` }, position: { x: 90 + node.depth * 220 + ((index * 37) % 90) - 45, y: 55 + (index * Math.max(5, 590 / count)) % 590 } } }), ...graph.edges.map((flow) => ({ data: { id: `${flow.src}-${flow.dst}`, source: flow.src, target: flow.dst, ...flow, width: Math.max(0.6, Math.log10(flow.sum_kzt) - 3) } }))]
}

function clusterElements(graph: ClusterGraph) {
  return [...graph.nodes.map((node, index) => ({ data: { id: `cluster-${node.cluster_id}`, label: `К${node.cluster_id}`, cluster_id: node.cluster_id, size: node.n_nodes, priority_score: node.max_priority, color: roleColors[node.top_role], clusterColor: '#dbe5ec' }, position: { x: 70 + (index % 13) * 90, y: 60 + Math.floor(index / 13) * 88 } })), ...graph.edges.map((flow) => ({ data: { id: `cluster-${flow.src_cluster}-${flow.dst_cluster}`, source: `cluster-${flow.src_cluster}`, target: `cluster-${flow.dst_cluster}`, ...flow, width: Math.max(0.8, Math.log10(flow.sum_kzt) - 3) } }))]
}

function FilterDrawer({ filters, setFilters, clusters, results, onApply, onOpen, onClose }: { filters: FilterState; setFilters: (value: FilterState) => void; clusters: Cluster[]; results: DiscoveryNode[]; onApply: (event: FormEvent) => void; onOpen: (gid: string) => Promise<void>; onClose: () => void }) {
  const field = (key: keyof FilterState, value: string) => setFilters({ ...filters, [key]: value })
  return <aside className="filter-drawer" data-testid="filters-panel"><div className="drawer-head"><div><p>Поиск без знания GID</p><h2>Фильтры узлов</h2></div><button onClick={onClose} aria-label="Закрыть фильтры">×</button></div><form onSubmit={onApply}><div className="filter-grid">
    <label>Роль<select data-testid="filter-role" value={filters.role} onChange={(e) => field('role', e.target.value)}><option value="">Любая</option>{Object.entries(roleNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label>Кластер<select value={filters.cluster_id} onChange={(e) => field('cluster_id', e.target.value)}><option value="">Любой</option>{clusters.map((item) => <option key={item.cluster_id} value={item.cluster_id}>{item.cluster_id}</option>)}</select></label>
    <label>Колено<select data-testid="filter-depth" value={filters.depth} onChange={(e) => field('depth', e.target.value)}><option value="">Любое</option>{[0, 1, 2, 3, 4].map((value) => <option key={value} value={value}>{depthLabel(value)}</option>)}</select></label>
    <label>Мин. приоритет<input data-testid="filter-priority" type="number" min="0" max="1" step="0.05" value={filters.min_priority} onChange={(e) => field('min_priority', e.target.value)} placeholder="0–1" /></label>
    <label>Оборот от, KZT<input type="number" min="0" value={filters.min_turnover} onChange={(e) => field('min_turnover', e.target.value)} /></label><label>Оборот до, KZT<input type="number" min="0" value={filters.max_turnover} onChange={(e) => field('max_turnover', e.target.value)} /></label>
    <label>Мин. плательщиков<input type="number" min="0" value={filters.min_in_deg} onChange={(e) => field('min_in_deg', e.target.value)} /></label><label>Мин. получателей<input type="number" min="0" value={filters.min_out_deg} onChange={(e) => field('min_out_deg', e.target.value)} /></label><label>Мин. seed-ветвей<input type="number" min="0" value={filters.min_seed_reach} onChange={(e) => field('min_seed_reach', e.target.value)} /></label>
    <label>Seed<select value={filters.is_seed} onChange={(e) => field('is_seed', e.target.value)}><option value="">Любой</option><option value="true">Только seed</option><option value="false">Не seed</option></select></label><label>Граница данных<select value={filters.truncated_by_depth} onChange={(e) => field('truncated_by_depth', e.target.value)}><option value="">Любая</option><option value="true">Только depth 4</option><option value="false">Без обрыва</option></select></label>
  </div><div className="filter-actions"><button type="button" className="ghost" onClick={() => setFilters(emptyFilters)}>Сбросить</button><button className="primary" data-testid="apply-filters">Показать совпадения</button></div></form><div className="discovery-results" data-testid="discovery-results"><div className="result-title"><b>Совпадения</b><span>{results.length}</span></div>{results.length === 0 ? <p>Задайте условия и запустите поиск.</p> : results.map((node) => <button key={node.gid} onClick={() => void onOpen(node.gid)}><span><b>GID {formatGid(node.gid)}</b><small>{roleNames[node.role]} · кластер {node.cluster_id} · {depthLabel(node.depth)}</small></span><strong>{score100(node.priority_score)} / 100</strong></button>)}</div></aside>
}

function NodePanel({ selected, neighbors, edge, onNode, onEdge, onCloseEdge }: { selected: NodeDetail | null; neighbors: Neighbors; edge: EdgeDetail | null; onNode: (gid: string) => Promise<void>; onEdge: (src: string, dst: string) => Promise<void>; onCloseEdge: () => void }) {
  if (!selected) return <div className="empty-detail"><span>◎</span><h2>Выберите GID</h2><p>Откройте приоритет, найдите точный идентификатор или нажмите узел графа.</p></div>
  const relations = [...neighbors.incoming.slice(0, 5), ...neighbors.outgoing.slice(0, 5)]
  return <div data-testid="node-detail"><div className="detail-head"><div><p>Выбранный клиент</p><h2>GID {selected.gid}</h2></div><strong style={{ color: roleColors[selected.role] }}>{score100(selected.priority_score)} / 100</strong></div><div className="role-line"><i style={{ background: roleColors[selected.role] }} /><div><b>{roleNames[selected.role]}</b><small>Выраженность роли: {score100(selected.role_score)} / 100 · кластер {selected.cluster_id}</small></div></div><p className="priority-copy">Приоритет проверки: <b>{score100(selected.priority_score)} / 100</b></p>{selected.coverage_warning && <div className="warning" data-testid="coverage-warning"><b>Ограничение покрытия</b>{selected.coverage_warning}</div>}<blockquote>{selected.evidence}</blockquote><div className="flow-grid"><div><small>Наблюдаемый вход</small><b>{kzt.format(selected.in_kzt)} KZT</b><span>{selected.in_deg} контрагентов · {selected.in_tx} переводов</span></div><div><small>Наблюдаемый выход</small><b>{kzt.format(selected.out_kzt)} KZT</b><span>{selected.out_deg} контрагентов · {selected.out_tx} переводов</span></div></div><dl className="metrics"><div><dt>Колено</dt><dd>{depthLabel(selected.depth)}</dd></div><div><dt>Seed-связность</dt><dd>Достижим из {selected.seed_reach_count} ветвей</dd></div><div><dt>PageRank</dt><dd>Топ {topPercent(selected.pagerank_pct)}%</dd></div><div><dt>Посредничество</dt><dd>Топ {topPercent(selected.betweenness_pct)}%</dd></div></dl><div className="why-role"><h3>Почему эта роль</h3>{selected.role_components.map((component) => <div key={component.label}><span>{component.label}{component.value != null ? ` · ${component.value >= 1000 ? kzt.format(component.value) : Number(component.value.toFixed(2))}` : ''}</span><b>{component.percentile == null ? 'условие' : `топ ${topPercent(component.percentile)}%`}</b></div>)}</div><div className="relations"><h3>Наблюдаемые связи</h3>{relations.map((flow) => { const incoming = flow.dst === selected.gid; const counterparty = incoming ? flow.src : flow.dst; return <div className="relation-row" key={`${flow.src}-${flow.dst}`}><button className="relation-node" aria-label={`Открыть контрагента ${counterparty}`} onClick={() => void onNode(counterparty)}><span><small>{incoming ? 'Входящий ←' : 'Исходящий →'} · {roleNames[flow.counterparty_role]} · кластер {flow.counterparty_cluster}</small><b>GID {counterparty}</b></span><strong>{kzt.format(flow.sum_kzt)} KZT · {flow.n_tx} тр.</strong></button><button className="flow-button" aria-label={`Открыть поток ${flow.src} ${flow.dst}`} onClick={() => void onEdge(flow.src, flow.dst)}>Поток</button></div> })}{neighbors.incoming.length + neighbors.outgoing.length > 10 && <small>Показано 10 из {neighbors.incoming.length + neighbors.outgoing.length} связей</small>}</div>{edge && <div className="edge-detail" data-testid="flow-detail"><div><small>Детали потока</small><button onClick={onCloseEdge} aria-label="Закрыть поток">×</button></div><h3>{edge.src} → {edge.dst}</h3><p><b>{kzt.format(edge.sum_kzt)} KZT</b> · {edge.n_tx} переводов · {edge.first_date}—{edge.last_date}</p><div className="edge-actions"><button onClick={() => void onNode(edge.src)}>Открыть отправителя</button><button onClick={() => void onNode(edge.dst)}>Открыть получателя</button></div><ul>{edge.transactions.map((tx, index) => <li key={`${tx.date}-${index}`}><span>{tx.date}</span><b>{kzt.format(tx.sum_kzt)} KZT</b></li>)}</ul></div>}</div>
}

function ClusterDetail({ cluster, edge, onNode }: { cluster: Cluster | null; edge: ClusterEdge | null; onNode: (gid: string) => Promise<void> }) {
  if (edge) return <div className="cluster-detail" data-testid="cluster-flow-detail"><div className="detail-head"><div><p>Межкластерный поток</p><h2>Кластер {edge.src_cluster} → {edge.dst_cluster}</h2></div></div><div className="cluster-stats"><div><small>Наблюдаемый объём</small><b>{kzt.format(edge.sum_kzt)} KZT</b></div><div><small>Транзакций</small><b>{edge.n_tx}</b></div><div><small>Связей GID→GID</small><b>{edge.n_edges}</b></div></div><p className="caution">Агрегат наблюдаемых переводов между двумя сообществами, не вывод о едином владельце.</p></div>
  if (!cluster) return <div className="empty-detail"><span>◎</span><h2>Выберите кластер</h2><p>Нажмите supernode или межкластерный поток, чтобы увидеть агрегированное evidence.</p></div>
  return <div className="cluster-detail" data-testid="cluster-detail"><div className="detail-head"><div><p>Выбранное сообщество</p><h2>Кластер {cluster.cluster_id}</h2></div><strong>{score100(cluster.max_priority)} / 100</strong></div><div className="cluster-stats"><div><small>Узлов / seed</small><b>{cluster.n_nodes} / {cluster.n_seed}</b></div><div><small>Внутренний оборот</small><b>{kzt.format(cluster.sum_kzt_internal)} KZT</b></div><div><small>Доминирующая роль</small><b>{roleNames[cluster.top_role]}</b></div></div><blockquote>{cluster.hypothesis}</blockquote><h3>Приоритетные GID</h3><div className="cluster-node-list">{cluster.nodes?.map((node) => <button key={node.gid} onClick={() => void onNode(node.gid)}><span>GID {node.gid}<small>{roleNames[node.role]}</small></span><b>{score100(node.priority_score)}</b></button>)}</div></div>
}

function AnalyticsSection({ summary, analytics, clusters, clusterGraph, tab, setTab, sort, setSort, minNodes, setMinNodes, minSeeds, setMinSeeds, onCluster, onNode, onFlow }: { summary: Summary | null; analytics: Analytics | null; clusters: Cluster[]; clusterGraph: ClusterGraph | null; tab: string; setTab: (tab: 'structure' | 'clusters' | 'signals' | 'flows') => void; sort: ClusterSortKey; setSort: (key: ClusterSortKey) => void; minNodes: string; setMinNodes: (value: string) => void; minSeeds: string; setMinSeeds: (value: string) => void; onCluster: (id: number) => Promise<void>; onNode: (gid: string) => Promise<void>; onFlow: (edge: ClusterEdge) => void }) {
  return <section className="analytics" data-testid="analytics"><div className="analytics-head"><div><p>Детерминированные срезы</p><h2>Сводная аналитика сети</h2></div><nav>{[['structure', 'Структура'], ['clusters', 'Кластеры'], ['signals', 'Аналитические сигналы'], ['flows', 'Межкластерные потоки']].map(([key, label]) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key as 'structure' | 'clusters' | 'signals' | 'flows')}>{label}</button>)}</nav></div>{tab === 'structure' && <div className="structure-grid"><div><h3>Распределение ролей</h3>{summary && Object.entries(summary.role_counts).sort((a, b) => b[1] - a[1]).map(([role, count]) => <Bar key={role} label={roleNames[role]} value={count} max={summary.nodes} color={roleColors[role]} />)}</div><div><h3>Колена наблюдения</h3>{analytics && Object.entries(analytics.depth_counts).map(([depth, count]) => <Bar key={depth} label={depthLabel(Number(depth))} value={count} max={summary?.nodes ?? 1} color={Number(depth) === 4 ? '#ef6a62' : '#7e8b97'} />)}<p className="analytics-note">Seed: <b>{analytics?.seed_count ?? '—'}</b> · узлов на границе без видимого выхода: <b>{analytics?.boundary_count ?? '—'}</b></p></div></div>}{tab === 'clusters' && <div><div className="table-filters"><label>Сортировать<select value={sort} onChange={(e) => setSort(e.target.value as ClusterSortKey)}><option value="max_priority">Макс. приоритет</option><option value="n_nodes">Узлы</option><option value="n_seed">Seed</option><option value="sum_kzt_internal">Внутренний оборот</option></select></label><label>Мин. узлов<input type="number" min="0" value={minNodes} onChange={(e) => setMinNodes(e.target.value)} /></label><label>Мин. seed<input type="number" min="0" value={minSeeds} onChange={(e) => setMinSeeds(e.target.value)} /></label></div><div className="data-table"><div className="table-row table-head"><span>Кластер</span><span>Узлы / seed</span><span>Внутри</span><span>Макс. приоритет</span><span>Гипотеза</span></div>{clusters.map((item) => <button className="table-row" key={item.cluster_id} onClick={() => void onCluster(item.cluster_id)}><b>К{item.cluster_id}</b><span>{item.n_nodes} / {item.n_seed}</span><span>{kzt.format(item.sum_kzt_internal)} KZT</span><span>{score100(item.max_priority)} / 100</span><span>{item.hypothesis}</span></button>)}</div></div>}{tab === 'signals' && <div className="signal-grid">{analytics?.signals.map((group) => <div key={group.label}><h3>{group.label}</h3><p>Кандидаты для проверки, не доказательство нарушения.</p>{group.nodes.map((node) => <button key={node.gid} onClick={() => void onNode(node.gid)}><span>GID {node.gid}<small>{roleNames[node.role]}</small></span><b>{node.value < 1 ? `топ ${topPercent(node.value)}%` : kzt.format(node.value)}</b></button>)}</div>)}</div>}{tab === 'flows' && <div className="data-table"><div className="table-row table-head"><span>Направление</span><span>KZT</span><span>Транзакции</span><span>Связи</span><span>Действие</span></div>{clusterGraph?.edges.slice(0, 30).map((flow) => <button className="table-row" key={`${flow.src_cluster}-${flow.dst_cluster}`} onClick={() => onFlow(flow)}><b>К{flow.src_cluster} → К{flow.dst_cluster}</b><span>{kzt.format(flow.sum_kzt)} KZT</span><span>{flow.n_tx}</span><span>{flow.n_edges}</span><span>Показать на графе</span></button>)}</div>}</section>
}

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return <div className="bar-row"><span>{label}</span><i><b style={{ width: `${Math.max(1, value / max * 100)}%`, background: color }} /></i><strong>{value.toLocaleString('ru-RU')}</strong></div>
}

export default App
