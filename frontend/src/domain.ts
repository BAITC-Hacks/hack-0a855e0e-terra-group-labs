export const roleColors: Record<string, string> = {
  consolidator: '#f3b33d',
  transit: '#52c7b8',
  distributor: '#77a7ff',
  terminal: '#d68ae8',
  coordinator: '#ef6a62',
  peripheral: '#687786',
}

export const roleNames: Record<string, string> = {
  consolidator: 'Консолидатор',
  transit: 'Транзитный узел',
  distributor: 'Распределитель',
  terminal: 'Кандидат в конечный узел',
  coordinator: 'Координирующий узел',
  peripheral: 'Периферийный узел',
}

export const kzt = new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 })
export const score100 = (value: number) => Math.round(value * 100)
export const topPercent = (percentile: number) => Math.max(1, Math.ceil((1 - percentile) * 100 - 1e-9))
export const depthLabel = (depth: number) => depth === 0 ? 'Seed / 0-е колено' : depth === 4 ? '4-е колено · граница наблюдения' : `${depth}-е колено`
export const formatGid = (gid: string) => gid

export type ClusterSortKey = 'n_nodes' | 'n_seed' | 'sum_kzt_internal' | 'max_priority'
export function sortClusters<T extends Record<ClusterSortKey, number> & { cluster_id: number }>(clusters: T[], key: ClusterSortKey): T[] {
  return [...clusters].sort((a, b) => b[key] - a[key] || a.cluster_id - b.cluster_id)
}
