// Wild visitors and summons under region locks: random visitors from the current region (after another window's
// travel too), a stale random visitor refused, named visitors, summons and owned Pokémon free of locks, and seen
// progress by region.
import { expect, test } from 'claude-code/testing'

import { TRAVEL_REGIONS, seenIn as seenInRegion, unlockedOf } from '../hooks/travel-regions'
import type { Journey, TravelRegion } from '../hooks/travel-regions'
import { FRIENDSHIP_MS } from '../hooks/evolution'
import { emptySave, xpForLevel } from '../hooks/save'
import type { Save } from '../hooks/save'
import {
  answerTools,
  ART,
  bash,
  begin,
  CHAINS,
  cmd,
  end,
  hourAt,
  KIT,
  LIST,
  lv,
  member,
  mountBand,
  named,
  preFeature,
  until,
} from './world'
import type { Net } from './world'

const [KANTO, JOHTO, , , UNOVA] = TRAVEL_REGIONS as [
  TravelRegion,
  TravelRegion,
  TravelRegion,
  TravelRegion,
  TravelRegion,
]
const IN_JOHTO: Journey = { current: 'johto', tickets: ['johto'], starters: { johto: { species: 'chikorita' } } }

// `size` rows of `width` columns of one colour.
const solid = (rgb: string, size: number, width = size) =>
  Array.from({ length: size }, () => `\x1b[38;2;${rgb}m\x1b[48;2;${rgb}m▀\x1b[0m`.repeat(width)).join('\n')
const TALL = solid('9;9;9', 12)
// A wild visitor easy to find in the band: a solid cyan block.
const BLOCK = solid('0;255;255', 8)
const CYAN = '#00ffff'
const CACHE = '/home/ash/.cache/claude-code-pokemon'

// Four Kanto species and one Johto species, every one drawn as the cyan block.
const MIXED = ['caterpie', 'weedle', 'pidgey', 'rattata', 'chikorita']
const mixedNet = (): Net => ({
  isOnline: true,
  list: JSON.stringify(MIXED.map(name => ({ name, forms: ['regular'] }))),
  sprites: Object.fromEntries(MIXED.map(n => [n, BLOCK])),
})
// Only these species in the downloaded list.
const onlyNet = (list: { name: string; forms: string[] }[]): Net => ({
  isOnline: true,
  list: JSON.stringify(list),
  sprites: Object.fromEntries(list.map(s => [s.name, BLOCK])),
})
const pikachuAndChikorita = () =>
  onlyNet([
    { name: 'pikachu', forms: ['regular'] },
    { name: 'chikorita', forms: ['regular'] },
  ])

type Aim = {
  pointer: (e: { type: 'down'; x: number; y: number; button: 'left' }) => Promise<void>
  drawn: () => Promise<unknown>
  redraw: () => Promise<void>
}
type Line = [string, string, string][]
type World = Awaited<ReturnType<typeof begin>>

