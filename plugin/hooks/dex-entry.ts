// `/pokedex <name>`: one species' entry. Its number, types and rarity, what the Pokédex has of it, how it evolves
// (from and into), its forms, and which of yours are that species; fitted to the terminal like the other replies.
import { evolvedForm, nextStages, pokeapiForm } from './evolution'
import type { ChainLink, Stage, Way } from './evolution'
import { itemName } from './items'
import { readName, slug, spell } from './lookup'
import type { Pick, Species } from './lookup'
import { displayName, nameOf, REPLY_INDENT, speciesName, TIME_TEXT, titleCase, widthOf, wrapSegments } from './save'
import type { Member, Save } from './save'
import { SPECIES } from './species-data'

// What the evolution lookup came back with: the stages a party member of this species and form would have, and the
// chain they came from (absent for a species PokeAPI has none for); or that it failed (no connection and nothing
// cached), or is still downloading.
export type DexEvolutions = { stages: Stage[]; chain?: ChainLink } | 'offline' | 'slow'

// The most of your Pokémon of one species the entry names; the rest are counted.
const MAX_YOURS = 6

// What `/pokedex <query>` names among `list`: the species and form, or the answer instead (a guess to confirm, or no
// such Pokémon). Null when the query names none (`shiny` alone): the whole Pokédex then.
export function readDexQuery(list: Species[], query: string): Pick | string | null {
  const named = readName(list, query)
  if ('error' in named) return named.error
  if ('guess' in named)
    return `Did you mean ${displayName(named.guess.species, named.guess.form)}? Run /pokedex ${spell(named.guess)}`
  return named.pick
}

// A way to evolve, short enough to sit in brackets after a name: "Water Stone", "Lv 25, at night".
function wayShort(way: Way): string {
  const when = 'time' in way && way.time ? `, ${TIME_TEXT[way.time]}` : ''
  if (way.kind === 'level')
    return `Lv ${way.level}${when}${way.partyType ? `, a ${titleCase(way.partyType)}-type in the party` : ''}`
  if (way.kind === 'item') return `${itemName(way.item)}${when}`
  if (way.kind === 'hold') return `holding ${itemName(way.item)}${when}`
  if (way.kind === 'friendship') return `friendship${when}`
  if (way.kind === 'party') return `${speciesName(way.species)} in the party`
  return 'comes along'
}

// Stages as the entry lists them: one per Pokémon they lead to, its ways together ("Lycanroc (Lv 25, by day or Lv
// 25, at night)"), each named in the form the pick would become.
function stageTexts(stages: Stage[], form: string, list: Species[]): string[] {
  const ways = new Map<string, string[]>()
  for (const stage of stages) {
    const forms = list.find(s => s.name === stage.species)?.forms ?? ['regular']
    const name = displayName(stage.species, evolvedForm(stage, form, forms))
    const text = wayShort(stage.way)
    const had = ways.get(name) ?? []
    if (!had.includes(text)) ways.set(name, [...had, text])
  }
  return [...ways].map(([name, texts]) => `${name} (${texts.join(' or ')})`)
}

const parentOf = (chain: ChainLink, name: string): ChainLink | undefined =>
  chain.evolves_to.some(c => c.species.name === name)
    ? chain
    : chain.evolves_to.map(c => parentOf(c, name)).find(Boolean)

// What the pick evolves from and how, read off the same chain: "Pichu (friendship)". The way into the pick's own form
// when the chain names one, else any; just the name when the plugin has no way for it. Null for a first stage.
function evolvesFrom(chain: ChainLink, pick: Pick, list: Species[]): string | null {
  const parent = parentOf(chain, pick.species)?.species.name
  if (!parent) return null
  const into = nextStages(chain, parent).filter(s => s.species === pick.species)
  const own = pokeapiForm(pick.species, pick.form)
  const stage = into.find(s => s.form === own) ?? into.find(s => !s.form) ?? into[0]
  const known = list.some(s => s.name === parent)
  return `${known ? speciesName(parent) : titleCase(parent)}${stage ? ` (${wayShort(stage.way)})` : ''}`
}

// Columns an item needs beside its label; a terminal narrower than that has them under it instead.
const BESIDE = 24

// `label` then `items` joined by " · ", wrapped under the first item to fit `room` columns (no limit when unknown).
function labelled(label: string, items: string[], room: number): string[] {
  const head = `${label}: `
  const line = head + items.join(' · ')
  if (widthOf(line) <= room) return [line]
  const width = room - head.length
  if (width < BESIDE) return [`${label}:`, ...wrapSegments(items, Math.max(room - 2, 20)).map(l => `  ${l}`)]
  return wrapSegments(items, width).map((text, i) => (i ? ' '.repeat(head.length) : head) + text)
}

