import { expect, test } from 'claude-code/testing'

import {
  BOX,
  EVOLUTION_STYLES,
  evolutionFrame,
  SCREEN_MIN_ROWS,
  SCREEN_MS,
  screenPhaseAt,
  TEXT_COLUMN,
} from '../hooks/evolution-screen'
import type { EvolutionStyle } from '../hooks/evolution-screen'

type Img = { pixels: number[]; width: number; height: number }

const FROM_C = 0xabcdef
const TO_C = 0x123456
const FROM: Img = { pixels: Array<number>(64).fill(FROM_C), width: 8, height: 8 }
const TO: Img = { pixels: Array<number>(120).fill(TO_C), width: 10, height: 12 }
const W = 60
const ROWS = 12
const STAGE = (ROWS - 3) * 2

// Sample times: one in each phase.
const AT = { intro: 1200, flash: 3000, burst: 6400, outro: 8000, hold: 9800 }

const draw = (style: EvolutionStyle, ms: number, o: Partial<Parameters<typeof evolutionFrame>[0]> = {}) =>
  evolutionFrame({ style, ms, from: FROM, to: TO, fromName: 'Eevee', toName: 'Espeon', columns: W, rows: ROWS, ...o })
const at = (img: Img, x: number, y: number) => img.pixels[y * img.width + x] ?? -2
const stage = (img: Img) => img.pixels.slice(0, STAGE * img.width)
const count = (px: number[], c: number) => px.filter(p => p === c).length
const rgb = (c: number) => [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff] as const
const light = (c: number) => rgb(c).every(v => v >= 0xc0)
const brightness = (c: number) => rgb(c).reduce((a, b) => a + b, 0)
const mode = (px: number[]) => {
  const seen = new Map<number, number>()
  for (const p of px) seen.set(p, (seen.get(p) ?? 0) + 1)
  return [...seen].sort((a, b) => b[1] - a[1])[0]![0]
}
// The rows of the taller `to` sprite above where the shorter `from` reaches: all silhouette when `to` shows.
const showsTo = (img: Img, tint: number) => {
  let n = 0
  for (let y = 0; y < STAGE; y++)
    for (let x = W / 2 - 5; x < W / 2 + 5; x++) if (at(img, x, y) === tint && y < STAGE / 2 - 2) n++
  return n >= 30
}

test('a ten-second sequence in five phases', () => {
  expect(SCREEN_MS).toBe(10_100)
  expect(SCREEN_MIN_ROWS).toBe(8)
  expect(EVOLUTION_STYLES).toEqual(['rays', 'white', 'gradient'])
  expect(screenPhaseAt(0)).toEqual({ phase: 'intro', f: 0 })
  expect(screenPhaseAt(800)).toEqual({ phase: 'intro', f: 0.5 })
  expect(screenPhaseAt(1600).phase).toBe('flash')
  expect(screenPhaseAt(6200).phase).toBe('burst')
  expect(screenPhaseAt(6700).phase).toBe('outro')
  expect(screenPhaseAt(9500).phase).toBe('hold')
  expect(screenPhaseAt(20_000)).toEqual({ phase: 'hold', f: 1 })
  for (const [phase, ms] of Object.entries(AT)) expect(screenPhaseAt(ms).phase).toBe(phase)
})

test('the frame covers the whole band, every pixel painted', () => {
  for (const style of EVOLUTION_STYLES)
    for (const ms of Object.values(AT)) {
      const { img } = draw(style, ms)
      expect([img.width, img.height]).toEqual([W, ROWS * 2])
      expect(img.pixels.length).toBe(W * ROWS * 2)
      expect(img.pixels.every(p => p >= 0)).toBe(true)
    }
})

test('each style has its own stage: dark with rays, off-white, or blue into purple', () => {
  const rays = stage(draw('rays', AT.intro).img)
  expect(count(rays, 0x0d0e1c)).toBeGreaterThan(50)
  expect(rays.filter(c => [0x161834, 0x1d2047, 0x2a2e5a].includes(c)).length).toBeGreaterThan(50)
  expect(rays.filter(c => brightness(c) < 0x60 * 3).length).toBeGreaterThan(rays.length * 0.8)

  const white = stage(draw('white', AT.intro).img)
  expect(white.every(c => c === 0xf8f8f0 || c === FROM_C)).toBe(true)

  const { img } = draw('gradient', AT.intro)
  const row = (y: number) => mode(img.pixels.slice(y * W, (y + 1) * W))
  const blueness = (c: number) => rgb(c)[2] - rgb(c)[0]
  expect(blueness(row(0))).toBeGreaterThan(blueness(row(STAGE - 1)) + 40)
  expect(rgb(row(STAGE - 1))[0]).toBeGreaterThan(rgb(row(0))[0])
})

