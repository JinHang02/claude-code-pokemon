import type { Phase } from './backdrop'
import { isForSale, itemById } from './items'

type Named = { name: string }

// One way a species is reached in PokeAPI's chain: the trigger and what it needs. `gender`: 1 when only females
// evolve this way, 2 when only males. The forms it starts from and ends as (`meowth-galar` only; `raichu-alola`).
export type EvolutionDetail = {
  trigger?: Named | null
  min_level?: number | null
  gender?: number | null
  item?: Named | null
  held_item?: Named | null
  trade_species?: Named | null
  min_happiness?: number | null
  min_affection?: number | null
  known_move?: Named | null
  known_move_type?: Named | null
  party_species?: Named | null
  party_type?: Named | null
  time_of_day?: string | null
  required_pokemon_form?: Named | null
  evolved_pokemon_form?: Named | null
}

// A PokeAPI evolution chain node; `evolution_details` say how its species is reached.
export type ChainLink = {
  species: Named
  evolves_to: ChainLink[]
  evolution_details?: EvolutionDetail[]
}

export type Time = 'day' | 'night' | 'dusk'

// How an evolution happens here. `level`: at that level, at that time, with a party member of that type.
// `item`: given, at once. `hold`: while held. `friendship`: after FRIENDSHIP_MS together. `party`: with that species
// in the party. `shed`: comes along when its pre-evolution evolves (Shedinja).
export type Way =
  | { kind: 'level'; level: number; time?: Time; partyType?: string; isFallback?: true }
  | { kind: 'item'; item: string; time?: Time }
  | { kind: 'hold'; item: string; time?: Time }
  | { kind: 'friendship'; time?: Time }
  | { kind: 'party'; species: string }
  | { kind: 'shed' }

// `form`: the PokeAPI form the evolution leads to (`raichu-alola`), when the games name one.
export type Stage = { species: string; form?: string; way: Way }

// Evolutions the games tie to what the plugin can't do (a move, steps, a battle) happen at this level at the
// earliest, and FALLBACK_GAP levels after the species was reached, so none comes straight after another.
export const FALLBACK_LEVEL = 30
export const FALLBACK_GAP = 10
export const FRIENDSHIP_MS = 10 * 60 * 60_000

const TIMES: Record<string, Time> = { day: 'day', night: 'night', dusk: 'dusk', 'full-moon': 'night' }
// Forms the games pick by the time of day without naming them in the chain.
const TIME_FORMS: Record<string, Partial<Record<Time, string>>> = {
  lycanroc: { day: 'lycanroc-midday', night: 'lycanroc-midnight', dusk: 'lycanroc-dusk' },
}

const sold = (item: Named | null | undefined) => (item && isForSale(itemById(item.name)) ? item.name : null)
// Needs an item the Mart doesn't sell (another Sweet, a Gen 9 item): another detail covers the species.
const isUnsold = (d: EvolutionDetail) => Boolean((d.item && !sold(d.item)) || (d.held_item && !sold(d.held_item)))

// How one PokeAPI detail works here, or null when it needs what the plugin doesn't have.
export function wayOf(d: EvolutionDetail): Way | null {
  const time = TIMES[d.time_of_day ?? '']
  const at = time ? { time } : {}
  if (d.known_move || d.known_move_type) return null
  const trigger = d.trigger?.name ?? 'level-up'
  if (typeof d.min_level === 'number')
    return { kind: 'level', level: d.min_level, ...at, ...(d.party_type ? { partyType: d.party_type.name } : {}) }
  if (trigger === 'use-item') {
    const item = sold(d.item)
    return item ? { kind: 'item', item, ...at } : null
  }
  if (trigger === 'trade') {
    const item = d.held_item ? sold(d.held_item) : 'linking-cord'
    return item ? { kind: 'item', item, ...at } : null
  }
  if (trigger === 'shed') return { kind: 'shed' }
  if (d.held_item) {
    const item = sold(d.held_item)
    return item ? { kind: 'hold', item, ...at } : null
  }
  if (trigger !== 'level-up') return null
  if (d.min_happiness || d.min_affection) return { kind: 'friendship', ...at }
  if (d.party_species) return { kind: 'party', species: d.party_species.name }
  return null
}

