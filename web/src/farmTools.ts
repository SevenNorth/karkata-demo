import { z } from 'zod'
import { defineTool, type Tool } from '@karkata-ai/core'
import type { FarmPlace, FarmSimulation, FarmSnapshot, SeedType } from './farmSimulation'

type Empty = Record<string, never>
const tileCoordinates = z.object({ x: z.number().int(), y: z.number().int() })
type TileCoordinates = z.infer<typeof tileCoordinates>

export function createFarmTools(simulation: FarmSimulation): Tool[] {
  const state = defineTool({ name: 'get_farm_state', description: 'Read the current day, energy, money, inventory, and authoritative farm tile coordinates and states. Call this before choosing a tile for a coordinate-based action.', inputSchema: z.object({}), execute: () => simulation.snapshot() })
  const move: Tool<{ target: FarmPlace }, FarmSnapshot> = { name: 'move_to', description: 'Move the farmer to the field, shop, farmhouse, warehouse, or recycling hut before performing a local action.', inputSchema: z.object({ target: z.enum(['field', 'shop', 'farmhouse', 'storage', 'recycling']) }), execute: ({ target }) => simulation.moveTo(target) }
  const till = defineTool<TileCoordinates, FarmSnapshot>({ name: 'till_soil', description: 'Use the hoe to turn one available grass tile from the latest farm state into farm soil.', inputSchema: tileCoordinates, execute: ({ x, y }) => simulation.tillSoil(x, y) })
  const plant = defineTool<TileCoordinates & { seedType: SeedType }, FarmSnapshot>({ name: 'plant_seed', description: 'Plant one seed on a tilled tile selected from the latest farm state.', inputSchema: tileCoordinates.extend({ seedType: z.enum(['parsnip']) }), execute: ({ x, y, seedType }) => simulation.plantSeed(x, y, seedType) })
  const water = defineTool<TileCoordinates, FarmSnapshot>({ name: 'water_crop', description: 'Water one planted tile selected from the latest farm state.', inputSchema: tileCoordinates, execute: ({ x, y }) => simulation.waterCrop(x, y) })
  const harvest = defineTool<TileCoordinates, FarmSnapshot>({ name: 'harvest_crop', description: 'Harvest one mature watered tile selected from the latest farm state.', inputSchema: tileCoordinates, execute: ({ x, y }) => simulation.harvestCrop(x, y) })
  const buy: Tool<{ seedType: SeedType; quantity: number }, FarmSnapshot> = { name: 'buy_seeds', description: 'Buy parsnip seeds for 20 gold each while standing in the shop.', inputSchema: z.object({ seedType: z.enum(['parsnip']), quantity: z.number().int().min(1).max(20) }), execute: ({ seedType, quantity }) => simulation.buySeeds(seedType, quantity) }
  const sell: Tool<{ item: 'parsnip'; quantity: number }, FarmSnapshot> = { name: 'sell_items', description: 'Sell harvested parsnips for 35 gold each at the shop or recycling hut.', inputSchema: z.object({ item: z.enum(['parsnip']), quantity: z.number().int().min(1).max(20) }), execute: ({ item, quantity }) => simulation.sellItems(item, quantity) }
  const store: Tool<{ item: string; quantity: number }, FarmSnapshot> = { name: 'store_items', description: 'Move items from the backpack into the standalone warehouse.', inputSchema: z.object({ item: z.enum(['parsnip_seed', 'parsnip']), quantity: z.number().int().min(1).max(20) }), execute: ({ item, quantity }) => simulation.storeItems(item, quantity) }
  const withdraw: Tool<{ item: string; quantity: number }, FarmSnapshot> = { name: 'withdraw_items', description: 'Move items from the standalone warehouse into the backpack.', inputSchema: z.object({ item: z.enum(['parsnip_seed', 'parsnip']), quantity: z.number().int().min(1).max(20) }), execute: ({ item, quantity }) => simulation.withdrawItems(item, quantity) }
  const sleep: Tool<Empty, FarmSnapshot> = { name: 'sleep', description: 'Sleep at the farmhouse to restore energy and advance one day.', inputSchema: z.object({}), execute: () => simulation.sleep() }
  return [state, move, till, plant, water, harvest, buy, sell, store, withdraw, sleep]
}
