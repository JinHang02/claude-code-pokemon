import { FRIENDSHIP_MS } from './evolution'
import { DEFAULT_EVOLUTION_STYLE, isEvolutionStyle } from './evolution-style'
import type { EvolutionStyle } from './evolution-style'
import type { Stage, Time, Way } from './evolution'
import { isItemId, itemById, itemName, ITEMS, MAX_BAG, TABS, withArticle } from './items'
import type { Item } from './items'

export type Size = 'auto' | 'normal' | 'small'

export type Member = {
  // Tells apart two members of the same species (an evolution can lead to one already in the party).
  id: string
  species: string
  form: string
  isShiny: boolean
  xp: number
  evolutions: number
  // What it evolves into and how, as in the games; [] at a final stage, absent until looked up.
  next?: Stage[]
  // The one item it holds, as in the games: an Everstone stops it evolving.
  heldItem?: string
  // Time in the party while Claude Code was open: friendship evolutions come from it. Kept under its own store key
  // (`Together`) and filled in by withTogether for showing and deciding; never stored in the save.
  togetherMs?: number
  // From its species' ratio, as in the games; null for a genderless one, absent until looked up.
  gender?: 'female' | 'male' | null
  // Caught with a Poké Ball from the wild, not summoned by name.
  isCaught?: true
  // When it last evolved: another session shows the evolution's screen only when it is recent.
  evolvedAt?: number
}

export type DexEntry = { seen: number; shiny: number; first: number; caught?: number }

// `isOff`: the Pokémon rest in their Poké Balls (/pokemon off): nothing drawn, no xp.
// `folded`: the session XP ledgers already added into the party's XP here, so they never count twice;
// `foldedXp`: what each added, so XP a ledger gains afterwards still counts.
// `box`: the PC box, where catches go when the party is full; absent when empty.
// `bag`, `spent`, `earned`: the wallet is STARTING_MONEY + earned (and unfolded ledgers) - spent.
export type Save = {
  party: Member[]
  size: Size
  dex: Record<string, DexEntry>
  recent: string[]
  box?: Member[]
  // How the evolution screen looks (/pokemon evolution); absent means the default.
  evolutionStyle?: EvolutionStyle
  isOff?: boolean
  folded?: string[]
  foldedXp?: Record<string, Record<string, number>>
  // Items by id, 1 to MAX_BAG each.
  bag?: Record<string, number>
  // ₽ spent ever, and ₽ from folded ledgers (with what each added, as for XP).
  spent?: number
  earned?: number
  foldedMoney?: Record<string, number>
  // A stamp for each of the latest writes, newest last (REVS_KEPT of them): a window can tell from it whether the
  // save it reads was written over one of its own writes without it.
  revs?: string[]
}

export const REVS_KEPT = 32

// The XP one session has earned, by member id: only that session ever writes it, so sessions running side by
// side can't lose each other's XP. `at`: when it last wrote.
export type Ledger = { at: number; xp: Record<string, number>; money: number }

// Store keys of session ledgers start with this.
export const LEDGER = 'xp:'

// Time together by member id (so it stays through evolution, deposit and withdraw), under its own store key: the
// heartbeat writes only this, never the save, so it can't undo a purchase, a catch or an evolution another session
// saved meanwhile. `at`: when time was last added, by any session; 0 before the first beat.
export type Together = { at: number; ms: Record<string, number> }
export const TOGETHER = 'together'

export const MAX_PARTY = 3
// As many as the games' PC (32 boxes of 30). Only adding is refused: an older save holding more keeps them all.
export const MAX_BOX = 960
export const isBoxFull = (save: Save) => (save.box?.length ?? 0) >= MAX_BOX
// Why nothing more can go into the PC box, wherever something would: a catch, a new lead, a deposit.
export const BOX_FULL = "There's no more room in your PC box!"
export const MAKE_ROOM = 'Make room with /pokemon release <name>.'
export const XP = { reply: 2, tests: 5, commit: 10 }
export const MONEY_PER_XP = 10
export const STARTING_MONEY = 3000
export const MAX_LEVEL = 100
// The most one heartbeat adds to time together: a closed laptop isn't time together.
export const TOGETHER_CAP_MS = 120_000
const TIMES: Time[] = ['day', 'night', 'dusk']
export const GENERATIONS = [151, 251, 386, 493, 649, 721, 809, 905]
const SIZES: Size[] = ['auto', 'normal', 'small']

