import { describe, expect, it } from 'vitest'
import { getDayTransitionFrame } from './dayTransition'

describe('getDayTransitionFrame', () => {
  it('moves from clear sunset through night and back to clear sunrise', () => {
    expect(getDayTransitionFrame(0)).toEqual({ color: 0xd96c3f, alpha: 0 })
    expect(getDayTransitionFrame(0.525)).toEqual({ color: 0x18233f, alpha: 0.9 })
    expect(getDayTransitionFrame(1)).toEqual({ color: 0xf4bd70, alpha: 0 })
  })

  it('clamps progress outside the animation range', () => {
    expect(getDayTransitionFrame(-1)).toEqual(getDayTransitionFrame(0))
    expect(getDayTransitionFrame(2)).toEqual(getDayTransitionFrame(1))
  })
})