// Where one of yours is, as a list line says it: the lead, the party, or its place in the PC box.
const placeOf = (save: Save, m: Member) =>
  save.party[0] === m ? 'lead' : save.party.includes(m) ? 'party' : `PC box #${(save.box ?? []).indexOf(m) + 1}`

export type DexEntry = {
  pick: Pick
  // The species list in national Pokédex order: a species' number is its place in it, from 1.
  list: Species[]
  // The save as the party stands (XP from every session included), for the Pokédex counts and your Pokémon.
  save: Save
  evolutions: DexEvolutions
  levelOf: (m: Member) => number
}

// The entry for a terminal `columns` wide. The first line starts `#133`, no space: `# ` would be a Markdown heading.
export function formatDexEntry({ pick, list, save, evolutions, levelOf }: DexEntry, columns = Infinity): string {
  const room = columns > 0 ? columns - REPLY_INDENT : Infinity
  const info = SPECIES[pick.species]
  const types = (pick.form === 'regular' ? undefined : info?.forms[pick.form]?.types) ?? info?.types ?? []
  const seen = save.dex[pick.species]
  const counts = seen && `(${seen.seen} seen, ${seen.caught ?? 0} caught, ${seen.shiny} shiny)`
  const status = !seen ? 'not seen yet' : (seen.caught ?? 0) > 0 ? `caught ✓ ${counts}` : `not caught yet ${counts}`
  const head = [
    `#${pick.dex + 1} ${displayName(pick.species, pick.form)}`,
    ...(types.length ? [types.map(titleCase).join('/')] : []),
    ...(info ? [info.tier.replace(/-/g, ' ')] : []),
    status,
  ]
  const lines = room < Infinity ? wrapSegments(head, Math.max(room, 20)) : [head.join(' · ')]
  if (typeof evolutions === 'string')
    lines.push(
      evolutions === 'offline'
        ? 'Evolution info needs a connection.'
        : `Evolution info is still downloading. Run /pokedex ${spell(pick)} again.`,
    )
  else {
    const from = evolutions.chain && evolvesFrom(evolutions.chain, pick, list)
    if (from) lines.push(...labelled('Evolves from', [from], room))
    const into = stageTexts(evolutions.stages, pick.form, list)
    lines.push(...labelled('Evolves into', into.length ? into : [from ? 'none, final form' : 'none'], room))
  }
  const forms = (list[pick.dex]?.forms ?? []).filter(f => f !== 'regular').map(titleCase)
  lines.push(...labelled('Forms', forms.length ? forms : ['none'], room))
  const yours = [...save.party, ...(save.box ?? [])].filter(m => m.species === pick.species)
  const more = yours.length - MAX_YOURS
  const named = yours.slice(0, MAX_YOURS).map(m => `${nameOf(m)} Lv ${levelOf(m)} (${placeOf(save, m)})`)
  lines.push(
    ...labelled('You have', named.length ? [...named, ...(more > 0 ? [`… and ${more} more`] : [])] : ['none'], room),
  )
  return lines.join('\n')
}

// A typeahead row, as commands.ts's own.
type Row = { text: string; label?: string; description: string }

const SPECIES_NAMES = Object.keys(SPECIES)

// The typeahead's rows while `/pokedex <name>` is typed: every species starting with the words so far (two letters
// at least: one would list a hundred), each with its number, types and what your Pokédex has of it. `wordsBefore`:
// a name's first words already typed (`tapu`), so a row writes only the rest of it.
export function dexRows(wordsBefore: string[], token: string, dex: Save['dex'] = {}): Row[] {
  const want = slug([...wordsBefore, token].join(' '))
  if (want.length < 2) return []
  return SPECIES_NAMES.flatMap((name, at) => {
    if (!name.startsWith(want) || name.split('-').length <= wordsBefore.length) return []
    const seen = dex[name]
    const status = !seen ? 'not seen yet' : (seen.caught ?? 0) > 0 ? 'caught ✓' : 'seen'
    const types = (SPECIES[name]?.types ?? []).map(titleCase).join('/')
    return [
      {
        text: name.split('-').slice(wordsBefore.length).join(' '),
        ...(wordsBefore.length ? { label: name } : {}),
        description: `#${at + 1} ${speciesName(name)} · ${types} · ${status}`,
      },
    ]
  })
}
