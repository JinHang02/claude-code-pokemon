import { expect, test } from 'claude-code/testing'

import {
  dueStarter,
  findRegion,
  hasArrived,
  isObject,
  keptJourney,
  loadJourney,
  newestOf,
  newJourney,
  readTicketWords,
  regionById,
  regionOf,
  TRAVEL_REGIONS,
  requiredSeen,
  SEEN_SHARE,
  seenIn,
  speciesIn,
  TICKET_PRICE,
  ticketState,
  unlockedOf,
} from '../hooks/travel-regions'
import type { Journey, TravelRegion, RegionId } from '../hooks/travel-regions'
import type { DexEntry } from '../hooks/save'

const region = (id: RegionId): TravelRegion => {
  const r = TRAVEL_REGIONS.find(x => x.id === id)
  if (!r) throw new Error(`no region ${id}`)
  return r
}
const KANTO = region('kanto')
const JOHTO = region('johto')
const HOENN = region('hoenn')

const dexOf = (species: string[], seen = 1): Record<string, DexEntry> =>
  Object.fromEntries(species.map(s => [s, { seen, shiny: 0, first: 0 }]))
const firstSeen = (r: TravelRegion, n: number) => dexOf(speciesIn(r).slice(0, n))
const journey = (j: Partial<Journey>): Journey => ({ ...keptJourney(), ...j })

