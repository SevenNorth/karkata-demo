export type SeedType = 'parsnip'
export type FarmTile = { x: number; y: number; state: 'soil' | 'tilled' | 'planted' | 'watered'; crop: SeedType | null; growth: number }

export type FarmSnapshot = {
  day: number; time: string; energy: number; gold: number; player: { x: number; y: number }
  inventory: { item: string; quantity: number }[]; tiles: FarmTile[]; message: string
}

const FIELD_X = 2
const FIELD_Y = 2
const FIELD_W = 4
const FIELD_H = 3

export class FarmSimulation {
  private state: FarmSnapshot = {
    day: 1, time: '06:00', energy: 100, gold: 100, player: { x: 8, y: 5 },
    inventory: [{ item: 'parsnip_seed', quantity: 3 }],
    tiles: Array.from({ length: FIELD_W * FIELD_H }, (_, index) => ({ x: FIELD_X + index % FIELD_W, y: FIELD_Y + Math.floor(index / FIELD_W), state: 'soil' as const, crop: null, growth: 0 })),
    message: '新的一天开始了。',
  }
  private currentSnapshot: FarmSnapshot = structuredClone(this.state)
  private listeners = new Set<() => void>()
  subscribe(listener: () => void) { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  snapshot(): FarmSnapshot { return this.currentSnapshot }
  private commit(message: string) { this.state.message = message; this.currentSnapshot = structuredClone(this.state); for (const listener of this.listeners) listener() }
  private spendEnergy(amount: number) { if (this.state.energy < amount) throw new Error('体力不足，先睡觉休息吧。'); this.state.energy -= amount }
  private tile(x: number, y: number) { const tile = this.state.tiles.find((candidate) => candidate.x === x && candidate.y === y); if (!tile) throw new Error('目标不在农田范围内。'); return tile }
  moveTo(target: 'field' | 'shop' | 'shipping_bin' | 'bed') {
    const positions = { field: { x: 4, y: 3 }, shop: { x: 10, y: 2 }, shipping_bin: { x: 10, y: 6 }, bed: { x: 8, y: 6 } }
    this.state.player = positions[target]; this.commit(`角色走到了${target === 'field' ? '农田' : target === 'shop' ? '种子商店' : target === 'shipping_bin' ? '出货箱' : '床'}。`); return this.snapshot()
  }
  tillSoil(x: number, y: number) { const tile = this.tile(x, y); if (tile.state !== 'soil') throw new Error('这块地已经耕过了。'); this.spendEnergy(2); tile.state = 'tilled'; this.commit(`已耕地 (${x}, ${y})。`); return this.snapshot() }
  plantSeed(x: number, y: number, seedType: SeedType) { const tile = this.tile(x, y); const seed = this.state.inventory.find((item) => item.item === `${seedType}_seed`); if (!seed || seed.quantity < 1) throw new Error('背包里没有这种种子。'); if (tile.state !== 'tilled') throw new Error('必须先耕地。'); this.spendEnergy(1); tile.state = 'planted'; tile.crop = seedType; seed.quantity -= 1; this.commit(`已种下${seedType === 'parsnip' ? '防风草' : seedType}。`); return this.snapshot() }
  waterCrop(x: number, y: number) { const tile = this.tile(x, y); if (tile.state !== 'planted') throw new Error('这块地没有需要浇水的作物。'); this.spendEnergy(1); tile.state = 'watered'; this.commit(`已浇水 (${x}, ${y})。`); return this.snapshot() }
  harvestCrop(x: number, y: number) { const tile = this.tile(x, y); if (tile.state !== 'watered' || tile.growth < 2 || !tile.crop) throw new Error('作物还没有成熟。'); this.spendEnergy(1); tile.state = 'tilled'; tile.growth = 0; tile.crop = null; this.state.inventory.push({ item: 'parsnip', quantity: 1 }); this.commit('收获了 1 个防风草。'); return this.snapshot() }
  buySeeds(seedType: SeedType, quantity: number) { if (quantity < 1 || quantity > 20) throw new Error('购买数量必须在 1 到 20 之间。'); const cost = quantity * 20; if (this.state.gold < cost) throw new Error('金币不足。'); this.state.gold -= cost; const item = this.state.inventory.find((entry) => entry.item === `${seedType}_seed`); if (item) item.quantity += quantity; else this.state.inventory.push({ item: `${seedType}_seed`, quantity }); this.commit(`买了 ${quantity} 包种子。`); return this.snapshot() }
  sellItems(item: 'parsnip', quantity: number) { const entry = this.state.inventory.find((candidate) => candidate.item === item); if (!entry || entry.quantity < quantity) throw new Error('背包里没有足够的作物。'); entry.quantity -= quantity; this.state.gold += quantity * 35; this.commit(`卖出 ${quantity} 个防风草，获得 ${quantity * 35} 金币。`); return this.snapshot() }
  sleep() { this.state.day += 1; this.state.time = '06:00'; this.state.energy = 100; for (const tile of this.state.tiles) { if (tile.state === 'planted') { tile.state = 'watered'; tile.growth = 1 } else if (tile.state === 'watered') tile.growth += 1 }; this.commit(`睡了一觉，现在是第 ${this.state.day} 天。`); return this.snapshot() }
}