test('the intro shows the old Pokémon in colour, the outro and hold the new one', () => {
  for (const style of EVOLUTION_STYLES) {
    const intro = stage(draw(style, AT.intro).img)
    expect(count(intro, FROM_C)).toBe(64)
    expect(count(intro, TO_C)).toBe(0)
    for (const ms of [AT.outro, AT.hold]) {
      const outro = stage(draw(style, ms).img)
      expect(count(outro, TO_C)).toBe(120)
      expect(count(outro, FROM_C)).toBe(0)
    }
  }
})

test('the flash shows silhouettes, white on rays and gradient and dark on white', () => {
  const tints: Record<EvolutionStyle, number> = { rays: 0xffffff, white: 0x30303a, gradient: 0xffffff }
  for (const style of EVOLUTION_STYLES) {
    const { img } = draw(style, AT.flash)
    const px = stage(img)
    expect(count(px, FROM_C) + count(px, TO_C)).toBe(0)
    // The middle of either sprite is silhouette.
    expect(at(img, W / 2, STAGE / 2 + 2)).toBe(tints[style])
    expect(count(px, tints[style])).toBeGreaterThanOrEqual(64)
  }
})

test('the silhouettes swap faster and faster, starting from the old Pokémon', () => {
  const start = 1600
  const end = start + 4600
  const shown = (ms: number) => showsTo(draw('white', ms).img, 0x30303a)
  const swaps = (from: number) => {
    let n = 0
    for (let ms = from + 5; ms < from + 200; ms += 5) if (shown(ms) !== shown(ms - 5)) n++
    return n
  }
  expect(shown(start)).toBe(false)
  expect(swaps(start)).toBeLessThanOrEqual(1)
  expect(swaps(end - 200)).toBeGreaterThanOrEqual(3)
  expect(swaps(end - 200)).toBeGreaterThan(swaps(start + 200))
})

test('the burst lights up the Pokémon’s middle and spreads', () => {
  for (const style of EVOLUTION_STYLES) {
    const { img } = draw(style, 6250)
    expect(light(at(img, W / 2, STAGE / 2 + 2))).toBe(true)
    const late = draw(style, 6650).img
    const flash = draw(style, 6150).img
    // By the end the light has reached the corners of the stage.
    const top = (img: Img) => img.pixels.slice(0, W).reduce((a, c) => a + brightness(c), 0)
    expect(top(late)).toBeGreaterThan(top(flash))
  }
  expect(at(draw('white', 6150).img, W / 2, STAGE / 2 + 2)).toBe(0x30303a)
})

test('the text box fills the bottom three rows in the box colours', () => {
  const colours = new Set([BOX.fill, BOX.border, BOX.margin])
  for (const style of EVOLUTION_STYLES)
    for (const ms of Object.values(AT)) {
      const { img } = draw(style, ms)
      const box = img.pixels.slice(STAGE * W)
      expect(box.length).toBe(6 * W)
      expect(box.every(c => colours.has(c))).toBe(true)
      // The text's row is plain box fill from the text column to the far side.
      for (const y of [STAGE + 2, STAGE + 3])
        for (let x = TEXT_COLUMN; x < W - TEXT_COLUMN; x++) expect(at(img, x, y)).toBe(BOX.fill)
    }
})

