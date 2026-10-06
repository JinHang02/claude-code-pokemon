export type Size = 'auto' | 'normal' | 'small'

export type Member = {
  // Tells apart two members of the same species (an evolution can lead to one already in the party).
  id: string
  species: string
  form: string
  isShiny: boolean
  xp: number
  evolutions: number
  // The level it evolves at, as in the games; null at a final stage, absent until looked up.
  evolveAt?: number | null
  hasEverstone?: boolean
  // From its species' ratio, as in the games; null for a genderless one, absent until looked up.
  gender?: 'female' | 'male' | null
  // Caught with a Poké Ball from the wild, not summoned by name.
  isCaught?: true
}

export type DexEntry = { seen: number; shiny: number; first: number; caught?: number }

// `isOff`: the Pokémon rest in their Poké Balls (/pokemon off): nothing drawn, no xp.
// `folded`: the session XP ledgers already added into the party's XP here, so they never count twice.
// `box`: the PC box, where catches go when the party is full; absent when empty.
export type Save = {
  party: Member[]
  size: Size
  dex: Record<string, DexEntry>
  recent: string[]
  box?: Member[]
  isOff?: boolean
  folded?: string[]
}

// The XP one session has earned, by member id: only that session ever writes it, so sessions running side by
// side can't lose each other's XP. `at`: when it last wrote.
export type Ledger = { at: number; xp: Record<string, number> }

// Store keys of session ledgers start with this.
export const LEDGER = 'xp:'

export const MAX_PARTY = 3
export const XP = { reply: 2, tests: 5, commit: 10 }
export const GENERATIONS = [151, 251, 386, 493, 649, 721, 809, 905]
const SIZES: Size[] = ['auto', 'normal', 'small']

export const emptySave = (): Save => ({ party: [], size: 'auto', dex: {}, recent: [] })

// Species and form names as the sprite list spells them; anything else never reaches a file path or URL.
export const isName = (name: unknown): name is string =>
  typeof name === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)

export const newId = () => Math.random().toString(36).slice(2, 10)

const count = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0)
const isObject = (o: unknown): o is Record<string, unknown> => typeof o === 'object' && o !== null && !Array.isArray(o)

// A stored party member, or null when it isn't one. A member saved before ids existed gets one from its
// place in the party, the same in every session reading that save.
function loadMember(raw: unknown, at: number): Member | null {
  if (!isObject(raw) || !isName(raw.species) || !isName(raw.form)) return null
  const evolveAt = raw.evolveAt
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `${at}-${raw.species}-${raw.form}`,
    species: raw.species,
    form: raw.form,
    isShiny: raw.isShiny === true,
    xp: count(raw.xp),
    evolutions: count(raw.evolutions),
    ...(evolveAt === null || (typeof evolveAt === 'number' && Number.isInteger(evolveAt) && evolveAt > 0)
      ? { evolveAt }
      : {}),
    ...(raw.hasEverstone === true ? { hasEverstone: true } : {}),
    ...(raw.gender === 'female' || raw.gender === 'male' || raw.gender === null ? { gender: raw.gender } : {}),
    ...(raw.isCaught === true ? { isCaught: true as const } : {}),
  }
}

// A stored save, with anything malformed replaced by its default, field by field.
export function loadSave(raw: unknown): Save {
  const s = isObject(raw) ? raw : {}
  const party: Member[] = []
  for (const [at, m] of (Array.isArray(s.party) ? s.party : []).entries()) {
    const member = loadMember(m, at)
    if (!member || party.length >= MAX_PARTY) continue
    party.push(party.some(p => p.id === member.id) ? { ...member, id: `${member.id}-${at}` } : member)
  }
  const box: Member[] = []
  for (const [at, m] of (Array.isArray(s.box) ? s.box : []).entries()) {
    const member = loadMember(m, at)
    if (member) box.push(member)
  }
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
    ...(s.isOff === true ? { isOff: true } : {}),
    ...(Array.isArray(s.folded) && s.folded.some(isLedgerKey) ? { folded: s.folded.filter(isLedgerKey) } : {}),
  }
}

const isLedgerKey = (k: unknown): k is string => typeof k === 'string' && k.startsWith(LEDGER)

// A stored ledger, with anything malformed dropped.
export function loadLedger(raw: unknown): Ledger {
  const l = isObject(raw) ? raw : {}
  const xp: Record<string, number> = {}
  for (const [id, n] of Object.entries(isObject(l.xp) ? l.xp : {})) if (count(n)) xp[id] = count(n)
  return { at: count(l.at), xp }
}

