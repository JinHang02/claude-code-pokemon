import { backdrop } from './backdrop'
import type { Landscape, Phase } from './backdrop'
import { CLEAR, mirror, shrink } from './sprite'
import type { Pixels } from './sprite'

export const TICK_MS = 50
// Calm scenes (nothing moving) draw one tick in this many.
export const CALM_EVERY = 4
// Pixels kept clear above the sprites for hops, stretches and floating Zs.
export const HEADROOM = 5
export const MAX_CLONES = 3

export const ticks = (ms: number) => Math.max(1, Math.round(ms / TICK_MS))
export const SLEEP_TICKS = ticks(5 * 60_000)

// Columns per tick, and how much the speed may change per tick.
const WALK = 0.25
const RUN = 0.6
const WILD = 0.18
const ACCEL = 0.03

const SPARK = [0xffffff, 0xfff27a, 0xffd84a]
const DUST = [0xb5ab99, 0x968d7e, 0x6f685e]
const ZZZ = [0xffffff, 0xdde4ff, 0xb8c2e0, 0x8c96b4]
const CONFETTI = [0xff5a5a, 0xffd23f, 0x3fd1ff, 0x7dff6a, 0xd57bff, 0xffffff]
const Z_GLYPH = [1, 1, 1, 0, 1, 0, 1, 1, 1]
// A speech bubble with a red "!", 5 by 6: 1 is the bubble, 2 the mark.
const ALERT_GLYPH = [0, 1, 1, 1, 0, 1, 1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 0, 1, 1, 1, 0]
const ALERT_MARK = 0xe0352b
const BUBBLE = 0xf4f4f4
const BUBBLE_DOT = 0x2a2a2a
// A thought bubble, 9 by 5; its three dots sit at columns 2, 4 and 6 of the middle row.
const BUBBLE_GLYPH = [
  0,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  0,
  ...Array<number>(9).fill(1),
  1,
  1,
  0,
  1,
  0,
  1,
  0,
  1,
  1,
  ...Array<number>(9).fill(1),
  0,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  0,
]
const BOLT = [
  [0, 0],
  [1, 1],
  [0, 2],
]

// Hop: crouch, a parabola in the air, a squashed landing; the reply animation is two, spinning mid-air.
const CROUCH = ticks(150)
const AIR = ticks(500)
const LAND = ticks(150)
const HOP = CROUCH + AIR + LAND
const SPIN_AT = HOP + CROUCH + Math.floor(AIR / 2)
// Faint, the way a Pokémon battle shows it: a shudder, sinking out of sight, then back up.
const SHAKE = ticks(400)
const SINK = ticks(700)
const GONE = ticks(600)
const RISE = ticks(500)
const BOUNCE = ticks(300)
const FAINT = SHAKE + SINK + GONE + RISE + BOUNCE
const SQUASH_IN = ticks(400)
const SPRING = ticks(900)
const EMERGE = ticks(300)
const RUSTLE = ticks(2000)
const ALERT = ticks(2500)
// The startled hop on spotting a wild Pokémon.
const STARTLE = ticks(400)
// Evolution: the two forms swap as white silhouettes, ever faster, then a flash and the new form.
export const EVOLVE = ticks(4500)
const EVOLVE_FLASH = ticks(500)

// `pace` scales a stroll's walking speed.
export type Roam = { kind: 'walk' | 'idle' | 'turn' | 'look' | 'skip'; left: number; age: number; pace?: number }

export type Scene = { x: number; v: number; facing: 1 | -1; roam: Roam; t: number; stride: number }

export type Mood = { kind: 'hop' | 'cheer' | 'faint' | 'spring' | 'evolve'; t: number; actor?: number } | null

export type Particle = {
  kind: 'dust' | 'spark' | 'z' | 'confetti'
  x: number
  // Pixels from the ground row (negative is up); a spark keeps a random seed here, a Z its actor, and
  // confetti counts from its owner's head.
  y: number
  owner?: number
  age: number
  life: number
  vx?: number
  vy?: number
  color?: number
}