const find = (chain: ChainLink, name: string): ChainLink | undefined =>
  chain.species.name === name ? chain : chain.evolves_to.map(c => find(c, name)).find(Boolean)

const parentOf = (chain: ChainLink, name: string): ChainLink | undefined =>
  chain.evolves_to.some(c => c.species.name === name)
    ? chain
    : chain.evolves_to.map(c => parentOf(c, name)).find(Boolean)

// The level `name` is reached at here: its pre-evolution's level, or the fallback it came by; 1 otherwise.
function reachedAt(chain: ChainLink, name: string): number {
  const parent = parentOf(chain, name)
  const details = parent?.evolves_to.find(c => c.species.name === name)?.evolution_details ?? []
  if (!parent) return 1
  const ways = details.map(wayOf)
  const levels = ways.flatMap(w => (w?.kind === 'level' ? [w.level] : []))
  if (levels.length) return Math.min(...levels)
  return ways.some(Boolean) || details.some(isUnsold) ? 1 : fallbackFrom(chain, parent.species.name)
}

const fallbackFrom = (chain: ChainLink, name: string) => Math.max(FALLBACK_LEVEL, reachedAt(chain, name) + FALLBACK_GAP)

export type Gender = 'female' | 'male' | null

// A Pokémon's gender from its species' `gender_rate` (eighths female; -1 genderless). A species with a single
// gender always has it; otherwise `was` stays when it's set, or one is rolled.
export function genderOf(rate: unknown, was: Gender | undefined, rand = Math.random): Gender {
  if (typeof rate !== 'number' || rate < 0) return null
  if (rate === 0) return 'male'
  if (rate === 8) return 'female'
  return was === 'female' || was === 'male' ? was : rand() < rate / 8 ? 'female' : 'male'
}

const GENDER_CODES: Record<number, Gender> = { 1: 'female', 2: 'male' }

// What `name` evolves into and how, from the PokeAPI form `formName` (`meowth-galar`); empty for a final stage or a
// name not in the chain. Ways for the other gender never apply (`gender` undefined: any). A form with evolutions of
// its own takes only those (the plain species also those of its variants the sprites lack); a form the games give
// none (Gigantamax) evolves as the plain species; then the evolutions no form is named for apply; failing those, the
// plain species answers to the games' own names for it (`burmy-plant`, every Scatterbug pattern: forms missing from
// `forms`, the species' forms in the sprite list, when given). A species and form the plugin has no way to reach gets
// the fallback level.
export function nextStages(
  chain: ChainLink,
  name: string,
  formName = name,
  gender?: Gender,
  forms?: string[],
): Stage[] {
  // A child with no way at all isn't an evolution (Phione → Manaphy: only breeding links them).
  const ways = (find(chain, name)?.evolves_to ?? [])
    .flatMap(child => (child.evolution_details ?? []).map(detail => ({ child, detail })))
    .filter(w => gender === undefined || !w.detail.gender || GENDER_CODES[w.detail.gender] === gender)
  const required = (w: (typeof ways)[number]) => w.detail.required_pokemon_form?.name
  const forForm = (form: string) => ways.filter(w => required(w) === form)
  const asPlain =
    formName === name && forms
      ? ways.filter(
          w => required(w)?.startsWith(`${name}-`) && !forms.includes(required(w)?.slice(name.length + 1) ?? ''),
        )
      : []
  // A plain species with ways of its own also takes those of the variants the sprites draw as it: Own Tempo Rockruff
  // becomes Dusk Lycanroc.
  const own = forForm(formName)
  const ownAndUnseen = own.length ? [...own, ...asPlain] : own
  const chosen = [ownAndUnseen, forForm(name), ways.filter(w => !required(w)), asPlain].find(w => w.length) ?? []
  const stages = new Map<string, Stage>()
  // Species and forms some detail leads to that the plugin can't carry out: the fallback, unless another way can.
  const stuck = new Map<string, Stage>()
  for (const { child, detail } of chosen) {
    const species = child.species.name
    const way = wayOf(detail)
    const time = way && 'time' in way ? way.time : undefined
    const form = detail.evolved_pokemon_form?.name ?? (time ? TIME_FORMS[species]?.[time] : undefined)
    const target = `${species}|${form ?? ''}`
    if (!way) {
      if (!isUnsold(detail) && !stuck.has(target))
        stuck.set(target, {
          species,
          ...(form ? { form } : {}),
          way: { kind: 'level', level: fallbackFrom(chain, name), isFallback: true },
        })
      continue
    }
    // The same way in several games is one stage; a level one keeps its lowest level.
    const { level: _, ...shape } = way.kind === 'level' ? way : { ...way, level: 0 }
    const key = `${target}|${JSON.stringify(shape)}`
    const had = stages.get(key)?.way
    if (had?.kind === 'level' && way.kind === 'level' && had.level <= way.level) continue
    stages.set(key, { species, ...(form ? { form } : {}), way })
  }
  // Level ways into one species from different games come at the lowest of their levels, so each can happen:
  // Hisuian Decidueye's Lv 36 would never come after plain Decidueye's 34.
  const lowest = new Map<string, number>()
  for (const { species, way } of stages.values())
    if (way.kind === 'level') lowest.set(species, Math.min(way.level, lowest.get(species) ?? way.level))
  for (const [key, stage] of stages)
    if (stage.way.kind === 'level')
      stages.set(key, { ...stage, way: { ...stage.way, level: lowest.get(stage.species) ?? stage.way.level } })
  const reached = new Set([...stages.values()].map(s => `${s.species}|${s.form ?? ''}`))
  for (const [target, stage] of stuck) if (!reached.has(target)) stages.set(`${target}|fallback`, stage)
  return [...stages.values()]
}

