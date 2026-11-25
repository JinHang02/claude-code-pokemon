// The ferry crossing between regions: FERRY_MS, FERRY_ROWS, FERRY_MIN_ROWS, FERRY_MIN_COLUMNS, SAILED_MS; FerryBeat
// and beatAt; ferryFrame; the art FERRY, pier and TICKET_ICON.
import { BOX, textBox } from './evolution-screen'
import type { TravelRegion } from './travel-regions'
import { MAX_PARTY } from './save'
import { CLEAR, mirror, resample } from './sprite'
import type { Pixels } from './sprite'

export const FERRY_MS = 7_700
export const FERRY_ROWS = 18
export const FERRY_MIN_ROWS = 10
export const FERRY_MIN_COLUMNS = 40
export const SAILED_MS = 2_500

export type FerryBeat = 'docked' | 'boarding' | 'sailing' | 'docking' | 'leaving' | 'welcome'

const BEATS: readonly (readonly [FerryBeat, number])[] = [
  ['docked', 0],
  ['boarding', 300],
  ['sailing', 2400],
  ['docking', 4100],
  ['leaving', 5300],
  ['welcome', 7400],
]
const BOARDING_MS = 300
const SAILING_MS = 2400
const UNMOORED_MS = 2900
const DOCKING_MS = 4100
const LEAVING_MS = 5300
const CROSSING_MS = 1200
const MEMBER_GAP_MS = 300
const WALK_MS = 1200

const BOX_ROWS = 3
const PIER_PX = 22

/** The beat playing `ms` into the crossing; negative or NaN ms is docked, and the welcome holds after FERRY_MS. */
export function beatAt(ms: number): FerryBeat {
  const t = ms > 0 ? ms : 0
  let beat: FerryBeat = 'docked'
  for (const [name, start] of BEATS) if (t >= start) beat = name
  return beat
}

// ── Art ──

const SKY = 0x9ad0f5
const WATER = 0x2f74c0
const RIPPLE = 0x5c9be0
const WIPE = 0xffffff
const PAINT = 0xf0f0e8
const WINDOW = 0x3a6ea5
const FUNNEL_TOP = 0x2a2d34
const FUNNEL = 0xd8483c
const RAIL = 0x8a8f99
const HULL = 0x24407a
const KEEL = 0xa83232
const SAND = 0xd8c08a
const GRASS = 0x5ca04a
const WOOD = 0x8a5a2c
const WOOD_DARK = 0x6a4020
const POLE = 0xc8c8c8
const FLAG_FALLBACK = 0xf8f8f0
const TICKET_PAPER = 0xf4ead0
const TICKET_EDGE = 0xc0a060
const STAR = 0xf2c230

const canvas = (width: number, height: number): Pixels => ({
  pixels: Array<number>(width * height).fill(CLEAR),
  width,
  height,
})

function rect(c: Pixels, x0: number, y0: number, x1: number, y1: number, color: number): void {
  for (let y = Math.max(0, y0); y <= Math.min(c.height - 1, y1); y++)
    for (let x = Math.max(0, x0); x <= Math.min(c.width - 1, x1); x++) c.pixels[y * c.width + x] = color
}

function drawFerry(): Pixels {
  const c = canvas(62, 27)
  rect(c, 28, 0, 33, 1, FUNNEL_TOP)
  rect(c, 28, 2, 33, 6, FUNNEL)
  rect(c, 20, 7, 41, 11, PAINT)
  for (let x = 23; x <= 38; x += 3) rect(c, x, 9, x, 9, WINDOW)
  rect(c, 12, 12, 49, 16, PAINT)
  for (let x = 14; x <= 47; x += 3) rect(c, x, 14, x, 14, WINDOW)
  rect(c, 4, 17, 57, 17, RAIL)
  for (let y = 18; y <= 26; y++) {
    const inset = Math.floor((y - 18) / 2)
    rect(c, inset, y, 61 - inset, y, y <= 21 ? HULL : y === 22 ? PAINT : KEEL)
  }
  return c
}

/** The double-ended ferry, 62 × 27 px. */
export const FERRY: Pixels = drawFerry()

const readColor = (color: string): number =>
  /^#[0-9a-f]{6}$/i.test(color) ? parseInt(color.slice(1), 16) : FLAG_FALLBACK