// `rustle`: ticks left of the grass shaking at its edge before it steps out.
export type Wild = { x: number; facing: 1 | -1; stride: number; pause: number; hasPaused: boolean; rustle: number }

export type Status = {
  // One per party member, the lead first.
  actors: Scene[]
  mood: Mood
  isWorking: boolean
  isCompacting: boolean
  compactT: number
  idleTicks: number
  agents: number
  // Tick each clone appeared, oldest first.
  clones: number[]
  // Center columns the lead passed, newest first, one per column moved: the clones' path.
  trail: number[]
  fx: Particle[]
  wild: Wild | null
  // Ticks left of the party's "!" at a wild Pokémon stepping out.
  alert: number
  t: number
}

export type Happening =
  'activity' | 'turn-start' | 'turn-answer' | 'turn-end' | 'tool-error' | 'cheer' | 'compact-start' | 'compact-end'

export const newScene = (x = 0): Scene => ({
  x,
  v: 0,
  facing: -1,
  roam: { kind: 'idle', left: ticks(1000), age: 0 },
  t: 0,
  stride: 0,
})

export const initialStatus = (): Status => ({
  actors: [newScene()],
  mood: null,
  isWorking: false,
  isCompacting: false,
  compactT: 0,
  idleTicks: 0,
  agents: 0,
  clones: [],
  trail: [],
  fx: [],
  wild: null,
  alert: 0,
  t: 0,
})

const moodLength = (mood: NonNullable<Mood>) =>
  mood.kind === 'hop' || mood.kind === 'cheer'
    ? HOP * 2
    : mood.kind === 'faint'
      ? FAINT
      : mood.kind === 'evolve'
        ? EVOLVE
        : SPRING

// Nobody dozes off with a wild Pokémon around.
export const isAsleep = (s: Status) =>
  s.idleTicks >= SLEEP_TICKS && !s.mood && !s.isWorking && !s.isCompacting && !s.wild

// What a session event does to the Pokémon; every event wakes them. An evolution is never cut short.
export function react(s: Status, what: Happening): Status {
  const awake = { ...s, idleTicks: 0 }
  const mood = (next: NonNullable<Mood>): Mood => (s.mood?.kind === 'evolve' ? s.mood : next)
  switch (what) {
    case 'activity':
      return awake
    case 'turn-start':
      return { ...awake, isWorking: true }
    case 'turn-answer':
      return { ...awake, isWorking: false, mood: mood({ kind: 'hop', t: 0 }) }
    case 'turn-end':
      return { ...awake, isWorking: false }
    case 'tool-error':
      return { ...awake, mood: mood({ kind: 'faint', t: 0 }) }
    case 'cheer':
      return { ...awake, mood: mood({ kind: 'cheer', t: 0 }) }
    case 'compact-start':
      return { ...awake, isCompacting: true, compactT: 0 }
    case 'compact-end':
      return { ...awake, isCompacting: false, mood: mood({ kind: 'spring', t: 0 }) }
  }
}

export const evolve = (s: Status, actor: number): Status => ({
  ...s,
  idleTicks: 0,
  mood: { kind: 'evolve', t: 0, actor },
})

// A wild Pokémon waits just out of sight at a random edge, rustling the grass, before it steps out.
export const startWild = (s: Status, width: number, wildWidth: number, rand = Math.random): Status => {
  const facing = rand() < 0.5 ? 1 : -1
  const x = facing === 1 ? -wildWidth : width
  return { ...s, wild: { x, facing, stride: 0, pause: 0, hasPaused: false, rustle: RUSTLE } }
}

const between = (lo: number, hi: number, rand: () => number) => lo + Math.floor(rand() * (hi - lo + 1))
const flip = (f: 1 | -1): 1 | -1 => (f === 1 ? -1 : 1)

// A stroll of a few steps at its own pace.
const stroll = (rand: () => number): Roam => ({
  kind: 'walk',
  left: between(ticks(600), ticks(2500), rand),
  age: 0,
  pace: 0.7 + rand() * 0.5,
})