export const styleOf = (save: Save): EvolutionStyle => save.evolutionStyle ?? DEFAULT_EVOLUTION_STYLE

export const emptySave = (): Save => ({ party: [], size: 'auto', dex: {}, recent: [] })

// Species and form names as the sprite list spells them; anything else never reaches a file path or URL.
export const isName = (name: unknown): name is string =>
  typeof name === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)

export const newId = () => Math.random().toString(36).slice(2, 10)

const count = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0)
const isObject = (o: unknown): o is Record<string, unknown> => typeof o === 'object' && o !== null && !Array.isArray(o)

function loadWay(w: unknown): Way | null {
  if (!isObject(w)) return null
  const time = TIMES.includes(w.time as Time) ? { time: w.time as Time } : {}
  if (w.kind === 'level')
    return typeof w.level === 'number' && Number.isInteger(w.level) && w.level > 0
      ? {
          kind: 'level',
          level: w.level,
          ...time,
          ...(isName(w.partyType) ? { partyType: w.partyType } : {}),
          ...(w.isFallback === true ? { isFallback: true as const } : {}),
        }
      : null
  if (w.kind === 'item' || w.kind === 'hold') return isItemId(w.item) ? { kind: w.kind, item: w.item, ...time } : null
  if (w.kind === 'friendship') return { kind: 'friendship', ...time }
  if (w.kind === 'party') return isName(w.species) ? { kind: 'party', species: w.species } : null
  if (w.kind === 'shed') return { kind: 'shed' }
  return null
}

// Stored next stages; one that can't be read means the list is looked up again.
function loadStages(raw: unknown): Stage[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const stages = raw.flatMap((s: unknown): Stage[] => {
    const way = isObject(s) && isName(s.species) ? loadWay(s.way) : null
    return isObject(s) && way
      ? [{ species: s.species as string, ...(isName(s.form) ? { form: s.form } : {}), way }]
      : []
  })
  return stages.length === raw.length ? stages : undefined
}

// A stored party member, or null when it isn't one. A member saved before ids existed gets one from its
// place in the party, the same in every session reading that save.
function loadMember(raw: unknown, at: number): Member | null {
  if (!isObject(raw) || !isName(raw.species) || !isName(raw.form)) return null
  const next = loadStages(raw.next)
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `${at}-${raw.species}-${raw.form}`,
    species: raw.species,
    form: raw.form,
    isShiny: raw.isShiny === true,
    xp: count(raw.xp),
    evolutions: count(raw.evolutions),
    ...(next ? { next } : {}),
    ...(isItemId(raw.heldItem)
      ? { heldItem: raw.heldItem }
      : raw.hasEverstone === true
        ? { heldItem: 'everstone' }
        : {}),
    ...(raw.gender === 'female' || raw.gender === 'male' || raw.gender === null ? { gender: raw.gender } : {}),
    ...(raw.isCaught === true ? { isCaught: true as const } : {}),
    ...(count(raw.evolvedAt) ? { evolvedAt: count(raw.evolvedAt) } : {}),
  }
}

