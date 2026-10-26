import { expect, test } from 'claude-code/testing'

import { backdrop } from '../hooks/backdrop'
import { ALL_HELP, suggest } from '../hooks/commands'
import { drawWild } from '../hooks/encounter'
import type { Where } from '../hooks/encounter'
import { dueStages, timeMatches } from '../hooks/evolution'
import type { Stage } from '../hooks/evolution'
import {
  DUSK_VISITORS,
  FULL_MOON,
  isFullMoonAt,
  moonAge,
  moonPhaseAt,
  moonShape,
  NEW_MOON,
  SYNODIC_DAYS,
} from '../hooks/moon'
import { emptySave, evolvesText } from '../hooks/save'
import type { Save } from '../hooks/save'
import { CHAIN_OF, CHAINS, LIST } from './fixtures/evolutions'
import { begin, cmd, hourAt, KIT, member, mountBand } from './world'
import type { Net } from './world'

const MOON = 0xf3f0d2
const DAY_MS = 86_400_000

test('the moon phase from the date: 2026 full and new moons', () => {
  // Full moons on 3 January and 26 October 2026, new moons on 18 January and 9 November.
  for (const at of ['2026-01-03T10:03Z', '2026-10-26T04:12Z']) {
    expect([at, moonPhaseAt(Date.parse(at))]).toEqual([at, FULL_MOON])
    expect([at, isFullMoonAt(Date.parse(at))]).toEqual([at, true])
  }
  for (const at of ['2026-01-18T19:52Z', '2026-11-09T07:02Z']) {
    expect([at, moonPhaseAt(Date.parse(at))]).toEqual([at, NEW_MOON])
    expect([at, isFullMoonAt(Date.parse(at))]).toEqual([at, false])
  }
  // Within a day of full counts; two days off doesn't. A week after the full moon is the last quarter.
  const full = Date.parse('2026-10-26T04:12Z')
  expect(isFullMoonAt(full + 0.8 * DAY_MS)).toBe(true)
  expect(isFullMoonAt(full - 0.8 * DAY_MS)).toBe(true)
  expect(isFullMoonAt(full + 2 * DAY_MS)).toBe(false)
  expect(moonPhaseAt(full + 7.4 * DAY_MS)).toBe(6)
  // The age wraps cleanly, before the reference new moon too.
  expect(moonAge(0)).toBeGreaterThanOrEqual(0)
  expect(moonAge(0)).toBeLessThan(SYNODIC_DAYS)
})

test('eight moon shapes: none lit at new moon, a sliver for a crescent, all of it full, waxing on the right', () => {
  const lit = (phase: number) => moonShape(phase).filter(p => p.isLit)
  expect(lit(NEW_MOON)).toHaveLength(0)
  // A new moon is still a faint disc, not nothing.
  expect(moonShape(NEW_MOON).length).toBe(moonShape(FULL_MOON).length)
  const counts = [0, 1, 2, 3, 4].map(p => lit(p).length)
  expect(counts).toEqual([...counts].sort((a, b) => a - b))
  expect(new Set(counts).size).toBe(5)
  expect(lit(FULL_MOON).length).toBe(moonShape(FULL_MOON).length)
  // Waxing lights the right, waning the left; the two quarters mirror each other.
  expect(lit(2).every(p => p.x >= 3)).toBe(true)
  expect(lit(6).every(p => p.x <= 3)).toBe(true)
  expect(lit(1).every(p => p.x >= 4)).toBe(true)
  expect(lit(7).every(p => p.x <= 2)).toBe(true)
  expect(lit(2).length).toBe(lit(6).length)
  // Worked out once per shape.
  expect(moonShape(5)).toBe(moonShape(5))
})

test('the night band draws a full moon and a crescent differently', () => {
  const W = 90
  const H = 28
  const paint = (moon: number) => {
    const out = { pixels: Array<number>(W * H).fill(-1), width: W, height: H }
    backdrop(out, 'night', 'meadow', 0, 20, W, moon)
    return out.pixels
  }
  const bright = (moon: number) => paint(moon).filter(c => c === MOON).length
  expect(bright(FULL_MOON)).toBeGreaterThan(30)
  expect(bright(1)).toBeGreaterThan(0)
  expect(bright(1)).toBeLessThan(bright(FULL_MOON) / 3)
  expect(bright(NEW_MOON)).toBe(0)
  expect(paint(FULL_MOON).join()).not.toBe(paint(1).join())
  expect(paint(NEW_MOON).join()).not.toBe(paint(1).join())
})

