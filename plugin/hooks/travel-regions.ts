// The region catalog and the player's place in it: RegionId, TravelRegion, TRAVEL_REGIONS, StarterChoice, Journey, TicketState,
// TICKET_PRICE, SEEN_SHARE; isObject; regionById; membership (regionOf, speciesIn, requiredSeen, seenIn); parsing (findRegion,
// readTicketWords); factories (newJourney, keptJourney, loadJourney); queries (unlockedOf, newestOf, ticketState,
// hasArrived, dueStarter).
import type { DexEntry } from './save'
import { SPECIES } from './species-data'

export type RegionId = 'kanto' | 'johto' | 'hoenn' | 'sinnoh' | 'unova' | 'kalos' | 'alola' | 'galar'
// `last`: the national dex number of its last species. `color`: its dot in the band and the Mart.
export type TravelRegion = {
  id: RegionId
  name: string
  last: number
  starters: readonly [string, string, string]
  color: string
}
export type StarterChoice = 'due' | { species: string }
export type Journey = {
  current: RegionId
  tickets: RegionId[]
  starters: Partial<Record<RegionId, StarterChoice>>
  isUndecided?: true
}
export type TicketState = 'unavailable' | 'buyable' | 'owned'

export const TICKET_PRICE = 150_000
export const SEEN_SHARE = 0.6

// Dot colours: the region-ui design report (Kanto red, Johto gold, Hoenn sky, Sinnoh lilac, Unova white, Kalos mint,
// Alola orange, Galar pink).
export const TRAVEL_REGIONS: readonly TravelRegion[] = [
  { id: 'kanto', name: 'Kanto', last: 151, starters: ['bulbasaur', 'charmander', 'squirtle'], color: '#e3350d' },
  { id: 'johto', name: 'Johto', last: 251, starters: ['chikorita', 'cyndaquil', 'totodile'], color: '#ffd75e' },
  { id: 'hoenn', name: 'Hoenn', last: 386, starters: ['treecko', 'torchic', 'mudkip'], color: '#5fb4f0' },
  { id: 'sinnoh', name: 'Sinnoh', last: 493, starters: ['turtwig', 'chimchar', 'piplup'], color: '#b9a3e3' },
  { id: 'unova', name: 'Unova', last: 649, starters: ['snivy', 'tepig', 'oshawott'], color: '#f4f1e6' },
  { id: 'kalos', name: 'Kalos', last: 721, starters: ['chespin', 'fennekin', 'froakie'], color: '#7fe0b0' },
  { id: 'alola', name: 'Alola', last: 809, starters: ['rowlet', 'litten', 'popplio'], color: '#f59a3c' },
  { id: 'galar', name: 'Galar', last: 905, starters: ['grookey', 'scorbunny', 'sobble'], color: '#f28cc0' },
]

const KANTO: TravelRegion = TRAVEL_REGIONS[0] as TravelRegion
const NAMES: string[] = Object.keys(SPECIES)
const DEX_INDEX: Map<string, number> = new Map(NAMES.map((name, i) => [name, i]))
const REGION_BY_ID: Map<string, TravelRegion> = new Map(TRAVEL_REGIONS.map(r => [r.id, r]))

export const isObject = (o: unknown): o is Record<string, unknown> =>
  typeof o === 'object' && o !== null && !Array.isArray(o)
const isRegionId = (id: unknown): id is RegionId => typeof id === 'string' && REGION_BY_ID.has(id)

export const regionById = (id: RegionId): TravelRegion => REGION_BY_ID.get(id) ?? KANTO
const firstOf = (r: TravelRegion): number => {
  const before = TRAVEL_REGIONS[TRAVEL_REGIONS.indexOf(r) - 1]
  return before ? before.last : 0
}

// ── Membership ──

/** The region of a species by its national dex number; undefined for names outside the species table. */
export function regionOf(species: string): TravelRegion | undefined {
  const index = DEX_INDEX.get(species)
  return index === undefined ? undefined : TRAVEL_REGIONS.find(r => index < r.last)
}

/** The region's species, in national dex order. */
export const speciesIn = (r: TravelRegion): string[] => NAMES.slice(firstOf(r), r.last)

/** The seen count that opens the next region's ticket. */
export const requiredSeen = (r: TravelRegion): number => Math.ceil(SEEN_SHARE * speciesIn(r).length)