test('the messages type out in the intro and the outro, names in capitals', () => {
  const intro = 'What? EEVEE is evolving!'
  const outro = 'Congratulations! Your EEVEE evolved into ESPEON!'
  const text = (ms: number) => draw('rays', ms).text
  expect(text(0)).toBe('')
  const typed = [100, 300, 600, 900].map(text)
  for (let i = 1; i < typed.length; i++) {
    expect(typed[i]!.length).toBeGreaterThan(typed[i - 1]!.length)
    expect(intro.startsWith(typed[i]!)).toBe(true)
  }
  expect(text(1599)).toBe(intro)
  expect(text(AT.flash)).toBe(intro)
  expect(text(AT.burst)).toBe(intro)
  expect(text(6700)).toBe('')
  const later = [6900, 7300, 7800].map(text)
  for (let i = 1; i < later.length; i++) {
    expect(later[i]!.length).toBeGreaterThan(later[i - 1]!.length)
    expect(outro.startsWith(later[i]!)).toBe(true)
  }
  expect(text(9499)).toBe(outro)
  expect(text(AT.hold)).toBe(outro)
  expect(text(SCREEN_MS)).toBe(outro)
  // A long name still finishes typing before its phase ends.
  const long = draw('rays', 9499, { fromName: 'Alolan Ninetales', toName: 'Alolan Ninetales', columns: 100 }).text
  expect(long).toBe('Congratulations! Your ALOLAN NINETALES evolved into ALOLAN NINETALES!')
})

test('a narrow band cuts the message with an ellipsis', () => {
  const { text } = draw('white', AT.hold, { columns: 40 })
  expect([...text].length).toBe(40 - 2 * TEXT_COLUMN)
  expect(text.endsWith('…')).toBe(true)
  expect(text.startsWith('Congratulations! Your EEVEE')).toBe(true)
  expect(draw('white', AT.flash, { columns: 40 }).text).toBe('What? EEVEE is evolving!')
  // Cut first, then typed: the typed part is always a prefix of what will be shown.
  const half = draw('white', 7300, { columns: 40 }).text
  expect(text.startsWith(half)).toBe(true)
})

test('a tall sprite shrinks to fit a five-row stage, nearest-neighbour and keeping its shape', () => {
  const pixels: number[] = []
  for (let y = 0; y < 29; y++) for (let x = 0; x < 35; x++) pixels.push((x + y) % 2 ? TO_C : 0x654321)
  const tall: Img = { pixels, width: 35, height: 29 }
  const { img } = evolutionFrame({
    style: 'white',
    ms: AT.hold,
    from: FROM,
    to: tall,
    fromName: 'Eevee',
    toName: 'Espeon',
    columns: W,
    rows: SCREEN_MIN_ROWS,
  })
  const stageH = (SCREEN_MIN_ROWS - 3) * 2
  let [x0, y0, x1, y1] = [W, img.height, -1, -1]
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < W; x++) {
      const c = at(img, x, y)
      if (c !== TO_C && c !== 0x654321) continue
      ;[x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)]
    }
  const [w, h] = [x1 - x0 + 1, y1 - y0 + 1]
  expect(y0).toBeGreaterThanOrEqual(0)
  expect(y1).toBeLessThan(stageH)
  expect(h).toBeGreaterThan(stageH / 2)
  expect(Math.abs(w / h - 35 / 29)).toBeLessThan(0.15)
  // Centred across the band.
  expect(Math.abs(x0 + w / 2 - W / 2)).toBeLessThanOrEqual(1)
  // Nearest-neighbour: only the sprite's own colours, nothing blended.
  const inside = img.pixels.filter((_, i) => i % W >= x0 && i % W <= x1 && i >= y0 * W && i < (y1 + 1) * W)
  expect(inside.every(c => c === TO_C || c === 0x654321 || c === 0xf8f8f0)).toBe(true)
})

test('the same input draws the same frame; sparkles and rays move with time', () => {
  for (const style of EVOLUTION_STYLES)
    for (const ms of Object.values(AT)) expect(draw(style, ms).img.pixels).toEqual(draw(style, ms).img.pixels)
  expect(draw('rays', 1000).img.pixels).not.toEqual(draw('rays', 1300).img.pixels)
  expect(draw('gradient', 1000).img.pixels).not.toEqual(draw('gradient', 1300).img.pixels)
  // Sparkles are there at all on the two styles that have them.
  expect(stage(draw('gradient', AT.intro).img).some(c => c === 0xffffff || c === 0xffe9a8)).toBe(true)
  expect(stage(draw('rays', AT.intro).img).some(c => c === 0xffffff || c === 0x9fb3ff)).toBe(true)
})

test('a band shorter than the minimum still draws without breaking', () => {
  for (const rows of [0, 1, 3, 5])
    for (const style of EVOLUTION_STYLES) {
      const { img } = draw(style, AT.flash, { rows, columns: 5 })
      expect(img.pixels.length).toBe(5 * rows * 2)
    }
})
