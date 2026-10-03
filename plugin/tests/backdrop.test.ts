import { expect, test } from 'claude-code/testing'

import { backdrop, landscapeAt, LANDSCAPES, PHASES } from '../hooks/backdrop'
import { frame, initialStatus, newScene, react, step } from '../hooks/scene'
import type { Status } from '../hooks/scene'

const W = 90
const H = 28
const paint = (phase: (typeof PHASES)[number], landscape: (typeof LANDSCAPES)[number], t = 0) => {
  const out = { pixels: Array<number>(W * H).fill(-1), width: W, height: H }
  backdrop(out, phase, landscape, t)
  return out.pixels
}
const count = (px: number[], c: number) => px.filter(p => p === c).length

test('twenty different backdrops: five landscapes for each time of day', () => {
  const all = PHASES.flatMap(phase => LANDSCAPES.map(landscape => paint(phase, landscape).join()))
  expect(all.length).toBe(20)
  expect(new Set(all).size).toBe(20)
})

test('every backdrop fills the band, with grass along the bottom', () => {
  for (const phase of PHASES)
    for (const landscape of LANDSCAPES) {
      const px = paint(phase, landscape)
      expect(px.every(c => c !== -1)).toBe(true)
      const bottom = px.slice((H - 1) * W)
      expect(bottom.every(c => ((c >> 8) & 0xff) >= (c & 0xff))).toBe(true)
    }
})

test('a fresh landscape every hour, the same all hour long, all five in a day or two', () => {
  const hours = Array.from({ length: 48 }, (_, h) => landscapeAt(500_000 + h))
  expect(new Set(hours)).toEqual(new Set(LANDSCAPES))
  expect(landscapeAt(500_123)).toBe(landscapeAt(500_123))
  expect(hours.filter((l, i) => i > 0 && l !== hours[i - 1]).length).toBeGreaterThan(20)
})

test('each landscape has its own landmarks', () => {
  expect(count(paint('day', 'mountains'), 0xf4f8ff)).toBeGreaterThan(10)
  expect(count(paint('day', 'lake'), 0x285f94)).toBeGreaterThan(50)
  expect(count(paint('day', 'forest'), 0xd9473a)).toBeGreaterThan(2)
  expect(count(paint('day', 'hills'), 0x35703f)).toBeGreaterThan(50)
  expect(count(paint('day', 'meadow'), 0xf2d24b) + count(paint('day', 'meadow'), 0xe86a8a)).toBeGreaterThan(2)
})

test('clouds drift, water shimmers and stars twinkle', () => {
  expect(paint('day', 'meadow', 0).join()).not.toBe(paint('day', 'meadow', 400).join())
  expect(paint('night', 'lake', 0).join()).not.toBe(paint('night', 'lake', 30).join())
  const stars = (t: number) => paint('night', 'meadow', t).filter(c => c === 0xcfd8ff || c === 0x8e9ac4).length
  expect(new Set([0, 14, 28, 42, 56, 70].map(stars)).size).toBeGreaterThan(1)
})

test('Zs and confetti show up over the sky but never over a Pokémon', () => {
  const sprite = { pixels: Array<number>(64).fill(0xabcdef), width: 8, height: 8 }
  const rows = 9
  let s: Status = { ...initialStatus(), actors: [{ ...newScene(30), roam: { kind: 'idle', left: 1e9, age: 0 } }] }
  let seed = 7
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  s = step(react(s, 'cheer'), W, [8], 0, rand)
  for (let i = 0; i < 8; i++) s = step(s, W, [8], 0, rand)
  const img = frame(s, [sprite], W, rows, { phase: 'day', landscape: 'meadow' })
  const confetti = [0xff5a5a, 0xffd23f, 0x3fd1ff, 0x7dff6a, 0xd57bff, 0xffffff]
  expect(img.pixels.some(c => confetti.includes(c))).toBe(true)
  expect(count(img.pixels, 0xabcdef)).toBe(64)
})
