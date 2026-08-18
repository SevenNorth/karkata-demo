import { describe, expect, it } from 'vitest'
import { FarmSimulation } from './farmSimulation'

describe('FarmSimulation', () => {
  it('requires the farmer to visit the shop before buying or selling', () => {
    const farm = new FarmSimulation()
    expect(() => farm.buySeeds('parsnip', 1)).toThrow('请先移动到商店')
    farm.moveTo('shop')
    expect(farm.buySeeds('parsnip', 2)).toMatchObject({ gold: 60, inventory: [{ item: 'parsnip_seed', quantity: 5 }] })
  })

  it('moves items between the backpack and the standalone warehouse', () => {
    const farm = new FarmSimulation()
    farm.moveTo('storage')
    expect(farm.storeItems('parsnip_seed', 2)).toMatchObject({ inventory: [{ item: 'parsnip_seed', quantity: 1 }], storage: [{ item: 'parsnip_seed', quantity: 2 }] })
    expect(farm.withdrawItems('parsnip_seed', 1)).toMatchObject({ inventory: [{ item: 'parsnip_seed', quantity: 2 }], storage: [{ item: 'parsnip_seed', quantity: 1 }] })
  })

  it('requires the bed location before advancing the day', () => {
    const farm = new FarmSimulation()
    farm.moveTo('field')
    expect(() => farm.sleep()).toThrow('请先移动到农舍')
    farm.moveTo('farmhouse')
    expect(farm.sleep()).toMatchObject({ day: 2, energy: 100, location: 'farmhouse' })
  })
})
