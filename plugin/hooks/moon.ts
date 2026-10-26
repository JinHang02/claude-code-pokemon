// The real moon: its phase on any date, worked out from the clock (no network), its shape in the night sky, and the
// visitors that only come at dusk or under a full moon.
import type { Phase } from './backdrop'
import type { Pick, Species } from './lookup'

// Days from one new moon to the next, on average, and one new moon to count from (2000-01-06 18:14 UTC).
export const SYNODIC_DAYS = 29.530588853
const NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14)
const DAY_MS = 86_400_000

// The moon's eight shapes, in order from one new moon to the next: index 4 is the full moon.
export const MOON_PHASES = [
  'new moon',
  'waxing crescent',
  'first quarter',
  'waxing gibbous',
  'full moon',
  'waning gibbous',
  'last quarter',
  'waning crescent',
] as const
export const NEW_MOON = 0
export const FULL_MOON = 4

// Days since the last new moon at `ms`, 0 up to SYNODIC_DAYS. The mean month drifts from the real one by up to
// about half a day, which is fine for a picture and a ±1 day full moon.
export const moonAge = (ms: number) => ((((ms - NEW_MOON_MS) / DAY_MS) % SYNODIC_DAYS) + SYNODIC_DAYS) % SYNODIC_DAYS

// Which of the eight shapes the moon has at `ms`: the nearest one.
export const moonPhaseAt = (ms: number) => Math.round((moonAge(ms) / SYNODIC_DAYS) * 8) % 8

// Whether `ms` is within a day of the full moon, as the games' full-moon evolution (Ursaluna) asks.
export const isFullMoonAt = (ms: number) => Math.abs(moonAge(ms) - SYNODIC_DAYS / 2) <= 1

// The words `/pokemon-play … moon` takes before `moon`, and the shape each shows.
export const MOON_WORDS: Record<string, number> = { new: 0, crescent: 1, half: 2, quarter: 2, gibbous: 3, full: 4 }

// The moon's disc, 7 pixels across (a pixel is about square: half a terminal cell).
const RADIUS = 3.5
export const MOON_SIZE = 7

export type MoonPixel = { x: number; y: number; isLit: boolean }

// Where in the month each shape is drawn as: the crescents a little fatter and the gibbous moons a little thinner than
// their middle day, or seven pixels across would show a crescent as one column and a gibbous moon as nearly full.
const DRAWN_AT = [0, 0.18, 0.25, 0.32, 0.5, 0.68, 0.75, 0.82]

// Each shape's pixels, worked out once: the lit part's edge is an ellipse across the disc, on the right while the
// moon waxes and on the left while it wanes, as seen from the northern hemisphere. The rest of the disc is drawn
// faint (earthshine), so even a new moon is a dim outline.
const shapes: MoonPixel[][] = []
export function moonShape(phase: number): MoonPixel[] {
  const index = ((Math.round(phase) % 8) + 8) % 8
  const known = shapes[index]
  if (known) return known
  // Rounded, so both quarters light the middle column alike.
  const cos = Math.round(Math.cos((DRAWN_AT[index] ?? 0) * 2 * Math.PI) * 1e9) / 1e9
  const out: MoonPixel[] = []
  for (let y = 0; y < MOON_SIZE; y++)
    for (let x = 0; x < MOON_SIZE; x++) {
      const dx = x - (MOON_SIZE - 1) / 2
      const dy = y - (MOON_SIZE - 1) / 2
      if (dx * dx + dy * dy > RADIUS * RADIUS) continue
      // Across this row, from -1 (left edge) to 1 (right edge), and where the edge of the lit part falls.
      const half = Math.sqrt(1 - Math.min(1, (dy / RADIUS) ** 2))
      const across = dx / RADIUS
      const edge = half * cos
      const isLit = index === FULL_MOON || (index < FULL_MOON ? across >= edge : across <= -edge)
      out.push({ x, y, isLit: index !== NEW_MOON && isLit })
    }
  shapes[index] = out
  return out
}

// Who may come out at dusk (17:00–19:00) besides the usual visitors, and how often: about one visit in four.
export const DUSK_VISITORS = ['rockruff', 'murkrow', 'misdreavus', 'hoothoot', 'zubat', 'gastly', 'houndour', 'sableye']
export const DUSK_SHARE = 1 / 4
// On a full-moon night, about one visit in ten is a Clefairy, come to dance under it.
export const FULL_MOON_VISITOR = 'clefairy'
export const FULL_MOON_SHARE = 1 / 10

// A visitor only this hour brings, or null for the usual draw. `moon`: the shape the sky shows tonight. Only asks
// `rand` at dusk or under a full moon, so other draws stay as they were.
export function moonVisitor(list: Species[], phase: Phase, moon: number, rand: () => number): Pick | null {
  const pickOf = (name: string): Pick | null => {
    const dex = list.findIndex(s => s.name === name)
    return dex >= 0 ? { dex, species: name, form: 'regular' } : null
  }
  if (phase === 'dusk') {
    if (rand() >= DUSK_SHARE) return null
    const there = DUSK_VISITORS.filter(name => list.some(s => s.name === name))
    const name = there[Math.floor(rand() * there.length)]
    return name ? pickOf(name) : null
  }
  if (phase === 'night' && moon === FULL_MOON) return rand() < FULL_MOON_SHARE ? pickOf(FULL_MOON_VISITOR) : null
  return null
}