// A stored save's party and PC box, and the time together its members kept before the `together` key, by the ids
// they load with.
function loadMembers(s: Record<string, unknown>): { party: Member[]; box: Member[]; ms: Record<string, number> } {
  // Ids are unique across party and box: a repeat becomes `<id>-<slot>`, then `-2`, `-3`... until free.
  const ids = new Set<string>()
  const ms = tally()
  const load = (raw: unknown, at: number) => {
    const member = loadMember(raw, at)
    if (!member) return null
    let id = member.id
    if (ids.has(id)) id = `${member.id}-${at}`
    for (let n = 2; ids.has(id); n++) id = `${member.id}-${at}-${n}`
    ids.add(id)
    if (isObject(raw) && count(raw.togetherMs)) ms[id] = count(raw.togetherMs)
    return id === member.id ? member : { ...member, id }
  }
  const party: Member[] = []
  // Members past a full party go into the box after its own.
  const overflow: Member[] = []
  for (const [at, m] of (Array.isArray(s.party) ? s.party : []).entries()) {
    const member = load(m, at)
    if (member) (party.length < MAX_PARTY ? party : overflow).push(member)
  }
  const box: Member[] = []
  for (const [at, m] of (Array.isArray(s.box) ? s.box : []).entries()) {
    const member = load(m, at)
    if (member) box.push(member)
  }
  box.push(...overflow)
  return { party, box, ms }
}

// A stored save, with anything malformed replaced by its default, field by field. Time together kept in it by an
// earlier version is left out: it lives under its own key (togetherOf moves it there).
export function loadSave(raw: unknown): Save {
  const s = isObject(raw) ? raw : {}
  const { party, box } = loadMembers(s)
  const folded = Array.isArray(s.folded) ? s.folded.filter(isLedgerKey) : []
  const foldedXp: Record<string, Record<string, number>> = {}
  for (const [key, xp] of Object.entries(isObject(s.foldedXp) ? s.foldedXp : {}))
    if (folded.includes(key)) foldedXp[key] = loadLedger({ xp }).xp
  const bag: Record<string, number> = {}
  for (const [id, n] of Object.entries(isObject(s.bag) ? s.bag : {}))
    if (isItemId(id) && itemById(id)?.isSold !== false && count(n)) bag[id] = Math.min(MAX_BAG, count(n))
  const foldedMoney: Record<string, number> = {}
  for (const [key, n] of Object.entries(isObject(s.foldedMoney) ? s.foldedMoney : {}))
    if (folded.includes(key) && count(n)) foldedMoney[key] = count(n)
  const revs = (
    Array.isArray(s.revs) ? s.revs.filter((r): r is string => typeof r === 'string' && r.length <= 40) : []
  ).slice(-REVS_KEPT)
  const dex: Record<string, DexEntry> = {}
  for (const [name, e] of Object.entries(isObject(s.dex) ? s.dex : {}))
    if (isName(name) && isObject(e))
      dex[name] = {
        seen: count(e.seen),
        shiny: count(e.shiny),
        first: count(e.first),
        ...(count(e.caught) ? { caught: count(e.caught) } : {}),
      }
  return {
    party,
    size: SIZES.includes(s.size as Size) ? (s.size as Size) : 'auto',
    dex,
    recent: (Array.isArray(s.recent) ? s.recent.filter(isName) : []).slice(0, 10),
    ...(box.length ? { box } : {}),
    ...(isEvolutionStyle(s.evolutionStyle) ? { evolutionStyle: s.evolutionStyle } : {}),
    ...(s.isOff === true ? { isOff: true } : {}),
    ...(folded.length ? { folded } : {}),
    ...(Object.keys(foldedXp).length ? { foldedXp } : {}),
    ...(Object.keys(bag).length ? { bag } : {}),
    ...(count(s.spent) ? { spent: count(s.spent) } : {}),
    ...(count(s.earned) ? { earned: count(s.earned) } : {}),
    ...(Object.keys(foldedMoney).length ? { foldedMoney } : {}),
    ...(revs.length ? { revs } : {}),
  }
}

// The stored time together, with anything malformed dropped.
export function loadTogether(raw: unknown): Together {
  const t = isObject(raw) ? raw : {}
  const ms = tally()
  for (const [id, n] of Object.entries(isObject(t.ms) ? t.ms : {})) if (count(n)) ms[id] = count(n)
  return { at: count(t.at), ms }
}

