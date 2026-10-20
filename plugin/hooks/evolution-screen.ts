import { DEFAULT_EVOLUTION_STYLE, EVOLUTION_STYLES } from './evolution-style'
import type { EvolutionStyle } from './evolution-style'
import { CLEAR } from './sprite'
import type { Pixels } from './sprite'

export { DEFAULT_EVOLUTION_STYLE, EVOLUTION_STYLES }
export type { EvolutionStyle }

// The full-band evolution screen, one frame at a time: a stage on top and a 3-row text box at the bottom.

export type ScreenPhase = 'intro' | 'flash' | 'burst' | 'outro' | 'hold'

const PHASES: [ScreenPhase, number][] = [
  ['intro', 1600],
  ['flash', 4600],
  ['burst', 500],
  ['outro', 2800],
  ['hold', 600],
]

export const SCREEN_MS = PHASES.reduce((sum, [, ms]) => sum + ms, 0)

// 5 rows of stage and the 3-row text box.
export const SCREEN_MIN_ROWS = 8
const BOX_ROWS = 3
// A stage this many pixels high or less has none to spare around the sprite.
const SMALL_STAGE = 12

// The text sits on the box's middle row (row `rows - 2`) from this column, with as much room on the right.
export const TEXT_COLUMN = 3
export const BOX = { fill: 0xf8f8f0, border: 0x3a4a78, margin: 0x1c1d24, text: 0x20232f }

const at = (ms: number) => {
  let t = Math.max(0, ms)
  for (const [phase, length] of PHASES) {
    if (t < length) return { phase, f: t / length, t, length }
    t -= length
  }
  return { phase: 'hold' as const, f: 1, t: 600, length: 600 }
}

export function screenPhaseAt(ms: number): { phase: ScreenPhase; f: number } {
  const { phase, f } = at(ms)
  return { phase, f }
}

// Silhouettes swap every `period` ms, the period shrinking from 420 to 40 over the flash.
const FLASH_MS = 4600
const period = (t: number) => 420 - 380 * Math.pow(Math.min(1, t / FLASH_MS), 1.6)
function swaps(t: number): number {
  let n = 0
  for (let next = period(0); next <= t; next += period(next)) n++
  return n
}

const mix = (a: number, b: number, p: number) => {
  const m = (shift: number) => Math.round(((a >> shift) & 0xff) * (1 - p) + ((b >> shift) & 0xff) * p) << shift
  return m(16) | m(8) | m(0)
}

// Nearest-neighbour, so a scaled sprite keeps its own colours; never scales up.
function fitInto(img: Pixels, maxWidth: number, maxHeight: number): Pixels {
  const s = Math.min(1, maxHeight / img.height, maxWidth / img.width)
  if (s >= 1) return img
  const width = Math.max(1, Math.round(img.width * s))
  const height = Math.max(1, Math.round(img.height * s))
  const pixels: number[] = []
  for (let y = 0; y < height; y++) {
    const sy = Math.min(img.height - 1, Math.floor(((y + 0.5) * img.height) / height))
    for (let x = 0; x < width; x++) {
      const sx = Math.min(img.width - 1, Math.floor(((x + 0.5) * img.width) / width))
      pixels.push(img.pixels[sy * img.width + sx] ?? CLEAR)
    }
  }
  return { pixels, width, height }
}

const chars = (s: string) => [...s]

// The first wording that fits; if none does, the last one with its start cut, keeping the end (the new name).
function fitFirst(options: string[], room: number): string {
  const fits = options.find(s => chars(s).length <= room)
  if (fits !== undefined) return fits
  const all = chars(options[options.length - 1] ?? '')
  return room <= 0 ? '' : '…' + all.slice(all.length - room + 1).join('')
}

// Types the message out so it is complete before 85% of the phase, however long the names.
function typed(s: string, t: number, length: number, msPerChar: number): string {
  const all = chars(s)
  const per = Math.min(msPerChar, (length * 0.85) / Math.max(1, all.length))
  return all.slice(0, Math.floor(t / per)).join('')
}

type Spark = { x: number; y: number; v: number; ph: number }

// Seeded on the band's size alone, so sparkles keep their places from frame to frame and only twinkle or rise.
function sparks(columns: number, height: number): Spark[] {
  let seed = (Math.imul(columns, 7919) + Math.imul(height, 104729) + 97) >>> 0
  const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296
  const n = Math.max(4, Math.round((26 * columns * height) / (150 * 22)))
  return Array.from({ length: n }, () => ({
    x: rand() * columns,
    y: rand() * height,
    v: 0.6 + rand() * 1.4,
    ph: rand() * 6.28,
  }))
}

function background(out: number[], style: EvolutionStyle, columns: number, height: number, ms: number) {
  const set = (x: number, y: number, c: number) => {
    if (x >= 0 && x < columns && y >= 0 && y < height) out[y * columns + x] = c
  }
  if (style === 'white') {
    out.fill(0xf8f8f0, 0, columns * height)
    return
  }
  if (style === 'gradient') {
    for (let y = 0; y < height; y++) {
      const c = mix(0x4e78d6, 0x965ac8, height <= 1 ? 0 : y / (height - 1))
      out.fill(c, y * columns, (y + 1) * columns)
    }
    for (const s of sparks(columns, height)) {
      const y = (((s.y - (ms / 1000) * s.v * 3) % height) + height) % height
      set(Math.floor(s.x), Math.floor(y), Math.sin(ms / 200 + s.ph) > 0 ? 0xffffff : 0xffe9a8)
    }
    return
  }
  // Rays: 14 alternating wedges turning about the stage's centre, lighter towards the middle.
  const [cx, cy, n, turn] = [columns / 2, height / 2, 14, ms / 3000]
  const [near, mid] = [(height * 5) / 22, (height * 9) / 22]
  for (let y = 0; y < height; y++)
    for (let x = 0; x < columns; x++) {
      const a = Math.atan2((y - cy) * 2.2, x - cx) + turn
      const k = Math.floor((((a / (Math.PI * 2)) * n) % n) + n) % n
      const d = Math.hypot((x - cx) / 3, y - cy)
      out[y * columns + x] = k % 2 ? 0x0d0e1c : d < near ? 0x2a2e5a : d < mid ? 0x1d2047 : 0x161834
    }
  for (const s of sparks(columns, height)) {
    const glow = (Math.sin(ms / 260 + s.ph) + 1) / 2
    if (glow > 0.55) set(Math.floor(s.x), Math.floor(s.y), glow > 0.85 ? 0xffffff : 0x9fb3ff)
  }
}

