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
  private lastPlayerPosition?: { x: number; y: number }
  private fieldSprites = new Map<string, Phaser.GameObjects.Sprite>()
  private cropSprites: Phaser.GameObjects.Sprite[] = []
  constructor(getState: () => FarmSnapshot) { super('farm'); this.getState = getState }
  preload() {
    this.load.spritesheet('outdoors', '/assets/farm/spring-outdoors.png', { frameWidth: 16, frameHeight: 16 })
    this.load.spritesheet('caroline', '/assets/farm/caroline.png', { frameWidth: 16, frameHeight: 32 })
    this.load.spritesheet('crops', '/assets/farm/crops.png', { frameWidth: 16, frameHeight: 32 })
    this.load.image('houses', '/assets/farm/houses.png')
    this.load.image('shed', '/assets/farm/shed.png')
    this.load.image('recycling-hut', '/assets/farm/recycling-hut.png')
  }
  create() {
    this.createGround()
    this.createBuildings()
    this.createCharacterAnimations()
    this.playerSprite = this.add.sprite(0, 0, 'caroline', 0).setScale(2).setDepth(8)
    this.renderState(this.getState())
  }
  renderState(state: FarmSnapshot) {
    for (const sprite of this.cropSprites) sprite.destroy()
    this.cropSprites = []
    for (const tile of state.tiles) {
      const key = `${tile.x}:${tile.y}`
      let ground = this.fieldSprites.get(key)
      if (!ground) { ground = this.add.sprite(tile.x * TILE + TILE / 2, tile.y * TILE + TILE / 2, 'outdoors', 171).setScale(3).setDepth(3); this.fieldSprites.set(key, ground) }
      ground.setVisible(tile.state !== 'grass').setFrame(171).clearTint()
      if (tile.state === 'watered') ground.setTint(0x9fc5cf)
      if (tile.crop) this.cropSprites.push(this.add.sprite(tile.x * TILE + TILE / 2, tile.y * TILE + TILE / 2 + 10, 'crops', tile.growth >= 2 ? 4 : 2).setScale(2.2).setDepth(6))
    }
    this.movePlayer(state.player)
  }
  private createGround() {
    for (let y = 0; y < 9; y++) for (let x = 0; x < 14; x++) this.add.sprite(x * TILE + TILE / 2, y * TILE + TILE / 2, 'outdoors', 150 + (x + y * 2) % 3).setScale(3).setDepth(0)
    for (let y = 0; y < 9; y++) this.add.sprite(6 * TILE + TILE / 2, y * TILE + TILE / 2, 'outdoors', 226).setScale(3).setDepth(1)
    for (let x = 6; x < 13; x++) { this.add.sprite(x * TILE + TILE / 2, 4 * TILE + TILE / 2, 'outdoors', 226).setScale(3).setDepth(1); this.add.sprite(x * TILE + TILE / 2, 7 * TILE + TILE / 2, 'outdoors', 226).setScale(3).setDepth(1) }
  }
  private createBuildings() {
    this.add.image(350, 8, 'houses').setOrigin(0).setCrop(0, 0, 160, 145).setDisplaySize(220, 200).setDepth(4)
    this.add.text(420, 42, '种子商店', { fontFamily: 'system-ui', fontSize: '13px', color: '#fff0bd', stroke: '#583522', strokeThickness: 4 }).setDepth(7)
    this.add.text(410, 185, '种子 20G · 收购 35G', { fontFamily: 'system-ui', fontSize: '9px', color: '#5d351f', backgroundColor: '#f1cf7a', padding: { x: 5, y: 3 } }).setDepth(7)
    this.add.image(583, 84, 'recycling-hut').setOrigin(0).setCrop(0, 0, 48, 64).setScale(1.7).setDepth(4)
    this.add.text(592, 166, '回收屋', { fontFamily: 'system-ui', fontSize: '9px', color: '#fff0bd', stroke: '#31552f', strokeThickness: 3 }).setDepth(7)
    this.add.image(350, 242, 'houses').setOrigin(0).setCrop(0, 145, 160, 140).setDisplaySize(205, 180).setDepth(4)
    this.add.text(420, 390, '农舍 · 休息', { fontFamily: 'system-ui', fontSize: '10px', color: '#fff0bd', stroke: '#583522', strokeThickness: 3 }).setDepth(7)
    this.add.image(540, 270, 'shed').setOrigin(0).setDisplaySize(126, 126).setDepth(4)
    this.add.text(580, 390, '仓库', { fontFamily: 'system-ui', fontSize: '10px', color: '#fff0bd', stroke: '#583522', strokeThickness: 3 }).setDepth(7)
  }
  private createCharacterAnimations() {
    const animations = [
      ['walk-down', 0, 3], ['walk-right', 4, 7], ['walk-up', 8, 11], ['walk-left', 12, 15],
    ] as const
    for (const [key, start, end] of animations) this.anims.create({ key, frames: this.anims.generateFrameNumbers('caroline', { start, end }), frameRate: 8, repeat: -1 })
  }
  private movePlayer(position: { x: number; y: number }) {
    if (!this.playerSprite) return
    const target = { x: position.x * TILE + TILE / 2, y: position.y * TILE + TILE / 2 }
    if (!this.lastPlayerPosition) { this.playerSprite.setPosition(target.x, target.y); this.lastPlayerPosition = position; return }
    if (this.lastPlayerPosition.x === position.x && this.lastPlayerPosition.y === position.y) return
    this.tweens.killTweensOf(this.playerSprite)
    const finish = () => { this.playerSprite?.anims.stop() }
    const moveY = () => {
      if (!this.playerSprite || this.playerSprite.y === target.y) { finish(); return }
      this.playerSprite.play(target.y > this.playerSprite.y ? 'walk-down' : 'walk-up', true)
      this.tweens.add({ targets: this.playerSprite, y: target.y, duration: Math.abs(target.y - this.playerSprite.y) * 5, ease: 'Linear', onComplete: finish })
    }
    if (this.playerSprite.x !== target.x) {
      this.playerSprite.play(target.x > this.playerSprite.x ? 'walk-right' : 'walk-left', true)
      this.tweens.add({ targets: this.playerSprite, x: target.x, duration: Math.abs(target.x - this.playerSprite.x) * 5, ease: 'Linear', onComplete: moveY })
    } else moveY()
    this.lastPlayerPosition = { ...position }
  }
}
