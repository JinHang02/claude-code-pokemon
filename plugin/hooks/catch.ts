import { arc, silhouette, ticks } from './scene'
import type { Placed } from './scene'
import { CLEAR } from './sprite'
import type { Pixels } from './sprite'

// A left click on the band as the click layer reports it: its cell, and where in the cell when the terminal says.
export type Click = { x: number; y: number; fine?: { x: number; y: number } }
// A band pixel: column, and row of pixels (two per cell).
export type Point = { x: number; y: number }
export type ThrowPhase = 'fly' | 'miss' | 'shrink' | 'drop' | 'wobble' | 'caught' | 'burst'
// A Poké Ball thrown from `from` at `to`; on a hit it settles at `rest`, in front of where the Pokémon stood. The
// roll is made at the throw: whether it's caught, how many times the ball wobbles, whether it flees after.
export type Throw = {
  phase: ThrowPhase
  t: number
  from: Point
  to: Point
  rest: Point
  isHit: boolean
  isCaught: boolean
  wobbles: number
  flees: boolean
}
export type ThrowEvent = 'caught' | 'broke-free' | 'released' | 'fled'

// The capture rate when PokeAPI can't say: about one ball in six.
export const DEFAULT_RATE = 45
export const FLEE_ODDS = 0.1
export const FLY = ticks(600)
export const MISS = ticks(600)
export const SHRINK = ticks(400)
export const DROP = ticks(300)
export const WOBBLE = ticks(500)
export const CAUGHT = ticks(800)
export const BURST = ticks(500)
// How far the ball's arc rises above its straight line, in pixels.
const PEAK = 8

const PALETTE: Record<string, number> = { r: 0xe3350d, k: 0x222222, w: 0xf2f2f2, b: 0xffffff, d: 0x555555 }
const art = (rows: string[]): Pixels => ({
  width: rows[0]?.length ?? 0,
  height: rows.length,
  pixels: [...rows.join('')].map(ch => PALETTE[ch] ?? CLEAR),
})
const BALL = art(['.rr.', 'kbbk', 'wwww', '.ww.'])
// Spinning in flight: upright, on its side, upside down, on its other side.
export const BALL_SPIN = [
  BALL,
  art(['.wk.', 'wwbr', 'wwbr', '.wk.']),
  art(['.ww.', 'wwww', 'kbbk', '.rr.']),
  art(['.kw.', 'rbww', 'rbww', '.kw.']),
]
// The button darkens as the ball clicks shut.
const SHUT = art(['.rr.', 'kddk', 'wwww', '.ww.'])
const OPEN = art(['.rr.', 'rrrr', '....', '....', 'wwww', '.ww.'])
const STAR: Pixels = { pixels: [0xfff27a], width: 1, height: 1 }

const isCount = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0

export function readClick(data: unknown): Click | null {
  if (typeof data !== 'object' || data === null) return null
  const { x, y, fine } = data as Record<string, unknown>
  if (!isCount(x) || !isCount(y)) return null
  const f = typeof fine === 'object' && fine !== null ? (fine as Record<string, unknown>) : {}
  return typeof f.x === 'number' && typeof f.y === 'number' && Number.isFinite(f.x) && Number.isFinite(f.y)
    ? { x, y, fine: { x: f.x, y: f.y } }
    : { x, y }
}

// The band pixels a click covers: the half of the cell it landed in, or both halves when the terminal can't say.
export function clickPixels(c: Click): { x: number; ys: number[] } {
  return c.fine ? { x: Math.floor(c.fine.x), ys: [Math.floor(c.fine.y * 2)] } : { x: c.x, ys: [c.y * 2, c.y * 2 + 1] }
}

export const catchChance = (rate: number) => Math.min(255, Math.max(0, rate)) / 255

// Wobbles before a Pokémon breaks free: up to 2, more likely the easier it is to catch.
export const wobblesFor = (rate: number, rand = Math.random) => Math.min(2, Math.floor(rand() * 3 * catchChance(rate)))

export function startThrow(
  from: Point,
  to: Point,
  rest: Point,
  isHit: boolean,
  rate: number,
  rand = Math.random,
): Throw {
  const isCaught = isHit && rand() < catchChance(rate)
  const wobbles = isCaught ? 3 : isHit ? wobblesFor(rate, rand) : 0
  const flees = isHit && !isCaught && rand() < FLEE_ODDS
  return { phase: 'fly', t: 0, from, to, rest, isHit, isCaught, wobbles, flees }
}

const LENGTH: Record<ThrowPhase, (p: Throw) => number> = {
  fly: () => FLY,
  miss: () => MISS,
  shrink: () => SHRINK,
  drop: () => DROP,
  wobble: p => WOBBLE * p.wobbles,
  caught: () => CAUGHT,
  burst: () => BURST,
}

