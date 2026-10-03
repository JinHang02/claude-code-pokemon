import { expect, test } from 'claude-code/testing'

import {
  carryActors,
  isAsleep,
  advance,
  CALM_EVERY,
  EVOLVE,
  evolve,
  evolveLook,
  frame,
  HEADROOM,
  initialStatus,
  isCalm,
  newScene,
  phaseAt,
  pose,
  react,
  SLEEP_TICKS,
  startWild,
  step,
  TICK_MS,
} from '../hooks/scene'
import type { Scene, Status } from '../hooks/scene'

type Img = { pixels: number[]; width: number; height: number }

const SPRITE = { pixels: Array<number>(16).fill(0xabcdef), width: 4, height: 4 }
const OTHER = { pixels: Array<number>(16).fill(0x123456), width: 4, height: 4 }
const ROWS = Math.ceil((SPRITE.height + 1 + HEADROOM) / 2)
const W = 60
const idle = { kind: 'idle' as const, left: 1e9, age: 0 }
const walk = { kind: 'walk' as const, left: 1e9, age: 0 }
const base = initialStatus()
const still: Status = { ...base, actors: [{ ...newScene(10), roam: idle }] }
const walkingRight: Status = { ...still, actors: [{ ...newScene(10), facing: 1, roam: walk }] }
const lead = (s: Status) => s.actors[0] ?? newScene()
const run = (s: Status, n: number, widths = [SPRITE.width], rand = () => 0.99) => {
  for (let i = 0; i < n; i++) s = step(s, W, widths, 0, rand)
  return s
}
const count = (img: Img, c: number) => img.pixels.filter(p => p === c).length
const at = (img: Img, x: number, y: number) => img.pixels[y * img.width + x]
// Row of the sprite's top pixel in its own column.
const spriteTop = (s: Status) => {
  const img = frame(s, [SPRITE], W, ROWS)
  for (let y = 0; y < img.height - 1; y++) if (at(img, Math.round(lead(s).x) + 1, y) === 0xabcdef) return y
  return img.height
}
const ticks = (ms: number) => Math.round(ms / TICK_MS)

test('stands the Pokémon in a grass strip', () => {
  const img = frame(still, [SPRITE], W, ROWS)
  expect(img.pixels.slice((img.height - 1) * W).every(c => c !== -1)).toBe(true)
  expect([at(img, 10, img.height - 3), at(img, 10, img.height - 2)]).toEqual([0xabcdef, 0xabcdef])
  expect(at(img, 10, img.height - 6)).not.toBe(0xabcdef)
})

test('eases into a walk instead of jumping to full speed', () => {
  const speeds = [1, 2, 3, 8, 20].map(n => lead(run(walkingRight, n)).v)
  expect(speeds[0]).toBeGreaterThan(0)
  for (let i = 1; i < speeds.length; i++) expect(speeds[i]).toBeGreaterThanOrEqual(speeds[i - 1] ?? 0)
  expect(Math.abs((speeds[4] ?? 0) - 0.25)).toBeLessThan(0.001)
})

test('brakes before the edge, pauses there, then turns around', () => {
  let s: Status = { ...walkingRight, actors: [{ ...lead(walkingRight), x: 50, v: 0.25 }] }
  const speeds: number[] = []
  while (lead(s).roam.kind === 'walk') {
    s = run(s, 1)
    speeds.push(lead(s).v)
    expect(lead(s).x).toBeLessThanOrEqual(56)
  }
  expect(lead(s).x).toBeGreaterThan(55)
  const braking = speeds.slice(speeds.findIndex(v => v < 0.25))
  for (let i = 1; i < braking.length; i++) expect(braking[i]).toBeLessThanOrEqual(braking[i - 1] ?? 1)
  expect(braking.length).toBeGreaterThan(3)
  expect(lead(run(s, ticks(400))).facing).toBe(-1)
})