// The time together a save from before the `together` key kept itself (each member's `togetherMs` and the save's
// `togetherAt`): what seeds the key.
export function togetherOf(raw: unknown): Together {
  const s = isObject(raw) ? raw : {}
  return { at: count(s.togetherAt), ms: loadMembers(s).ms }
}

const isLedgerKey = (k: unknown): k is string => typeof k === 'string' && k.startsWith(LEDGER)

// XP by member id, with no inherited keys: an id like `constructor` reads as no XP yet.
const tally = (): Record<string, number> => Object.create(null) as Record<string, number>

// A stored ledger, with anything malformed dropped.
export function loadLedger(raw: unknown): Ledger {
  const l = isObject(raw) ? raw : {}
  const xp = tally()
  for (const [id, n] of Object.entries(isObject(l.xp) ? l.xp : {})) if (count(n)) xp[id] = count(n)
  return { at: count(l.at), xp, money: count(l.money) }
}

// The XP in `xp` above `counted`, by member id.
function above(xp: Record<string, number>, counted: Record<string, number> = {}): Record<string, number> {
  const out = tally()
  for (const [id, n] of Object.entries(xp)) {
    const more = n - (Object.hasOwn(counted, id) ? (counted[id] ?? 0) : 0)
    if (more > 0) out[id] = more
  }
  return out
}

// The XP in session ledgers not yet folded into the save, by member id. A ledger folded by a version that kept
// no record of what it added counts as wholly folded.
export function extraXp(
  ledgers: Record<string, Ledger>,
  folded: string[] = [],
  foldedXp: Record<string, Record<string, number>> = {},
): Record<string, number> {
  const extra = tally()
  for (const [key, ledger] of Object.entries(ledgers)) {
    if (folded.includes(key) && !Object.hasOwn(foldedXp, key)) continue
    const more = folded.includes(key) ? above(ledger.xp, foldedXp[key]) : ledger.xp
    for (const [id, n] of Object.entries(more)) extra[id] = (extra[id] ?? 0) + n
  }
  return extra
}

// The ₽ in session ledgers not yet folded into the save. A ledger folded with no record of its ₽ had none.
export function extraMoney(
  ledgers: Record<string, Ledger>,
  folded: string[] = [],
  foldedMoney: Record<string, number> = {},
): number {
  let more = 0
  for (const [key, l] of Object.entries(ledgers))
    more += Math.max(0, l.money - (folded.includes(key) ? (foldedMoney[key] ?? l.money) : 0))
  return more
}

// The ₽ to spend: `cash` is extraMoney of the ledgers.
export const balanceOf = (save: Save, cash: number) => STARTING_MONEY + (save.earned ?? 0) + cash - (save.spent ?? 0)

export const formatMoney = (n: number) => `₽${n.toLocaleString('en-US')}`

// The save as the party stands: each member's XP with its ledger XP added. For showing and deciding, never storing.
export const withExtra = (save: Save, extra: Record<string, number>): Save => {
  const add = (m: Member) => ({ ...m, xp: m.xp + (Object.hasOwn(extra, m.id) ? (extra[m.id] ?? 0) : 0) })
  return { ...save, party: save.party.map(add), ...(save.box ? { box: save.box.map(add) } : {}) }
}

// `ledger` added into the save's own XP, and marked as added with what it added; XP it gained since an earlier
// fold is added the same way. Nothing new to add changes nothing.
export function foldLedger(save: Save, key: string, ledger: Ledger): Save {
  const isFolded = save.folded?.includes(key) ?? false
  const counted = save.foldedXp?.[key]
  if (isFolded && !counted) return save
  const more = above(ledger.xp, counted)
  const money = Math.max(0, ledger.money - (save.foldedMoney?.[key] ?? 0))
  if (isFolded && !Object.keys(more).length && !money) return save
  return {
    ...withExtra(save, more),
    folded: isFolded ? (save.folded ?? []) : [...(save.folded ?? []), key],
    foldedXp: { ...save.foldedXp, [key]: { ...counted, ...ledger.xp } },
    ...(ledger.money
      ? { earned: (save.earned ?? 0) + money, foldedMoney: { ...save.foldedMoney, [key]: ledger.money } }
      : {}),
  }
}