// The band's text lines while the click layer draws it (null when it's pixel art).
async function aimLines(aim: Aim): Promise<Line[] | null> {
  await aim.redraw()
  const find = (node: unknown): Line[] | null => {
    if (typeof node !== 'object' || node === null) return null
    const n = node as { type?: string; props?: { key?: string; props?: { lines?: Line[] } } }
    if (n.type === 'Client' && n.props?.key === 'aim') return n.props.props?.lines ?? null
    for (const child of Object.values(node)) {
      const found = find(child)
      if (found) return found
    }
    return null
  }
  return find(await aim.drawn())
}
// The first cell the text band draws as a bare `hex` background.
function cellIn(lines: Line[] | null, hex: string) {
  for (const [y, runs] of (lines ?? []).entries()) {
    let x = 0
    for (const [text, , bg] of runs) {
      if (text.startsWith(' ') && bg === hex) return { x, y }
      x += text.length
    }
  }
  return null
}
// Moves the clock on until the visitor can be aimed at.
async function aimable(w: World, aim: Aim) {
  for (let i = 0; i < 200; i++) {
    const cell = cellIn(await aimLines(aim), CYAN)
    if (cell) return cell
    await w.clock.advance(50)
  }
  throw new Error('never showed up')
}
// A party of one in daylight with the band up.
async function banded($: Parameters<typeof cmd>[0]) {
  await cmd($, 'pokemon', 'party')
  const aim = (await mountBand($ as never)) as Aim
  await cmd($, 'pokemon-play', 'day')
  return aim
}
const gotcha = (w: World) => w.toasts.filter(t => t.startsWith('Gotcha'))
// Balls at `name` until it is caught, bringing it back by name whenever it has run off.
async function catchByName($: Parameters<typeof cmd>[0], w: World, aim: Aim, name: string) {
  for (let i = 0; i < 60 && !gotcha(w).length; i++) {
    await cmd($, 'pokemon-play', `wild ${name}`)
    const cell = cellIn(await aimLines(aim), CYAN)
    if (cell) await aim.pointer({ type: 'down', ...cell, button: 'left' })
    for (let t = 0; t < 20 && !gotcha(w).length; t++) await w.clock.advance(250)
  }
  expect(gotcha(w)).toHaveLength(1)
}
// Another window travels: its save write and its copy write.
function otherWindowTravels(w: World, journey: Journey) {
  w.store.set('save', { ...w.saveNow(), journey })
  w.store.set('journey', journey)
}
const seenOf = (w: World, r: TravelRegion) => seenInRegion(w.saveNow().dex, r)
const caught = (s: Save) => ({ party: s.party.map(m => m.id), box: (s.box ?? []).map(m => m.id), dex: s.dex })

// ── Random visitors ──

test('an unseen random Pikachu in Kanto raises Kanto seen by one, and Johto none', KIT, async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('eevee')] }, TALL, undefined, pikachuAndChikorita())
  await banded($)
  const [kanto, johto] = [seenOf(w, KANTO), seenOf(w, JOHTO)]
  expect(await cmd($, 'pokemon-play', 'wild')).toBe('A wild Pikachu wanders by.')
  expect(seenOf(w, KANTO)).toBe(kanto + 1)
  expect(seenOf(w, JOHTO)).toBe(johto)
})

test('random visitors in Kanto are only ever Kanto species', { timeoutMs: 120_000 }, async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('eevee')] }, TALL, undefined, mixedNet())
  await banded($)
  const came = () => w.toasts.filter(t => /appeared!$/.test(t))
  for (let i = 0; i < 400 && came().length < 8; i++) {
    await cmd($, 'pokemon-play', 'wild')
    await w.clock.advance(5_000)
  }
  expect(came().length).toBe(8)
  expect(came().filter(t => t.includes('Chikorita'))).toEqual([])
})

test('Rattata and Alolan Rattata as random visitors count once for Kanto', { timeoutMs: 120_000 }, async ($, on) => {
  const w = await begin(
    $,
    on,
    { ...emptySave(), party: [member('eevee')] },
    TALL,
    undefined,
    onlyNet([{ name: 'rattata', forms: ['regular', 'alola'] }]),
  )
  await banded($)
  const kanto = seenOf(w, KANTO)
  const came = (name: string) => w.toasts.some(t => t.endsWith(`A wild ${name} appeared!`))
  for (let i = 0; i < 600 && !(came('Rattata') && came('Rattata (Alola)')); i++) {
    await cmd($, 'pokemon-play', 'wild')
    await w.clock.advance(5_000)
  }
  expect([came('Rattata'), came('Rattata (Alola)')]).toEqual([true, true])
  expect(seenOf(w, KANTO)).toBe(kanto + 1)
  expect(w.saveNow().dex.rattata?.seen).toBeGreaterThanOrEqual(2)
})