/** How many of the region's species have a dex entry. */
export const seenIn = (dex: Record<string, DexEntry>, r: TravelRegion): number =>
  Object.keys(dex).filter(species => regionOf(species) === r).length

// ── Parsing ──

/** The region named `word`, in any case; undefined for anything else. */
export const findRegion = (word: string): TravelRegion | undefined =>
  TRAVEL_REGIONS.find(r => r.name.toLowerCase() === word.toLowerCase())

/** The region of the words `<region> ticket`; undefined for Kanto or any other words. */
export function readTicketWords(words: readonly string[]): TravelRegion | undefined {
  const [name, ticket, ...rest] = words
  if (name === undefined || ticket?.toLowerCase() !== 'ticket' || rest.length) return undefined
  const r = findRegion(name)
  return r === KANTO ? undefined : r
}

// ── Factories ──

export const newJourney = (): Journey => ({ current: 'kanto', tickets: [], starters: { kanto: 'due' } })

export const keptJourney = (): Journey => ({ current: 'kanto', tickets: [], starters: {} })

function readChoice(choice: unknown): StarterChoice | undefined {
  if (choice === 'due') return 'due'
  if (isObject(choice) && typeof choice.species === 'string' && DEX_INDEX.has(choice.species))
    return { species: choice.species }
  return undefined
}

function readJourney(j: Record<string, unknown>): Journey {
  const owned = new Set(Array.isArray(j.tickets) ? j.tickets.filter(isRegionId) : [])
  owned.delete('kanto')
  const tickets = TRAVEL_REGIONS.map(r => r.id).filter(id => owned.has(id))
  const isUnlocked = (id: RegionId): boolean => id === 'kanto' || owned.has(id)
  const starters: Partial<Record<RegionId, StarterChoice>> = {}
  for (const [id, raw] of Object.entries(isObject(j.starters) ? j.starters : {})) {
    const choice = readChoice(raw)
    if (isRegionId(id) && isUnlocked(id) && choice) starters[id] = choice
  }
  return {
    current: isRegionId(j.current) && isUnlocked(j.current) ? j.current : 'kanto',
    tickets,
    starters,
    ...(j.isUndecided === true ? { isUndecided: true } : {}),
  }
}

/**
 * The journey a stored save holds.
 * @param raw the stored save object; null when there is no save.
 * @param copy the recovery copy under the `journey` store key; read only when `raw` has no `journey`.
 * @returns new for no save; for a save without `journey`, the copy when it names a region, else kept and undecided;
 *   kept for a malformed `journey`; otherwise the stored journey with unknown or locked entries dropped.
 */
export function loadJourney(raw: Record<string, unknown> | null, copy: unknown): Journey {
  if (raw === null) return newJourney()
  if (!Object.hasOwn(raw, 'journey'))
    return isObject(copy) && isRegionId(copy.current) ? readJourney(copy) : { ...keptJourney(), isUndecided: true }
  return isObject(raw.journey) ? readJourney(raw.journey) : keptJourney()
}

// ── Queries ──

/** Kanto plus the regions whose ticket is owned, in TRAVEL_REGIONS order. */
export const unlockedOf = (j: Journey): TravelRegion[] =>
  TRAVEL_REGIONS.filter(r => r === KANTO || j.tickets.includes(r.id))

/** The latest unlocked region. */
export const newestOf = (j: Journey): TravelRegion => unlockedOf(j).at(-1) ?? KANTO

/** The state of `r`'s ferry ticket for a player with this journey and dex. */
export function ticketState(j: Journey, dex: Record<string, DexEntry>, r: TravelRegion): TicketState {
  if (j.tickets.includes(r.id)) return 'owned'
  const newest = newestOf(j)
  const isNext = TRAVEL_REGIONS.indexOf(r) === TRAVEL_REGIONS.indexOf(newest) + 1
  return isNext && seenIn(dex, newest) >= requiredSeen(newest) ? 'buyable' : 'unavailable'
}

/** Whether `r` was reached by ticket. */
export const hasArrived = (j: Journey, r: RegionId): boolean => r in j.starters

/** The region whose starter choice is due: the current one first, then TRAVEL_REGIONS order; undefined when none. */
export function dueStarter(j: Journey): RegionId | undefined {
  if (j.starters[j.current] === 'due') return j.current
  return TRAVEL_REGIONS.find(r => j.starters[r.id] === 'due')?.id
}