function nextPhase(p: Throw): ThrowPhase | null {
  const settle = p.isCaught ? 'caught' : 'burst'
  if (p.phase === 'fly') return p.isHit ? 'shrink' : 'miss'
  if (p.phase === 'shrink') return 'drop'
  if (p.phase === 'drop') return p.wobbles ? 'wobble' : settle
  if (p.phase === 'wobble') return settle
  return null
}

// One tick of a throw; the event marks a phase starting (a catch, a break-free) or the throw ending after a burst.
export function stepThrow(p: Throw): { pitch: Throw | null; event?: ThrowEvent } {
  if (p.t + 1 < LENGTH[p.phase](p)) return { pitch: { ...p, t: p.t + 1 } }
  const phase = nextPhase(p)
  if (!phase) return p.phase === 'burst' ? { pitch: null, event: p.flees ? 'fled' : 'released' } : { pitch: null }
  const pitch = { ...p, phase, t: 0 }
  if (phase === 'caught') return { pitch, event: 'caught' }
  if (phase === 'burst') return { pitch, event: 'broke-free' }
  return { pitch }
}

const lerp = (a: number, b: number, q: number) => a + (b - a) * q

// The ball this tick, centred on (x, y); null when it isn't drawn.
export function ballAt(p: Throw): { img: Pixels; x: number; y: number } | null {
  switch (p.phase) {
    case 'fly': {
      const q = (p.t + 1) / FLY
      const img = BALL_SPIN[Math.floor(p.t / 2) % BALL_SPIN.length] ?? BALL
      return { img, x: lerp(p.from.x, p.to.x, q), y: lerp(p.from.y, p.to.y, q) - arc(q, PEAK) }
    }
    case 'miss': {
      const half = MISS / 2
      if (p.t < half) return { img: BALL, x: p.to.x, y: p.to.y - arc(p.t / half, 3) }
      return Math.floor(p.t / 2) % 2 ? null : { img: BALL, ...p.to }
    }
    case 'shrink':
      return { img: BALL, ...p.to }
    case 'drop': {
      const q = ((p.t + 1) / DROP) ** 2
      return { img: BALL, x: lerp(p.to.x, p.rest.x, q), y: lerp(p.to.y, p.rest.y, q) }
    }
    case 'wobble': {
      const k = (p.t % WOBBLE) / WOBBLE
      const dx = k < 0.6 ? ([0, -1, 0, 1][Math.floor((k / 0.6) * 4)] ?? 0) : 0
      return { img: BALL, x: p.rest.x + dx, y: p.rest.y }
    }
    case 'caught':
      return { img: SHUT, ...p.rest }
    case 'burst':
      return p.t < BURST / 2 ? { img: OPEN, ...p.rest } : null
  }
}

// The ball as the band paints it, with twinkling sparkles once it clicks shut.
export function ballOverlays(p: Throw): Placed[] {
  const ball = ballAt(p)
  if (!ball) return []
  const x = Math.round(ball.x)
  const y = Math.round(ball.y)
  const placed = [{ img: ball.img, left: x - 2, floor: y + 1 }]
  if (p.phase !== 'caught') return placed
  const spots =
    Math.floor(p.t / ticks(150)) % 2
      ? [
          [-4, -3],
          [3, -4],
          [-3, 1],
        ]
      : [
          [3, 0],
          [-4, -1],
          [0, -5],
        ]
  return [...placed, ...spots.map(([dx = 0, dy = 0]) => ({ img: STAR, left: x + dx, floor: y + dy }))]
}

// `img` scaled by `k`, centred on its bottom edge, in a frame of its own size.
function shrinkInto(img: Pixels, k: number): Pixels {
  const w = Math.max(1, Math.round(img.width * k))
  const h = Math.max(1, Math.round(img.height * k))
  const pad = Math.floor((img.width - w) / 2)
  const pixels = Array<number>(img.width * img.height).fill(CLEAR)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      pixels[(img.height - h + y) * img.width + pad + x] =
        img.pixels[Math.floor((y * img.height) / h) * img.width + Math.floor((x * img.width) / w)] ?? CLEAR
  return { ...img, pixels }
}

// How the wild Pokémon shows during a throw: white and shrinking into the ball, hidden inside it, flashing white
// as it bursts out; null while hidden.
export function wildLook(p: Throw, img: Pixels): Pixels | null {
  if (p.phase === 'shrink') return silhouette(shrinkInto(img, 1 - (0.9 * p.t) / SHRINK))
  if (p.phase === 'drop' || p.phase === 'wobble' || p.phase === 'caught') return null
  if (p.phase === 'burst' && p.t < BURST / 2) return silhouette(img)
  return img
}