test(
  'after another window sails to Johto, the next random visitor here is from Johto, with no wait for the sync',
  KIT,
  async ($, on) => {
    const w = await begin($, on, { ...emptySave(), party: [member('eevee')] }, TALL, undefined, mixedNet())
    await banded($)
    otherWindowTravels(w, IN_JOHTO)
    expect(await cmd($, 'pokemon-play', 'wild')).toBe('A wild Chikorita wanders by.')
  },
)

test(
  'in a region the species list has nothing for, no random visitor comes; a named one still does',
  KIT,
  async ($, on) => {
    const journey: Journey = { current: 'unova', tickets: ['johto', 'hoenn', 'sinnoh', 'unova'], starters: {} }
    const w = await begin($, on, { ...emptySave(), journey, party: [member('eevee')] }, TALL, undefined, mixedNet())
    await banded($)
    expect(await cmd($, 'pokemon-play', 'wild')).toBe('No wild Pokémon showed up.')
    expect(w.toasts.filter(t => /appeared!$/.test(t))).toEqual([])
    expect(seenOf(w, UNOVA)).toBe(0)
    expect(await cmd($, 'pokemon-play', 'wild caterpie')).toBe('A wild Caterpie wanders by.')
  },
)

test(
  'a random Kanto visitor out when another window sails to Johto runs off at the next sync; a named one stays',
  KIT,
  async ($, on) => {
    const w = await begin($, on, { ...emptySave(), party: [member('eevee')] }, TALL, undefined, mixedNet())
    const aim = await banded($)
    expect(await cmd($, 'pokemon-play', 'wild')).toMatch(/^A wild (Caterpie|Weedle|Pidgey|Rattata) wanders by\.$/)
    await aimable(w, aim)
    otherWindowTravels(w, IN_JOHTO)
    await w.clock.advance(11_000)
    expect(w.toasts.filter(t => /ran off: you're in Johto now\.$/.test(t))).toHaveLength(1)
    for (let i = 0; i < 40 && (await cmd($, 'pokemon-play', 'wild')).endsWith('is still here.'); i++)
      await w.clock.advance(1_000)
    expect(w.toasts.filter(t => /appeared!$/.test(t)).at(-1)).toMatch(/A wild Chikorita appeared!$/)
  },
)

test('a named Kanto visitor stays when another window sails to Johto, and can still be caught', KIT, async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('eevee')] }, TALL, undefined, mixedNet())
  const aim = await banded($)
  expect(await cmd($, 'pokemon-play', 'wild caterpie')).toBe('A wild Caterpie wanders by.')
  otherWindowTravels(w, IN_JOHTO)
  await w.clock.advance(11_000)
  expect(w.toasts.filter(t => /ran off/.test(t))).toEqual([])
  await catchByName($, w, aim, 'caterpie')
  expect(w.saveNow().dex.caterpie?.caught).toBe(1)
})

test(
  'a random Kanto visitor in a ball when the store says Johto is not caught: it runs off, and nothing is kept',
  KIT,
  async ($, on) => {
    const w = await begin($, on, { ...emptySave(), party: [member('eevee')] }, TALL, undefined, mixedNet())
    const aim = await banded($)
    const said = await cmd($, 'pokemon-play', 'wild')
    expect(said).toMatch(/^A wild (Caterpie|Weedle|Pidgey|Rattata) wanders by\.$/)
    const name = said.replace(/^A wild (.+) wanders by\.$/, '$1')
    const cell = await aimable(w, aim)
    const before = caught(w.saveNow())
    otherWindowTravels(w, IN_JOHTO)
    for (let i = 0; i < 10 && !w.toasts.some(t => t.includes('ran off')); i++) {
      const at = cellIn(await aimLines(aim), CYAN) ?? cell
      await aim.pointer({ type: 'down', ...at, button: 'left' })
      for (let t = 0; t < 20 && !w.toasts.some(x => x.includes('ran off')); t++) await w.clock.advance(250)
    }
    expect(w.toasts.filter(t => t === `The wild ${name} ran off: you're in Johto now.`)).toHaveLength(1)
    expect(gotcha(w)).toEqual([])
    expect(caught(w.saveNow())).toEqual({ ...before, dex: w.saveNow().dex })
    expect(Object.values(w.saveNow().dex).filter(e => e.caught)).toEqual(
      Object.values(before.dex).filter(e => e.caught),
    )
    expect(w.saveNow().journey).toEqual(IN_JOHTO)
  },
)