// What to do after a stroll: stop for a bit, look around, skip, or stroll on. Anything else ends in a stroll.
// While Claude works they stay busy: only brief pauses between strolls.
function nextRoam(roam: Roam, rand: () => number, isRunning = false): Roam {
  if (roam.kind !== 'walk') return stroll(rand)
  const r = rand()
  if (isRunning) return r < 0.35 ? { kind: 'idle', left: between(ticks(200), ticks(700), rand), age: 0 } : stroll(rand)
  if (r < 0.4) return { kind: 'idle', left: between(ticks(700), ticks(3000), rand), age: 0 }
  if (r < 0.55) return { kind: 'look', left: ticks(1800), age: 0 }
  if (r < 0.65) return { kind: 'skip', left: ticks(400), age: 0 }
  return stroll(rand)
}

// A change of heart mid-stroll: about once every 7 seconds of walking.
const PIVOT_ODDS = 1 / ticks(7000)
// Closer to a wall than this, a new stroll heads away from it.
const WALL_ROOM = 8

// One tick of roaming: ease toward walking (or running) speed, brake in time to stop at an edge, pause
// and turn there, stand, look about or skip in place in between.
export function advance(s: Scene, width: number, spriteWidth: number, rand = Math.random, isRunning = false): Scene {
  const max = Math.max(0, width - spriteWidth)
  let { x, v, facing, roam } = s
  roam = { ...roam, left: roam.left - 1, age: roam.age + 1 }
  // A long rest is cut short when Claude starts working.
  if (isRunning && roam.kind !== 'turn' && roam.kind !== 'walk' && roam.left > ticks(700))
    roam = { ...roam, left: ticks(700) }
  if (roam.left <= 0) {
    if (roam.kind === 'turn') {
      // A turn always ends in a stroll the new way.
      facing = flip(facing)
      roam = stroll(rand)
    } else {
      roam = nextRoam(roam, rand, isRunning)
      // A new stroll picks its direction at random, but never straight into a wall.
      const ahead = facing === 1 ? max - x : x
      if (roam.kind === 'walk' && (ahead < WALL_ROOM || rand() < 0.5))
        roam = { kind: 'turn', left: ticks(isRunning ? 120 : 250), age: 0 }
    }
  } else if (roam.kind === 'walk' && rand() < PIVOT_ODDS)
    roam = { kind: 'turn', left: ticks(isRunning ? 150 : 350), age: 0 }
  if (roam.kind === 'look' && (roam.age === ticks(600) || roam.age === ticks(1300))) facing = flip(facing)
  const accel = ACCEL * (isRunning ? 2 : 1)
  const room = facing === 1 ? max - x : x
  // Capped at the speed it can still stop from before the edge.
  const cruise = Math.min((isRunning ? RUN : WALK) * (roam.pace ?? 1), Math.sqrt(2 * accel * Math.max(0, room - 0.5)))
  const target = roam.kind === 'walk' ? cruise : 0
  v += Math.max(-accel, Math.min(accel, target - v))
  const step = Math.min(v, Math.max(0, room)) * facing
  x += step
  if (roam.kind === 'walk' && room - Math.abs(step) < 0.5 && v <= accel * 2) {
    roam = { kind: 'turn', left: ticks(isRunning ? 100 : 300), age: 0 }
    v = 0
  }
  return { x: Math.min(Math.max(0, x), max), v, facing, roam, t: s.t + 1, stride: s.stride + Math.abs(step) }
}

// A wild Pokémon strolls across, stops once mid-way to look about, and leaves the other side.
function moveWild(w: Wild, width: number, wildWidth: number): Wild | null {
  if (w.rustle > 0) return { ...w, rustle: w.rustle - 1 }
  // Looks back over its shoulder mid-pause, then on its way again.
  const turns = w.pause === ticks(1600) || w.pause === ticks(800)
  if (w.pause > 0) return { ...w, pause: w.pause - 1, facing: turns ? flip(w.facing) : w.facing }
  const middle = (width - wildWidth) / 2
  const crosses = w.facing === 1 ? w.x < middle && w.x + WILD >= middle : w.x > middle && w.x - WILD <= middle
  if (crosses && !w.hasPaused) return { ...w, pause: ticks(2400), hasPaused: true }
  const x = w.x + WILD * w.facing
  if (x < -wildWidth - 1 || x > width + 1) return null
  return { ...w, x, stride: w.stride + WILD }
}

