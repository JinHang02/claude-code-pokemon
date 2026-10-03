import { CLEAR } from './sprite'
import type { Pixels } from './sprite'

export type Phase = 'day' | 'dusk' | 'night' | 'dawn'
export type Landscape = 'meadow' | 'hills' | 'mountains' | 'lake' | 'forest'

export const PHASES: Phase[] = ['dawn', 'day', 'dusk', 'night']
export const LANDSCAPES: Landscape[] = ['meadow', 'hills', 'mountains', 'lake', 'forest']

export const phaseAt = (hour: number): Phase =>
  hour >= 7 && hour < 17 ? 'day' : hour >= 17 && hour < 19 ? 'dusk' : hour >= 5 && hour < 7 ? 'dawn' : 'night'

const hash = (n: number) => Math.imul(n + 1, 2654435761) >>> 16

// The landscape shown during hour number `hour` (hours since the epoch, local time): a fresh pick every
// hour, the same in every session.
export const landscapeAt = (hour: number): Landscape => LANDSCAPES[hash(hour * 7919) % LANDSCAPES.length] ?? 'meadow'

type Palette = {
  sky: [number, number]
  far: number
  near: number
  snow: number
  water: [number, number]
  cloud: number
  sun: number
  grass: number[]
}

const PALETTES: Record<Phase, Palette> = {
  dawn: {
    sky: [0x2b2745, 0xc9826a],
    far: 0x5d4a6e,
    near: 0x3b5546,
    snow: 0xf0d6d0,
    water: [0x44507e, 0xf2b8a0],
    cloud: 0xe2ad9e,
    sun: 0xffd08a,
    grass: [1.05, 0.9, 0.85],
  },
  day: {
    sky: [0x1f4f80, 0x5b9bd0],
    far: 0x5f82a8,
    near: 0x35703f,
    snow: 0xf4f8ff,
    water: [0x285f94, 0xbfe3ff],
    cloud: 0xe8eef5,
    sun: 0xfff1a8,
    grass: [1, 1, 1],
  },
  dusk: {
    sky: [0x2a1b3d, 0xd8693a],
    far: 0x63395a,
    near: 0x343a35,
    snow: 0xf2bfa0,
    water: [0x46305a, 0xf59a5a],
    cloud: 0xc98272,
    sun: 0xff9a3c,
    grass: [1.1, 0.75, 0.6],
  },
  night: {
    sky: [0x05081a, 0x17223d],
    far: 0x26385c,
    near: 0x15291f,
    snow: 0x8f9cbc,
    water: [0x0e1d38, 0x7f98c8],
    cloud: 0x263252,
    sun: 0xf3f0d2,
    grass: [0.4, 0.5, 0.75],
  },
}

const GRASS = [0x3f8f3a, 0x4fa845, 0x2f7a2d]
const FLOWERS = [0xf2d24b, 0xf0f0f0, 0xe86a8a]
const STAR = [0xcfd8ff, 0x8e9ac4]
const FIREFLY = 0xd8ff6a
const MUSHROOM = 0xd9473a
const MOON_GLYPH = [0, 1, 1, 1, 1, 0, 1, 1, 0, 0, 1, 1, 1, 0, 0, 0, 1, 1, 1, 0]

const channel = (c: number, shift: number, k: number) => Math.min(255, Math.round(((c >> shift) & 0xff) * k)) << shift
const tint = (c: number, [r = 1, g = 1, b = 1]: number[]) => channel(c, 16, r) | channel(c, 8, g) | channel(c, 0, b)
const mix = (a: number, b: number, p: number) => {
  const m = (shift: number) => Math.round(((a >> shift) & 0xff) * (1 - p) + ((b >> shift) & 0xff) * p) << shift
  return m(16) | m(8) | m(0)
}

// What each pixel of the still layer is, so moving parts only land where they belong.
const SKY = 0
const WATER = 1
const LAND = 2

type Still = { pixels: number[]; kind: Uint8Array }

function set(still: Still, width: number, x: number, y: number, c: number, kind = LAND) {
  if (x < 0 || x >= width || y < 0 || y * width + x >= still.pixels.length) return
  still.pixels[y * width + x] = c
  still.kind[y * width + x] = kind
}

const sunAt = (phase: Phase, width: number, ground: number): [number, number] =>
  phase === 'day'
    ? [Math.round(width * 0.8), 3]
    : phase === 'dawn'
      ? [Math.round(width * 0.14), Math.round(ground * 0.55)]
      : [Math.round(width * 0.86), Math.round(ground * 0.55)]