test(
  'the species list offline when the timer fires: no visitor, and the failure is reported once',
  {
    timeoutMs: 120_000,
  },
  async ($, on) => {
    answerTools(on)
    const files = new Map([[`${CACHE}/sprites/regular/eevee`, TALL]])
    const w = await begin($, on, { ...emptySave(), party: [member('eevee', { next: [] })] }, TALL, files, {
      ...mixedNet(),
      isOnline: false,
    })
    await cmd($, 'pokemon', 'party')
    await mountBand($ as never)
    for (let i = 0; i < 45; i++) {
      await $.tool.call(bash('pytest -q') as never)
      await w.clock.advance(60_000)
    }
    expect(w.toasts.filter(t => /appeared!$/.test(t))).toEqual([])
    expect(w.toasts.filter(t => t.startsWith('Pokémon: '))).toHaveLength(1)
  },
)

// ── Named visitors ──

test(
  '/pokemon-play wild pikachu in Kanto, caught: in the party as caught, Kanto seen up by one',
  KIT,
  async ($, on) => {
    const w = await begin($, on, { ...emptySave(), party: [member('eevee')] }, TALL, undefined, pikachuAndChikorita())
    const aim = await banded($)
    const kanto = seenOf(w, KANTO)
    await catchByName($, w, aim, 'pikachu')
    expect(w.saveNow().party.find(m => m.species === 'pikachu')).toMatchObject({ isCaught: true })
    expect(w.saveNow().dex.pikachu).toMatchObject({ seen: expect.any(Number), caught: 1 })
    expect(seenOf(w, KANTO)).toBe(kanto + 1)
  },
)

test(
  '/pokemon-play wild chikorita in Kanto with Johto locked, caught: Johto seen up by one, Johto still locked',
  { timeoutMs: 120_000 },
  async ($, on) => {
    const w = await begin($, on, { ...emptySave(), party: [member('eevee')] }, TALL, undefined, pikachuAndChikorita())
    const aim = await banded($)
    const johto = seenOf(w, JOHTO)
    await catchByName($, w, aim, 'chikorita')
    expect(w.saveNow().party.find(m => m.species === 'chikorita')).toMatchObject({ isCaught: true })
    expect(w.saveNow().dex.chikorita?.caught).toBe(1)
    expect(seenOf(w, JOHTO)).toBe(johto + 1)
    expect(unlockedOf(w.saveNow().journey)).toEqual([KANTO])
    expect(w.saveNow().journey.current).toBe('kanto')
  },
)

test('/pokemon-play wild notamon gets the same unknown-Pokémon reply as before regions', KIT, async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('eevee')] }, TALL, undefined, mixedNet())
  await banded($)
  expect(await cmd($, 'pokemon-play', 'wild notamon')).toBe('No Pokémon called "notamon".')
})

// ── Summons and owned Pokémon ──

test('/pokemon pikachu counts Pikachu seen, Kanto up by one', KIT, async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('eevee')] })
  const kanto = seenOf(w, KANTO)
  expect(await cmd($, 'pokemon', 'pikachu')).toContain('Pikachu')
  expect(w.saveNow().party[0]?.species).toBe('pikachu')
  expect(w.saveNow().dex.pikachu).toBeDefined()
  expect(seenOf(w, KANTO)).toBe(kanto + 1)
})

test('/pokemon add chikorita in Kanto with Johto locked: it joins, Johto stays locked', KIT, async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('eevee')] }, TALL, undefined, pikachuAndChikorita())
  expect(await cmd($, 'pokemon', 'add chikorita')).toMatch(/Chikorita joined your party!/)
  expect(w.saveNow().party.map(m => m.species)).toContain('chikorita')
  expect(unlockedOf(w.saveNow().journey)).toEqual([KANTO])
})