test('the eight regions follow the generations, by name, with the R26 starters', () => {
  expect(TRAVEL_REGIONS.map(r => r.name)).toEqual([
    'Kanto',
    'Johto',
    'Hoenn',
    'Sinnoh',
    'Unova',
    'Kalos',
    'Alola',
    'Galar',
  ])
  expect(TRAVEL_REGIONS.map(r => r.id)).toEqual([
    'kanto',
    'johto',
    'hoenn',
    'sinnoh',
    'unova',
    'kalos',
    'alola',
    'galar',
  ])
  expect(TRAVEL_REGIONS.map(r => r.last)).toEqual([151, 251, 386, 493, 649, 721, 809, 905])
  expect(TRAVEL_REGIONS.map(r => r.starters)).toEqual([
    ['bulbasaur', 'charmander', 'squirtle'],
    ['chikorita', 'cyndaquil', 'totodile'],
    ['treecko', 'torchic', 'mudkip'],
    ['turtwig', 'chimchar', 'piplup'],
    ['snivy', 'tepig', 'oshawott'],
    ['chespin', 'fennekin', 'froakie'],
    ['rowlet', 'litten', 'popplio'],
    ['grookey', 'scorbunny', 'sobble'],
  ])
  for (const r of TRAVEL_REGIONS) for (const s of r.starters) expect(regionOf(s)?.id).toBe(r.id)
  for (const r of TRAVEL_REGIONS) expect(r.color).toMatch(/^#[0-9a-f]{6}$/)
  expect(new Set(TRAVEL_REGIONS.map(r => r.color)).size).toBe(8)
  expect(TICKET_PRICE).toBe(150_000)
  expect(SEEN_SHARE).toBe(0.6)
})

test('a species belongs to the region of its national dex number, forms included', () => {
  expect(regionOf('pikachu')?.id).toBe('kanto')
  expect(regionOf('chikorita')?.id).toBe('johto')
  expect(regionOf('wyrdeer')?.id).toBe('galar')
  expect(regionOf('enamorus')?.id).toBe('galar')
  expect(regionOf('bulbasaur')?.id).toBe('kanto')
  expect(regionOf('mew')?.id).toBe('kanto')
  expect(regionOf('celebi')?.id).toBe('johto')
  expect(regionOf('treecko')?.id).toBe('hoenn')
})

test('a regional form is stored under its species: Alolan Rattata is rattata, so Kanto', () => {
  expect(regionOf('rattata')?.id).toBe('kanto')
})

test('names outside the species table belong to no region', () => {
  for (const name of ['sprigatito', '', 'constructor', '__proto__', 'toString', 'Pikachu', ' pikachu'])
    expect(regionOf(name)).toBeUndefined()
})

test('each region has its species count, and needs 60% of them seen, rounded up', () => {
  expect(TRAVEL_REGIONS.map(r => speciesIn(r).length)).toEqual([151, 100, 135, 107, 156, 72, 88, 96])
  expect(TRAVEL_REGIONS.map(requiredSeen)).toEqual([91, 60, 81, 65, 94, 44, 53, 58])
  expect(speciesIn(KANTO)[0]).toBe('bulbasaur')
  expect(speciesIn(KANTO).at(-1)).toBe('mew')
  expect(speciesIn(JOHTO)[0]).toBe('chikorita')
  expect(speciesIn(region('galar')).at(-1)).toBe('enamorus')
})

test('seen counts every species of the region with a dex entry, even seen: 0', () => {
  expect(seenIn({}, KANTO)).toBe(0)
  expect(seenIn(dexOf(['pikachu']), KANTO)).toBe(1)
  expect(seenIn(dexOf(['pikachu', 'bulbasaur'], 0), KANTO)).toBe(2)
  expect(seenIn(dexOf(['pikachu', 'chikorita', 'sprigatito', 'constructor']), KANTO)).toBe(1)
  expect(seenIn(dexOf(['pikachu', 'chikorita', 'sprigatito']), JOHTO)).toBe(1)
  expect(seenIn(dexOf(speciesIn(KANTO)), KANTO)).toBe(151)
})

test('a region is found by its exact name, in any case', () => {
  for (const word of ['johto', 'Johto', 'JOHTO']) expect(findRegion(word)?.id).toBe('johto')
  for (const word of ['', 'atlantis', 'hisui', 'joh', ' johto', 'johto ', 'kanto-johto'])
    expect(findRegion(word)).toBeUndefined()
})

test('ticket words are exactly a later region and "ticket"', () => {
  expect(readTicketWords(['johto', 'ticket'])?.id).toBe('johto')
  expect(readTicketWords(['Galar', 'Ticket'])?.id).toBe('galar')
  for (const words of [
    [],
    ['ticket'],
    ['johto'],
    ['kanto', 'ticket'],
    ['johto', 'ferry', 'ticket'],
    ['johto', 'ticket', 'x'],
    ['ticket', 'johto'],
    ['atlantis', 'ticket'],
  ])
    expect(readTicketWords(words)).toBeUndefined()
})

test('a new journey starts in Kanto with its starter due; a kept one gives no starter', () => {
  expect(newJourney()).toEqual({ current: 'kanto', tickets: [], starters: { kanto: 'due' } })
  expect(keptJourney()).toEqual({ current: 'kanto', tickets: [], starters: {} })
  expect(loadJourney(null, null)).toEqual(newJourney())
  expect(loadJourney(null, { current: 'johto', tickets: ['johto'], starters: {} })).toEqual(newJourney())
})

test('a save without a journey takes a readable copy, else is kept and undecided', () => {
  const undecided = { ...keptJourney(), isUndecided: true }
  expect(loadJourney({}, undefined)).toEqual(undecided)
  expect(loadJourney({ party: [] }, null)).toEqual(undecided)
  const copy = { current: 'johto', tickets: ['johto'], starters: { johto: { species: 'cyndaquil' } } }
  expect(loadJourney({}, copy)).toEqual(copy)
  expect(loadJourney({}, copy).isUndecided).toBeUndefined()
  expect(loadJourney({}, { ...copy, isUndecided: true })).toEqual({ ...copy, isUndecided: true })
  for (const bad of ['johto', {}, [], 7, { current: 'atlantis', tickets: [], starters: {} }])
    expect(loadJourney({}, bad)).toEqual(undecided)
})

test('a malformed journey is kept, not undecided, and read field by field', () => {
  const kept = keptJourney()
  for (const bad of ['johto', ['johto'], null, 5, {}, { current: 'atlantis' }])
    expect(loadJourney({ journey: bad }, { current: 'johto', tickets: ['johto'], starters: {} })).toEqual(kept)
  expect(
    loadJourney({ journey: { current: 'kanto', tickets: ['johto', 'johto', 'kanto', 'atlantis'] } }, null),
  ).toEqual({ ...kept, tickets: ['johto'] })
  expect(loadJourney({ journey: { current: 'hoenn', tickets: ['johto'], starters: {} } }, null)).toEqual({
    ...kept,
    tickets: ['johto'],
  })
  expect(
    loadJourney(
      {
        journey: {
          current: 'johto',
          tickets: ['johto', 'hoenn'],
          starters: { johto: 5, kanto: 'due', atlantis: 'due', hoenn: { species: '../x' } },
        },
      },
      null,
    ),
  ).toEqual({ current: 'johto', tickets: ['johto', 'hoenn'], starters: { kanto: 'due' } })
  expect(
    loadJourney({ journey: { current: 'kanto', tickets: [], starters: { kanto: { species: 'constructor' } } } }, null),
  ).toEqual(kept)
  expect(loadJourney({ journey: { current: 'kanto', tickets: 'johto', starters: [] } }, null)).toEqual(kept)
  expect(loadJourney({ journey: { current: 'kanto', tickets: [], starters: {}, isUndecided: 'yes' } }, null)).toEqual(
    kept,
  )
})

test('a region without its ticket loses its starter entry', () => {
  expect(
    loadJourney({ journey: { current: 'kanto', tickets: [], starters: { johto: 'due', kanto: 'due' } } }, null),
  ).toEqual({ ...keptJourney(), starters: { kanto: 'due' } })
})

test('a stored journey round-trips', () => {
  const stored: Journey = {
    current: 'johto',
    tickets: ['johto', 'hoenn'],
    starters: { kanto: { species: 'bulbasaur' }, johto: 'due', hoenn: { species: 'mudkip' } },
  }
  expect(loadJourney({ journey: JSON.parse(JSON.stringify(stored)) as unknown }, null)).toEqual(stored)
  const undecided: Journey = { ...keptJourney(), isUndecided: true }
  expect(loadJourney({ journey: undecided }, null)).toEqual(undecided)
})

test('Kanto is always unlocked; the newest region is the latest owned ticket', () => {
  expect(unlockedOf(newJourney()).map(r => r.id)).toEqual(['kanto'])
  expect(unlockedOf(journey({ tickets: ['hoenn', 'johto'] })).map(r => r.id)).toEqual(['kanto', 'johto', 'hoenn'])
  expect(newestOf(newJourney()).id).toBe('kanto')
  expect(newestOf(journey({ tickets: ['johto'] })).id).toBe('johto')
  expect(newestOf(journey({ tickets: ['hoenn', 'johto'], current: 'kanto' })).id).toBe('hoenn')
})

test('the next ticket opens at the newest region’s required seen count', () => {
  const kanto = keptJourney()
  expect(ticketState(kanto, firstSeen(KANTO, 90), JOHTO)).toBe('unavailable')
  expect(ticketState(kanto, firstSeen(KANTO, 91), JOHTO)).toBe('buyable')
  expect(ticketState(kanto, firstSeen(KANTO, 92), JOHTO)).toBe('buyable')
  expect(ticketState(kanto, {}, JOHTO)).toBe('unavailable')
  expect(ticketState(kanto, dexOf(speciesIn(KANTO).slice(0, 91), 0), JOHTO)).toBe('buyable')
})

test('later regions stay unavailable whatever the seen count, and Kanto has no ticket', () => {
  const all = dexOf(TRAVEL_REGIONS.flatMap(speciesIn))
  for (const r of TRAVEL_REGIONS.slice(2)) expect(ticketState(keptJourney(), all, r)).toBe('unavailable')
  expect(ticketState(keptJourney(), all, KANTO)).toBe('unavailable')
})

test('an owned ticket shows owned; the gate follows the newest ticket, not the current region', () => {
  const owned = journey({ tickets: ['johto'] })
  expect(ticketState(owned, {}, JOHTO)).toBe('owned')
  const dex = { ...firstSeen(KANTO, 150), ...firstSeen(JOHTO, 20) }
  expect(ticketState(owned, dex, HOENN)).toBe('unavailable')
  expect(ticketState({ ...owned, current: 'kanto' }, firstSeen(JOHTO, 70), HOENN)).toBe('buyable')
  expect(ticketState({ ...owned, current: 'johto' }, firstSeen(JOHTO, 59), HOENN)).toBe('unavailable')
})

test('with Galar owned, no ticket is buyable', () => {
  const all = journey({ tickets: ['johto', 'hoenn', 'sinnoh', 'unova', 'kalos', 'alola', 'galar'] })
  const dex = dexOf(TRAVEL_REGIONS.flatMap(speciesIn))
  for (const r of TRAVEL_REGIONS) expect(ticketState(all, dex, r)).not.toBe('buyable')
})

test('the due starter prefers the current region, then TRAVEL_REGIONS order', () => {
  expect(dueStarter(newJourney())).toBe('kanto')
  expect(dueStarter(keptJourney())).toBeUndefined()
  const both = journey({ tickets: ['johto', 'hoenn'], starters: { hoenn: 'due', johto: 'due' } })
  expect(dueStarter(both)).toBe('johto')
  expect(dueStarter({ ...both, current: 'hoenn' })).toBe('hoenn')
  expect(dueStarter({ ...both, starters: { johto: { species: 'totodile' } } })).toBeUndefined()
})

test('a region is arrived at once it has a starter entry, due or chosen; Kanto only by its entry', () => {
  const j: Journey = {
    current: 'johto',
    tickets: ['johto', 'hoenn'],
    starters: { johto: 'due', kanto: { species: 'bulbasaur' } },
  }
  expect(hasArrived(j, 'johto')).toBe(true)
  expect(hasArrived(j, 'kanto')).toBe(true)
  expect(hasArrived(j, 'hoenn')).toBe(false)
  expect(hasArrived(keptJourney(), 'kanto')).toBe(false)
})

test('a plain object is an object that is neither null nor an array', () => {
  expect(isObject({})).toBe(true)
  expect(isObject({ a: 1 })).toBe(true)
  for (const o of [null, undefined, [], [1], 'x', 0, true]) expect(isObject(o)).toBe(false)
})

test('every region is found by its id', () => {
  for (const r of TRAVEL_REGIONS) expect(regionById(r.id)).toBe(r)
})