test('never leaves the band, however long it roams', () => {
  let scene: Scene = { ...newScene(5), roam: walk }
  for (let i = 0; i < 5000; i++) {
    scene = advance(scene, 30, 6, Math.random)
    expect(scene.x >= 0 && scene.x <= 24).toBe(true)
  }
})

test('party members roam on their own, the lead drawn in front', () => {
  const party: Status = { ...walkingRight, actors: [lead(walkingRight), { ...newScene(30), facing: -1, roam: walk }] }
  const later = run(party, 30, [4, 4])
  expect(later.actors[0]?.x).toBeGreaterThan(10)
  expect(later.actors[1]?.x).toBeLessThan(30)
  const overlap: Status = {
    ...still,
    actors: [
      { ...newScene(10), roam: idle },
      { ...newScene(10), roam: idle },
    ],
  }
  const img = frame(overlap, [SPRITE, OTHER], W, ROWS)
  expect(count(img, 0xabcdef)).toBe(16)
  expect(count(img, 0x123456)).toBe(0)
})

test('runs faster while Claude works, with nothing trailing behind', () => {
  const working = run(react(walkingRight, 'turn-start'), 40)
  const walking = run(walkingRight, 40)
  expect(lead(working).x - 10).toBeGreaterThan((lead(walking).x - 10) * 1.8)
  expect(working.fx.some(p => p.kind === 'dust')).toBe(false)
  expect(step(working, W, [4], 0, () => 0.1).fx.some(p => p.kind === 'spark')).toBe(true)
})

test('events set the mood, and every event wakes them', () => {
  const sleepy = { ...still, idleTicks: SLEEP_TICKS + 5 }
  expect(react(sleepy, 'turn-start')).toMatchObject({ isWorking: true, idleTicks: 0 })
  expect(react(sleepy, 'turn-answer')).toMatchObject({ isWorking: false, mood: { kind: 'hop' } })
  expect(react(sleepy, 'tool-error').mood).toEqual({ kind: 'faint', t: 0 })
  expect(react(sleepy, 'cheer').mood).toEqual({ kind: 'cheer', t: 0 })
  expect(react(react(sleepy, 'compact-start'), 'compact-end')).toMatchObject({
    isCompacting: false,
    mood: { kind: 'spring' },
  })
})

test('hops: crouches first, arcs up to the headroom, spins on the second hop, then roams on', () => {
  let s = react(still, 'turn-answer')
  const rest = spriteTop(still)
  const tops: number[] = []
  const facings = new Set<number>()
  while (true) {
    s = run(s, 1)
    if (!s.mood) break
    tops.push(spriteTop(s))
    facings.add(lead(s).facing)
  }
  expect(tops[0]).toBeGreaterThan(rest - 1)
  expect(Math.min(...tops)).toBe(rest - HEADROOM)
  expect(facings.size).toBe(2)
})

test('cheers with a hop and a burst of confetti that falls back down', () => {
  let s = run(react(still, 'cheer'), 5)
  const confetti = s.fx.filter(p => p.kind === 'confetti')
  expect(confetti.length).toBe(14)
  const startY = Math.min(...confetti.map(p => p.y))
  s = run(s, 25)
  const fallen = s.fx.filter(p => p.kind === 'confetti')
  expect(Math.max(...fallen.map(p => p.y))).toBeGreaterThan(startY)
  const img = frame(run(react(still, 'cheer'), 6), [SPRITE], W, ROWS)
  expect(img.pixels.some(c => [0xff5a5a, 0xffd23f, 0x3fd1ff, 0x7dff6a, 0xd57bff].includes(c))).toBe(true)
  expect(run(s, ticks(2000)).fx.length).toBe(0)
})

test('faints like a battle: shudders, sinks out of sight dimmed, comes back up', () => {
  const s = react(still, 'tool-error')
  const shakes = new Set([1, 2, 3, 4].map(n => pose(run(s, n), 4).shake))
  expect(shakes.has(1) && shakes.has(-1)).toBe(true)
  const sunk = run(s, ticks(400) + ticks(700) + 2)
  expect(pose(sunk, 4)).toMatchObject({ sink: 4 })
  expect(count(frame(sunk, [SPRITE], W, ROWS), 0xabcdef)).toBe(0)
  const back = run(s, ticks(2500) + 1)
  expect(back.mood).toBeNull()
  expect(count(frame(back, [SPRITE], W, ROWS), 0xabcdef)).toBe(16)
  expect(lead(run(s, 30)).x).toBe(10)
})