export const level = (xp: number) => 1 + Math.floor(Math.sqrt(xp / 4))
export const xpForLevel = (lv: number) => 4 * (lv - 1) ** 2

// The level it evolves at by itself: the lowest level way; null when none is by level; undefined until looked up.
export function evolveLevel(m: Member | undefined): number | null | undefined {
  if (!m?.next) return undefined
  const levels = m.next.flatMap(s => (s.way.kind === 'level' ? [s.way.level] : []))
  return levels.length ? Math.min(...levels) : null
}

// A session's ledger after every party member earns `amount` XP (a Lucky Egg holder half again) and the wallet
// `amount` × MONEY_PER_XP, once.
export const earnInto = (ledger: Ledger, party: Member[], amount: number, now: number): Ledger => ({
  at: now,
  xp: Object.assign(
    tally(),
    ledger.xp,
    Object.fromEntries(
      party.map(m => [
        m.id,
        (Object.hasOwn(ledger.xp, m.id) ? (ledger.xp[m.id] ?? 0) : 0) +
          (m.heldItem === 'lucky-egg' ? Math.round(amount * 1.5) : amount),
      ]),
    ),
  ),
  money: ledger.money + amount * MONEY_PER_XP,
})

export function recordSeen(save: Save, species: string, isShiny: boolean, now: number): Save {
  const was = save.dex[species] ?? { seen: 0, shiny: 0, first: now }
  const entry = { ...was, seen: was.seen + 1, shiny: was.shiny + (isShiny ? 1 : 0) }
  const recent = [species, ...save.recent.filter(r => r !== species)].slice(0, 10)
  return { ...save, dex: { ...save.dex, [species]: entry }, recent }
}

// One more of `species` caught; a catch never seen before counts as seen once.
export function recordCaught(save: Save, species: string, now: number): Save {
  const was = save.dex[species] ?? { seen: 1, shiny: 0, first: now }
  return { ...save, dex: { ...save.dex, [species]: { ...was, caught: (was.caught ?? 0) + 1 } } }
}

// A catch joins the party while it has room, else the PC box; with no room in either, `save` unchanged and
// `isStored` false. Twins are allowed since 1.4.0.
export function storeCaught(save: Save, m: Member): { save: Save; isInParty: boolean; isStored: boolean } {
  const isInParty = save.party.length < MAX_PARTY
  if (isInParty) return { save: { ...save, party: [...save.party, m] }, isInParty, isStored: true }
  if (isBoxFull(save)) return { save, isInParty, isStored: false }
  return { save: { ...save, box: [...(save.box ?? []), m] }, isInParty, isStored: true }
}

export function takeFromBag(save: Save, id: string): Save {
  const left = (save.bag?.[id] ?? 0) - 1
  const { [id]: _, ...rest } = save.bag ?? {}
  const bag = left > 0 ? { ...rest, [id]: left } : rest
  const { bag: __, ...without } = save
  return Object.keys(bag).length ? { ...without, bag } : without
}

// One more of `id` in the Bag, or null when it already holds MAX_BAG.
export function putInBag(save: Save, id: string): Save | null {
  const have = save.bag?.[id] ?? 0
  return have >= MAX_BAG ? null : { ...save, bag: { ...save.bag, [id]: have + 1 } }
}

// Why one more of an item can't go in the Bag, in every command: a release, a give, a take, a buy.
export const bagFull = (name: string) => `Your Bag can't hold another ${name} (${MAX_BAG} already).`

