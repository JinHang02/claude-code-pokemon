// Weather over the landscape: rain, snow or fog some hours, the same in every window. It's only for the eye: no
// Pokémon evolves, appears or levels differently for it.
import { LIGHT, SKY, WATER } from './backdrop'
import type { Landscape, Phase } from './backdrop'
// Only types from the scene: it draws the weather, so a value from it here would make the two load each other.
import type { Status } from './scene'
import { SPECIES } from './species-data'
import type { Pixels } from './sprite'

export type Weather = 'clear' | 'rain' | 'snow' | 'fog'
export const WEATHERS: Weather[] = ['clear', 'rain', 'snow', 'fog']

// Snow only falls where it's cold enough to believe: the high ground and the woods.
export const SNOWY: Landscape[] = ['mountains', 'hills', 'forest']

const hash = (n: number) => Math.imul(n + 1, 2654435761) >>> 16

// The weather during hour number `hour` (hours since the epoch, local time) over `landscape`: out of a hundred
// hours about 15 rain, 8 fog, 7 snow (10 in the night and dawn hours) and the rest clear. A snowy roll over the
// meadow or the lake stays clear.
export function weatherAt(hour: number, landscape: Landscape): Weather {
  const roll = hash(hour * 6007 + 4253) % 100
  const h = ((hour % 24) + 24) % 24
  const isCold = h < 7 || h >= 19
  if (roll < 15) return 'rain'
  if (roll < 23) return 'fog'
  if (roll < (isCold ? 33 : 30)) return SNOWY.includes(landscape) ? 'snow' : 'clear'
  return 'clear'
}

// `a` blended toward `b` by `p`, channel by channel, without a closure per call: it runs for every pixel of the sky.
const mix = (a: number, b: number, p: number) =>
  (Math.round(((a >> 16) & 0xff) * (1 - p) + ((b >> 16) & 0xff) * p) << 16) |
  (Math.round(((a >> 8) & 0xff) * (1 - p) + ((b >> 8) & 0xff) * p) << 8) |
  Math.round((a & 0xff) * (1 - p) + (b & 0xff) * p)

// Per time of day: the grey a rainy or snowy sky turns, the rain's and the snowflakes' colours, and the fog's.
export const SHADES: Record<Phase, { overcast: number; rain: number; flake: number; fog: number }> = {
  dawn: { overcast: 0x8c7f8e, rain: 0xc9c2d6, flake: 0xf4eef2, fog: 0xd9cacb },
  day: { overcast: 0x8794a4, rain: 0xc4d4e6, flake: 0xf6f9ff, fog: 0xd6dce3 },
  dusk: { overcast: 0x6e5866, rain: 0xb8a6b8, flake: 0xe8d8dc, fog: 0x9c8690 },
  night: { overcast: 0x161c30, rain: 0x5c6c90, flake: 0xaab4d0, fog: 0x384056 },
}