// The party's places after it changes from `was` to `keys`: a Pokémon found by key when the party is reordered or
// trimmed, or by slot when a new one takes the place of one that left (an evolution); only newcomers get `place`.
export function carryActors(was: string[], keys: string[], actors: Scene[], place: (i: number) => Scene): Scene[] {
  return keys.map((key, i) => {
    const same = was.indexOf(key)
    const at = same >= 0 ? same : was.length === keys.length && !keys.includes(was[i] ?? '') ? i : -1
    return actors[at] ?? place(i)
  })
}

// One tick: a mood plays on (everyone holds still for it), idle ones doze off, free ones roam (running
// while Claude works); clones, the wild visitor and particles come and go. `widths` per actor.
export function step(s: Status, width: number, widths: number[], wildWidth = 0, rand = Math.random): Status {
  const t = s.t + 1
  let mood = s.mood && { ...s.mood, t: s.mood.t + 1 }
  if (mood && mood.t >= moodLength(mood)) mood = null
  const isBusy = s.isWorking || s.isCompacting || s.agents > 0
  const idleTicks = isBusy ? 0 : s.idleTicks + 1
  const asleep = isAsleep({ ...s, idleTicks, mood })
  const wild = s.wild && moveWild(s.wild, width, wildWidth)
  const stepsOut = s.wild?.rustle === 1 && wild?.rustle === 0
  // The "!" goes with the visitor: gone early (the band shrank under it), so is the "!".
  const alert = stepsOut ? ALERT : wild ? Math.max(0, s.alert - 1) : 0
  const isStill = Boolean(mood) || s.isCompacting || asleep || alert > 0
  let actors = s.actors.map((scene, i) =>
    isStill ? { ...scene, v: 0, t: scene.t + 1 } : advance(scene, width, widths[i] ?? 1, rand, s.isWorking),
  )
  // Everyone turns to look at the newcomer.
  if (alert > 0 && wild)
    actors = actors.map((a, i) => ({
      ...a,
      facing: wild.x + wildWidth / 2 < a.x + (widths[i] ?? 0) / 2 ? -1 : 1,
    }))
  if ((mood?.kind === 'hop' || mood?.kind === 'cheer') && mood.t === SPIN_AT)
    actors = actors.map(a => ({ ...a, facing: flip(a.facing) }))

  const lead = actors[0] ?? newScene()
  const leadWidth = widths[0] ?? 1
  const center = Math.round(lead.x + leadWidth / 2)
  const trail = s.trail[0] === center ? s.trail : [center, ...s.trail].slice(0, 200)
  // Particles with a velocity drift and fall.
  let fx: Particle[] = s.fx
    .map(p => {
      const moved = { ...p, age: p.age + 1, x: p.x + (p.vx ?? 0), y: p.y + (p.vy ?? 0) }
      return p.vy === undefined ? moved : { ...moved, vy: p.vy + 0.06 }
    })
    .filter(p => p.age < p.life)
  let clones = s.clones
  const want = Math.min(s.agents, MAX_CLONES)
  if (clones.length < want) clones = [...clones, t]
  if (clones.length > want) {
    clones = clones.slice(0, want)
    // The puff rises where the vanishing clone walked: the first one dropped, as `frame` places it.
    const mini = Math.max(1, Math.round(leadWidth / 2))
    const back = Math.round((leadWidth + mini) / 2) + 1 + (mini + 2) * want
    const x = trail[back] ?? center - lead.facing * back
    fx = [
      ...fx,
      ...[0, 1, 2].map(i => ({ kind: 'dust' as const, x: x + i - 1, y: -1 - (i % 2), age: 0, life: ticks(450) })),
    ]
  }
  actors.forEach((a, i) => {
    const col = Math.round(a.x)
    const w = widths[i] ?? 1
    if (s.isWorking && !mood && !s.isCompacting) {
      if (rand() < 0.35 / actors.length)
        fx = [
          ...fx,
          { kind: 'spark', x: col - 2 + Math.floor(rand() * (w + 4)), y: Math.floor(rand() * 100), age: 0, life: 3 },
        ]
    }
    if (asleep && (t + i * ticks(400)) % ticks(1200) === 0)
      fx = [...fx, { kind: 'z', x: a.facing === 1 ? col + w - 2 : col - 1, y: i, age: 0, life: ticks(2400) }]
    if (mood?.kind === 'cheer' && mood.t === CROUCH + 1)
      for (let k = 0; k < 14; k++)
        fx = [
          ...fx,
          {
            kind: 'confetti',
            x: col - 2 + rand() * (w + 4),
            y: -1 - rand() * 2,
            owner: i,
            vx: (rand() - 0.5) * 0.5,
            vy: -0.3 - rand() * 0.4,
            color: CONFETTI[k % CONFETTI.length],
            age: 0,
            life: ticks(1500),
          },
        ]
  })
  const compactT = s.isCompacting ? s.compactT + 1 : 0
  return { ...s, actors, mood, idleTicks, clones, trail, fx, compactT, wild, alert, t }
}

