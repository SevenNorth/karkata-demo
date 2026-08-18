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
    const scene = new FarmScene(() => latest.current)
    const game = new Phaser.Game({ type: Phaser.CANVAS, width: WIDTH, height: HEIGHT, parent: host.current ?? undefined, backgroundColor: '#67a64b', pixelArt: true, antialias: false, scene })
    const unsubscribe = simulation.subscribe(() => { latest.current = simulation.snapshot(); scene.renderState(latest.current) })
    return () => { unsubscribe(); game.destroy(true) }
  }, [simulation])
  return <div className="farm-canvas-frame"><div ref={host} className="farm-canvas" /></div>
}

class FarmScene extends Phaser.Scene {
  private readonly getState: () => FarmSnapshot
  private playerSprite?: Phaser.GameObjects.Sprite
  private fieldSprites = new Map<string, Phaser.GameObjects.Sprite>()
  private cropSprites: Phaser.GameObjects.Sprite[] = []
  constructor(getState: () => FarmSnapshot) { super('farm'); this.getState = getState }
  preload() {
    this.load.spritesheet('outdoors', '/assets/farm/spring-outdoors.png', { frameWidth: 16, frameHeight: 16 })
    this.load.spritesheet('indoors', '/assets/farm/farmhouse-tiles.png', { frameWidth: 16, frameHeight: 16 })
    this.load.spritesheet('farmer', '/assets/farm/farmer.png', { frameWidth: 16, frameHeight: 32 })
    this.load.spritesheet('crops', '/assets/farm/crops.png', { frameWidth: 16, frameHeight: 32 })
    this.load.spritesheet('craftables', '/assets/farm/craftables.png', { frameWidth: 16, frameHeight: 32 })
    this.load.image('houses', '/assets/farm/houses.png')
    this.load.image('furniture', '/assets/farm/furniture.png')
  }
  create() {
    this.createGround()
    this.createBuildings()
    this.createRoom()
    this.playerSprite = this.add.sprite(0, 0, 'farmer', 0).setScale(2).setDepth(8)
    this.renderState(this.getState())
  }
  renderState(state: FarmSnapshot) {
    for (const sprite of this.cropSprites) sprite.destroy()
    this.cropSprites = []
    for (const tile of state.tiles) {
      const key = `${tile.x}:${tile.y}`
      let ground = this.fieldSprites.get(key)
      if (!ground) { ground = this.add.sprite(tile.x * TILE + TILE / 2, tile.y * TILE + TILE / 2, 'outdoors', 170).setScale(3).setDepth(3); this.fieldSprites.set(key, ground) }
      ground.setFrame(tile.state === 'soil' ? 170 : 171).clearTint()
      if (tile.state === 'watered') ground.setTint(0x9fc5cf)
      if (tile.crop) this.cropSprites.push(this.add.sprite(tile.x * TILE + TILE / 2, tile.y * TILE + TILE / 2 + 10, 'crops', tile.growth >= 2 ? 4 : 2).setScale(2.2).setDepth(6))
    }
    this.playerSprite?.setPosition(state.player.x * TILE + TILE / 2, state.player.y * TILE + TILE / 2)
  }
  private createGround() {
    for (let y = 0; y < 9; y++) for (let x = 0; x < 14; x++) this.add.sprite(x * TILE + TILE / 2, y * TILE + TILE / 2, 'outdoors', 150 + (x + y * 2) % 3).setScale(3).setDepth(0)
    for (let y = 0; y < 9; y++) this.add.sprite(6 * TILE + TILE / 2, y * TILE + TILE / 2, 'outdoors', 226).setScale(3).setDepth(1)
    for (let x = 6; x < 13; x++) { this.add.sprite(x * TILE + TILE / 2, 4 * TILE + TILE / 2, 'outdoors', 226).setScale(3).setDepth(1); this.add.sprite(x * TILE + TILE / 2, 7 * TILE + TILE / 2, 'outdoors', 226).setScale(3).setDepth(1) }
    for (let x = 1; x <= 6; x++) { this.add.sprite(x * TILE + TILE / 2, 1 * TILE + TILE / 2, 'outdoors', 167).setScale(3).setDepth(2); this.add.sprite(x * TILE + TILE / 2, 5 * TILE + TILE / 2, 'outdoors', 167).setScale(3).setDepth(2) }
  }
  private createBuildings() {
    this.add.image(405, 16, 'houses').setOrigin(0).setCrop(0, 0, 160, 145).setDisplaySize(230, 208).setDepth(4)
    this.add.text(478, 45, '种子商店', { fontFamily: 'system-ui', fontSize: '13px', color: '#fff0bd', stroke: '#583522', strokeThickness: 4 }).setDepth(7)
    this.add.text(458, 190, '种子 20G  ·  收购 35G', { fontFamily: 'system-ui', fontSize: '9px', color: '#5d351f', backgroundColor: '#f1cf7a', padding: { x: 5, y: 3 } }).setDepth(7)
    this.add.sprite(12 * TILE + 24, 6 * TILE + 24, 'craftables', 20).setScale(2.4).setDepth(5)
    this.add.text(594, 337, '出货箱', { fontFamily: 'system-ui', fontSize: '9px', color: '#fff0bd', stroke: '#583522', strokeThickness: 3 }).setDepth(7)
  }
  private createRoom() {
    for (let y = 5; y < 9; y++) for (let x = 8; x < 12; x++) this.add.sprite(x * TILE + TILE / 2, y * TILE + TILE / 2, 'indoors', 50 + (x + y) % 5).setScale(3).setDepth(2)
    for (let x = 8; x < 12; x++) this.add.sprite(x * TILE + TILE / 2, 5 * TILE + 12, 'indoors', 14 + x % 5).setScale(3).setDepth(3)
    this.add.image(8 * TILE + 12, 6 * TILE + 4, 'furniture').setOrigin(0).setCrop(0, 400, 80, 48).setDisplaySize(120, 72).setDepth(5)
    this.add.sprite(11 * TILE + 24, 7 * TILE + 24, 'craftables', 23).setScale(2.4).setDepth(5)
    this.add.text(433, 250, '农舍', { fontFamily: 'system-ui', fontSize: '13px', color: '#fff0bd', stroke: '#583522', strokeThickness: 4 }).setDepth(7)
    this.add.text(430, 360, '床', { fontFamily: 'system-ui', fontSize: '9px', color: '#fff0bd', stroke: '#583522', strokeThickness: 3 }).setDepth(7)
    this.add.text(545, 382, '仓库', { fontFamily: 'system-ui', fontSize: '9px', color: '#fff0bd', stroke: '#583522', strokeThickness: 3 }).setDepth(7)
  }
}
