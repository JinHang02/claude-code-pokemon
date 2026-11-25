import { expect, test } from 'claude-code/testing'

import { BOX } from '../hooks/evolution-screen'
import {
  beatAt,
  FERRY,
  FERRY_MIN_COLUMNS,
  FERRY_MIN_ROWS,
  FERRY_MS,
  FERRY_ROWS,
  ferryFrame,
  pier,
  SAILED_MS,
  TICKET_ICON,
} from '../hooks/ferry-screen'
import type { FerryBeat } from '../hooks/ferry-screen'
import { TRAVEL_REGIONS } from '../hooks/travel-regions'
import type { TravelRegion } from '../hooks/travel-regions'
import { mirror, textRows } from '../hooks/sprite'
import type { Pixels } from '../hooks/sprite'

const [KANTO, JOHTO] = TRAVEL_REGIONS as [TravelRegion, TravelRegion]
const W = 120
const ROWS = FERRY_ROWS
const stageHeight = (rows: number) => (rows - 3) * 2

const solid = (color: number, width: number, height: number): Pixels => ({
  pixels: Array<number>(width * height).fill(color),
  width,
  height,
})
const A = 0x010203
const B = 0x040506
const C = 0x070809
const D = 0x0a0b0c
const hex = (color: string) => parseInt(color.slice(1), 16)

type Frame = { img: Pixels; text: string }
const draw = (ms: number, o: Partial<Parameters<typeof ferryFrame>[0]> = {}): Frame =>
  ferryFrame({ ms, from: KANTO, to: JOHTO, party: [], columns: W, rows: ROWS, ...o })
const stage = ({ img }: Frame, rows = ROWS): Pixels => ({
  pixels: img.pixels.slice(0, stageHeight(rows) * img.width),
  width: img.width,
  height: stageHeight(rows),
})
const count = (img: Pixels, color: number) => img.pixels.filter(p => p === color).length
const colors = (img: Pixels) => new Set(img.pixels)
const box = (img: Pixels, color: number) => {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -1, -1]
  img.pixels.forEach((p, i) => {
    if (p !== color) return
    const [x, y] = [i % img.width, Math.floor(i / img.width)]
    ;[x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)]
  })
  return { x0, y0, x1, y1 }
}
const wipeX = (img: Pixels): number | null => {
  for (let x = 0; x < img.width; x++) {
    const top = img.pixels[x]
    let isLine = true
    for (let y = 1; y < img.height && isLine; y++) isLine = img.pixels[y * img.width + x] === top
    if (isLine) return x
  }
  return null
}

// ── Constants and beats ──

test('constants: the crossing lasts 7.7 s, wants 18 rows, needs 10 rows and 40 columns', () => {
  expect(FERRY_MS).toBe(7_700)
  expect(FERRY_ROWS).toBe(18)
  expect(FERRY_MIN_ROWS).toBe(10)
  expect(FERRY_MIN_COLUMNS).toBe(40)
  expect(SAILED_MS).toBe(2_500)
})

test('beatAt: each beat starts on its millisecond', () => {
  const cases: [number, FerryBeat][] = [
    [0, 'docked'],
    [299, 'docked'],
    [300, 'boarding'],
    [2399, 'boarding'],
    [2400, 'sailing'],
    [4099, 'sailing'],
    [4100, 'docking'],
    [5299, 'docking'],
    [5300, 'leaving'],
    [7399, 'leaving'],
    [7400, 'welcome'],
    [7700, 'welcome'],
    [60_000, 'welcome'],
    [Infinity, 'welcome'],
  ]
  for (const [ms, beat] of cases) expect([ms, beatAt(ms)]).toEqual([ms, beat])
})

test('beatAt: negative and NaN ms are docked', () => {
  expect(beatAt(-1)).toBe('docked')
  expect(beatAt(-10_000)).toBe('docked')
  expect(beatAt(NaN)).toBe('docked')
  expect(draw(-500)).toEqual(draw(0))
})

// ── Text ──