test('Ursaluna: a Peat Block works only on a night within a day of the full moon', () => {
  expect(timeMatches('full-moon', 'night', true)).toBe(true)
  expect(timeMatches('full-moon', 'night', false)).toBe(false)
  expect(timeMatches('full-moon', 'day', true)).toBe(false)
  // Plain night evolutions don't care about the moon.
  expect(timeMatches('night', 'night', false)).toBe(true)
  const luna = { species: 'ursaluna', way: { kind: 'hold', item: 'peat-block', time: 'full-moon' } } as Stage
  const base = { level: 40, phase: 'night' as const, heldItem: 'peat-block', togetherMs: 0, party: [], partyTypes: [] }
  expect(dueStages([luna], base)).toEqual([])
  expect(dueStages([luna], { ...base, isFullMoon: true })).toEqual([luna])
  const ursaring = member('ursaring', {
    next: [{ species: 'ursaluna', way: { kind: 'item', item: 'peat-block', time: 'full-moon' } }],
  })
  expect(evolvesText(ursaring)).toBe('evolves with a Peat Block only under a full moon')
})

// The real evolution data, and a clock at 23:00 on the day `days` after the epoch.
const chains = Object.fromEntries(LIST.map(s => [s.name, CHAINS[CHAIN_OF[s.name] ?? -1]]).filter(([, c]) => c))
const netAt = (days: number): Net => ({
  isOnline: true,
  list: JSON.stringify(LIST),
  chains,
  now: days * DAY_MS + hourAt(23),
})
const fullNight = Array.from({ length: 30 }, (_, d) => d).find(d => isFullMoonAt(d * DAY_MS + hourAt(23))) ?? 0
const ursaringSave = (): Save => ({
  ...emptySave(),
  party: [member('ursaring', { id: 'u' })],
  bag: { 'peat-block': 1 },
})

test('a Peat Block on a night without a full moon: not yet, and when the next one is', KIT, async ($, on) => {
  // A week off the full moon.
  const w = await begin($, on, ursaringSave(), undefined, undefined, netAt(fullNight + 7))
  const said = await cmd($, 'pokemon', 'give peat-block ursaring')
  expect(said).toMatch(/^Ursaring can use a Peat Block only under a full moon: the next is in about \d+ days\.$/)
  expect(w.saveNow().party[0]?.species).toBe('ursaring')
  expect(w.saveNow().bag?.['peat-block']).toBe(1)
})

test('a Peat Block under a full moon: Ursaring becomes Ursaluna', KIT, async ($, on) => {
  const w = await begin($, on, ursaringSave(), undefined, undefined, netAt(fullNight))
  await cmd($, 'pokemon', 'give peat-block ursaring')
  for (let i = 0; i < 50 && w.saveNow().party[0]?.species !== 'ursaluna'; i++) {
    await w.clock.advance(1_000)
    await cmd($, 'pokemon', 'party')
  }
  expect(w.saveNow().party[0]?.species).toBe('ursaluna')
})

// A small seeded generator, so the odds are the same every run.
const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}
const at = (phase: Where['phase'], moon?: number): Where => ({
  landscape: 'meadow',
  phase,
  dex: {},
  ...(moon === undefined ? {} : { moon }),
})
const share = (where: Where, isOne: (species: string) => boolean, n = 20_000) => {
  const rand = seeded(11)
  let hits = 0
  for (let i = 0; i < n; i++) if (isOne(drawWild(LIST, where, rand).species)) hits++
  return hits / n
}
const isDusky = (species: string) => DUSK_VISITORS.includes(species)

test('about one wild visit in four at dusk is a dusk visitor; by day they are rare', { timeoutMs: 120_000 }, () => {
  expect(DUSK_VISITORS.every(name => LIST.some(s => s.name === name))).toBe(true)
  const dusk = share(at('dusk'), isDusky)
  expect(dusk).toBeGreaterThan(0.24)
  expect(dusk).toBeLessThan(0.3)
  expect(share(at('day'), isDusky)).toBeLessThan(0.03)
  // The injected rand decides: a low first draw brings one, the second picks which.
  expect(drawWild(LIST, at('dusk'), () => 0).species).toBe(DUSK_VISITORS[0])
  const picks = [0.1, 0.99]
  expect(drawWild(LIST, at('dusk'), () => picks.shift() ?? 0).species).toBe(DUSK_VISITORS[DUSK_VISITORS.length - 1])
  // All eight come.
  const rand = seeded(12)
  const met = new Set<string>()
  // One place and time for every draw: the draw caches its table by it.
  const evening = at('dusk')
  for (let i = 0; i < 4_000; i++) met.add(drawWild(LIST, evening, rand).species)
  expect(DUSK_VISITORS.filter(name => !met.has(name))).toEqual([])
})