// Nothing moves but slow Zs: the band may draw at a lower rate.
export const isCalm = (s: Status) =>
  !s.mood &&
  !s.isCompacting &&
  !s.wild &&
  !s.alert &&
  s.actors.every(a => a.v === 0 && a.roam.kind !== 'skip') &&
  s.fx.every(p => p.kind === 'z') &&
  s.clones.every(born => s.t - born > EMERGE)

function scaleY(img: Pixels, f: number): Pixels {
  const height = Math.max(1, Math.min(img.height + HEADROOM, Math.round(img.height * f)))
  if (height === img.height) return img
  const pixels: number[] = []
  for (let y = 0; y < height; y++) {
    const src = Math.min(img.height - 1, Math.floor((y * img.height) / height))
    pixels.push(...img.pixels.slice(src * img.width, (src + 1) * img.width))
  }
  return { pixels, width: img.width, height }
}

const channel = (c: number, shift: number, k: number) => Math.min(255, Math.round(((c >> shift) & 0xff) * k)) << shift
const tint = (c: number, [r = 1, g = 1, b = 1]: number[]) => channel(c, 16, r) | channel(c, 8, g) | channel(c, 0, b)

function dim(img: Pixels, k: number): Pixels {
  if (k >= 1) return img
  return { ...img, pixels: img.pixels.map(c => (c === CLEAR ? c : tint(c, [k, k, k]))) }
}

const silhouette = (img: Pixels): Pixels => ({ ...img, pixels: img.pixels.map(c => (c === CLEAR ? c : 0xffffff)) })

const easeOut = (p: number) => 1 - (1 - p) ** 2
const easeIn = (p: number) => p * p
const arc = (p: number, peak: number) => Math.round(4 * peak * p * (1 - p))

// How a Pokémon shows this tick: stretched or squashed (`scale`), lifted, sunk below the grass,
// shaken sideways and dimmed.
export type Pose = { scale: number; lift: number; sink: number; shake: number; light: number }

const REST: Pose = { scale: 1, lift: 0, sink: 0, shake: 0, light: 1 }

function hopPose(t: number): Pose {
  if (t < CROUCH) return { ...REST, scale: 0.85 }
  if (t < CROUCH + AIR) {
    const p = (t - CROUCH + 1) / (AIR + 1)
    return { ...REST, lift: arc(p, HEADROOM), scale: p < 0.2 ? 1.08 : 1 }
  }
  return { ...REST, scale: t - CROUCH - AIR < LAND / 2 ? 0.85 : 0.95 }
}