function sky(still: Still, width: number, ground: number, p: Palette, phase: Phase) {
  // Down through the tuft row, so the gaps between tufts show sky.
  for (let y = 0; y <= ground; y++) {
    const c = mix(p.sky[0], p.sky[1], ground <= 1 ? 1 : Math.min(1, y / (ground - 1)))
    for (let x = 0; x < width; x++) set(still, width, x, y, c, SKY)
  }
  if (phase === 'night') {
    for (let i = 0; i < MOON_GLYPH.length; i++)
      if (MOON_GLYPH[i]) set(still, width, width - 8 + (i % 5), 1 + Math.floor(i / 5), p.sun, LAND)
    return
  }
  const [sx, sy] = sunAt(phase, width, ground)
  for (let dy = -3; dy <= 3; dy++)
    for (let dx = -3; dx <= 3; dx++) {
      const d = dx * dx + dy * dy
      const y = sy + dy
      if (y < 0 || y >= ground) continue
      if (d <= 4) set(still, width, sx + dx, y, p.sun, LAND)
      else if (d <= 10) set(still, width, sx + dx, y, mix(still.pixels[y * width + sx + dx] ?? p.sun, p.sun, 0.35), SKY)
    }
}

function fill(still: Still, width: number, x: number, top: number, bottom: number, c: number, kind = LAND) {
  for (let y = Math.max(0, Math.round(top)); y <= bottom; y++) set(still, width, x, y, c, kind)
}

function hills(still: Still, width: number, ground: number, p: Palette) {
  const h = ground
  for (let x = 0; x < width; x++) {
    const far = ground - (h * 0.42 + h * 0.13 * Math.sin(x / 9 + 1.3) + h * 0.06 * Math.sin(x / 4.1))
    fill(still, width, x, far, ground - 1, p.far)
    const near = ground - (h * 0.22 + h * 0.09 * Math.sin(x / 6.5 + 0.5))
    fill(still, width, x, near, ground - 1, p.near)
    set(still, width, x, Math.round(near), mix(p.near, 0xffffff, 0.12))
  }
}

function mountains(still: Still, width: number, ground: number, p: Palette) {
  const peaks = Math.max(2, Math.round(width / 28))
  const tops: number[] = Array<number>(width).fill(ground)
  const snowLine: number[] = Array<number>(width).fill(ground)
  for (let k = 0; k < peaks; k++) {
    const cx = ((k + 0.5) * width) / peaks + ((hash(k * 31) % 9) - 4)
    const height = ground * (0.55 + ((hash(k * 17) % 100) / 100) * 0.3)
    const half = height * 1.3
    for (let x = 0; x < width; x++) {
      const y = ground - (height - (Math.abs(x - cx) * height) / half)
      if (y < (tops[x] ?? ground)) {
        tops[x] = y
        snowLine[x] = ground - height * 0.72
      }
    }
  }
  for (let x = 0; x < width; x++) {
    const top = tops[x] ?? ground
    if (top >= ground) continue
    for (let y = Math.max(0, Math.round(top)); y < ground; y++)
      set(still, width, x, y, y < (snowLine[x] ?? 0) ? p.snow : p.far)
  }
  for (let x = 2; x < width; x += 3 + (hash(x) % 4)) {
    const tall = 3 + (hash(x * 3) % 3)
    for (let j = 0; j < tall; j++)
      for (let dx = -Math.floor(j / 2); dx <= Math.floor(j / 2); dx++)
        set(still, width, x + dx, ground - tall + j, p.near)
  }
}

function lake(still: Still, width: number, ground: number, p: Palette, phase: Phase) {
  const top = ground - Math.max(3, Math.round(ground * 0.3))
  for (let x = 0; x < width; x++) {
    const shore = top - (1 + 1.5 * (1 + Math.sin(x / 7 + 0.8)))
    fill(still, width, x, shore, top - 1, p.far)
    fill(still, width, x, top, ground - 1, p.water[0], WATER)
  }
  if (phase !== 'night') {
    const [sx] = sunAt(phase, width, ground)
    for (let y = top + 1; y < ground; y += 2)
      set(still, width, sx + ((y % 4) - 1), y, mix(p.water[0], p.sun, 0.6), WATER)
  }
  for (const x of [1, 3, width - 3, width - 5])
    for (let j = 1; j <= 3 + (x % 2); j++) set(still, width, x, ground - j, p.near)
}

function forest(still: Still, width: number, ground: number, p: Palette) {
  for (let x = 0; x < width; x += 4 + (hash(x * 5) % 3)) {
    const r = 3 + (hash(x) % 3)
    const cy = ground - r - 2 - (hash(x * 7) % 3)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r + 1) set(still, width, x + dx, cy + dy, p.far)
    fill(still, width, x, cy + r, ground - 1, mix(p.far, 0x000000, 0.35))
  }
  for (let x = 1; x < width; x += 6 + (hash(x * 11) % 5))
    for (let dx = -2; dx <= 2; dx++) set(still, width, x + dx, ground - 1, p.near)
}