test('squashes smoothly while compacting, then springs back with an overshoot', () => {
  const s = react(still, 'compact-start')
  const scales = [1, 3, 6, 8, 12].map(n => pose(run(s, n), 4).scale)
  for (let i = 1; i < 4; i++) expect(scales[i]).toBeLessThan(scales[i - 1] ?? 2)
  expect(Math.abs((scales[4] ?? 0) - 0.45)).toBeLessThan(0.05)
  const spring = react(run(s, 12), 'compact-end')
  const after = Array.from({ length: 18 }, (_, n) => pose(run(spring, n + 1), 4).scale)
  expect(Math.max(...after)).toBeGreaterThan(1.1)
})

test('dozes off after five idle minutes: stops, breathes, Zs float up and fade', () => {
  let s = run(still, SLEEP_TICKS + 1)
  const x = lead(s).x
  s = run(s, ticks(3000))
  expect(lead(s).x).toBe(x)
  expect(s.fx.filter(p => p.kind === 'z').length).toBeGreaterThan(0)
  const scales = Array.from({ length: 60 }, (_, n) => pose(run(s, n), 20).scale)
  expect(Math.min(...scales)).toBeLessThan(Math.max(...scales))
  expect(frame(s, [SPRITE], W, ROWS).pixels.some(c => [0xffffff, 0xdde4ff, 0xb8c2e0, 0x8c96b4].includes(c))).toBe(true)
  expect(run({ ...s, isWorking: true }, 1).idleTicks).toBe(0)
})

test('a clone rises out of the grass for each subagent and walks behind on the same path', () => {
  const big = { pixels: Array<number>(36).fill(0x654321), width: 6, height: 6 }
  let s: Status = { ...walkingRight, agents: 2 }
  s = run(s, 60, [big.width])
  expect(s.clones.length).toBe(2)
  const img = frame(s, [big], W, 6)
  expect(count(img, 0x654321)).toBe(36 + 9 * 2)
  expect(img.pixels.findIndex((c, i) => c === 0x654321 && i % W < Math.round(lead(s).x))).toBeGreaterThan(-1)
  const gone = step({ ...s, agents: 0 }, W, [big.width])
  expect(gone.clones.length).toBe(0)
  expect(gone.fx.filter(p => p.kind === 'dust').length).toBeGreaterThanOrEqual(3)
})

test('evolution swaps white silhouettes ever faster, then flashes and shows the new form', () => {
  const flips: number[] = []
  let last = evolveLook(0).isNew
  for (let t = 1; t < EVOLVE; t++) {
    const now = evolveLook(t).isNew
    if (now !== last) flips.push(t)
    last = now
  }
  const gaps = flips.slice(1).map((t, i) => t - (flips[i] ?? 0))
  expect(gaps[0]).toBeGreaterThan(gaps[gaps.length - 4] ?? 0)
  expect(evolveLook(EVOLVE - 1)).toEqual({ isNew: true, isWhite: false })
  expect(evolveLook(Math.floor(EVOLVE / 2)).isWhite).toBe(true)

  const s = run(evolve(still, 0), Math.floor(EVOLVE / 2))
  const mid = frame(s, [SPRITE], W, ROWS, { phase: 'day', evolveFrom: OTHER })
  expect(count(mid, 0xffffff)).toBe(16)
  const end = run(s, EVOLVE)
  expect(end.mood).toBeNull()
  expect(count(frame(end, [SPRITE], W, ROWS), 0xabcdef)).toBe(16)
})