// What an evolution check sees: the Pokémon's level, held item and time together; the time of day; the party's
// species and types.
export type DueContext = {
  level: number
  phase: Phase
  heldItem?: string
  togetherMs: number
  party: string[]
  partyTypes: string[]
}

// "day" in the games includes the morning.
export const timeMatches = (time: Time | undefined, phase: Phase) =>
  !time || (time === 'day' ? phase === 'day' || phase === 'dawn' : time === phase)

// The stages that happen by themselves now. Given items and Shedinja never do; an Everstone stops them all. Of the
// ways into one species, one that needs this time of day wins: Cubone becomes Alolan Marowak at night.
export function dueStages(stages: Stage[], c: DueContext): Stage[] {
  if (c.heldItem === 'everstone') return []
  const due = stages.filter(({ way }) => {
    if ('time' in way && !timeMatches(way.time, c.phase)) return false
    if (way.kind === 'level') return c.level >= way.level && (!way.partyType || c.partyTypes.includes(way.partyType))
    if (way.kind === 'hold') return c.heldItem === way.item
    if (way.kind === 'friendship') return c.togetherMs >= FRIENDSHIP_MS
    if (way.kind === 'party') return c.party.includes(way.species)
    return false
  })
  const isTimed = (s: Stage) => Boolean('time' in s.way && s.way.time)
  return due.filter(s => isTimed(s) || !due.some(o => o.species === s.species && isTimed(o)))
}

// The plugin's form for an evolved `stage` (forms as the sprite list names them: `alola`, `galar`...): the one
// the games name when the sprites have it; otherwise the member's own form when the evolved species has it.
export function evolvedForm(stage: Stage, memberForm: string, forms: string[]): string {
  if (stage.form !== undefined) {
    const named = stage.form.startsWith(`${stage.species}-`) ? stage.form.slice(stage.species.length + 1) : ''
    // `darmanitan-galar-standard` is the sprites' `galar`.
    return forms.includes(named) ? named : (forms.find(f => f !== 'regular' && named.startsWith(`${f}-`)) ?? 'regular')
  }
  return forms.includes(memberForm) ? memberForm : 'regular'
}

// The PokeAPI form name of a species in one of the plugin's forms: `meowth-galar`, `pikachu`.
export const pokeapiForm = (species: string, form: string) => (form === 'regular' ? species : `${species}-${form}`)