function textBox(out: number[], columns: number, top: number, rows: number) {
  for (let r = 0; r < rows * 2; r++) {
    const edge = r === 1 || r === rows * 2 - 2
    const inner = r > 1 && r < rows * 2 - 2
    for (let x = 0; x < columns; x++) {
      const side = x === 0 || x === columns - 1
      const frame = x === 1 || x === columns - 2
      out[(top + r) * columns + x] =
        r === 0 || r === rows * 2 - 1 || side ? BOX.margin : edge || (inner && frame) ? BOX.border : BOX.fill
    }
  }
}

export function evolutionFrame(o: {
  style: EvolutionStyle
  ms: number
  from: Pixels
  to: Pixels
  fromName: string
  toName: string
  // The band's size in cells; the image is `rows * 2` pixels high.
  columns: number
  rows: number
}): { img: Pixels; text: string } {
  const columns = Math.max(0, Math.floor(o.columns))
  const rows = Math.max(0, Math.floor(o.rows))
  const boxRows = Math.min(BOX_ROWS, rows)
  const height = (rows - boxRows) * 2
  const pixels = Array<number>(columns * rows * 2).fill(BOX.margin)
  const now = at(o.ms)
  background(pixels, o.style, columns, height, o.ms)

  // Both sprites share a baseline, the pair centred in the stage with a pixel to spare above and below; a small
  // stage gives the sprite every pixel it has.
  const room = Math.max(1, height <= SMALL_STAGE ? height : height - 2)
  const from = fitInto(o.from, columns, room)
  const to = fitInto(o.to, columns, room)
  const baseline = Math.floor((height + Math.max(from.height, to.height)) / 2)
  const paint = (img: Pixels, tint?: number) => {
    const x0 = Math.round(columns / 2 - img.width / 2)
    const y0 = baseline - img.height
    for (let y = 0; y < img.height; y++)
      for (let x = 0; x < img.width; x++) {
        const c = img.pixels[y * img.width + x] ?? CLEAR
        const [px, py] = [x0 + x, y0 + y]
        if (c === CLEAR || px < 0 || px >= columns || py < 0 || py >= height) continue
        pixels[py * columns + px] = tint ?? c
      }
  }
  const silhouette = o.style === 'white' ? 0x30303a : 0xffffff
  if (now.phase === 'intro') paint(from)
  else if (now.phase === 'flash') paint(swaps(now.t) % 2 ? to : from, silhouette)
  else if (now.phase === 'burst') {
    paint(to, silhouette)
    // An ellipse of light from the sprite's middle, growing past the stage's corners as it fades. White light
    // doesn't show on the off-white stage: there it is a pale blue with a darker ring at its edge.
    const [cx, cy] = [columns / 2, baseline - to.height / 2]
    const r = 4 + now.f * Math.max(columns / 2, height * 2)
    // From its first frame the ellipse is at least as big as the one through the sprite's corners (the box's
    // half-sides times root 2), so no part of the silhouette is left outside the light.
    const [rx, ry] = [Math.max(r, (to.width / 2) * Math.SQRT2 + 1), Math.max(r / 2, (to.height / 2) * Math.SQRT2 + 1)]
    const strength = 1 - now.f * 0.6
    const [light, ring] = o.style === 'white' ? [0xd4e4fc, 0x7890c0] : [0xffffff, 0xffffff]
    for (let y = 0; y < height; y++)
      for (let x = 0; x < columns; x++) {
        const d = Math.sqrt(((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2)
        if (d > 1) continue
        const edge = d * rx > rx - 2
        pixels[y * columns + x] = mix(pixels[y * columns + x] ?? 0, edge ? ring : light, strength)
      }
  } else paint(to)

  if (boxRows > 0) textBox(pixels, columns, height, boxRows)

  const roomForText = columns - 2 * TEXT_COLUMN
  const [a, b] = [o.fromName.toUpperCase(), o.toName.toUpperCase()]
  const evolving = fitFirst([`What? ${a} is evolving!`, `${a} is evolving!`], roomForText)
  // A narrow band drops words from the front, so the new form's name is the last thing to go.
  const evolved = fitFirst(
    [`Congratulations! Your ${a} evolved into ${b}!`, `${a} evolved into ${b}!`, `${a} → ${b}!`, `${a}→${b}!`],
    roomForText,
  )
  const text =
    now.phase === 'intro'
      ? typed(evolving, now.t, now.length, 45)
      : now.phase === 'outro'
        ? typed(evolved, now.t, now.length, 40)
        : now.phase === 'hold'
          ? evolved
          : evolving
  return { img: { pixels, width: columns, height: rows * 2 }, text }
}