test('an evolution is never cut short by a faint, hop or cheer', () => {
  const s = run(evolve(still, 0), 10)
  for (const what of ['tool-error', 'turn-answer', 'cheer', 'compact-end'] as const)
    expect(react(s, what).mood).toMatchObject({ kind: 'evolve', t: 10 })
})

test('a wild Pokémon walks in from an edge, stops mid-way to look about, and leaves', () => {
  let s = startWild(still, W, 4, () => 0.1)
  expect(s.wild).toMatchObject({ x: -4, facing: 1 })
  const xs: number[] = []
  let pauses = 0
  const facings = new Set<number>()
  for (let i = 0; i < 2000 && s.wild; i++) {
    s = step(s, W, [4], 4)
    if (s.wild) {
      xs.push(s.wild.x)
      facings.add(s.wild.facing)
      if (s.wild.pause > 0) pauses++
    }
  }
  expect(s.wild).toBeNull()
  expect(Math.max(...xs)).toBeGreaterThan(W - 2)
  expect(pauses).toBeGreaterThan(ticks(2000))
  expect(facings.size).toBe(2)
  const visiting = run(
    startWild(still, W, 4, () => 0.9),
    100,
    [4],
  )
  expect(count(frame(visiting, [SPRITE], W, ROWS, { phase: 'day', wild: OTHER }), 0x123456)).toBeGreaterThan(0)
})

test('the hour sets the light: stars, moon and fireflies at night, warm grass at dusk', () => {
  expect([3, 6, 12, 18, 21].map(phaseAt)).toEqual(['night', 'dawn', 'day', 'dusk', 'night'])
  const day = frame(still, [SPRITE], W, 8, { phase: 'day' })
  const night = frame(still, [SPRITE], W, 8, { phase: 'night' })
  const dusk = frame(still, [SPRITE], W, 8, { phase: 'dusk' })
  const sky = (img: Img) => img.pixels.slice(0, (img.height - 2) * W)
  expect(sky(day).every(c => c !== -1)).toBe(true)
  expect(sky(day).some(c => c === 0xcfd8ff || c === 0x8e9ac4)).toBe(false)
  expect(sky(night).filter(c => c === 0xcfd8ff || c === 0x8e9ac4).length).toBeGreaterThan(0)
  expect(count(night, 0xf3f0d2)).toBeGreaterThan(0)
  const grass = (img: Img) => img.pixels[(img.height - 1) * W] ?? 0
  const blue = (c: number) => c & 0xff
  const red = (c: number) => (c >> 16) & 0xff
  expect(blue(grass(night)) / Math.max(1, red(grass(night)))).toBeGreaterThan(
    blue(grass(day)) / Math.max(1, red(grass(day))),
  )
  expect(red(grass(dusk))).toBeGreaterThan(red(grass(day)))
  let fireflies = 0
  for (let t = 0; t < 100; t += 5)
    fireflies += count(frame({ ...still, t }, [SPRITE], W, 8, { phase: 'night' }), 0xd8ff6a)
  expect(fireflies).toBeGreaterThan(0)
  expect(count(night, 0xabcdef)).toBe(0)
})

test('a still scene counts as calm, so the band can draw less often', () => {
  expect(CALM_EVERY).toBeGreaterThan(1)
  expect(isCalm(still)).toBe(true)
  expect(isCalm(run(walkingRight, 5))).toBe(false)
  expect(isCalm(react(still, 'turn-answer'))).toBe(false)
  expect(isCalm(startWild(still, W, 4))).toBe(false)
  expect(isCalm(run(still, SLEEP_TICKS + 30))).toBe(true)
})

