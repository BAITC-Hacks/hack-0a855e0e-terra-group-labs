import cytoscape, { type Core } from 'cytoscape'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import './App.css'
import { depthLabel, formatGid, kzt, roleColors, roleNames, score100, sortClusters, topPercent, type ClusterSortKey } from './domain'

type Summary = { nodes: number; edges: number; transactions: number; observed_turnover_kzt: number; clusters: number; role_counts: Record<string, number> }
type GraphNode = { gid: string; role: string; role_score: number; priority_score: number; cluster_id: number; depth: number; is_seed: boolean; has_seed_link: boolean; truncated_by_depth: boolean }
type GraphEdge = { src: string; dst: string; sum_kzt: number; n_tx: number }
type GraphData = { nodes: GraphNode[]; edges: GraphEdge[] }
type TopNode = { rank: number; gid: string; role: string; priority_score: number; why: string; is_seed: boolean; has_seed_link: boolean }
type RoleComponent = { label: string; value: number | null; percentile: number | null }
type NodeDetail = GraphNode & {
  evidence: string; in_deg: number; out_deg: number; in_kzt: number; out_kzt: number; in_tx: number; out_tx: number
  pagerank_pct: number; betweenness_pct: number; seed_reach_count: number; pass_through: number | null
  coverage_warning: string | null; role_components: RoleComponent[]
}
type Neighbor = GraphEdge & { counterparty_role: string; counterparty_cluster: number; counterparty_is_seed: boolean }
type Neighbors = { incoming: Neighbor[]; outgoing: Neighbor[] }
type EdgeDetail = GraphEdge & { first_date: string; last_date: string; transactions: { date: string; sum_kzt: number }[] }
type ClusterNode = { gid: string; role: string; role_score: number; priority_score: number; evidence: string }
type Cluster = {
  cluster_id: number; n_nodes: number; n_seed: number; sum_kzt_internal: number; max_priority: number
  avg_priority: number; top_role: string; top_gids: string; hypothesis: string; seed_out_tx: number; seed_tx_share: number; has_seed_link: boolean; nodes?: ClusterNode[]
}
type ClusterEdge = { src_cluster: number; dst_cluster: number; sum_kzt: number; n_tx: number; n_edges: number; seed_tx: number; seed_tx_share: number }
type ClusterGraph = { nodes: (Cluster & { id: string; role_counts: Record<string, number> })[]; edges: ClusterEdge[] }
type SignalGroup = { label: string; nodes: { gid: string; role: string; priority_score: number; value: number }[] }
type Analytics = { depth_counts: Record<string, number>; seed_count: number; boundary_count: number; signals: SignalGroup[] }
type DiscoveryNode = GraphNode & { in_deg: number; out_deg: number; seed_reach_count: number; turnover: number; evidence: string }
type AIReply = { answer: string; summary: string; observations: string[]; limitations: string[]; recommended_checks: string[]; cited_gids: string[]; source_gids: string[]; model: string }
type ChatMessage = { role: 'user' | 'assistant'; content: string; reply?: AIReply }
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

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
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
  const [seedNodes, setSeedNodes] = useState<DiscoveryNode[]>([])
  const [queueMode, setQueueMode] = useState<'priority' | 'seed'>('priority')
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
  const [aiAvailable, setAiAvailable] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [aiSummary, setAiSummary] = useState<{ gid: string; reply: AIReply } | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState('')
  const [chatInput, setChatInput] = useState('')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])

  const showNode = useCallback(async (gid: string) => {
    try {
      setError('')
      const [detail, relations, ego] = await Promise.all([
        getJson<NodeDetail>(`/api/nodes/${gid}`), getJson<Neighbors>(`/api/nodes/${gid}/neighbors`), getJson<GraphData>(`/api/graph?gid=${gid}`),
      ])
      setSelected(detail); setNeighbors(relations); setGraph(ego); setGraphLevel('nodes'); setEdge(null); setAiSummary(null)
      setCluster(null); setClusterEdge(null); setMode('focus'); setFiltersOpen(false)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Не удалось загрузить GID') }
  }, [])

  const showEdge = useCallback(async (src: string, dst: string) => {
    try { setEdge(await getJson<EdgeDetail>(`/api/edges/${src}/${dst}`)) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Не удалось загрузить поток') }
  }, [])

  const showOverview = useCallback(async () => {
    try {
      setGraph(await getJson<GraphData>('/api/graph')); setGraphLevel('nodes'); setCluster(null); setClusterEdge(null); setEdge(null); setMode('overview')
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Не удалось загрузить сеть') }
  }, [])

  const showClusterNodes = useCallback(async (clusterId: number, fromFlow = false) => {
    if (!clusterId) return void showOverview()
    try {
      const [data, detail] = await Promise.all([getJson<GraphData>(`/api/graph?cluster_id=${clusterId}`), getJson<Cluster>(`/api/clusters/${clusterId}`)])
      setGraph(data); setCluster(detail); setSelected(null); setEdge(null); if (!fromFlow) setClusterEdge(null); setGraphLevel('nodes'); setMode('cluster')
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Не удалось загрузить кластер') }
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

  const openClusterOnGraph = useCallback(async (clusterId: number) => {
    try {
      setGraphLevel('clusters'); setClusterEdge(null); await selectCluster(clusterId)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Не удалось открыть кластер') }
  }, [selectCluster])

  const drillClusterFromFlow = (clusterId: number) => {
    if (clusterEdge) {
      window.history.replaceState({ clusterFlow: clusterEdge }, '')
      window.history.pushState({ clusterNodes: clusterId }, '', `#cluster-${clusterId}`)
    }
    void showClusterNodes(clusterId, Boolean(clusterEdge))
  }

  const navigateNodeFromFlow = (gid: string) => {
    if (!selected || !edge) return
    window.history.replaceState({ nodeFlow: { gid: selected.gid, src: edge.src, dst: edge.dst } }, '')
    window.history.pushState({ nodeDestination: gid }, '', `#gid-${gid}`)
    void showNode(gid)
  }

  useEffect(() => {
    const restoreFlow = (event: PopStateEvent) => {
      const clusterFlow = event.state?.clusterFlow as ClusterEdge | undefined
      const nodeFlow = event.state?.nodeFlow as { gid: string; src: string; dst: string } | undefined
      if (clusterFlow) { setClusterEdge(clusterFlow); setCluster(null); setGraphLevel('clusters'); setSelected(null) }
      else if (nodeFlow) { void showNode(nodeFlow.gid).then(() => showEdge(nodeFlow.src, nodeFlow.dst)) }
      else if (event.state?.nodeDestination) { void showNode(event.state.nodeDestination) }
    }
    window.addEventListener('popstate', restoreFlow)
    return () => window.removeEventListener('popstate', restoreFlow)
  }, [showNode, showEdge])

  const askSummary = async () => {
    if (!selected) return
    const gid = selected.gid
    setAiBusy(true); setAiError('')
    try {
      const reply = await postJson<AIReply>('/api/ai/ask', { gid, question: 'Кратко объясни наблюдаемую роль, главный поток и следующий шаг проверки.', concise: true })
      setAiSummary({ gid, reply })
    } catch (caught) { setAiError(caught instanceof Error ? caught.message : 'Не удалось получить AI-сводку') }
    finally { setAiBusy(false) }
  }

  const sendChat = async (event: FormEvent) => {
    event.preventDefault()
    const question = chatInput.trim()
    if (!question || aiBusy) return
    const history = chatMessages.slice(-6).map(({ role, content }) => ({ role, content }))
    setChatMessages((messages) => [...messages, { role: 'user', content: question }])
    setChatInput(''); setAiBusy(true); setAiError('')
    try {
      const reply = await postJson<AIReply>('/api/ai/ask', { gid: selected?.gid, question, history })
      setChatMessages((messages) => [...messages, { role: 'assistant', content: reply.answer, reply }])
    } catch (caught) { setAiError(caught instanceof Error ? caught.message : 'Не удалось получить ответ') }
    finally { setAiBusy(false) }
  }

  useEffect(() => {
    Promise.all([
      getJson<Summary>('/api/summary'), getJson<TopNode[]>('/api/top-nodes?limit=50'), getJson<Cluster[]>('/api/clusters'),
      getJson<GraphData>('/api/graph'), getJson<ClusterGraph>('/api/cluster-graph'), getJson<Analytics>('/api/analytics'),
    ]).then(([summaryData, topData, clusterData, graphData, clusterGraphData, analyticsData]) => {
      setSummary(summaryData); setTopNodes(topData); setClusters(clusterData); setGraph(graphData)
      setClusterGraph(clusterGraphData); setAnalytics(analyticsData)
    }).catch((caught) => setError(caught instanceof Error ? caught.message : 'Backend недоступен'))
    getJson<{ available: boolean }>('/api/ai/status').then((status) => setAiAvailable(status.available)).catch(() => setAiAvailable(false))
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
        { selector: 'node[?has_seed_link]', style: { 'border-color': '#ef6a62', 'border-width': 3, opacity: 1 } },
        { selector: 'edge', style: {
          width: 'data(width)', 'line-color': '#51606d', 'target-arrow-color': '#7e8b97', 'target-arrow-shape': 'triangle',
          'curve-style': 'bezier', opacity: graphLevel === 'clusters' ? 0.52 : mode === 'overview' ? 0.17 : 0.55,
        } },
        { selector: 'node[?is_seed]', style: { 'border-color': '#ef6a62', 'border-width': 4, opacity: 1 } },
        { selector: 'edge[?seed_related]', style: { 'line-color': '#bf4f4a', 'target-arrow-color': '#ef6a62', opacity: mode === 'overview' ? 0.52 : 0.8 } },
        { selector: 'edge.flow-muted', style: { opacity: 0.07 } },
        { selector: 'edge.related-flow', style: { 'line-color': '#ca9451', 'target-arrow-color': '#e3ad5e', opacity: 0.85, width: 2 } },
        { selector: 'edge[?seed_related].related-flow', style: { 'line-color': '#df625a', 'target-arrow-color': '#ef6a62' } },
        { selector: 'edge.active-flow', style: { 'line-color': '#ffcb62', 'target-arrow-color': '#ffcb62', 'target-arrow-shape': 'triangle', opacity: 1, width: 5, 'z-index': 999 } },
        { selector: 'edge.active-seed-flow', style: { 'line-color': '#ff6960', 'target-arrow-color': '#ff6960', 'target-arrow-shape': 'triangle', opacity: 1, width: 5, 'z-index': 999 } },
        { selector: 'node.flow-endpoint', style: { 'border-color': '#ffcb62', 'border-width': 5, opacity: 1, 'z-index': 999 } },
        { selector: 'node.seed-flow-endpoint', style: { 'border-color': '#ff6960', 'border-width': 5, opacity: 1, 'z-index': 999 } },
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
    cy.current.on('dragfree', 'node', (event) => {
      if (graphLevel === 'nodes') event.target.position('x', event.target.data('homeX'))
    })
    cy.current.fit(cy.current.nodes(), 30)
    return () => cy.current?.destroy()
  }, [clusterGraph, graph, graphLevel, mode, selectCluster, showEdge, showNode])

  useEffect(() => {
    const instance = cy.current
    if (!instance) return
    instance.elements().unselect().removeClass('flow-muted related-flow active-flow active-seed-flow flow-endpoint seed-flow-endpoint')
    const selectedId = graphLevel === 'clusters' ? cluster && `cluster-${cluster.cluster_id}` : selected?.gid
    if (selectedId) {
      const node = instance.$id(selectedId)
      node.select()
      node.connectedEdges().addClass('related-flow')
    }
    const activeId = graphLevel === 'clusters'
      ? clusterEdge && `cluster-${clusterEdge.src_cluster}-${clusterEdge.dst_cluster}`
      : edge && `${edge.src}-${edge.dst}`
    if (activeId) {
      const active = instance.$id(activeId)
      if (active.length) {
        instance.edges().addClass('flow-muted')
        const seedRelated = graphLevel === 'clusters' ? Number(active.data('seed_tx')) > 0 : Boolean(active.data('seed_related'))
        active.removeClass('flow-muted related-flow').addClass(seedRelated ? 'active-seed-flow' : 'active-flow')
        active.connectedNodes().addClass(seedRelated ? 'seed-flow-endpoint' : 'flow-endpoint')
      }
    }
  }, [cluster, clusterEdge, edge, graph, graphLevel, selected])

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

  const showSeedQueue = async () => {
    try {
      if (!seedNodes.length) setSeedNodes(await getJson<DiscoveryNode[]>('/api/nodes?is_seed=true&limit=100'))
      setQueueMode('seed')
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Не удалось загрузить стартовых клиентов') }
  }

  const queueItems = queueMode === 'seed' ? seedNodes.map((node, index) => ({ ...node, rank: index + 1 })) : topNodes

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
      <aside className="queue panel"><div className="panel-title"><div><p>Очередь аналитика</p><h2>{queueMode === 'seed' ? 'Стартовые клиенты' : 'Приоритеты проверки'}</h2></div><span>{queueMode === 'seed' ? seedNodes.length : 50}</span></div><div className="queue-switch"><button className={queueMode === 'priority' ? 'active' : ''} onClick={() => setQueueMode('priority')}>Топ 50</button><button className={queueMode === 'seed' ? 'active' : ''} onClick={() => void showSeedQueue()}>Стартовые 81</button></div><p className="queue-explain">Стартовые (seed) — 81 ранее выявленный клиент. Красный отмечает прямую наблюдаемую связь; это не вывод о виновности других узлов.</p><div className="queue-list">{queueItems.map((node) => <button key={node.gid} className={selected?.gid === node.gid ? 'queue-row active' : 'queue-row'} onClick={() => void showNode(node.gid)}><span className="rank">{String(node.rank).padStart(2, '0')}</span><span className="queue-main"><b>GID {node.gid}</b><small><i style={{ background: roleColors[node.role] }} />{roleNames[node.role]}{node.is_seed ? <em className="seed-tag">ранее выявленный</em> : node.has_seed_link && <em className="seed-link-tag">прямая связь</em>}</small></span><strong>{score100(node.priority_score)}</strong></button>)}</div></aside>

      <section className="graph-panel panel">
        <div className="graph-toolbar"><div><p>Наблюдаемая сеть</p><h2>{graphLevel === 'clusters' ? 'Структура кластеров' : mode === 'focus' ? `Окружение GID ${selected?.gid}` : mode === 'cluster' ? `Кластер ${cluster?.cluster_id}` : 'Четыре колена переводов'}</h2></div><div className="graph-actions"><div className="view-switch" aria-label="Уровень графа"><button className={graphLevel === 'nodes' ? 'active' : ''} onClick={() => void showOverview()}>Узлы</button><button data-testid="cluster-view" className={graphLevel === 'clusters' ? 'active' : ''} onClick={() => void showClusterGraph()}>Кластеры</button></div>{graphLevel === 'nodes' && <select aria-label="Фильтр по кластеру" value={cluster?.cluster_id ?? ''} onChange={(event) => void showClusterNodes(Number(event.target.value))}><option value="">Все кластеры</option>{clusters.map((item) => <option key={item.cluster_id} value={item.cluster_id}>Кластер {item.cluster_id} · {item.n_nodes}</option>)}</select>}{graphLevel === 'nodes' && clusterEdge && <button className="ghost" onClick={() => window.history.back()}>← К потоку К{clusterEdge.src_cluster}→К{clusterEdge.dst_cluster}</button>}{graphLevel === 'nodes' && selected && window.history.state?.nodeDestination === selected.gid && <button className="ghost" onClick={() => window.history.back()}>← К потоку GID</button>}{graphLevel === 'nodes' && mode !== 'overview' && <button className="ghost" onClick={() => void showOverview()}>Вся сеть</button>}<button className="ghost assistant-toggle" onClick={() => setAiOpen(true)}>AI помощник</button></div></div>
        {graphLevel === 'nodes' && cluster && <p className="cluster-note"><b>{cluster.n_seed} стартовых клиентов · {kzt.format(cluster.sum_kzt_internal)} KZT внутри.</b> {cluster.has_seed_link && <em>Есть прямая связь с ранее выявленными. </em>}{cluster.hypothesis}</p>}
        {graphLevel === 'nodes' && <div className="depth-axis">{[0, 1, 2, 3, 4].map((depth) => <span key={depth} className={depth === 4 ? 'boundary' : ''}>{depthLabel(depth)}</span>)}</div>}
        {!graph && !error && <div className="loading">Загрузка наблюдаемых потоков…</div>}
        <div className={graphLevel === 'nodes' ? 'graph depth-zones' : 'graph'} ref={graphElement} aria-label={graphLevel === 'nodes' ? 'Направленная сеть транзакций' : 'Направленная сеть кластеров'} />
        <div className="graph-status">{graphLevel === 'nodes' ? <><span>{graph?.nodes.length.toLocaleString('ru-RU') ?? 0} узлов</span><span>{graph?.edges.length.toLocaleString('ru-RU') ?? 0} направленных потоков</span><span><i className="seed-legend" /> красный — прямая связь со стартовым клиентом</span></> : <><span>{clusterGraph?.nodes.length ?? 0} кластеров</span><span>{clusterGraph?.edges.length ?? 0} межкластерных потоков</span></>}<span>{graphLevel === 'nodes' ? 'Колесо — масштаб · узлы перемещаются внутри колена' : 'Колесо — масштаб · кластеры можно перемещать'}</span></div>
      </section>

      <aside className="detail panel">{graphLevel === 'clusters' ? <ClusterDetail cluster={cluster} edge={clusterEdge} onNode={showNode} onClusterNodes={drillClusterFromFlow} /> : <NodePanel key={selected?.gid ?? 'empty'} selected={selected} neighbors={neighbors} edge={edge} onNode={showNode} onFlowNode={navigateNodeFromFlow} onEdge={showEdge} onCloseEdge={() => setEdge(null)} onSummary={askSummary} aiAvailable={aiAvailable} aiBusy={aiBusy} aiSummary={aiSummary && aiSummary.gid === selected?.gid ? aiSummary.reply : null} aiError={aiError} />}</aside>
    </section>

    {aiOpen && <aside className="assistant-drawer" aria-label="AI помощник аналитика" data-testid="assistant-panel">
      <div className="assistant-head"><div><p>OpenAI · только наблюдаемые факты</p><h2>Помощник аналитика</h2></div><button onClick={() => setAiOpen(false)} aria-label="Закрыть помощника">×</button></div>
      <p className="assistant-context">Контекст: {selected ? `GID ${selected.gid}` : 'вся сеть'} · ответ проверяйте по связям на графе.</p>
      {!aiAvailable && <p className="assistant-unavailable">Для AI добавьте `OpenAIKEY` в корневой .env и перезапустите backend. Основной анализ работает без ключа.</p>}
      <div className="assistant-messages" aria-live="polite">
        {chatMessages.length === 0 && <div className="assistant-intro"><p>Спросите, какие наблюдаемые потоки требуют проверки, или назовите до шести точных GID. Ответ ограничен данными текущего графа.</p><button onClick={() => setChatInput('На что обратить внимание в выбранном GID?')}>На что обратить внимание?</button></div>}
        {chatMessages.map((message, index) => <article key={index} className={`chat-message ${message.role}`}><b>{message.role === 'user' ? 'Вы' : 'AI · гипотеза'}</b><p>{message.content}</p>{message.reply && <div className="chat-analysis">
          <h3>Наблюдения</h3><ul>{message.reply.observations.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul>
          <h3>Ограничения</h3><ul>{message.reply.limitations.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul>
          <h3>Проверить дальше</h3><ul>{message.reply.recommended_checks.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul>
          <div className="chat-sources">{message.reply.source_gids.slice(0, 6).map((gid) => <button key={gid} onClick={() => void showNode(gid)}>GID {gid}</button>)}</div>
        </div>}</article>)}
        {aiBusy && <p className="assistant-thinking">Проверяю графовый контекст…</p>}
      </div>
      {aiError && <p className="assistant-error" role="alert">{aiError}</p>}
      <form className="assistant-form" onSubmit={sendChat}><label htmlFor="assistant-question">Вопрос по графу</label><textarea id="assistant-question" value={chatInput} onChange={(event) => setChatInput(event.target.value)} maxLength={500} placeholder="Например: кто получает переводы от этого GID?" /><button className="primary" disabled={!aiAvailable || aiBusy || !chatInput.trim()}>Спросить</button></form>
      <p className="assistant-privacy">Во внешний API передаются вопрос, до шести прошлых реплик, метрики выбранных GID и до 16 потоков; полный parquet не отправляется. Ответ — гипотеза.</p>
    </aside>}

    <AnalyticsSection summary={summary} analytics={analytics} clusters={visibleClusters} clusterGraph={clusterGraph} tab={analyticsTab} setTab={setAnalyticsTab} sort={clusterSort} setSort={setClusterSort} minNodes={clusterMinNodes} setMinNodes={setClusterMinNodes} minSeeds={clusterMinSeeds} setMinSeeds={setClusterMinSeeds} onCluster={openClusterOnGraph} onNode={showNode} onFlow={(flow) => { setGraphLevel('clusters'); setClusterEdge(flow); setCluster(null); window.scrollTo({ top: 0, behavior: 'smooth' }) }} />

    <footer className="coverage"><div><b>Покрытие, а не вердикт.</b><span>Оценка определяет приоритет проверки только внутри наблюдаемого графа.</span></div><ul><li>Только исходящий обход</li><li>Граница на 4-м колене</li><li>Переводы &lt;5 000 KZT не видны</li><li>Входящие стартовых неполны</li></ul><div className="legend">{Object.entries(roleColors).map(([role, color]) => <span key={role}><i style={{ background: color }} />{roleNames[role]}</span>)}</div></footer>
  </main>
}

function nodeElements(graph: GraphData) {
  const counts = new Map<number, number>(), totals = new Map<number, number>()
  const seedSet = new Set(graph.nodes.filter((node) => node.is_seed).map((node) => node.gid))
  graph.nodes.forEach((node) => totals.set(node.depth, (totals.get(node.depth) ?? 0) + 1))
  return [...graph.nodes.map((node) => { const index = counts.get(node.depth) ?? 0; counts.set(node.depth, index + 1); const count = totals.get(node.depth) ?? 1; const x = 90 + node.depth * 220 + ((index * 37) % 90) - 45; const y = 55 + (index * Math.max(5, 590 / count)) % 590; return { data: { id: node.gid, label: node.gid, ...node, color: roleColors[node.role], clusterColor: `hsl(${(node.cluster_id * 47) % 360}, 48%, 58%)`, homeX: x, homeY: y }, position: { x, y } } }), ...graph.edges.map((flow) => ({ data: { id: `${flow.src}-${flow.dst}`, source: flow.src, target: flow.dst, ...flow, seed_related: seedSet.has(flow.src) || seedSet.has(flow.dst), width: Math.max(0.6, Math.log10(flow.sum_kzt) - 3) } }))]
}

function clusterElements(graph: ClusterGraph) {
  return [...graph.nodes.map((node, index) => ({ data: { id: `cluster-${node.cluster_id}`, label: `К${node.cluster_id}`, cluster_id: node.cluster_id, size: node.n_nodes, priority_score: node.max_priority, has_seed_link: node.has_seed_link || node.n_seed > 0, color: roleColors[node.top_role], clusterColor: '#dbe5ec' }, position: { x: 70 + (index % 13) * 90, y: 60 + Math.floor(index / 13) * 88 } })), ...graph.edges.map((flow) => ({ data: { id: `cluster-${flow.src_cluster}-${flow.dst_cluster}`, source: `cluster-${flow.src_cluster}`, target: `cluster-${flow.dst_cluster}`, ...flow, seed_related: flow.seed_tx > 0, width: Math.max(0.8, Math.log10(flow.sum_kzt) - 3) } }))]
}

function FilterDrawer({ filters, setFilters, clusters, results, onApply, onOpen, onClose }: { filters: FilterState; setFilters: (value: FilterState) => void; clusters: Cluster[]; results: DiscoveryNode[]; onApply: (event: FormEvent) => void; onOpen: (gid: string) => Promise<void>; onClose: () => void }) {
  const field = (key: keyof FilterState, value: string) => setFilters({ ...filters, [key]: value })
  return <aside className="filter-drawer" data-testid="filters-panel"><div className="drawer-head"><div><p>Поиск без знания GID</p><h2>Фильтры узлов</h2></div><button onClick={onClose} aria-label="Закрыть фильтры">×</button></div><form onSubmit={onApply}><div className="filter-grid">
    <label>Роль<select data-testid="filter-role" value={filters.role} onChange={(e) => field('role', e.target.value)}><option value="">Любая</option>{Object.entries(roleNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label>Кластер<select value={filters.cluster_id} onChange={(e) => field('cluster_id', e.target.value)}><option value="">Любой</option>{clusters.map((item) => <option key={item.cluster_id} value={item.cluster_id}>{item.cluster_id}</option>)}</select></label>
    <label>Колено<select data-testid="filter-depth" value={filters.depth} onChange={(e) => field('depth', e.target.value)}><option value="">Любое</option>{[0, 1, 2, 3, 4].map((value) => <option key={value} value={value}>{depthLabel(value)}</option>)}</select></label>
    <label>Мин. приоритет<input data-testid="filter-priority" type="number" min="0" max="1" step="0.05" value={filters.min_priority} onChange={(e) => field('min_priority', e.target.value)} placeholder="0–1" /></label>
    <label>Оборот от, KZT<input type="number" min="0" value={filters.min_turnover} onChange={(e) => field('min_turnover', e.target.value)} /></label><label>Оборот до, KZT<input type="number" min="0" value={filters.max_turnover} onChange={(e) => field('max_turnover', e.target.value)} /></label>
    <label>Мин. плательщиков<input type="number" min="0" value={filters.min_in_deg} onChange={(e) => field('min_in_deg', e.target.value)} /></label><label>Мин. получателей<input type="number" min="0" value={filters.min_out_deg} onChange={(e) => field('min_out_deg', e.target.value)} /></label><label>Мин. стартовых ветвей<input type="number" min="0" value={filters.min_seed_reach} onChange={(e) => field('min_seed_reach', e.target.value)} /></label>
    <label>Стартовый клиент<select value={filters.is_seed} onChange={(e) => field('is_seed', e.target.value)}><option value="">Любой</option><option value="true">Только стартовые</option><option value="false">Не стартовые</option></select></label><label>Граница данных<select value={filters.truncated_by_depth} onChange={(e) => field('truncated_by_depth', e.target.value)}><option value="">Любая</option><option value="true">Только 4-е колено</option><option value="false">Без обрыва</option></select></label>
  </div><div className="filter-actions"><button type="button" className="ghost" onClick={() => setFilters(emptyFilters)}>Сбросить</button><button className="primary" data-testid="apply-filters">Показать совпадения</button></div></form><div className="discovery-results" data-testid="discovery-results"><div className="result-title"><b>Совпадения</b><span>{results.length}</span></div>{results.length === 0 ? <p>Задайте условия и запустите поиск.</p> : results.map((node) => <button key={node.gid} onClick={() => void onOpen(node.gid)}><span><b>GID {formatGid(node.gid)}</b><small>{roleNames[node.role]} · кластер {node.cluster_id} · {depthLabel(node.depth)}</small></span><strong>{score100(node.priority_score)} / 100</strong></button>)}</div></aside>
}

function NodePanel({ selected, neighbors, edge, onNode, onFlowNode, onEdge, onCloseEdge, onSummary, aiAvailable, aiBusy, aiSummary, aiError }: {
  selected: NodeDetail | null; neighbors: Neighbors; edge: EdgeDetail | null
  onNode: (gid: string) => Promise<void>; onFlowNode: (gid: string) => void; onEdge: (src: string, dst: string) => Promise<void>; onCloseEdge: () => void
  onSummary: () => Promise<void>; aiAvailable: boolean; aiBusy: boolean; aiSummary: AIReply | null; aiError: string
}) {
  const [showAllRelations, setShowAllRelations] = useState(false)
  if (!selected) return <div className="empty-detail"><span>◎</span><h2>Выберите GID</h2><p>Откройте приоритет, найдите точный идентификатор или нажмите узел графа.</p></div>
  const totalRelations = neighbors.incoming.length + neighbors.outgoing.length
  const relations = showAllRelations ? [...neighbors.incoming, ...neighbors.outgoing] : [...neighbors.incoming.slice(0, 5), ...neighbors.outgoing.slice(0, 5)]
  return <div data-testid="node-detail">
    <div className="detail-head"><div><p>Выбранный клиент</p><h2>GID {selected.gid}</h2></div><strong style={{ color: roleColors[selected.role] }}>{score100(selected.priority_score)} / 100</strong></div>
    <div className="role-line"><i style={{ background: roleColors[selected.role] }} /><div><b>{roleNames[selected.role]} {selected.is_seed && <em className="seed-tag">стартовый · ранее выявленный</em>}</b><small>Выраженность роли: {score100(selected.role_score)} / 100 · кластер {selected.cluster_id}</small></div></div>
    {!selected.is_seed && selected.has_seed_link && <p className="seed-link-notice">Есть прямая наблюдаемая связь с ранее выявленным стартовым клиентом. Это не доказательство причастности.</p>}
    <p className="priority-copy">Приоритет проверки: <b>{score100(selected.priority_score)} / 100</b></p>
    {selected.coverage_warning && <div className="warning" data-testid="coverage-warning"><b>Ограничение покрытия</b>{selected.coverage_warning}<span className="next-request">Что запросить дальше: {selected.is_seed ? 'полную историю входящих переводов стартового клиента.' : 'исходящие переводы за пределами 4-го колена.'}</span></div>}
    <blockquote>{selected.evidence}</blockquote>
    <div className="ai-summary"><button onClick={() => void onSummary()} disabled={!aiAvailable || aiBusy}>{aiBusy ? 'Готовлю сводку…' : 'AI-сводка · до 200 символов'}</button>{!aiAvailable && <small>Нужен OpenAIKEY в корневом .env</small>}{aiSummary && <div data-testid="ai-summary"><p>{aiSummary.summary}</p><small>Ограничение: {aiSummary.limitations[0]}</small><small>Дальше: {aiSummary.recommended_checks[0]}</small></div>}{aiError && <small className="assistant-error" role="alert">{aiError}</small>}</div>
    <div className="flow-grid"><div><small>Наблюдаемый вход</small><b>{kzt.format(selected.in_kzt)} KZT</b><span>{selected.in_deg} контрагентов · {selected.in_tx} переводов</span></div><div><small>Наблюдаемый выход</small><b>{kzt.format(selected.out_kzt)} KZT</b><span>{selected.out_deg} контрагентов · {selected.out_tx} переводов</span></div></div>
    <dl className="metrics"><div><dt>Колено</dt><dd>{depthLabel(selected.depth)}</dd></div><div><dt>Связь со стартовыми</dt><dd>Достижим из {selected.seed_reach_count} ветвей</dd></div><div><dt>PageRank</dt><dd>Топ {topPercent(selected.pagerank_pct)}%</dd></div><div><dt>Посредничество</dt><dd>Топ {topPercent(selected.betweenness_pct)}%</dd></div></dl>
    <div className="why-role"><h3>Почему эта роль</h3>{selected.role_components.map((component) => <div key={component.label}><span>{component.label}{component.value != null ? ` · ${component.value >= 1000 ? kzt.format(component.value) : Number(component.value.toFixed(2))}` : ''}</span><b>{component.percentile == null ? 'условие' : `топ ${topPercent(component.percentile)}%`}</b></div>)}</div>
    <div className="relations"><h3>Наблюдаемые связи</h3>{relations.map((flow) => {
      const incoming = flow.dst === selected.gid; const counterparty = incoming ? flow.src : flow.dst
      const seedRelated = selected.is_seed || flow.counterparty_is_seed
      return <div className={seedRelated ? 'relation-row seed-related' : 'relation-row'} key={`${flow.src}-${flow.dst}`}><button className="relation-node" aria-label={`Открыть контрагента ${counterparty}`} onClick={() => void onNode(counterparty)}><span><small>{incoming ? 'Входящий ←' : 'Исходящий →'} · {roleNames[flow.counterparty_role]} · кластер {flow.counterparty_cluster} {flow.counterparty_is_seed && '· ранее выявленный'} {flow.counterparty_cluster !== selected.cluster_id && '· межкластерный'}</small><b>GID {counterparty}</b></span><strong>{kzt.format(flow.sum_kzt)} KZT · {flow.n_tx} тр.</strong></button><button className="flow-button" aria-label={`Открыть поток ${flow.src} ${flow.dst}`} onClick={() => void onEdge(flow.src, flow.dst)}>Поток</button></div>
    })}{totalRelations > 10 && <button className="more-relations" onClick={() => setShowAllRelations(!showAllRelations)}>{showAllRelations ? 'Свернуть связи' : `Открыть все наблюдаемые связи · ${totalRelations}`}</button>}</div>
    {edge && <div className="edge-detail" data-testid="flow-detail"><div><small>Выделенный поток на графе</small><button onClick={onCloseEdge} aria-label="Закрыть поток">×</button></div><h3>{edge.src} → {edge.dst}</h3><p><b>{kzt.format(edge.sum_kzt)} KZT</b> · {edge.n_tx} переводов · {edge.first_date}—{edge.last_date}</p><div className="edge-actions"><button onClick={() => onFlowNode(edge.src)}>Открыть отправителя</button><button onClick={() => onFlowNode(edge.dst)}>Открыть получателя</button></div><ul>{edge.transactions.map((tx, index) => <li key={`${tx.date}-${index}`}><span>{tx.date}</span><b>{kzt.format(tx.sum_kzt)} KZT</b></li>)}</ul></div>}
  </div>
}

function ClusterDetail({ cluster, edge, onNode, onClusterNodes }: { cluster: Cluster | null; edge: ClusterEdge | null; onNode: (gid: string) => Promise<void>; onClusterNodes: (id: number) => void }) {
  if (edge) return <div className="cluster-detail" data-testid="cluster-flow-detail"><div className="detail-head"><div><p>Межкластерный поток · выделен на графе</p><h2>Кластер {edge.src_cluster} → {edge.dst_cluster}</h2></div></div><div className="cluster-stats"><div><small>Наблюдаемый объём</small><b>{kzt.format(edge.sum_kzt)} KZT</b></div><div><small>Транзакций / связей GID→GID</small><b>{edge.n_tx} / {edge.n_edges}</b></div><div><small>Отправитель — ранее выявленный клиент</small><b>{edge.seed_tx} из {edge.n_tx} транзакций · {(edge.seed_tx_share * 100).toFixed(1)}%</b></div></div><div className="edge-actions"><button onClick={() => onClusterNodes(edge.src_cluster)}>Узлы отправителя</button><button onClick={() => onClusterNodes(edge.dst_cluster)}>Узлы получателя</button></div><p className="caution">Агрегат наблюдаемых переводов между двумя сообществами, не вывод о едином владельце.</p></div>
  if (!cluster) return <div className="empty-detail"><span>◎</span><h2>Выберите кластер</h2><p>Нажмите узел кластера или межкластерный поток, чтобы увидеть сводные данные.</p></div>
  return <div className="cluster-detail" data-testid="cluster-detail"><div className="detail-head"><div><p>Выбранное сообщество</p><h2>Кластер {cluster.cluster_id}</h2></div><strong>{score100(cluster.max_priority)} / 100</strong></div><div className="cluster-stats"><div><small>Узлов / стартовых</small><b>{cluster.n_nodes} / {cluster.n_seed}</b></div><div><small>Внутренний оборот</small><b>{kzt.format(cluster.sum_kzt_internal)} KZT</b></div><div><small>Исходящие транзакции от стартовых</small><b>{cluster.seed_out_tx} · {(cluster.seed_tx_share * 100).toFixed(1)}% всех исходящих транзакций кластера</b></div><div><small>Доминирующая роль</small><b>{roleNames[cluster.top_role]}</b></div></div>{(cluster.n_seed > 0 || cluster.has_seed_link) && <p className="seed-link-notice">{cluster.n_seed > 0 ? `В кластере есть ранее выявленные стартовые клиенты: ${cluster.n_seed}.` : 'У узлов кластера есть прямая наблюдаемая связь с ранее выявленным клиентом.'}</p>}<button className="cluster-open" onClick={() => onClusterNodes(cluster.cluster_id)}>Показать узлы кластера</button><blockquote>{cluster.hypothesis}</blockquote><h3>Приоритетные GID</h3><div className="cluster-node-list">{cluster.nodes?.map((node) => <button key={node.gid} onClick={() => void onNode(node.gid)}><span>GID {node.gid}<small>{roleNames[node.role]}</small></span><b>{score100(node.priority_score)}</b></button>)}</div></div>
}

function AnalyticsSection({ summary, analytics, clusters, clusterGraph, tab, setTab, sort, setSort, minNodes, setMinNodes, minSeeds, setMinSeeds, onCluster, onNode, onFlow }: { summary: Summary | null; analytics: Analytics | null; clusters: Cluster[]; clusterGraph: ClusterGraph | null; tab: string; setTab: (tab: 'structure' | 'clusters' | 'signals' | 'flows') => void; sort: ClusterSortKey; setSort: (key: ClusterSortKey) => void; minNodes: string; setMinNodes: (value: string) => void; minSeeds: string; setMinSeeds: (value: string) => void; onCluster: (id: number) => Promise<void>; onNode: (gid: string) => Promise<void>; onFlow: (edge: ClusterEdge) => void }) {
  const priorityLeaders = [...clusters].sort((a, b) => b.max_priority - a.max_priority || a.cluster_id - b.cluster_id).slice(0, 5)
  const seedLeaders = [...clusters].sort((a, b) => b.seed_out_tx - a.seed_out_tx || a.cluster_id - b.cluster_id).slice(0, 5)
  return <section className="analytics" data-testid="analytics">
    <div className="analytics-head"><div><p>Детерминированные срезы</p><h2>Сводная аналитика сети</h2></div><nav>{[['structure', 'Структура'], ['clusters', 'Кластеры'], ['signals', 'Аналитические сигналы'], ['flows', 'Межкластерные потоки']].map(([key, label]) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key as 'structure' | 'clusters' | 'signals' | 'flows')}>{label}</button>)}</nav></div>
    {tab === 'structure' && <div className="structure-grid"><div><h3>Распределение ролей</h3>{summary && Object.entries(summary.role_counts).sort((a, b) => b[1] - a[1]).map(([role, count]) => <Bar key={role} label={roleNames[role]} value={count} max={summary.nodes} color={roleColors[role]} />)}</div><div><h3>Колена наблюдения</h3>{analytics && Object.entries(analytics.depth_counts).map(([depth, count]) => <Bar key={depth} label={depthLabel(Number(depth))} value={count} max={summary?.nodes ?? 1} color={Number(depth) === 4 ? '#ef6a62' : '#7e8b97'} />)}<p className="analytics-note">Стартовых клиентов: <b>{analytics?.seed_count ?? '—'}</b> · узлов на границе без видимого выхода: <b>{analytics?.boundary_count ?? '—'}</b></p></div></div>}
    {tab === 'clusters' && <div>
      <div className="cluster-leaders"><div><h3>Топ групп по максимальному приоритету</h3>{priorityLeaders.map((item, index) => <button key={item.cluster_id} onClick={() => void onCluster(item.cluster_id)}><span>{index + 1}. К{item.cluster_id} · {item.n_nodes} узлов{item.n_seed > 0 ? <em className="seed-tag">ранее выявленные</em> : item.has_seed_link && <em className="seed-link-tag">прямая связь</em>}</span><i><b style={{ width: `${score100(item.max_priority)}%` }} /></i><strong>{score100(item.max_priority)} / 100</strong></button>)}</div>
        <div><h3>Топ групп по исходящим транзакциям стартовых клиентов</h3>{seedLeaders.map((item, index) => <button key={item.cluster_id} onClick={() => void onCluster(item.cluster_id)}><span>{index + 1}. К{item.cluster_id} · {item.seed_out_tx} тр.{item.n_seed > 0 ? <em className="seed-tag">ранее выявленные</em> : item.has_seed_link && <em className="seed-link-tag">прямая связь</em>}</span><i><b style={{ width: `${item.seed_tx_share * 100}%` }} /></i><strong>{(item.seed_tx_share * 100).toFixed(1)}%</strong></button>)}</div></div>
      <p className="analytics-note">Доля: переводы, отправленные стартовыми клиентами кластера, от всех исходящих переводов его узлов. Это не доля денег всей сети.</p>
      <div className="table-filters"><label>Сортировать<select value={sort} onChange={(e) => setSort(e.target.value as ClusterSortKey)}><option value="max_priority">Макс. приоритет</option><option value="n_nodes">Узлы</option><option value="n_seed">Стартовые</option><option value="sum_kzt_internal">Внутренний оборот</option><option value="seed_tx_share">Доля переводов стартовых</option></select></label><label>Мин. узлов<input type="number" min="0" value={minNodes} onChange={(e) => setMinNodes(e.target.value)} /></label><label>Мин. стартовых<input type="number" min="0" value={minSeeds} onChange={(e) => setMinSeeds(e.target.value)} /></label></div>
      <div className="data-table"><div className="table-row cluster-table table-head"><span>Кластер</span><span>Узлы / стартовые</span><span>Внутри</span><span>Макс. приоритет</span><span>От стартовых · переводы</span><span>Гипотеза</span></div>{clusters.map((item) => <button className="table-row cluster-table" key={item.cluster_id} onClick={() => void onCluster(item.cluster_id)}><b>К{item.cluster_id}{item.n_seed > 0 ? <em className="seed-tag">ранее выявленные</em> : item.has_seed_link && <em className="seed-link-tag">прямая связь</em>}</b><span>{item.n_nodes} / {item.n_seed}</span><span>{kzt.format(item.sum_kzt_internal)} KZT</span><span>{score100(item.max_priority)} / 100</span><span>{item.seed_out_tx} · {(item.seed_tx_share * 100).toFixed(1)}%</span><span>{item.hypothesis}</span></button>)}</div>
    </div>}
    {tab === 'signals' && <div className="signal-grid">{analytics?.signals.map((group) => <div key={group.label}><h3>{group.label}</h3><p>Кандидаты для проверки, не доказательство нарушения.</p>{group.nodes.map((node) => <button key={node.gid} onClick={() => void onNode(node.gid)}><span>GID {node.gid}<small>{roleNames[node.role]}</small></span><b>{node.value < 1 ? `топ ${topPercent(node.value)}%` : kzt.format(node.value)}</b></button>)}</div>)}</div>}
    {tab === 'flows' && <div className="data-table"><div className="table-row flow-table table-head"><span>Направление</span><span>KZT</span><span>Переводы</span><span>Связи</span><span>От стартовых</span><span>Действие</span></div>{clusterGraph?.edges.slice(0, 30).map((flow) => <button className="table-row flow-table" key={`${flow.src_cluster}-${flow.dst_cluster}`} onClick={() => onFlow(flow)}><b>К{flow.src_cluster} → К{flow.dst_cluster}</b><span>{kzt.format(flow.sum_kzt)} KZT</span><span>{flow.n_tx}</span><span>{flow.n_edges}</span><span>{flow.seed_tx} · {(flow.seed_tx_share * 100).toFixed(1)}%</span><span>Выделить на графе</span></button>)}</div>}
  </section>
}

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return <div className="bar-row"><span>{label}</span><i><b style={{ width: `${Math.max(1, value / max * 100)}%`, background: color }} /></i><strong>{value.toLocaleString('ru-RU')}</strong></div>
}

export default App