function grass(still: Still, width: number, height: number, p: Palette, landscape: Landscape, phase: Phase) {
  const ground = height - 2
  for (let c = 0; c < width; c++) {
    const h = hash(c)
    set(still, width, c, height - 1, tint(GRASS[h % 3] ?? 0, p.grass))
    if (h % 3 === 0) set(still, width, c, ground, tint(GRASS[(h >> 3) % 3] ?? 0, p.grass))
    if (h % (landscape === 'meadow' ? 11 : 29) === 0)
      set(still, width, c, ground, tint(FLOWERS[(h >> 5) % 3] ?? 0, p.grass))
  }
  if (landscape === 'forest')
    for (let x = 5; x < width; x += 13 + (hash(x) % 7)) {
      const cap = phase === 'night' ? tint(MUSHROOM, p.grass) : MUSHROOM
      for (let dx = -1; dx <= 1; dx++) set(still, width, x + dx, ground - 1, cap)
      set(still, width, x, ground, 0xeeeeee)
    }
}

// The parts of a landscape that never move, built once per size, time of day and landscape.
function still(width: number, height: number, phase: Phase, landscape: Landscape): Still {
  const out: Still = { pixels: Array<number>(width * height).fill(CLEAR), kind: new Uint8Array(width * height) }
  const p = PALETTES[phase]
  const ground = height - 2
  sky(out, width, ground, p, phase)
  if (landscape === 'hills') hills(out, width, ground, p)
  if (landscape === 'mountains') mountains(out, width, ground, p)
  if (landscape === 'lake') lake(out, width, ground, p, phase)
  if (landscape === 'forest') forest(out, width, ground, p)
  grass(out, width, height, p, landscape, phase)
  return out
}

let cached: { key: string; layer: Still } | null = null

// Paints the landscape into `out` (sized to the band): the still layer, then drifting clouds, twinkling
// stars, shimmering water and fireflies at tick `t`.
export function backdrop(out: Pixels, phase: Phase, landscape: Landscape, t: number, ticksPerSecond = 20) {
  const { width, height } = out
  const key = `${width}x${height}|${phase}|${landscape}`
  if (cached?.key !== key) cached = { key, layer: still(width, height, phase, landscape) }
  const { pixels, kind } = cached.layer
  for (let i = 0; i < pixels.length; i++) out.pixels[i] = pixels[i] ?? CLEAR
  const p = PALETTES[phase]
  const ground = height - 2
  const seconds = t / ticksPerSecond
  const onSky = (x: number, y: number) => x >= 0 && x < width && y >= 0 && kind[y * width + x] === SKY

  if (phase === 'night') {
    for (let y = 0; y < ground - 2; y++)
      for (let x = 0; x < width; x++) {
        const h = hash(x * 131 + y * 7919)
        if (h % 61 === 0 && onSky(x, y) && ((h >> 4) + Math.floor(seconds / 0.7)) % 6 !== 0)
          out.pixels[y * width + x] = STAR[(h >> 9) % 2] ?? CLEAR
      }
  } else
    for (let i = 0; i < 3; i++) {
      const span = width + 16
      const x0 = Math.round((((hash(i * 97) % span) + seconds * 0.6 * (i + 1)) % span) - 8)
      const y0 = 1 + i * Math.max(2, Math.round(ground / 7))
      const rows = [4, 8, 6]
      rows.forEach((w, dy) => {
        for (let dx = 0; dx < w; dx++) {
          const x = x0 + dx + Math.floor((8 - w) / 2)
          if (onSky(x, y0 + dy)) out.pixels[(y0 + dy) * width + x] = p.cloud
        }
      })
    }

  if (landscape === 'lake') {
    const frame = Math.floor(seconds / 0.4)
    for (let i = 0; i < pixels.length; i++)
      if (kind[i] === WATER && hash(i * 13 + frame * 7) % 23 === 0) {
        const glint = mix(p.water[0], p.water[1], 0.7)
        out.pixels[i] = glint
        if (i % width < width - 1 && kind[i + 1] === WATER) out.pixels[i + 1] = glint
      }
  }

  if (phase === 'night')
    for (let i = 0; i < Math.max(1, Math.floor(width / 25)); i++) {
      if ((t + i * 23) % Math.round(ticksPerSecond * 2) > Math.round(ticksPerSecond * 1.1)) continue
      const x = Math.round(((hash(i) % 1000) / 1000) * width + 6 * Math.sin(seconds / 1.8 + i))
      const y = ground - 2 - Math.round(2 + 2 * Math.sin(seconds / 1.3 + i * 2))
      if (x >= 0 && x < width && y >= 0 && y < ground) out.pixels[y * width + x] = FIREFLY
    }
}
