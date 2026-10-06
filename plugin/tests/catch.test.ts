import { expect, test } from 'claude-code/testing'

import {
  BALL_SPIN,
  ballAt,
  ballOverlays,
  BURST,
  CAUGHT,
  catchChance,
  clickPixels,
  DROP,
  FLY,
  MISS,
  readClick,
  SHRINK,
  startThrow,
  stepThrow,
  WOBBLE,
  wildLook,
  wobblesFor,
} from '../hooks/catch'
import type { Throw, ThrowEvent } from '../hooks/catch'

const RED = 0xff0000
// 3 wide, 4 tall, see-through at (1, 1) and (2, 3).
const SPRITE = { width: 3, height: 4, pixels: [RED, RED, RED, RED, -1, RED, RED, RED, RED, RED, RED, -1] }
const A = { x: -3, y: 20 }
const B = { x: 30, y: 10 }
const C = { x: 31, y: 19 }
const seq = (...values: number[]) => {
  let i = 0
  return () => values[i++ % values.length] ?? 0
}
// Plays a throw out: its events in order and how many ticks it ran.
function playOut(p: Throw) {
  const events: ThrowEvent[] = []
  let ran = 0
  for (let cur: Throw | null = p; cur && ran < 1000; ran++) {
    const r = stepThrow(cur)
    if (r.event) events.push(r.event)
    cur = r.pitch
  }
  return { events, ran }
}

test('a click reads as its cell, plus where in the cell when the terminal says; anything else is no click', () => {
  expect(readClick({ x: 3, y: 1 })).toEqual({ x: 3, y: 1 })
  expect(readClick({ x: 3, y: 1, fine: { x: 3.4, y: 1.75 } })).toEqual({ x: 3, y: 1, fine: { x: 3.4, y: 1.75 } })
  expect(readClick({ x: 3, y: 1, fine: { x: 'a' } })).toEqual({ x: 3, y: 1 })
  for (const bad of [null, 'x', { x: -1, y: 0 }, { x: 1.5, y: 0 }, { y: 2 }, { x: 1, y: Infinity }])
    expect(readClick(bad)).toBeNull()
})

test('a cell holds two pixels: the sub-cell position picks the half, without it both count', () => {
  expect(clickPixels({ x: 4, y: 3, fine: { x: 4.9, y: 3.2 } })).toEqual({ x: 4, ys: [6] })
  expect(clickPixels({ x: 4, y: 3, fine: { x: 4.1, y: 3.8 } })).toEqual({ x: 4, ys: [7] })
  expect(clickPixels({ x: 4, y: 3 })).toEqual({ x: 4, ys: [6, 7] })
})

test('the odds follow the capture rate; a miss rolls nothing', () => {
  expect(catchChance(255)).toBe(1)
  expect(catchChance(3)).toBe(3 / 255)
  expect(catchChance(-5)).toBe(0)
  expect(catchChance(999)).toBe(1)
  expect(startThrow(A, B, C, true, 255, () => 0.999)).toMatchObject({ isCaught: true, wobbles: 3, flees: false })
  expect(startThrow(A, B, C, true, 3, seq(0.5, 0.99, 0.05))).toMatchObject({
    isCaught: false,
    wobbles: 0,
    flees: true,
  })
  expect(startThrow(A, B, C, false, 255, () => 0)).toMatchObject({
    isHit: false,
    isCaught: false,
    wobbles: 0,
    flees: false,
  })
})

test('a near miss wobbles more: up to twice, more often the higher the rate', () => {
  expect(wobblesFor(255, () => 0.99)).toBe(2)
  expect(wobblesFor(255, () => 0.5)).toBe(1)
  expect(wobblesFor(150, () => 0.99)).toBe(1)
  expect(wobblesFor(45, () => 0.99)).toBe(0)
})

test('the phases in order: a catch, a break-free that walks on, one that flees, and a miss', () => {
  expect(playOut(startThrow(A, B, C, true, 255, () => 0))).toEqual({
    events: ['caught'],
    ran: FLY + SHRINK + DROP + 3 * WOBBLE + CAUGHT,
  })
  expect(playOut(startThrow(A, B, C, true, 200, seq(0.9, 0.99, 0.5)))).toEqual({
    events: ['broke-free', 'released'],
    ran: FLY + SHRINK + DROP + 2 * WOBBLE + BURST,
  })
  expect(playOut(startThrow(A, B, C, true, 3, seq(0.5, 0, 0.05)))).toEqual({
    events: ['broke-free', 'fled'],
    ran: FLY + SHRINK + DROP + BURST,
  })
  expect(playOut(startThrow(A, B, C, false, 45, () => 0))).toEqual({ events: [], ran: FLY + MISS })
})

test('the ball flies in from off the bottom-left on an arc, spinning, and lands on the clicked pixel', () => {
  const p = startThrow(A, B, C, false, 45, () => 0)
  const path = Array.from({ length: FLY }, (_, t) => ballAt({ ...p, t }))
  expect(path[0]?.x).toBeLessThan(0)
  expect(path.at(-1)).toMatchObject({ x: B.x, y: B.y })
  expect(Math.min(...path.map(b => b?.y ?? 99))).toBeLessThan(B.y)
  expect(new Set(path.map(b => b?.img)).size).toBe(BALL_SPIN.length)
})

test('a missed ball bounces where it landed, then blinks out', () => {
  const m: Throw = { ...startThrow(A, B, C, false, 45, () => 0), phase: 'miss' }
  const shown = Array.from({ length: MISS }, (_, t) => ballAt({ ...m, t }))
  expect(shown.every(b => b === null || b.x === B.x)).toBe(true)
  expect(Math.min(...shown.map(b => b?.y ?? 99))).toBeLessThan(B.y)
  expect(shown.slice(MISS / 2).some(b => b === null)).toBe(true)
  expect(shown.slice(0, MISS / 2).every(b => b !== null)).toBe(true)
})

test('caught: the ball rests where the Pokémon stood, its button dark, with sparkles around it', () => {
  const c: Throw = { ...startThrow(A, B, C, true, 255, () => 0), phase: 'caught', t: 0 }
  const placed = ballOverlays(c)
  expect(placed.length).toBeGreaterThan(1)
  expect(placed[0]?.floor).toBe(C.y + 1)
  expect(placed[0]?.img).not.toBe(BALL_SPIN[0])
})

test('the Pokémon shrinks into the ball as a white shape, stays hidden in it, and flashes back out on a burst', () => {
  const p = startThrow(A, B, C, true, 200, seq(0.9, 0.99, 0.5))
  const white = (img: { pixels: number[] } | null) => img?.pixels.filter(c => c === 0xffffff).length ?? 0
  expect(wildLook({ ...p, phase: 'fly' }, SPRITE)).toBe(SPRITE)
  const early = wildLook({ ...p, phase: 'shrink', t: 0 }, SPRITE)
  const late = wildLook({ ...p, phase: 'shrink', t: SHRINK - 1 }, SPRITE)
  expect(early?.pixels.every(c => c === -1 || c === 0xffffff)).toBe(true)
  expect(white(early)).toBeGreaterThan(white(late))
  expect(white(late)).toBeGreaterThan(0)
  expect([late?.width, late?.height]).toEqual([3, 4])
  for (const phase of ['drop', 'wobble', 'caught'] as const) expect(wildLook({ ...p, phase, t: 0 }, SPRITE)).toBeNull()
  expect(white(wildLook({ ...p, phase: 'burst', t: 0 }, SPRITE))).toBe(10)
  expect(wildLook({ ...p, phase: 'burst', t: BURST - 1 }, SPRITE)).toBe(SPRITE)
})