test('a Clefairy comes about one night visit in ten under a full moon, hardly ever otherwise', () => {
  const isClefairy = (species: string) => species === 'clefairy'
  const full = share(at('night', FULL_MOON), isClefairy, 20_000)
  expect(full).toBeGreaterThan(0.08)
  expect(full).toBeLessThan(0.13)
  expect(share(at('night', 2), isClefairy, 20_000)).toBeLessThan(0.01)
  // Under a full moon by day, nothing special.
  expect(share(at('day', FULL_MOON), isClefairy, 20_000)).toBeLessThan(0.01)
  expect(drawWild(LIST, at('night', FULL_MOON), () => 0).species).toBe('clefairy')
})

// How many of the band's cells show the moon's colour, as the terminal got them (three words a cell: the character,
// its colour and the background).
const moonCells = (cells: string) => {
  const words = new Uint32Array(Uint8Array.from(atob(cells), c => c.charCodeAt(0)).buffer)
  let n = 0
  for (let i = 0; i < words.length; i += 3) if (words[i + 1] === MOON || words[i + 2] === MOON) n++
  return n
}

// A lead 12 cells tall, so the band has sky enough above the hills for the whole moon.
const TALL = Array.from({ length: 12 }, () => `\x1b[38;2;9;9;9m\x1b[48;2;9;9;9m▀\x1b[0m`.repeat(8)).join('\n')

test('/pokemon-play full moon, new moon and moon show the night sky under that moon', KIT, async ($, on) => {
  // Daytime, a week from the full moon.
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu')] }, TALL, undefined, {
    isOnline: true,
    list: JSON.stringify(LIST),
    now: (fullNight + 7) * DAY_MS + hourAt(12),
  })
  await cmd($, 'pokemon', 'party')
  await mountBand($ as never)
  const shownNow = async (args: string) => {
    const said = await cmd($, 'pokemon-play', args)
    await w.clock.advance(1_000)
    return { said, moon: moonCells(w.band.cells) }
  }
  // The meadow, whose sky goes all the way down to the grass.
  const full = await shownNow('full moon meadow')
  expect(full.said).toBe('Showing a full moon over the meadow for 15 seconds.')
  const crescent = await shownNow('crescent moon meadow')
  expect(crescent.said).toBe('Showing a waxing crescent over the meadow for 15 seconds.')
  const none = await shownNow('new moon meadow')
  expect(none.said).toBe('Showing a new moon over the meadow for 15 seconds.')
  expect(await cmd($, 'pokemon-play', 'full moon')).toBe('Showing a full moon for 15 seconds.')
  expect(full.moon).toBeGreaterThan(2 * crescent.moon)
  expect(crescent.moon).toBeGreaterThan(0)
  expect(none.moon).toBe(0)
  const tonight = await shownNow('moon')
  expect(tonight.said).toMatch(/^Showing tonight's (last quarter|waning (gibbous|crescent)) for 15 seconds\.$/)
  // After 15 seconds the sky is the day's again.
  await w.clock.advance(15_000)
  expect(moonCells(w.band.cells)).toBe(0)
})

test('the moon words in /pokemon-help and the typeahead', () => {
  for (const word of ['moon', 'full moon', 'new moon', 'crescent moon'])
    expect([word, ALL_HELP.includes(word)]).toEqual([word, true])
  expect(ALL_HELP.split('\n').filter(l => [...l].length > 60)).toEqual([])
  const typed = '/pokemon-play m'
  const owned = { party: [], box: [], bag: {}, levelOf: () => 1 }
  const texts = suggest(typed, typed.length, 'm', typed.length - 1, owned).map(r => r.text)
  expect(texts).toContain('moon')
  const full = '/pokemon-play fu'
  expect(suggest(full, full.length, 'fu', full.length - 2, owned).map(r => r.text)).toEqual(['full moon'])
})
