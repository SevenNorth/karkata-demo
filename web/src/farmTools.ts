import { z } from 'zod'
import type { Tool } from '@karkata-ai/core'
import type { FarmSimulation, FarmSnapshot, SeedType } from './farmSimulation'

type Empty = Record<string, never>

export function createFarmTools(simulation: FarmSimulation): Tool[] {
  const state: Tool<Empty, FarmSnapshot> = { name: 'get_farm_state', description: 'Read the current day, energy, money, inventory and crop grid before choosing an action.', inputSchema: z.object({}), execute: () => simulation.snapshot() }
  const move: Tool<{ target: 'field' | 'shop' | 'shipping_bin' | 'bed' }, FarmSnapshot> = { name: 'move_to', description: 'Move the farmer to one named place on the fixed farm screen.', inputSchema: z.object({ target: z.enum(['field', 'shop', 'shipping_bin', 'bed']) }), execute: ({ target }) => simulation.moveTo(target) }
  const till: Tool<{ x: number; y: number }, FarmSnapshot> = { name: 'till_soil', description: 'Till one farm tile at x 2-5 and y 2-4.', inputSchema: z.object({ x: z.number().int().min(2).max(5), y: z.number().int().min(2).max(4) }), execute: ({ x, y }) => simulation.tillSoil(x, y) }
  const plant: Tool<{ x: number; y: number; seedType: SeedType }, FarmSnapshot> = { name: 'plant_seed', description: 'Plant one seed on an already tilled farm tile.', inputSchema: z.object({ x: z.number().int().min(2).max(5), y: z.number().int().min(2).max(4), seedType: z.enum(['parsnip']) }), execute: ({ x, y, seedType }) => simulation.plantSeed(x, y, seedType) }
  const water: Tool<{ x: number; y: number }, FarmSnapshot> = { name: 'water_crop', description: 'Water one planted crop.', inputSchema: z.object({ x: z.number().int().min(2).max(5), y: z.number().int().min(2).max(4) }), execute: ({ x, y }) => simulation.waterCrop(x, y) }
  const harvest: Tool<{ x: number; y: number }, FarmSnapshot> = { name: 'harvest_crop', description: 'Harvest one mature watered crop.', inputSchema: z.object({ x: z.number().int().min(2).max(5), y: z.number().int().min(2).max(4) }), execute: ({ x, y }) => simulation.harvestCrop(x, y) }
  const buy: Tool<{ seedType: SeedType; quantity: number }, FarmSnapshot> = { name: 'buy_seeds', description: 'Buy parsnip seeds for 20 gold each.', inputSchema: z.object({ seedType: z.enum(['parsnip']), quantity: z.number().int().min(1).max(20) }), execute: ({ seedType, quantity }) => simulation.buySeeds(seedType, quantity) }
  const sell: Tool<{ item: 'parsnip'; quantity: number }, FarmSnapshot> = { name: 'sell_items', description: 'Sell harvested parsnips for 35 gold each.', inputSchema: z.object({ item: z.enum(['parsnip']), quantity: z.number().int().min(1).max(20) }), execute: ({ item, quantity }) => simulation.sellItems(item, quantity) }
  const sleep: Tool<Empty, FarmSnapshot> = { name: 'sleep', description: 'Sleep in the farmhouse to restore energy and advance one day.', inputSchema: z.object({}), execute: () => simulation.sleep() }
  return [state, move, till, plant, water, harvest, buy, sell, sleep]
}