/** The shore and pier, 22 × 26 px, with a flag in `color` (`#rrggbb`; anything else gives a white flag). */
export function pier(color: string): Pixels {
  const c = canvas(PIER_PX, 26)
  rect(c, 0, 15, 7, 25, SAND)
  rect(c, 0, 15, 7, 15, GRASS)
  rect(c, 8, 15, 21, 15, WOOD)
  rect(c, 8, 16, 21, 16, WOOD_DARK)
  rect(c, 11, 17, 12, 25, WOOD_DARK)
  rect(c, 18, 17, 19, 25, WOOD_DARK)
  rect(c, 3, 0, 3, 14, POLE)
  rect(c, 4, 0, 11, 4, readColor(color))
  return c
}

function drawTicket(): Pixels {
  const c = canvas(14, 10)
  rect(c, 0, 0, 13, 9, TICKET_EDGE)
  rect(c, 1, 1, 12, 8, TICKET_PAPER)
  for (let y = 1; y <= 8; y += 2) rect(c, 4, y, 4, y, TICKET_EDGE)
  rect(c, 2, 4, 2, 5, STAR)
  rect(c, 5, 1, 12, 2, FUNNEL)
  rect(c, 8, 4, 8, 5, FUNNEL)
  rect(c, 6, 6, 11, 6, HULL)
  rect(c, 7, 7, 10, 7, HULL)
  return c
}

/** The ferry ticket picture for the Mart, 14 × 10 px (14 × 5 cells). */
export const TICKET_ICON: Pixels = drawTicket()

// ── Stage ──

const STAGE_PX = 30
const SCENE_PX = 92
const FERRY_TOP = 1
const PIER_TOP = 4
const WATER_TOP = 22
const FEET = 18
const MEMBER_PX = 12
const SLOT_PX = 14
const SEATS: readonly number[] = [44, 26, 8]

type Layout = { s: number; columns: number; height: number; dy: number; ferry: Pixels; pier: (c: string) => Pixels }

let lastLayout: Layout | null = null

function layoutOf(columns: number, height: number): Layout {
  if (lastLayout?.columns === columns && lastLayout.height === height) return lastLayout
  const s = Math.max(0, Math.min(1, height / STAGE_PX, columns / SCENE_PX))
  const piers = new Map<string, Pixels>()
  const pierOf = (color: string): Pixels => {
    const drawn = piers.get(color) ?? resample(pier(color), s)
    piers.set(color, drawn)
    return drawn
  }
  lastLayout = {
    s,
    columns,
    height,
    dy: height - Math.round(STAGE_PX * s),
    ferry: resample(FERRY, s),
    pier: pierOf,
  }
  return lastLayout
}

const at = (l: Layout, y: number) => l.dy + Math.round(y * l.s)
const dockX = (l: Layout) => Math.round(PIER_PX * l.s)

function paint(out: number[], l: Layout, img: Pixels, x0: number, y0: number): void {
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++) {
      const c = img.pixels[y * img.width + x] ?? CLEAR
      const [px, py] = [x0 + x, y0 + y]
      if (c === CLEAR || px < 0 || px >= l.columns || py < 0 || py >= l.height) continue
      out[py * l.columns + px] = c
    }
}

/** The departure-side picture: sky, water, the pier on the left with `region`'s flag and the ferry at `ferryX`. */
function backdrop(l: Layout, region: TravelRegion, ferryX: number | null): Pixels {
  const pixels = Array<number>(l.columns * l.height).fill(SKY)
  const waterTop = at(l, WATER_TOP)
  for (let y = Math.max(0, waterTop); y < l.height; y++)
    pixels.fill(y === waterTop ? RIPPLE : WATER, y * l.columns, (y + 1) * l.columns)
  paint(pixels, l, l.pier(region.color), 0, at(l, PIER_TOP))
  if (ferryX !== null) paint(pixels, l, l.ferry, ferryX, at(l, FERRY_TOP))
  return { pixels, width: l.columns, height: l.height }
}

/** The ferry's left edge in departure-side columns, `ms` into the crossing. */
function ferryXAt(l: Layout, ms: number): number {
  const dock = dockX(l)
  const out = (f: number) => Math.round(dock + Math.min(1, Math.max(0, f)) * (l.columns - dock))
  if (ms < UNMOORED_MS) return dock
  if (ms < DOCKING_MS) return out((ms - UNMOORED_MS) / CROSSING_MS)
  return out(1 - (ms - DOCKING_MS) / CROSSING_MS)
}