test('a wild Pokémon rustles the grass at its edge first, then steps out to a "!" from the party', () => {
  const party: Status = {
    ...still,
    actors: [
      { ...newScene(20), facing: 1, roam: walk },
      { ...newScene(40), facing: 1, roam: walk },
    ],
  }
  let s = startWild(party, W, 4, () => 0.1)
  const edge = (img: Img) =>
    [1, 2, 3].flatMap(up => img.pixels.slice((img.height - 2 - up) * W, (img.height - 2 - up) * W + 8))
  const calm = edge(frame(party, [SPRITE, SPRITE], W, ROWS)).join()
  const shakes = new Set<string>()
  for (let i = 0; i < ticks(1800); i++) {
    s = step(s, W, [4, 4], 4)
    shakes.add(edge(frame(s, [SPRITE, SPRITE], W, ROWS, { phase: 'day', wild: OTHER })).join())
    expect(s.wild?.x).toBe(-4)
  }
  expect(shakes.size).toBeGreaterThan(1)
  expect(shakes.has(calm)).toBe(false)
  while ((s.wild?.rustle ?? 0) > 0) s = step(s, W, [4, 4], 4)
  expect(s.alert).toBeGreaterThan(0)
  expect(s.actors.map(a => a.facing)).toEqual([-1, -1])
  const xs = s.actors.map(a => a.x)
  const img = frame(s, [SPRITE, SPRITE], W, ROWS, { phase: 'day', wild: OTHER })
  expect(count(img, 0xe0352b)).toBe(2 * 3)
  expect(count(img, 0xf4f4f4)).toBeGreaterThan(2 * 15)
  expect(isCalm(s)).toBe(false)
  for (let i = 0; i < ticks(1000); i++) s = step(s, W, [4, 4], 4)
  expect(s.actors.map(a => a.x)).toEqual(xs)
  for (let i = 0; i < ticks(2000); i++) s = step(s, W, [4, 4], 4)
  expect(s.alert).toBe(0)
  expect(count(frame(s, [SPRITE, SPRITE], W, ROWS, { phase: 'day', wild: OTHER }), 0xe0352b)).toBe(0)
})

test('while Claude works the lead shows a thought bubble whose dots count up', () => {
  const big = { pixels: Array<number>(20 * 16).fill(0xabcdef), width: 16, height: 20 }
  const rows = Math.ceil((big.height + 1 + HEADROOM) / 2)
  let s = react({ ...walkingRight, actors: [{ ...newScene(25), facing: 1, roam: walk }] }, 'turn-start')
  const dots = new Set<number>()
  for (let i = 0; i < ticks(2000); i++) {
    s = step(s, 90, [16], 0, () => 0.99)
    const img = frame(s, [big], 90, rows)
    expect(count(img, 0xf4f4f4)).toBeGreaterThan(20)
    dots.add(count(img, 0x2a2a2a))
    expect(img.pixels.some(c => [0xdadada, 0xb4b4b4, 0x8c8c8c, 0x6a6a6a].includes(c))).toBe(false)
  }
  expect([...dots].sort()).toEqual([0, 1, 2, 3])
  const resting = frame({ ...s, isWorking: false }, [big], 90, rows)
  expect(count(resting, 0xf4f4f4)).toBe(0)
  expect(count(frame(react(s, 'turn-answer'), [big], 90, rows), 0xf4f4f4)).toBe(0)
})

test('roams unpredictably: short strolls, stops, and turns far from the walls', () => {
  let seed = 3
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const width = 300
  let scene: Scene = newScene(150)
  let turnsInOpen = 0
  let turnsNearWall = 0
  let stops = 0
  let walked = 0
  const strolls: number[] = []
  for (let i = 0; i < ticks(20 * 60_000); i++) {
    const before = scene
    scene = advance(scene, width, 10, rand)
    walked += Math.abs(scene.x - before.x)
    if (scene.facing !== before.facing && before.roam.kind === 'turn') {
      if (Math.min(scene.x, width - 10 - scene.x) > 20) turnsInOpen++
      else turnsNearWall++
    }
    if (scene.roam.kind !== before.roam.kind && before.roam.kind === 'walk') {
      strolls.push(walked)
      walked = 0
    }
    if (scene.roam.kind === 'idle' && before.roam.kind !== 'idle') stops++
  }
  expect(turnsInOpen).toBeGreaterThan(3 * turnsNearWall)
  expect(stops).toBeGreaterThan(50)
  const average = strolls.reduce((a, b) => a + b, 0) / strolls.length
  expect(average).toBeLessThan(12)
  expect(average).toBeGreaterThan(2)
})