test('an owned Johto Pokémon in the box leads in Kanto with Johto locked', KIT, async ($, on) => {
  const w = await begin($, on, {
    ...emptySave(),
    party: [member('eevee')],
    box: [member('crobat', { id: 'bat', next: [] })],
  })
  expect(await cmd($, 'pokemon', 'crobat')).toMatch(/^Crobat \(Lv 1\) came out of the PC box to lead your party\./)
  expect(w.saveNow().party[0]?.id).toBe('bat')
  expect(unlockedOf(w.saveNow().journey)).toEqual([KANTO])
})

test(
  'a kept save with an Unova Pokémon in the box: it comes out and evolves with only Kanto open',
  KIT,
  async ($, on) => {
    const leaf = { species: named('snivy'), evolves_to: [end('servine', [{ min_level: 17 }])] }
    const saved: Save = {
      ...emptySave(),
      evolution: 'auto',
      party: [member('eevee')],
      box: [member('snivy', { id: 'leaf', xp: xpForLevel(16), next: [lv('servine', 17)] })],
      bag: { 'rare-candy': 1 },
    }
    const list = [...LIST, { name: 'snivy', forms: ['regular'] }, { name: 'servine', forms: ['regular'] }]
    const net: Net = { isOnline: true, list: JSON.stringify(list), chains: { ...CHAINS, snivy: leaf, servine: leaf } }
    const w = await begin($, on, preFeature(saved), undefined, undefined, net)
    expect(await cmd($, 'pokemon', 'add snivy')).toBe('Snivy came out of the PC box and joined your party!')
    expect(await cmd($, 'pokemon', 'give rare candy snivy')).toBe('Snivy grew to Lv 17!')
    await until($, () => w.saveNow().party.find(m => m.id === 'leaf')?.species === 'servine')
    expect(unlockedOf(w.saveNow().journey)).toEqual([KANTO])
  },
)

// ── Evolutions ──

test(
  'Eevee evolving into Espeon in Kanto counts Espeon seen and caught for Johto, which stays locked',
  KIT,
  async ($, on) => {
    const net: Net = {
      isOnline: true,
      list: JSON.stringify(LIST),
      now: hourAt(12),
      keys: { together: { at: 0, ms: { e: FRIENDSHIP_MS - 30_000 } } },
    }
    const w = await begin(
      $,
      on,
      { ...emptySave(), evolution: 'auto', party: [member('eevee', { id: 'e' })] },
      ART,
      undefined,
      net,
    )
    const johto = seenOf(w, JOHTO)
    await w.clock.advance(120_000)
    await until($, () => w.saveNow().party[0]?.species === 'espeon')
    expect(w.saveNow().dex.espeon).toMatchObject({ seen: 1, caught: 1 })
    expect(seenOf(w, JOHTO)).toBe(johto + 1)
    expect(unlockedOf(w.saveNow().journey)).toEqual([KANTO])
  },
)

test('a Charmander from /pokemon add that evolves into Charmeleon counts for Kanto', KIT, async ($, on) => {
  const w = await begin($, on, {
    ...emptySave(),
    evolution: 'auto',
    party: [member('eevee')],
    bag: { 'rare-candy': 15 },
  })
  expect(await cmd($, 'pokemon', 'add charmander')).toMatch(/Charmander joined your party!/)
  const kanto = seenOf(w, KANTO)
  for (let i = 0; i < 15; i++) await cmd($, 'pokemon', 'give rare candy charmander')
  await until($, () => w.saveNow().party.some(m => m.species === 'charmeleon'))
  expect(w.saveNow().dex.charmeleon).toMatchObject({ seen: 1, caught: 1 })
  expect(seenOf(w, KANTO)).toBe(kanto + 1)
})