test('text: boarding, then sailing to the region, then the welcome (A49)', () => {
  expect(draw(0).text).toBe('Your party is boarding…')
  expect(draw(2399).text).toBe('Your party is boarding…')
  expect(draw(2400).text).toBe('Sailing to Johto…')
  expect(draw(7399).text).toBe('Sailing to Johto…')
  expect(draw(7400).text).toBe('Welcome to JOHTO!')
  expect(draw(FERRY_MS).text).toBe('Welcome to JOHTO!')
})

test('text: the way back ends with Welcome to KANTO! (A50)', () => {
  expect(draw(2400, { from: JOHTO, to: KANTO }).text).toBe('Sailing to Kanto…')
  expect(draw(7400, { from: JOHTO, to: KANTO }).text).toBe('Welcome to KANTO!')
})

// ── Party ──

test('party: [] draws no Pokémon and still ends with the welcome (A51)', () => {
  expect(stage(draw(1000))).toEqual(stage(draw(100)))
  expect(stage(draw(2399))).toEqual(stage(draw(100)))
  expect(stage(draw(6000))).toEqual(stage(draw(7500)))
  expect(draw(7400).text).toBe('Welcome to JOHTO!')
})

test('party: with 2 sprites only those 2 are drawn (A52)', () => {
  const party = [solid(A, 10, 12), solid(B, 10, 12)]
  for (const ms of [1500, 2399, 3000, 4500, 6000]) {
    const scene = colors(stage(draw(ms)))
    const img = stage(draw(ms, { party }))
    expect(count(img, A)).toBeGreaterThan(0)
    expect(count(img, B)).toBeGreaterThan(0)
    for (const c of colors(img)) expect([c, scene.has(c) || c === A || c === B]).toEqual([c, true])
  }
})

test('party: members are off stage before boarding and after leaving', () => {
  const party = [solid(A, 10, 12), solid(B, 10, 12), solid(C, 10, 12)]
  for (const ms of [0, 299, 7400, 7699]) {
    const img = stage(draw(ms, { party }))
    expect([ms, count(img, A) + count(img, B) + count(img, C)]).toEqual([ms, 0])
  }
})

test('party: the third member starts 600 ms into boarding and all finish inside the beat', () => {
  const party = [solid(A, 10, 12), solid(B, 10, 12), solid(C, 10, 12)]
  const at = (ms: number, color: number) => box(stage(draw(ms, { party })), color)
  expect(count(stage(draw(300 + 599, { party })), C)).toBe(0)
  expect(count(stage(draw(300 + 700, { party })), C)).toBeGreaterThan(0)
  expect(count(stage(draw(300 + 299, { party })), B)).toBe(0)
  expect(count(stage(draw(300 + 400, { party })), B)).toBeGreaterThan(0)
  for (const color of [A, B, C]) expect(at(2100, color)).toEqual(at(2399, color))
  expect(at(1000, C)).not.toEqual(at(2399, C))
})

test('party: the third member starts 600 ms into leaving and all walk off inside the beat', () => {
  const party = [solid(A, 10, 12), solid(B, 10, 12), solid(C, 10, 12)]
  const seated = (color: number) => box(stage(draw(5300, { party })), color)
  for (const color of [A, B, C]) expect(box(stage(draw(5299, { party })), color)).toEqual(seated(color))
  expect(box(stage(draw(5300 + 599, { party })), C)).toEqual(seated(C))
  expect(box(stage(draw(5300 + 700, { party })), C)).not.toEqual(seated(C))
  expect(box(stage(draw(5300 + 700, { party })), C).x0).toBeGreaterThan(seated(C).x0)
  const gone = stage(draw(7399, { party }))
  expect(count(gone, A) + count(gone, B) + count(gone, C)).toBe(0)
})

test('party: members ride the ferry while it sails', () => {
  const party = [solid(A, 10, 12)]
  expect(box(stage(draw(3500, { party })), A).x0).toBeGreaterThan(box(stage(draw(2400, { party })), A).x0)
})