function faintPose(t: number, height: number): Pose {
  if (t < SHAKE) return { ...REST, shake: t % 4 < 2 ? 1 : -1 }
  t -= SHAKE
  if (t < SINK) {
    const p = easeIn(t / SINK)
    return { ...REST, sink: Math.round(height * p), light: 1 - 0.55 * p }
  }
  t -= SINK
  if (t < GONE) return { ...REST, sink: height, light: 0.45 }
  t -= GONE
  if (t < RISE) {
    const p = easeOut(t / RISE)
    return { ...REST, sink: Math.round(height * (1 - p)), light: 0.45 + 0.55 * p }
  }
  return { ...REST, lift: arc((t - RISE + 1) / (BOUNCE + 1), 2) }
}

export function pose(s: Status, height: number, actor = 0): Pose {
  const { mood } = s
  const scene = s.actors[actor] ?? newScene()
  if (s.isCompacting) {
    const t = s.compactT
    const scale =
      t < SQUASH_IN ? 1 - 0.55 * easeOut(t / SQUASH_IN) : 0.45 + 0.03 * Math.sin((2 * Math.PI * t) / ticks(600))
    return { ...REST, scale }
  }
  if (mood?.kind === 'spring') {
    const t = mood.t
    return { ...REST, scale: 1 - 0.55 * Math.exp(-t / ticks(150)) * Math.cos((2 * Math.PI * t) / ticks(350)) }
  }
  if (mood?.kind === 'faint') return faintPose(mood.t, height)
  if (mood?.kind === 'hop' || mood?.kind === 'cheer') return hopPose(mood.t % HOP)
  if (mood?.kind === 'evolve') return REST
  if (s.alert > ALERT - STARTLE) return { ...REST, lift: arc((ALERT - s.alert + 1) / (STARTLE + 1), 2) }
  if (isAsleep(s)) {
    const breath = 0.5 + 0.5 * Math.sin((2 * Math.PI * (scene.t + actor * 13)) / ticks(3000))
    return { ...REST, scale: 1 - 0.05 * breath, sink: 1, light: 0.8 }
  }
  if (scene.roam.kind === 'skip') return { ...REST, lift: arc(scene.roam.age / ticks(400), 2) }
  if (Math.abs(scene.v) > 0.05) return { ...REST, lift: Math.floor(scene.stride / 2.5) % 2 }
  return REST
}

// Which form an evolving Pokémon shows at tick `t`: the old and new silhouettes swap ever faster, then the
// new form flashes white once and stays.
export function evolveLook(t: number): { isNew: boolean; isWhite: boolean } {
  if (t >= EVOLVE - EVOLVE_FLASH) return { isNew: true, isWhite: t < EVOLVE - EVOLVE_FLASH / 2 }
  const p = t / (EVOLVE - EVOLVE_FLASH)
  const period = Math.max(2, Math.round(16 * (1 - p) ** 1.5))
  return { isNew: Math.floor(t / period) % 2 === 1, isWhite: p > 0.1 }
}

// Pixels a Pokémon covers in the frame being drawn.
let body = new Uint8Array(0)

// Paints `img` with its feet on row `floor`, rows below `clip` left out (sunk into the grass);
// `avoidBodies` leaves any Pokémon in the frame untouched; `isBody` marks what it paints as one.
function paint(
  into: Pixels,
  img: Pixels,
  left: number,
  floor: number,
  clip = into.height,
  avoidBodies = false,
  isBody = false,
) {
  const top = floor + 1 - img.height
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++) {
      const c = img.pixels[y * img.width + x] ?? CLEAR
      const [px, py] = [left + x, top + y]
      if (c === CLEAR || px < 0 || px >= into.width || py < 0 || py >= into.height || py > clip) continue
      if (avoidBodies && body[py * into.width + px]) continue
      into.pixels[py * into.width + px] = c
      if (isBody) body[py * into.width + px] = 1
    }
}