// Paints `weather` over a landscape `backdrop` just drew into `out`, `kind` being what it said each pixel is, at
// tick `t`. Everything follows from `t`, so the band moves it only on the frames it draws (one in four when calm),
// and nothing lands on the sun or moon.
export function drawWeather(
  out: Pixels,
  kind: Uint8Array,
  weather: Weather,
  phase: Phase,
  t: number,
  ticksPerSecond = 20,
) {
  if (weather === 'clear') return
  const { width, height, pixels } = out
  const seconds = t / ticksPerSecond
  const shade = SHADES[phase]
  const ground = height - 2
  const at = (x: number, y: number) => y * width + (((x % width) + width) % width)
  if (weather === 'rain' || weather === 'snow') {
    // A grey sky: rain clouds heavier than snow ones.
    const k = weather === 'rain' ? 0.4 : 0.25
    for (let i = 0; i < width * ground; i++) if (kind[i] === SKY) pixels[i] = mix(pixels[i] ?? 0, shade.overcast, k)
  }
  if (weather === 'rain') {
    // Streaks three pixels long, slanting a little, falling 25 to 36 pixels a second through sky and land alike.
    const drops = Math.round((width * height) / 50)
    const span = height + 3
    for (let d = 0; d < drops; d++) {
      const seed = hash(d * 131 + 7)
      const fall = Math.floor((seed % span) + seconds * (25 + (seed % 12)))
      const y = (fall % span) - 3
      const x = (seed >> 4) + Math.floor(fall / 3)
      for (let dy = 0; dy < 3; dy++) {
        const row = y + dy
        if (row < 0 || row >= height - 1) continue
        const i = at(x + (dy >> 1), row)
        if (kind[i] !== LIGHT) pixels[i] = mix(pixels[i] ?? 0, shade.rain, 0.6)
      }
    }
    // Splashes: a drop lands, a little crown on the grass or a ring on the lake, a new spot each half second.
    const splashes = Math.max(2, Math.round(width / 9))
    for (let s = 0; s < splashes; s++) {
      const beat = Math.floor(seconds * 2 + (s % 3) / 3)
      const spot = hash(s * 977 + beat * 31)
      const x = spot % width
      // On a lake, every other one falls on the water, somewhere in its rows.
      const wy = ground - 1 - ((spot >> 8) % Math.max(1, Math.round(ground / 4)))
      if (s % 2 === 0 && kind[at(x, wy)] === WATER) {
        for (let dx = -1; dx <= 1; dx += 2) if (kind[at(x + dx, wy)] === WATER) pixels[at(x + dx, wy)] = shade.rain
        continue
      }
      for (let dx = -1; dx <= 1; dx += 2) {
        const i = at(x + dx, ground)
        if (kind[i] !== LIGHT) pixels[i] = shade.rain
      }
    }
  }
  if (weather === 'snow') {
    // Flakes drifting down a few pixels a second, swaying side to side.
    const flakes = Math.round((width * height) / 55)
    for (let f = 0; f < flakes; f++) {
      const seed = hash(f * 389 + 11)
      const y = Math.floor((seed % height) + seconds * (2 + (seed % 4))) % height
      const x = (seed >> 3) + Math.round(1.5 * Math.sin(seconds * 0.9 + f))
      const i = at(x, y)
      if (kind[i] !== LIGHT) pixels[i] = shade.flake
    }
    // Snow lying on the grass.
    for (let x = 0; x < width; x++) {
      const i = (height - 1) * width + x
      pixels[i] = mix(pixels[i] ?? 0, shade.flake, x % 3 === 0 ? 0.35 : 0.6)
    }
  }
  if (weather === 'fog') {
    // A pale bank lying low over the far landscape, thickest a little above the grass and slowly rolling.
    const top = Math.floor(ground * 0.2)
    const mid = ground * 0.65
    for (let x = 0; x < width; x++) {
      const roll = 0.1 * Math.sin(x / 7 + seconds * 0.4)
      for (let y = top; y < ground; y++) {
        const i = y * width + x
        if (kind[i] === LIGHT) continue
        const k = Math.max(0, 0.62 - Math.abs(y - mid) / (ground * 0.9) + roll)
        pixels[i] = mix(pixels[i] ?? 0, shade.fog, Math.min(0.75, k))
      }
    }
  }
}

// How often a Pokémon that loves the weather hops for joy in it, on average, while the party is awake: in ticks of
// 50 ms, about every 40 seconds.
const JOY_EVERY = 800

// The type that loves each weather.
const FOND: Partial<Record<Weather, string>> = { rain: 'water', snow: 'ice' }

const typesOf = (m: { species: string; form: string }) => {
  const info = SPECIES[m.species]
  return (m.form === 'regular' ? info?.types : info?.forms[m.form]?.types) ?? info?.types ?? []
}

// Now and then a Water type hops in the rain (an Ice type in the snow): a one-Pokémon hop. `party`: who each actor
// is. Nothing stirs a sleeping (`isAsleep`), busy or startled party, so the calm rate stays calm. A preview passes
// `() => 0` for `rand` to have the hop now.
export function stir(
  s: Status,
  weather: Weather,
  party: ({ species: string; form: string } | undefined)[],
  isAsleep: boolean,
  rand = Math.random,
): Status {
  const fond = FOND[weather]
  if (!fond || isAsleep || s.mood || s.isWorking || s.isCompacting || s.wild || s.alert) return s
  if (rand() >= 1 / JOY_EVERY) return s
  const fans = party.flatMap((m, i) => (m && i < s.actors.length && typesOf(m).includes(fond) ? [i] : []))
  const actor = fans[Math.floor(rand() * fans.length)]
  if (actor === undefined) return s
  // The party's idle time runs on: rain all hour mustn't keep them from dozing off.
  return { ...s, mood: { kind: 'hop', t: 0, actor } }
}
