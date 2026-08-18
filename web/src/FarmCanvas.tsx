import { useEffect, useRef } from 'react'
import Phaser from 'phaser'
import type { FarmSimulation, FarmSnapshot } from './farmSimulation'

const TILE = 48
const WIDTH = 14 * TILE
const HEIGHT = 9 * TILE

export function FarmCanvas({ simulation }: { simulation: FarmSimulation }) {
  const host = useRef<HTMLDivElement>(null)
  const latest = useRef<FarmSnapshot>(simulation.snapshot())
  useEffect(() => {
    const scene = new FarmScene(simulation, () => latest.current)
    const game = new Phaser.Game({ type: Phaser.CANVAS, width: WIDTH, height: HEIGHT, parent: host.current ?? undefined, backgroundColor: '#1b2930', pixelArt: true, scene })
    const unsubscribe = simulation.subscribe(() => { latest.current = simulation.snapshot(); scene.renderState(latest.current) })
    return () => { unsubscribe(); game.destroy(true) }
  }, [simulation])
  return <div className="farm-canvas-frame"><div ref={host} className="farm-canvas" /></div>
}

class FarmScene extends Phaser.Scene {
  private readonly simulation: FarmSimulation
  private readonly getState: () => FarmSnapshot
  private layer?: Phaser.GameObjects.Graphics
  private playerSprite?: Phaser.GameObjects.Sprite
  constructor(simulation: FarmSimulation, getState: () => FarmSnapshot) { super('farm'); this.simulation = simulation; this.getState = getState }
  preload() { this.load.spritesheet('farmer', '/assets/farm/character-sheet.png', { frameWidth: 16, frameHeight: 16 }) }
  create() { this.layer = this.add.graphics(); this.playerSprite = this.add.sprite(0, 0, 'farmer', 0).setScale(2.5); this.renderState(this.getState()) }
  renderState(state: FarmSnapshot) {
    if (!this.layer) return
    const g = this.layer; g.clear(); g.fillStyle(0x29434a); g.fillRect(0, 0, WIDTH, HEIGHT)
    g.fillStyle(0x3c6b4a); g.fillRect(TILE, TILE, 6 * TILE, 7 * TILE); g.fillStyle(0x8b6b4a); g.fillRect(8 * TILE, TILE, 4 * TILE, 3 * TILE); g.fillStyle(0xb99764); g.fillRect(8 * TILE, 5 * TILE, 3 * TILE, 3 * TILE)
    g.fillStyle(0x98754d); for (const tile of state.tiles) { const color = tile.state === 'soil' ? 0x806044 : tile.state === 'tilled' ? 0xa87b4e : tile.state === 'planted' ? 0x8f7246 : 0x6f9b55; g.fillStyle(color); g.fillRect(tile.x * TILE + 2, tile.y * TILE + 2, TILE - 4, TILE - 4); if (tile.crop) { g.fillStyle(tile.growth >= 2 ? 0xf4c95d : 0x65a765); g.fillCircle(tile.x * TILE + TILE / 2, tile.y * TILE + TILE / 2, tile.growth >= 2 ? 12 : 8) } }
    g.fillStyle(0xe5b35b); g.fillRect(10 * TILE + 12, 2 * TILE + 12, 24, 24); g.fillStyle(0x694c3a); g.fillRect(9 * TILE + 14, 6 * TILE + 14, 20, 20); if (this.playerSprite) this.playerSprite.setPosition(state.player.x * TILE + TILE / 2, state.player.y * TILE + TILE / 2)
    g.lineStyle(2, 0xd9f99d, .55); g.strokeRect(8 * TILE, TILE, 4 * TILE, 3 * TILE); g.strokeRect(8 * TILE, 5 * TILE, 3 * TILE, 3 * TILE)
  }
}
