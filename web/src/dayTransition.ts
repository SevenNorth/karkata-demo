export interface DayTransitionFrame {
  color: number
  alpha: number
}

const KEYFRAMES = [
  { progress: 0, color: 0xd96c3f, alpha: 0 },
  { progress: 0.2, color: 0xd96c3f, alpha: 0.55 },
  { progress: 0.45, color: 0x18233f, alpha: 0.9 },
  { progress: 0.6, color: 0x18233f, alpha: 0.9 },
  { progress: 0.78, color: 0xf4bd70, alpha: 0.5 },
  { progress: 1, color: 0xf4bd70, alpha: 0 },
] as const

function interpolateColor(from: number, to: number, amount: number) {
  const channel = (shift: number) => Math.round(
    ((from >> shift) & 0xff) + (((to >> shift) & 0xff) - ((from >> shift) & 0xff)) * amount,
  )
  return (channel(16) << 16) | (channel(8) << 8) | channel(0)
}

export function getDayTransitionFrame(progress: number): DayTransitionFrame {
  const clamped = Math.min(1, Math.max(0, progress))
  const nextIndex = KEYFRAMES.findIndex((frame) => frame.progress >= clamped)
  if (nextIndex <= 0) {
    const frame = KEYFRAMES[0]
    return { color: frame.color, alpha: frame.alpha }
  }

  const previous = KEYFRAMES[nextIndex - 1]
  const next = KEYFRAMES[nextIndex]
  const amount = (clamped - previous.progress) / (next.progress - previous.progress)
  return {
    color: interpolateColor(previous.color, next.color, amount),
    alpha: previous.alpha + (next.alpha - previous.alpha) * amount,
  }
}