// The XP in session ledgers not yet folded into the save, by member id.
export function extraXp(ledgers: Record<string, Ledger>, folded: string[] = []): Record<string, number> {
  const extra: Record<string, number> = {}
  for (const [key, ledger] of Object.entries(ledgers))
    if (!folded.includes(key)) for (const [id, n] of Object.entries(ledger.xp)) extra[id] = (extra[id] ?? 0) + n
  return extra
}

// The save as the party stands: each member's XP with its ledger XP added. For showing and deciding, never storing.
export const withExtra = (save: Save, extra: Record<string, number>): Save => {
  const add = (m: Member) => ({ ...m, xp: m.xp + (extra[m.id] ?? 0) })
  return { ...save, party: save.party.map(add), ...(save.box ? { box: save.box.map(add) } : {}) }
}

// `ledger` added into the save's own XP, and marked as added; a ledger already added changes nothing.
export function foldLedger(save: Save, key: string, ledger: Ledger): Save {
  if (save.folded?.includes(key)) return save
  return {
    ...withExtra(save, ledger.xp),
    folded: [...(save.folded ?? []), key],
  }
}

export const level = (xp: number) => 1 + Math.floor(Math.sqrt(xp / 4))
export const xpForLevel = (lv: number) => 4 * (lv - 1) ** 2

export const isDueToEvolve = (m: Member) =>
  !m.hasEverstone && typeof m.evolveAt === 'number' && level(m.xp) >= m.evolveAt

// A session's ledger after every party member earns `amount`.
export const earnInto = (ledger: Ledger, party: Member[], amount: number, now: number): Ledger => ({
  at: now,
  xp: { ...ledger.xp, ...Object.fromEntries(party.map(m => [m.id, (ledger.xp[m.id] ?? 0) + amount])) },
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

// A catch joins the party while it has room and holds no Pokémon of its species and form; else the PC box.
export function storeCaught(save: Save, m: Member): { save: Save; isInParty: boolean } {
  const isInParty = save.party.length < MAX_PARTY && !save.party.some(p => p.species === m.species && p.form === m.form)
  return isInParty
    ? { save: { ...save, party: [...save.party, m] }, isInParty }
    : { save: { ...save, box: [...(save.box ?? []), m] }, isInParty }
}

export const titleCase = (name: string) =>
  name
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

export const displayName = (species: string, form = 'regular') =>
  titleCase(species) + (form === 'regular' ? '' : ` (${titleCase(form)})`)

const bar = (done: number, total: number, width = 10) => {
  const full = Math.round((done / total) * width)
  return '█'.repeat(full) + '░'.repeat(width - full)
}

// A member's columns: name, level, xp to the next level, and when it evolves.
function memberColumns(m: Member): string[] {
  const lv = level(m.xp)
  const evolves = m.hasEverstone
    ? '· everstone'
    : typeof m.evolveAt === 'number'
      ? `· evolves at Lv ${m.evolveAt}`
      : m.evolveAt === null
        ? '· final form'
        : ''
  const sign = m.gender === 'female' ? ' ♀' : m.gender === 'male' ? ' ♂' : ''
  return [
    `${m.isShiny ? '✨ ' : ''}${displayName(m.species, m.form)}${sign}${m.isCaught ? ' ◓' : ''}`,
    `Lv ${lv}`,
    `(${xpForLevel(lv + 1) - m.xp} xp to Lv ${lv + 1})`,
    evolves,
  ]
}

// Terminal columns a text takes: ✨ is drawn two wide.
const widthOf = (text: string) => [...text].length + (text.match(/✨/g)?.length ?? 0)

// Rows of columns, each column padded to its widest entry.
function lineUp(rows: string[][]): string[] {
  const widths = (rows[0] ?? []).map((_, c) => Math.max(...rows.map(r => widthOf(r[c] ?? ''))))
  const pad = (text: string, c: number) => text + ' '.repeat((widths[c] ?? 0) - widthOf(text))
  return rows.map(r => `  ${r.map(pad).join('  ').trimEnd()}`)
}

// One row per member, every column lined up.
export function formatParty(save: Save): string {
  if (!save.party.length) return 'Your party is empty. /pokemon <name> picks a lead.'
  return [
    'Your party:',
    ...lineUp(save.party.map((m, i) => [i === 0 ? 'Lead' : `${i + 1}.`, ...memberColumns(m)])),
  ].join('\n')
}

export function formatBox(save: Save): string {
  const box = save.box ?? []
  if (!box.length) return 'Your PC box is empty.'
  return ['Your PC box:', ...lineUp(box.map((m, i) => [`${i + 1}.`, ...memberColumns(m)]))].join('\n')
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
