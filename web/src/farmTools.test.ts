import { describe, expect, it } from 'vitest'
import { FarmSimulation } from './farmSimulation'
import { createFarmTools } from './farmTools'

describe('farm tools', () => {
  it('uses farm state rather than duplicated schema bounds for tile coordinates', () => {
    const simulation = new FarmSimulation()
    const tools = createFarmTools(simulation)
    const state = tools.find((tool) => tool.name === 'get_farm_state')
    const till = tools.find((tool) => tool.name === 'till_soil')

    expect(state?.description).toContain('authoritative farm tile coordinates')
    expect(till?.description).not.toMatch(/2-5|2-4/)
    expect(till?.inputSchema.safeParse({ x: 99, y: 99 }).success).toBe(true)
    expect(simulation.snapshot().tiles.every((tile) => tile.state === 'grass')).toBe(true)

    simulation.moveTo('field')
    expect(() => till?.execute({ x: 99, y: 99 }, { signal: new AbortController().signal, runId: 'test', step: 1 })).toThrow('目标不在农田范围内')
  })
})