/** The wipe line's column during the sailing beat; -1 before it enters. */
function wipeXAt(l: Layout, ms: number): number {
  const dock = dockX(l)
  if (ms < UNMOORED_MS) return Math.round(-1 + ((ms - SAILING_MS) / (UNMOORED_MS - SAILING_MS)) * dock)
  return ferryXAt(l, ms) - 1
}

const progress = (ms: number, start: number) => Math.min(1, Math.max(0, (ms - start) / WALK_MS))

/** Party sprites fitted to a deck slot, facing right (PokeAPI front sprites face left). */
let lastMembers: { l: Layout; party: Pixels[]; fitted: Pixels[] } | null = null

function members(l: Layout, party: Pixels[]): Pixels[] {
  const shown = party.slice(0, MAX_PARTY)
  const isSame =
    lastMembers?.l === l &&
    lastMembers.party.length === shown.length &&
    shown.every((p, i) => lastMembers?.party[i] === p)
  if (isSame && lastMembers) return lastMembers.fitted
  const [h, w] = [MEMBER_PX * l.s, SLOT_PX * l.s]
  const fitted = shown.map(p => mirror(resample(p, Math.min(1, h / p.height, w / p.width))))
  lastMembers = { l, party: shown, fitted }
  return fitted
}

function drawParty(out: number[], l: Layout, ms: number, party: Pixels[], ferryLeft: number, isArrival: boolean) {
  const feet = at(l, FEET)
  members(l, party).forEach((m, i) => {
    const seat = ferryLeft + Math.round((SEATS[i] ?? 0) * l.s) + Math.floor((Math.round(SLOT_PX * l.s) - m.width) / 2)
    const x = isArrival
      ? seat + progress(ms, LEAVING_MS + i * MEMBER_GAP_MS) * (l.columns - seat)
      : -m.width + progress(ms, BOARDING_MS + i * MEMBER_GAP_MS) * (seat + m.width)
    paint(out, l, m, Math.round(x), feet - m.height + 1)
  })
}

function stage(l: Layout, ms: number, from: TravelRegion, to: TravelRegion, party: Pixels[]): number[] {
  const ferryX = ferryXAt(l, ms)
  if (ms >= DOCKING_MS) {
    const out = mirror(backdrop(l, to, ferryX)).pixels
    drawParty(out, l, ms, party, l.columns - ferryX - l.ferry.width, true)
    return out
  }
  const out = backdrop(l, from, ferryX).pixels
  drawParty(out, l, ms, party, ferryX, false)
  if (ms < SAILING_MS) return out
  const wipe = wipeXAt(l, ms)
  const arrival = mirror(backdrop(l, to, null)).pixels
  for (let y = 0; y < l.height; y++)
    for (let x = 0; x <= Math.min(wipe, l.columns - 1); x++)
      out[y * l.columns + x] = x === wipe ? WIPE : (arrival[y * l.columns + x] ?? SKY)
  return out
}

function textAt(beat: FerryBeat, to: TravelRegion): string {
  if (beat === 'docked' || beat === 'boarding') return 'Your party is boarding…'
  if (beat === 'welcome') return `Welcome to ${to.name.toUpperCase()}!`
  return `Sailing to ${to.name}…`
}

/**
 * One frame of the crossing.
 * @param o.ms time into the crossing; negative is docked, past FERRY_MS holds the welcome
 * @param o.from the region sailed from; o.to the region sailed to
 * @param o.party the party's sprites, up to MAX_PARTY drawn
 * @param o.columns, o.rows the band's size in cells
 * @returns img `columns` × `rows * 2` px: the stage above a 3-row text box; text the box's message
 */
export function ferryFrame(o: {
  ms: number
  from: TravelRegion
  to: TravelRegion
  party: Pixels[]
  columns: number
  rows: number
}): { img: Pixels; text: string } {
  const columns = Math.max(0, Math.floor(o.columns))
  const rows = Math.max(0, Math.floor(o.rows))
  const ms = Math.min(o.ms > 0 ? o.ms : 0, FERRY_MS)
  const boxRows = Math.min(BOX_ROWS, rows)
  const height = (rows - boxRows) * 2
  const pixels = Array<number>(columns * rows * 2).fill(BOX.margin)
  if (height > 0 && columns > 0) {
    const drawn = stage(layoutOf(columns, height), ms, o.from, o.to, o.party)
    for (let i = 0; i < drawn.length; i++) pixels[i] = drawn[i] ?? SKY
  }
  if (boxRows > 0) textBox(pixels, columns, height, boxRows)
  return { img: { pixels, width: columns, height: rows * 2 }, text: textAt(beatAt(ms), o.to) }
}