test('the "..." bubble steps aside for the "!" and comes back if Claude is still working', () => {
  const big = { pixels: Array<number>(20 * 16).fill(0xabcdef), width: 16, height: 20 }
  const rows = Math.ceil((big.height + 1 + HEADROOM) / 2)
  let s = startWild(react({ ...still, actors: [{ ...newScene(40), roam: idle }] }, 'turn-start'), 90, 4, () => 0.1)
  const looks = (img: Img) => ({ dots: count(img, 0x2a2a2a), mark: count(img, 0xe0352b) })
  while ((s.wild?.rustle ?? 0) > 0) s = step(s, 90, [16], 4)
  let during = { dots: 0, mark: 0 }
  while (s.alert > 0) {
    const seen = looks(frame(s, [big], 90, rows, { phase: 'day', wild: OTHER }))
    during = { dots: during.dots + seen.dots, mark: during.mark + seen.mark }
    s = step(s, 90, [16], 4)
  }
  expect(during.mark).toBeGreaterThan(0)
  expect(during.dots).toBe(0)
  let after = 0
  for (let i = 0; i < ticks(2000); i++) {
    s = step(s, 90, [16], 4)
    after += looks(frame(s, [big], 90, rows, { phase: 'day', wild: OTHER })).dots
  }
  expect(after).toBeGreaterThan(0)
})

test('while Claude works they still stroll unpredictably, just faster and with only brief pauses', () => {
  let seed = 5
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const width = 300
  let scene: Scene = newScene(150)
  let turnsInOpen = 0
  let turnsNearWall = 0
  let longestPause = 0
  let pause = 0
  for (let i = 0; i < ticks(10 * 60_000); i++) {
    const before = scene
    scene = advance(scene, width, 10, rand, true)
    if (scene.facing !== before.facing && before.roam.kind === 'turn') {
      if (Math.min(scene.x, width - 10 - scene.x) > 20) turnsInOpen++
      else turnsNearWall++
    }
    pause = scene.v === 0 ? pause + 1 : 0
    longestPause = Math.max(longestPause, pause)
  }
  expect(turnsInOpen).toBeGreaterThan(3 * turnsNearWall)
  expect(longestPause).toBeLessThan(ticks(1200))
})

test('each Pokémon keeps its place when the party changes; only newcomers land somewhere new', () => {
  const at = (x: number) => ({ ...newScene(), x })
  const placed = (x: number) => () => at(x)
  const xs = (actors: { x: number }[]) => actors.map(a => a.x)
  const party = [at(10), at(50), at(90)]
  // An evolution: the slot's Pokémon changes, its place stays.
  expect(xs(carryActors(['a', 'b', 'c'], ['a', 'B', 'c'], party, placed(0)))).toEqual([10, 50, 90])
  // Reordering and releasing move no one else.
  expect(xs(carryActors(['a', 'b', 'c'], ['c', 'a', 'b'], party, placed(0)))).toEqual([90, 10, 50])
  expect(xs(carryActors(['a', 'b', 'c'], ['a', 'c'], party, placed(0)))).toEqual([10, 90])
  // A newcomer joining lands where it's placed.
  expect(xs(carryActors(['a', 'b'], ['a', 'b', 'd'], party, placed(7)))).toEqual([10, 50, 7])
})

test('nobody dozes off with a wild Pokémon around, and its "!" leaves with it', () => {
  const tired = { ...initialStatus(), actors: [newScene(10)], idleTicks: SLEEP_TICKS }
  expect(isAsleep(tired)).toBe(true)
  expect(isAsleep(startWild(tired, 80, 10))).toBe(false)
  // The visitor gone early (the band shrank under it): the "!" goes too.
  const alerted = { ...initialStatus(), actors: [newScene(10)], alert: 40 }
  expect(step(alerted, 80, [10]).alert).toBe(0)
})