test('party: only the first three members are drawn', () => {
  const party = [solid(A, 10, 12), solid(B, 10, 12), solid(C, 10, 12), solid(D, 10, 12)]
  for (const ms of [1000, 2399, 3000, 6000]) expect(count(stage(draw(ms, { party })), D)).toBe(0)
})

test('party: a sprite taller than the stage is fitted, not cut', () => {
  const tall = solid(A, 40, 200)
  const img = stage(draw(2399, { party: [tall] }))
  const b = box(img, A)
  const [w, h] = [b.x1 - b.x0 + 1, b.y1 - b.y0 + 1]
  expect(b.y0).toBeGreaterThan(0)
  expect(h).toBeLessThan(stageHeight(ROWS))
  expect(Math.abs(w / h - 0.2)).toBeLessThan(0.15)
  expect(count(img, A)).toBe(w * h)
})

test('party: an empty or fully clear sprite draws nothing and does not throw', () => {
  const empty: Pixels = { pixels: [], width: 0, height: 0 }
  const clear = solid(-1, 8, 8)
  expect(stage(draw(1500, { party: [empty, clear] }))).toEqual(stage(draw(1500)))
})

// ── Size ──

test('size: columns wide, with a (rows − 3) × 2 px stage above the 3-row box', () => {
  for (const rows of [10, 18, 30]) {
    const { img } = draw(1000, { rows })
    expect([rows, img.width, img.height]).toEqual([rows, W, rows * 2])
    const h = stageHeight(rows)
    expect(img.pixels[h * W + 5]).toBe(BOX.margin)
    expect(img.pixels[(h - 1) * W + 5]).not.toBe(BOX.margin)
    expect(img.pixels[(rows * 2 - 3) * W + 5]).toBe(BOX.fill)
  }
})

test('size: the ferry is smaller at 10 rows than at 18', () => {
  const hull = FERRY.pixels[(FERRY.height - 6) * FERRY.width + Math.floor(FERRY.width / 2)] ?? -1
  const small = count(stage(draw(100, { rows: 10 }), 10), hull)
  const full = count(stage(draw(100, { rows: 18 }), 18), hull)
  expect(small).toBeGreaterThan(0)
  expect(small).toBeLessThan(full)
})

test('size: 40 columns and tiny or odd sizes draw without throwing', () => {
  for (const ms of [0, 1000, 3000, 4500, 6000, 7500]) {
    const { img } = draw(ms, { columns: FERRY_MIN_COLUMNS, rows: FERRY_MIN_ROWS, party: [solid(A, 10, 12)] })
    expect(img.width).toBe(FERRY_MIN_COLUMNS)
    expect(count(img, A)).toBeGreaterThanOrEqual(0)
  }
  for (const [columns, rows] of [
    [0, 0],
    [1, 1],
    [3, 2],
    [40.7, 10.9],
    [-5, -5],
  ] as const) {
    const { img } = draw(3000, { columns, rows })
    expect(img.pixels).toHaveLength(img.width * img.height)
  }
})

// ── Motion ──

test('motion: the wipe sweeps left to right without going back', () => {
  let last = -1
  let seen = 0
  for (let ms = 2400; ms < 4100; ms += 25) {
    const x = wipeX(stage(draw(ms)))
    if (x === null) continue
    expect(x).toBeGreaterThanOrEqual(last)
    last = x
    seen++
  }
  expect(seen).toBeGreaterThan(20)
  expect(last).toBeGreaterThan(W / 2)
  expect(wipeX(stage(draw(2399)))).toBeNull()
})

test('motion: the wipe reveals the new region', () => {
  const before = stage(draw(2399))
  const after = stage(draw(4099))
  expect(count(before, hex(KANTO.color))).toBeGreaterThan(0)
  expect(count(before, hex(JOHTO.color))).toBe(0)
  expect(count(after, hex(JOHTO.color))).toBeGreaterThan(0)
  expect(count(after, hex(KANTO.color))).toBe(0)
})

