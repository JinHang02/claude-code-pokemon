import type { Landscape, Phase } from './backdrop'
import type { Pick, Species } from './lookup'
import { moonVisitor } from './moon'
import type { DexEntry } from './save'
import { SPECIES } from './species-data'

// `moon`: the moon's shape tonight (moon.ts), for the full moon's own visitor.
export type Where = { landscape: Landscape; phase: Phase; dex: Record<string, DexEntry>; moon?: number }

const RARE_SHARE = 0.01
const FORM_SHARE = 1 / 8
const UNSEEN = 2.5
const STAGE = { 1: 1, 2: 0.75, 3: 0.55 } as const
const BABY = 0.4
// Same rule the table's generator uses, for forms a newer sprite list adds.
const NOT_WILD_FORM = [
  /^mega(-[xy])?$/,
  /(^|-)gmax$/,
  /^primal$/,
  /^eternamax$/,
  /^ultra$/,
  /^(galar-)?zen$/,
  /^(school|blade|complete|busted|gulping|gorging|hangry|noice|ash|crowned|unbound|sunshine|eternal)$/,
  /^totem/,
  /^(belle|libre|phd|pop-star|rock-star|cosplay)$/,
  /-cap$/,
  /^starter$/,
  /^(hisui-)?noble$/,
  /^(shadow|ice)-rider$/,
  // Event and gift forms: Spiky-eared Pichu, Dada Zarude, Fancy and Poké Ball Vivillon.
  /^(spiky-eared|dada|fancy|poke-ball)$/,
  // Item-triggered formes.
  /^(therian|origin)$/,
]

const PLACE: Record<Landscape, string[]> = {
  meadow: ['normal', 'grass', 'bug', 'electric', 'fairy', 'flying'],
  hills: ['ground', 'normal', 'fighting', 'fire', 'rock', 'flying'],
  mountains: ['rock', 'ground', 'steel', 'ice', 'dragon', 'fighting', 'flying'],
  lake: ['water', 'ice', 'flying', 'bug'],
  forest: ['bug', 'grass', 'poison', 'fairy', 'normal', 'dark'],
}
const TIME: Record<Phase, Record<string, number>> = {
  night: { ghost: 2, dark: 2, poison: 2, psychic: 2, fairy: 2 },
  dawn: { flying: 2, psychic: 2 },
  day: { fire: 2, grass: 2, bug: 2, normal: 2 },
  dusk: { flying: 2, psychic: 2, ghost: 1.5 },
}

export function isWildForm(species: string, form: string): boolean {
  if (form === 'regular') return true
  const known = SPECIES[species]?.forms[form]
  return known ? known.isWild : !NOT_WILD_FORM.some(r => r.test(form))
}

function typesOf(species: string, form: string): string[] {
  const info = SPECIES[species]
  return (form === 'regular' ? info?.types : info?.forms[form]?.types) ?? info?.types ?? []
}

// How likely this one is, before the rare/common split. 0 when it is never wild.
export function weightOf(species: string, form: string, where: Where, forms?: string[]): number {
  if (!isWildForm(species, form)) return 0
  const info = SPECIES[species]
  const others = (forms ?? Object.keys(info?.forms ?? {})).filter(f => f !== 'regular' && isWildForm(species, f))
  // A form the caller's list doesn't offer can't be drawn (and would divide by zero below).
  if (form !== 'regular' && !others.includes(form)) return 0
  const share = form === 'regular' ? (others.length ? 1 - FORM_SHARE : 1) : FORM_SHARE / others.length
  const types = typesOf(species, form)
  const place = types.some(t => PLACE[where.landscape].includes(t)) ? 4 : 1
  const time = Math.max(1, ...types.map(t => TIME[where.phase][t] ?? 1))
  const novelty = (where.dex[species]?.seen ?? 0) > 0 ? 1 : UNSEEN
  const tier = info?.tier ?? 'common'
  const base = !info
    ? 0.5
    : tier === 'common'
      ? Math.sqrt(info.rate / 255) * (info.isBaby ? BABY : STAGE[info.stage])
      : tier === 'mythical'
        ? 0.5
        : 1
  return base * share * place * time * novelty
}

const isRare = (species: string) => (SPECIES[species]?.tier ?? 'common') !== 'common'

type Table = { picks: Pick[]; total: number; cumulative: number[] }
let cached: { key: unknown[]; rare: Table; common: Table } | null = null

function tables(list: Species[], where: Where) {
  const key = [list, where.landscape, where.phase, where.dex]
  if (cached && cached.key.every((k, i) => k === key[i])) return cached
  const build = (rare: boolean): Table => {
    const picks: Pick[] = []
    const cumulative: number[] = []
    let total = 0
    list.forEach(({ name, forms }, dex) => {
      if (isRare(name) !== rare) return
      for (const form of forms) {
        const w = weightOf(name, form, where, forms)
        if (w <= 0) continue
        total += w
        picks.push({ dex, species: name, form })
        cumulative.push(total)
      }
    })
    return { picks, total, cumulative }
  }
  cached = { key, rare: build(true), common: build(false) }
  return cached
}

function drawFrom(t: Table, rand: () => number): Pick | undefined {
  const x = rand() * t.total
  let lo = 0
  let hi = t.cumulative.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if ((t.cumulative[mid] ?? 0) <= x) lo = mid + 1
    else hi = mid
  }
  return t.picks[lo]
}

// One wild Pokémon for this place and time: now and then one only dusk or a full moon brings (moon.ts), else the
// rare pool 1% of the time, else the common one.
export function drawWild(list: Species[], where: Where, rand = Math.random): Pick {
  const special = moonVisitor(list, where.phase, where.moon ?? -1, rand)
  if (special) return special
  const { rare, common } = tables(list, where)
  const first = rand() < RARE_SHARE ? rare : common
  const pool = first.total > 0 ? first : first === rare ? common : rare
  return drawFrom(pool, rand) ?? { dex: 0, species: list[0]?.name ?? '', form: 'regular' }
}