// The member at `spot` gone back to the wild, its held item back in the Bag, or why not (`query`: how it was named).
// The text names its level (`levelOf`, as the party stands) and where it was, so a misfire shows at once. An Everstone
// is free and never kept in the Bag: it is dropped, as a take drops it. The Pokédex keeps the member; its time
// together goes at the next beat.
export function releaseMember(
  save: Save,
  spot: { place: 'party' | 'box'; at: number },
  query: string,
  levelOf = (m: Member) => level(m.xp),
): { save: Save; text: string } | string {
  const isParty = spot.place === 'party'
  const m = isParty ? save.party[spot.at] : save.box?.[spot.at]
  if (!m) return `No ${query.trim()} in your party or PC box.`
  if (isParty && save.party.length === 1) return 'Pick a new lead first.'
  const item = m.heldItem === 'everstone' ? undefined : m.heldItem
  const held = item ? putInBag(save, item) : save
  if (!held) return bagFull(itemName(item ?? ''))
  const box = (save.box ?? []).filter((_, i) => isParty || i !== spot.at)
  const { box: _, ...rest } = held
  const back = item ? ` Its ${itemName(item)} went back to the Bag.` : ''
  return {
    save: { ...rest, party: save.party.filter((_, i) => !isParty || i !== spot.at), ...(box.length ? { box } : {}) },
    text: `Bye bye, ${nameOf(m)} (Lv ${levelOf(m)}, ${isParty ? 'party' : 'PC box'})! It went back to the wild.${back}`,
  }
}

// `qty` of `item` bought with what the wallet holds (`cash`: the ledgers' unfolded ₽), or why not.
export function buy(save: Save, cash: number, item: Item, qty: number): { save: Save; text: string; isError: boolean } {
  if (!Number.isInteger(qty) || qty < 1) return { save, text: "That isn't a quantity you can buy.", isError: true }
  const have = save.bag?.[item.id] ?? 0
  const room = MAX_BAG - have
  const cost = item.price * qty
  const left = balanceOf(save, cash)
  if (!room) return { save, text: bagFull(item.name), isError: true }
  if (qty > room) return { save, text: `Your Bag has room for ${room} more.`, isError: true }
  if (left < cost) return { save, text: `Not enough ₽: ${formatMoney(cost - left)} more to go.`, isError: true }
  return {
    save: { ...save, spent: (save.spent ?? 0) + cost, bag: { ...save.bag, [item.id]: have + qty } },
    text: qty === 1 ? `Bought ${withArticle(item.name)}!` : `Bought ${qty} × ${item.name}!`,
    isError: false,
  }
}

// Time together since the last beat (from any session), capped, added to each member of the save's party (a Soothe
// Bell holder's ×1.5). Time of a member no longer in the party or the PC box (released) is dropped.
export function addTogether(t: Together, save: Save, now: number): Together {
  const gap = t.at ? Math.max(0, Math.min(now - t.at, TOGETHER_CAP_MS)) : 0
  const kept = new Set([...save.party, ...(save.box ?? [])].map(m => m.id))
  const ms = tally()
  for (const [id, n] of Object.entries(t.ms)) if (kept.has(id)) ms[id] = n
  if (gap)
    for (const m of save.party)
      ms[m.id] =
        (Object.hasOwn(ms, m.id) ? (ms[m.id] ?? 0) : 0) + Math.round(m.heldItem === 'soothe-bell' ? gap * 1.5 : gap)
  return { at: now, ms }
}

// A member with its time together from `ms` (by member id), for showing and deciding.
export function withTime(m: Member, ms: Record<string, number>): Member {
  const { togetherMs: _, ...rest } = m
  const n = Object.hasOwn(ms, m.id) ? (ms[m.id] ?? 0) : 0
  return n ? { ...rest, togetherMs: n } : rest
}

// The save with every member's time together: for showing and deciding, never storing.
export const withTogether = (save: Save, ms: Record<string, number>): Save => ({
  ...save,
  party: save.party.map(m => withTime(m, ms)),
  ...(save.box ? { box: save.box.map(m => withTime(m, ms)) } : {}),
})