test('motion: the arrival mirrors the departure', () => {
  const departure = (ms: number) => stage(draw(ms, { from: JOHTO, to: KANTO }))
  const arrival = (ms: number) => stage(draw(ms, { from: KANTO, to: JOHTO }))
  expect(arrival(7500)).toEqual(mirror(departure(100)))
  expect(arrival(6000)).toEqual(mirror(departure(1000)))
  expect(arrival(5300)).toEqual(mirror(departure(2399)))
  for (const a of [100, 600, 1100]) {
    const before = departure(4100 - a)
    const wipe = wipeX(before) ?? W
    const columns = (img: Pixels) =>
      Array.from({ length: img.height }, (_, y) => img.pixels.slice(y * W, y * W + W - 1 - wipe))
    expect(columns(arrival(4100 + a))).toEqual(columns(mirror(before)))
  }
  const party = [solid(A, 10, 12)]
  expect(stage(draw(7500, { party }))).toEqual(mirror(stage(draw(100, { from: JOHTO, to: KANTO, party }))))
})

test('motion: the ferry docks on the right pier on arrival', () => {
  const hull = FERRY.pixels[(FERRY.height - 6) * FERRY.width + Math.floor(FERRY.width / 2)] ?? -1
  const docked = box(stage(draw(7500)), hull)
  expect(docked.x1).toBeGreaterThan(W / 2)
  expect(box(stage(draw(4500)), hull).x1).toBeLessThan(docked.x1)
})

// ── Art ──

test('art: the pier flag takes the region colour', () => {
  expect(pier('#123456').pixels).toContain(0x123456)
  expect(pier('#abcdef').pixels).not.toContain(0x123456)
  for (const r of TRAVEL_REGIONS) expect(pier(r.color).pixels).toContain(hex(r.color))
})

test('art: a malformed colour still draws a whole pier', () => {
  for (const color of ['', 'red', '#12345', '#zzzzzz']) {
    const img = pier(color)
    expect(img.pixels.every(p => Number.isInteger(p))).toBe(true)
    expect(img.pixels).toHaveLength(pier('#123456').pixels.length)
  }
})

test('art: the ferry is the same both ways round', () => {
  expect(mirror(FERRY)).toEqual(FERRY)
  expect(FERRY.pixels).toHaveLength(FERRY.width * FERRY.height)
})

test('art: the ticket icon fits the Mart picture slot of 14 × 7 cells', () => {
  expect(TICKET_ICON.width).toBeLessThanOrEqual(14)
  const lines = textRows(TICKET_ICON)
  expect(lines.length).toBeLessThanOrEqual(7)
  for (const line of lines) expect(line.reduce((n, [t]) => n + [...t].length, 0)).toBeLessThanOrEqual(14)
  expect(TICKET_ICON.pixels).toHaveLength(TICKET_ICON.width * TICKET_ICON.height)
})

test('size and party: a frame is the same whatever sizes or parties were drawn before it', () => {
  const party = [solid(A, 8, 10), solid(B, 10, 12)]
  const other = [solid(C, 12, 8)]
  const cases: [number, number, Pixels[]][] = [
    [W, ROWS, party],
    [60, 12, party],
    [W, ROWS, other],
    [W, 10, party],
    [W, ROWS, []],
  ]
  for (const ms of [500, 3000, 6000]) {
    const alone = cases.map(([columns, rows, p]) => draw(ms, { columns, rows, party: p }))
    for (const _ of [1, 2])
      cases.forEach(([columns, rows, p], i) => expect(draw(ms, { columns, rows, party: p })).toEqual(alone[i]!))
  }
})

test('party: a sprite changed in place draws as it now is', () => {
  const party = [solid(A, 8, 10)]
  const before = draw(500, { party })
  party[0] = solid(D, 8, 10)
  const after = draw(500, { party })
  expect(count(stage(after), D)).toBeGreaterThan(0)
  expect(count(stage(after), A)).toBe(0)
  expect(count(stage(before), A)).toBeGreaterThan(0)
})
