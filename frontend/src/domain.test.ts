import { describe, expect, it } from 'vitest'
import { depthLabel, formatGid, roleNames, sortClusters, topPercent } from './domain'

describe('AML display helpers', () => {
  it('keeps large GIDs exact and renders domain labels', () => {
    expect(formatGid('100000003684369100')).toBe('100000003684369100')
    expect(depthLabel(0)).toBe('Seed / 0-е колено')
    expect(depthLabel(4)).toContain('граница наблюдения')
    expect(roleNames.distributor).toBe('Распределитель')
  })

  it('converts percentiles to honest top-percent labels', () => {
    expect(topPercent(1)).toBe(1)
    expect(topPercent(0.95)).toBe(5)
    expect(topPercent(0)).toBe(100)
  })

  it('sorts cluster discovery deterministically', () => {
    const clusters = [
      { cluster_id: 2, n_nodes: 4, n_seed: 1, sum_kzt_internal: 10, max_priority: 0.7 },
      { cluster_id: 1, n_nodes: 8, n_seed: 2, sum_kzt_internal: 20, max_priority: 0.9 },
    ]
    expect(sortClusters(clusters, 'n_nodes').map((item) => item.cluster_id)).toEqual([1, 2])
  })
})