// "1y 3d 2h 7m": from the largest unit that isn't zero, down to minutes.
export function formatSpan(ms: number): string {
  let minutes = Math.floor(ms / 60_000)
  const parts: string[] = []
  for (const [unit, size] of [
    ['y', 525_600],
    ['d', 1440],
    ['h', 60],
    ['m', 1],
  ] as const) {
    const n = Math.floor(minutes / size)
    minutes -= n * size
    if (n || parts.length) parts.push(`${n}${unit}`)
  }
  while (parts.length > 1 && parts[parts.length - 1]?.startsWith('0')) parts.pop()
  return parts.join(' ') || '0m'
}

export const titleCase = (name: string) =>
  name
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

export const displayName = (species: string, form = 'regular') =>
  titleCase(species) + (form === 'regular' ? '' : ` (${titleCase(form)})`)

// A member as its line in a numbered list names it, so an answer says which one went: "✨ Eevee ♂". The sign is
// left out while its gender is unknown (a member saved before genders, or not looked up yet).
export const nameOf = (m: Member) =>
  `${m.isShiny ? '✨ ' : ''}${displayName(m.species, m.form)}${m.gender === 'female' ? ' ♀' : m.gender === 'male' ? ' ♂' : ''}`

const bar = (done: number, total: number, width = 10) => {
  const full = Math.round((done / total) * width)
  return '█'.repeat(full) + '░'.repeat(width - full)
}

export const TIME_TEXT: Record<Time, string> = { day: 'by day', night: 'at night', dusk: 'at dusk' }

function wayText(w: Way, m: Member): string {
  const when = 'time' in w && w.time ? ` ${TIME_TEXT[w.time]}` : ''
  if (w.kind === 'level')
    return `at Lv ${w.level}${when}${w.partyType ? ` with a ${titleCase(w.partyType)}-type in the party` : ''}`
  if (w.kind === 'item') return `with ${withArticle(itemName(w.item))}${when}`
  if (w.kind === 'hold') return `holding ${withArticle(itemName(w.item))}${when}`
  if (w.kind === 'party') return `with ${titleCase(w.species)} in the party`
  if (w.kind === 'friendship') {
    const ms = m.togetherMs ?? 0
    const left = FRIENDSHIP_MS - ms
    const pct = Math.min(100, Math.floor((ms / FRIENDSHIP_MS) * 100))
    return `with friendship${when} (♥ ${pct}%${left > 0 ? `, ${formatSpan(left + 59_999)} to go` : ''})`
  }
  return ''
}

// How a member evolves next: "evolves at Lv 36", "evolves with a Thunder Stone", "final form".
export function evolvesText(m: Member): string {
  if (m.heldItem === 'everstone') return 'everstone'
  if (!m.next) return ''
  const texts = [...new Set(m.next.map(s => wayText(s.way, m)).filter(Boolean))]
  if (!texts.length) return 'final form'
  return `evolves ${texts.length > 3 ? `${texts.slice(0, 3).join(', ')} or another way` : texts.join(' or ')}`
}

// A member's columns: name, level, xp to the next level, time together, what it holds, how it evolves. The evolves
// text is last and unpadded: it can run long (a branching line), and must not push the others to the right.
function memberColumns(m: Member): string[] {
  const lv = level(m.xp)
  const evolves = evolvesText(m)
  const sign = m.gender === 'female' ? ' ♀' : m.gender === 'male' ? ' ♂' : ''
  return [
    `${m.isShiny ? '✨ ' : ''}${displayName(m.species, m.form)}${sign}${m.isCaught ? ' ◓' : ''}`,
    `Lv ${lv}`,
    `(${xpForLevel(lv + 1) - m.xp} xp to Lv ${lv + 1})`,
    m.togetherMs ? `· together ${formatSpan(m.togetherMs)}` : '',
    m.heldItem && m.heldItem !== 'everstone' ? `· holds ${withArticle(itemName(m.heldItem))}` : '',
    evolves ? `· ${evolves}` : '',
  ]
}

// Terminal columns a text takes: ✨ is drawn two wide.
const widthOf = (text: string) => [...text].length + (text.match(/✨/g)?.length ?? 0)

