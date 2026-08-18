export type SeedType = 'parsnip'
export type FarmTile = { x: number; y: number; state: 'soil' | 'tilled' | 'planted' | 'watered'; crop: SeedType | null; growth: number }
export type FarmPlace = 'field' | 'shop' | 'bed' | 'storage' | 'shipping_bin'
export type ItemStack = { item: string; quantity: number }
export type FarmSnapshot = {
  day: number; time: string; energy: number; gold: number; player: { x: number; y: number }; location: FarmPlace
  inventory: ItemStack[]; storage: ItemStack[]; tiles: FarmTile[]; message: string
}

const FIELD_X = 2
const FIELD_Y = 2
const FIELD_W = 4
const FIELD_H = 3

export class FarmSimulation {
  private state: FarmSnapshot = {
    day: 1, time: '06:00', energy: 100, gold: 100, player: { x: 8, y: 6 }, location: 'bed',
    inventory: [{ item: 'parsnip_seed', quantity: 3 }], storage: [],
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
  private requirePlace(...places: FarmPlace[]) { if (!places.includes(this.state.location)) throw new Error(`当前在${this.placeName(this.state.location)}，请先移动到${places.map((place) => this.placeName(place)).join('或')}。`) }
  private placeName(place: FarmPlace) { return ({ field: '农田', shop: '商店', bed: '床边', storage: '仓库', shipping_bin: '出货箱' })[place] }
  private stack(list: ItemStack[], item: string) { return list.find((entry) => entry.item === item) }
  private add(list: ItemStack[], item: string, quantity: number) { const entry = this.stack(list, item); if (entry) entry.quantity += quantity; else list.push({ item, quantity }) }
  private remove(list: ItemStack[], item: string, quantity: number) { const entry = this.stack(list, item); if (!entry || entry.quantity < quantity) throw new Error(`没有足够的${item}。`); entry.quantity -= quantity; if (entry.quantity === 0) list.splice(list.indexOf(entry), 1) }
  moveTo(target: FarmPlace) { const positions = { field: { x: 4, y: 3 }, shop: { x: 10, y: 2 }, bed: { x: 8, y: 6 }, storage: { x: 11, y: 7 }, shipping_bin: { x: 12, y: 6 } }; this.state.player = positions[target]; this.state.location = target; this.commit(`角色走到了${this.placeName(target)}。`); return this.snapshot() }
  tillSoil(x: number, y: number) { this.requirePlace('field'); const tile = this.tile(x, y); if (tile.state !== 'soil') throw new Error('这块地已经耕过了。'); this.spendEnergy(2); tile.state = 'tilled'; this.commit(`已耕地 (${x}, ${y})。`); return this.snapshot() }
  plantSeed(x: number, y: number, seedType: SeedType) { this.requirePlace('field'); const tile = this.tile(x, y); if (!this.stack(this.state.inventory, `${seedType}_seed`)) throw new Error('背包里没有这种种子。'); if (tile.state !== 'tilled') throw new Error('必须先耕地。'); this.spendEnergy(1); tile.state = 'planted'; tile.crop = seedType; this.remove(this.state.inventory, `${seedType}_seed`, 1); this.commit(`已种下${seedType === 'parsnip' ? '防风草' : seedType}。`); return this.snapshot() }
  waterCrop(x: number, y: number) { this.requirePlace('field'); const tile = this.tile(x, y); if (tile.state !== 'planted') throw new Error('这块地没有需要浇水的作物。'); this.spendEnergy(1); tile.state = 'watered'; this.commit(`已浇水 (${x}, ${y})。`); return this.snapshot() }
  harvestCrop(x: number, y: number) { this.requirePlace('field'); const tile = this.tile(x, y); if (tile.state !== 'watered' || tile.growth < 2 || !tile.crop) throw new Error('作物还没有成熟。'); this.spendEnergy(1); tile.state = 'tilled'; tile.growth = 0; tile.crop = null; this.add(this.state.inventory, 'parsnip', 1); this.commit('收获了 1 个防风草。'); return this.snapshot() }
  buySeeds(seedType: SeedType, quantity: number) { this.requirePlace('shop'); if (quantity < 1 || quantity > 20) throw new Error('购买数量必须在 1 到 20 之间。'); const cost = quantity * 20; if (this.state.gold < cost) throw new Error('金币不足。'); this.state.gold -= cost; this.add(this.state.inventory, `${seedType}_seed`, quantity); this.commit(`在商店买了 ${quantity} 包种子。`); return this.snapshot() }
  sellItems(item: 'parsnip', quantity: number) { this.requirePlace('shop', 'shipping_bin'); this.remove(this.state.inventory, item, quantity); this.state.gold += quantity * 35; this.commit(`在${this.state.location === 'shop' ? '商店' : '出货箱'}卖出 ${quantity} 个防风草，获得 ${quantity * 35} 金币。`); return this.snapshot() }
  storeItems(item: string, quantity: number) { this.requirePlace('storage'); this.remove(this.state.inventory, item, quantity); this.add(this.state.storage, item, quantity); this.commit(`把 ${quantity} 个${item}放进仓库。`); return this.snapshot() }
  withdrawItems(item: string, quantity: number) { this.requirePlace('storage'); this.remove(this.state.storage, item, quantity); this.add(this.state.inventory, item, quantity); this.commit(`从仓库取出 ${quantity} 个${item}。`); return this.snapshot() }
  sleep() { this.requirePlace('bed'); this.state.day += 1; this.state.time = '06:00'; this.state.energy = 100; for (const tile of this.state.tiles) { if (tile.state === 'planted') { tile.state = 'watered'; tile.growth = 1 } else if (tile.state === 'watered') tile.growth += 1 }; this.commit(`睡了一觉，现在是第 ${this.state.day} 天。`); return this.snapshot() }
}