const dot = (c: number): Pixels => ({ pixels: [c], width: 1, height: 1 })
const pick = (colors: number[], p: number) =>
  colors[Math.min(colors.length - 1, Math.floor(p * colors.length))] ?? CLEAR
const glyph = (bits: number[], width: number, c: number): Pixels => ({
  pixels: bits.map(on => (on ? c : CLEAR)),
  width,
  height: bits.length / width,
})

const RUSTLE_COLUMNS = 9
const RUSTLE_GRASS = [0x8fe36a, 0x6fcf4f, 0x4fa845]

// Tall grass blades thrashing at the edge a wild Pokémon is about to step out of.
function rustle(out: Pixels, from: number, t: number) {
  const ground = out.height - 2
  const phase = Math.floor(t / 2) % 3
  for (let k = 0; k < RUSTLE_COLUMNS; k++) {
    const tall = 2 + ((k + phase) % 3)
    const lean = (k + phase) % 2 ? 1 : -1
    for (let j = 0; j < tall; j++) {
      const x = from + k + (j >= 2 ? lean : 0)
      paint(out, dot(RUSTLE_GRASS[(k + j) % 3] ?? 0), x, ground - j, ground)
    }
  }
}

// A thought bubble behind the lead's head while Claude works; its dots count up one, two, three.
function thoughtBubble(out: Pixels, lead: Scene, width: number, top: number, t: number) {
  const dots = Math.floor(t / ticks(350)) % 4
  const pixels = BUBBLE_GLYPH.map((on, i) => {
    const isDot = i >= 18 && i < 27 && [20, 22, 24].indexOf(i) >= 0
    if (isDot) return [20, 22, 24].indexOf(i) < dots ? BUBBLE_DOT : BUBBLE
    return on ? BUBBLE : CLEAR
  })
  const bubble = { pixels, width: 9, height: 5 }
  const x = Math.round(lead.x)
  const bottom = top + 4
  const left = lead.facing === 1 ? x - 10 : x + width + 1
  paint(out, bubble, left, bottom, out.height - 2, true)
  const [near, far] = lead.facing === 1 ? [left + 9, left + 10] : [left - 1, left - 2]
  paint(out, dot(BUBBLE), near, bottom + 1, out.height - 2, true)
  paint(out, dot(BUBBLE), far, bottom + 2, out.height - 2, true)
}

export { phaseAt } from './backdrop'
export type { Landscape, Phase } from './backdrop'

export type Look = { phase: Phase; landscape?: Landscape; wild?: Pixels; evolveFrom?: Pixels }