// Rows of columns, each column padded to its widest entry.
function lineUp(rows: string[][]): string[] {
  const widths = (rows[0] ?? []).map((_, c) => Math.max(...rows.map(r => widthOf(r[c] ?? ''))))
  const pad = (text: string, c: number) => text + ' '.repeat((widths[c] ?? 0) - widthOf(text))
  // A column nobody fills (no one holds anything, say) takes no room.
  return rows.map(
    r =>
      `  ${r
        .flatMap((text, c) => (widths[c] ? [pad(text, c)] : []))
        .join('  ')
        .trimEnd()}`,
  )
}

// One row per member, every column lined up.
export function formatParty(save: Save): string {
  if (!save.party.length) return 'Your party is empty. /pokemon <name> picks a lead.'
  return [
    'Your party:',
    ...lineUp(save.party.map((m, i) => [i === 0 ? 'Lead' : `${i + 1}.`, ...memberColumns(m)])),
  ].join('\n')
}

// The Bag by tab, the wallet, and who holds what, in the party and the PC box. `cash`: the ledgers' unfolded ₽.
export function formatBag(save: Save, cash: number): string {
  const lines = [`Bag · ${formatMoney(balanceOf(save, cash))}`]
  for (const tab of TABS) {
    const items = ITEMS.filter(i => i.tab === tab && (save.bag?.[i.id] ?? 0) > 0).sort((a, b) =>
      a.name.localeCompare(b.name),
    )
    if (items.length) lines.push(`  ${tab.padEnd(10)}  ${items.map(i => `${i.name} ×${save.bag?.[i.id]}`).join(' · ')}`)
  }
  const held = [
    ...save.party.map(m => ({ m, where: '' })),
    ...(save.box ?? []).map(m => ({ m, where: ' (box)' })),
  ].flatMap(({ m, where }) =>
    m.heldItem ? [`${displayName(m.species, m.form)}${where}: ${itemName(m.heldItem)}`] : [],
  )
  if (held.length) lines.push(`  ${'Held'.padEnd(10)}  ${held.join(' · ')}`)
  if (lines.length === 1) lines.push('  Empty. Buy items at the PokéMart: /pokemon mart')
  return lines.join('\n')
}

export function formatBox(save: Save): string {
  const box = save.box ?? []
  if (!box.length) return 'Your PC box is empty.'
  return [
    `Your PC box (${box.length} / ${MAX_BOX}):`,
    ...lineUp(box.map((m, i) => [`${i + 1}.`, ...memberColumns(m)])),
  ].join('\n')
}

// The Pokédex: totals, progress per generation, shinies and the latest sightings. `names` is the national dex order.
export function formatDex(save: Save, names: string[]): string {
  const seen = names.filter(n => save.dex[n])
  const shinies = names.filter(n => (save.dex[n]?.shiny ?? 0) > 0)
  const caught = names.filter(n => (save.dex[n]?.caught ?? 0) > 0)
  const gens = GENERATIONS.map((end, g) => {
    const start = g === 0 ? 0 : (GENERATIONS[g - 1] ?? 0)
    const inGen = names.slice(start, end).filter(n => save.dex[n]).length
    return `  Gen ${g + 1}  ${bar(inGen, end - start)}  ${inGen}/${end - start}`
  })
  return [
    `Pokédex: ${seen.length} / ${names.length} seen · ${caught.length} caught · ${shinies.length} shiny`,
    ...gens,
    `Shinies: ${shinies.length ? shinies.map(n => titleCase(n)).join(', ') : 'none yet'}`,
    `Recently seen: ${save.recent.length ? save.recent.map(n => titleCase(n)).join(', ') : 'nothing yet'}`,
  ].join('\n')
}

// Rows the tallest sprite may take: half size on `small`, and on `auto` when the terminal is short.
export function spriteBudget(size: Size, maxRows: number, headroomRows: number, maxSprite = 12): number {
  const isSmall = size === 'small' || (size === 'auto' && maxRows < 20)
  const room = Math.max(2, maxRows - 1 - headroomRows)
  return Math.min(isSmall ? Math.ceil(maxSprite / 2) : maxSprite, room)
}