// The band's picture: the meadow, clones trailing the lead, a wild visitor, the party in their poses with
// feet in the grass (lead in front), then dust, sparks, confetti and Zs. `lefts`: the party facing left.
export function frame(s: Status, lefts: Pixels[], width: number, rows: number, look: Look = { phase: 'day' }): Pixels {
  const out: Pixels = { pixels: Array<number>(width * rows * 2).fill(CLEAR), width, height: rows * 2 }
  const ground = out.height - 2
  backdrop(out, look.phase, look.landscape ?? 'meadow', s.t, 1000 / TICK_MS)
  body = new Uint8Array(width * out.height)
  if (s.wild && s.wild.rustle > 0) rustle(out, s.wild.facing === 1 ? 0 : width - RUSTLE_COLUMNS, s.t)
  const night = look.phase === 'night' ? 0.85 : 1
  const lead = s.actors[0] ?? newScene()
  const leadLeft = lefts[0]

  if (s.clones.length && leadLeft) {
    const mini = shrink(leadLeft, 2)
    const flipped = mirror(mini)
    const center = Math.round(lead.x) + Math.round(leadLeft.width / 2)
    s.clones.forEach((born, i) => {
      const back = Math.round((leadLeft.width + mini.width) / 2) + 1 + (mini.width + 2) * i
      const at = s.trail[back] ?? center - lead.facing * back
      const ahead = s.trail[back - 1] ?? at
      const dir = ahead === at ? lead.facing : ahead > at ? 1 : -1
      const rise = Math.min(1, (s.t - born) / EMERGE)
      const sink = Math.round(mini.height * (1 - easeOut(rise)))
      const lift = Math.floor((lead.stride + i * 1.3) / 2) % 2
      paint(
        out,
        dim(dir === 1 ? flipped : mini, night),
        at - Math.round(mini.width / 2),
        ground + sink - lift,
        ground,
        false,
        true,
      )
    })
  }

  if (s.wild && look.wild) {
    const w = s.wild
    const lift = w.pause ? 0 : Math.floor(w.stride / 2.5) % 2
    paint(
      out,
      dim(w.facing === 1 ? mirror(look.wild) : look.wild, night),
      Math.round(w.x),
      ground - lift,
      ground,
      false,
      true,
    )
  }

  const tops: number[] = []
  for (let i = s.actors.length - 1; i >= 0; i--) {
    const a = s.actors[i]
    let left = lefts[i]
    if (!a || !left) continue
    let isWhite = false
    if (s.mood?.kind === 'evolve' && s.mood.actor === i && look.evolveFrom) {
      const seen = evolveLook(s.mood.t)
      if (!seen.isNew) left = look.evolveFrom
      isWhite = seen.isWhite
    }
    const facing = a.facing === 1 ? mirror(left) : left
    const p = pose(s, facing.height, i)
    let sprite = dim(scaleY(facing, p.scale), p.light * night)
    if (isWhite) sprite = silhouette(sprite)
    paint(out, sprite, Math.round(a.x) + p.shake, ground - p.lift + p.sink, ground, false, true)
    tops[i] = ground + 1 - sprite.height - p.lift + p.sink
  }

  // Hidden while the party's "!" is up; back afterwards if Claude is still working.
  if (s.isWorking && !s.mood && !s.isCompacting && !s.alert && leadLeft && tops[0] !== undefined)
    thoughtBubble(out, lead, leadLeft.width, tops[0], s.t)
  if (s.alert > 0)
    s.actors.forEach((a, i) => {
      const top = tops[i]
      const w = lefts[i]?.width ?? 0
      const mark = { pixels: ALERT_GLYPH.map(v => (v === 2 ? ALERT_MARK : v ? BUBBLE : CLEAR)), width: 5, height: 6 }
      // Resting on the head, so it fits above the tallest Pokémon too.
      if (top !== undefined) paint(out, mark, Math.round(a.x + w / 2) - 2, top)
    })

  for (const fx of s.fx) {
    const age = fx.age / fx.life
    if (fx.kind === 'dust') {
      const puff = { pixels: [pick(DUST, age), pick(DUST, age)], width: 2, height: 1 }
      paint(out, puff, Math.round(fx.x), ground + fx.y - Math.floor(age * 2), ground, true)
    }
    if (fx.kind === 'confetti') {
      const head = ground + 1 - (lefts[fx.owner ?? 0]?.height ?? 0)
      paint(out, dot(fx.color ?? 0xffffff), Math.round(fx.x), head + Math.round(fx.y), ground, true)
    }
    if (fx.kind === 'spark') {
      const owner = Math.max(
        0,
        s.actors.findIndex((a, i) => Math.abs(a.x + (lefts[i]?.width ?? 0) / 2 - fx.x) < (lefts[i]?.width ?? 0)),
      )
      const top = tops[owner] ?? ground
      const half = Math.max(1, Math.ceil((lefts[owner]?.height ?? 2) / 2))
      for (const [dx, dy] of BOLT)
        paint(out, dot(pick(SPARK, age)), fx.x + (dx ?? 0), top + (fx.y % half) + (dy ?? 0), ground, true)
    }
    if (fx.kind === 'z') {
      const actor = s.actors[fx.y] ?? lead
      const rise = Math.floor(fx.age / ticks(300))
      const drift = Math.floor(fx.age / ticks(500)) * actor.facing
      paint(out, glyph(Z_GLYPH, 3, pick(ZZZ, age)), fx.x + drift, (tops[fx.y] ?? ground) + 2 - rise, ground, true)
    }
  }
  return out
}
