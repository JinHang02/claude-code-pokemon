// Every slash command's words in one place: what /pokemon-help and /pokemon help list, and what the prompt box's
// typeahead previews while a command is typed (`/pokemon g` offers `give <item> <name>`, then the Bag's items, then
// the party's names).
import { LANDSCAPES } from './backdrop'
import type { Phase } from './backdrop'
import { EVOLUTION_STYLES } from './evolution-style'
import { forSale, ITEMS } from './items'
import { slug } from './lookup'
import { displayName, formatMoney, nameOf } from './save'
import type { Member, Save } from './save'
import { SPECIES } from './species-data'

// What a word of a command can be: a Pokémon of yours (in the party, the PC box, or either), any species, an item
// (one in the Bag first, or one the Mart sells), or one of a fixed few.
type Arg =
  'party' | 'box' | 'owned' | 'species' | 'visitor' | 'bag' | 'sale' | 'size' | 'style' | 'mode' | 'landscape' | 'phase'

type Sub = {
  // The word typed after the command; `''` for one that is the whole command (`/pokemon` alone, `/pokemon <name>`).
  word: string
  // As the help and the typeahead's row write it.
  usage: string
  about: string
  // What each word after `word` can be, in order.
  args?: Arg[]
  // Listed by one of the two alone: the help says `on, off` in one line, the typeahead offers each word.
  only?: 'help' | 'typeahead'
}

export const POKEMON: Sub[] = [
  { word: '', usage: '(nothing)', about: 'a random new lead; old to PC box' },
  { word: '', usage: '<name>', about: 'lead with it; shiny <name>' },
  { word: 'add', usage: 'add [name]', about: 'join the party', args: ['species'] },
  { word: 'release', usage: 'release <name> [n]', about: 'back to the wild; or remove', args: ['owned'] },
  { word: 'remove', usage: 'remove <name> [n]', about: 'back to the wild', args: ['owned'], only: 'typeahead' },
  { word: 'deposit', usage: 'deposit <name>', about: 'into the PC box', args: ['party'] },
  { word: 'party', usage: 'party', about: 'your party' },
  { word: 'box', usage: 'box [name] [page]', about: 'the PC box, 30 a page', args: ['box'] },
  { word: 'bag', usage: 'bag', about: 'your items and ₽' },
  { word: 'give', usage: 'give <item> <name>', about: 'evolve, level up or hold', args: ['bag', 'party'] },
  { word: 'take', usage: 'take <name>', about: 'take back what it holds', args: ['owned'] },
  { word: 'everstone', usage: 'everstone <name>', about: 'stop it evolving, or not', args: ['party'] },
  { word: 'evolve', usage: 'evolve <name> [n]', about: "evolve one that's ready", args: ['party'] },
  { word: 'evolve', usage: 'evolve manual, auto', about: 'by /pokemon evolve, or by itself', args: ['mode'] },
  { word: 'mart', usage: 'mart', about: 'the PokéMart, by mouse' },
  { word: 'buy', usage: 'buy <item> [count]', about: 'the PokéMart, by typing', args: ['sale'] },
  { word: 'size', usage: 'size <size>', about: 'small, normal or auto', args: ['size'] },
  { word: 'evolution', usage: 'evolution <style>', about: 'rays, white or gradient', args: ['style'] },
  { word: 'on', usage: 'on, off', about: 'out, or back in their balls', only: 'help' },
  { word: 'on', usage: 'on', about: 'out of their Poké Balls', only: 'typeahead' },
  { word: 'off', usage: 'off', about: 'back in their Poké Balls', only: 'typeahead' },
  { word: 'help', usage: 'help', about: 'this list' },
]

const ANIMATION_ABOUT: [string, string][] = [
  ['hop', 'the hop at the end of a reply'],
  ['cheer', 'confetti, as when tests pass'],
  ['faint', 'a faint, as when tests fail'],
  ['sleep', 'dozing, as after 5 idle minutes'],
  ['squash', 'squashed, as while compacting'],
  ['work', 'busy, as while Claude works'],
  ['clones', 'clones, as for subagents'],
  ['push', 'a Pidgey flies off, as on git push'],
  ['boulder', 'Strength, as on a long test or build'],
  ['boxes', 'boxes carried, as after an install'],
  ['confused', 'confused, as at a merge conflict'],
]
const PHASE_ABOUT: Record<Phase, string> = {
  day: 'daytime',
  dusk: 'the sun going down',
  night: 'night and stars',
  dawn: 'the sun coming up',
}

export const PLAY: Sub[] = [
  ...ANIMATION_ABOUT.map(([word, about]) => ({ word, usage: word, about })),
  { word: 'evolve', usage: 'evolve [style]', about: "your lead's evolution screen", args: ['style'] },
  { word: 'wild', usage: 'wild [name]', about: 'a wild Pokémon wanders by', args: ['visitor'] },
  ...(Object.keys(PHASE_ABOUT) as Phase[]).map(word => ({
    word,
    usage: `${word} [place]`,
    about: PHASE_ABOUT[word],
    args: ['landscape' as const],
  })),
  ...LANDSCAPES.map(word => ({ word, usage: `${word} [time]`, about: `the ${word}`, args: ['phase' as const] })),
]

// The commands' own lines in the typeahead and /help: one short line each, so none is cut off, and the hint the
// prompt box shows dim after the command's name.
export const COMMANDS = {
  pokemon: {
    name: 'pokemon',
    description: 'Your Pokémon: lead, party, PC box, bag, items, evolution · /pokemon-help lists all',
    argumentHint: '[name | party | box | bag | give | evolve | mart | …]',
  },
  play: {
    name: 'pokemon-play',
    description: 'Try an animation, a time of day or a landscape · /pokemon-help lists all',
    argumentHint: '[animation | time | landscape]',
  },
  dex: { name: 'pokedex', description: 'Every Pokémon you have seen, and your party' },
  help: { name: 'pokemon-help', description: 'Every Pokémon command and what it takes' },
} as const

const USAGE_COLUMNS = 19
const line = (s: Sub) => `  ${s.usage.padEnd(USAGE_COLUMNS)}  ${s.about}`
const listed = (subs: Sub[]) => subs.filter(s => s.only !== 'typeahead')

// `/pokemon help`: every sub-command, one a line, narrow enough for a 60-column terminal.
export const POKEMON_HELP = [
  'Pokémon Journey · /pokemon …',
  ...listed(POKEMON).map(line),
  'Several of one? Add a number, shiny or lv <n>.',
  'Also: /pokedex, and /pokemon-play to try things out.',
].join('\n')

// `/pokemon-help`: every command of the plugin with every word it takes, under 60 columns too.
export const ALL_HELP = [
  'Pokémon Journey · every command',
  '',
  '/pokemon …',
  ...listed(POKEMON).map(line),
  '  Several of one? Add a number, shiny or lv <n>.',
  '',
  '/pokemon-play …',
  ...ANIMATION_ABOUT.map(([word, about]) => line({ word, usage: word, about })),
  line({ word: '', usage: 'evolve [style]', about: "your lead's evolution screen" }),
  line({ word: '', usage: 'wild [name]', about: 'a wild Pokémon wanders by' }),
  line({ word: '', usage: '<time> <place>', about: 'e.g. dusk lake, for 15 s' }),
  `    times: ${Object.keys(PHASE_ABOUT).join(', ')}`,
  `    places: ${LANDSCAPES.join(', ')}`,
  '',
  '/pokedex             all you have seen and caught',
  '/pokemon-help        this list',
  '',
  'Type /pokemon and a letter: the typeahead previews',
  'each command, then your items and Pokémon.',
].join('\n')

// What the typeahead knows of the save: the party, the PC box and the Bag, and a member's level now.
export type Owned = Pick<Save, 'party' | 'box' | 'bag'> & { levelOf: (m: Member) => number }

export type Suggestion = { text: string; label?: string; description?: string }

// Rows past this many are left out: the typeahead is a preview, not a list to scroll through.
export const MAX_ROWS = 8
const SPECIES_NAMES = Object.keys(SPECIES)

// The typeahead's rows for `token`, the word at the cursor in `text`, while a Pokémon command is typed; [] for
// anything else. On the command itself every word it takes, then on each word what can go there.
export function suggest(text: string, cursor: number, token: string, start: number, owned: Owned): Suggestion[] {
  const typed = text.slice(0, cursor)
  const m = /^\s*\/(pokemon|pokemon-play)(?=\s|$)/.exec(typed)
  if (!m) return []
  const isPlay = m[1] === 'pokemon-play'
  const subs = isPlay ? PLAY : POKEMON
  const command = `/${m[1]}`
  // The token is the command itself: every word it takes, written after it.
  if (start < m[0].length) return token.trim() === command ? offered(subs).map(s => subRow(s, `${command} `)) : []
  const before = typed.slice(m[0].length, start).trim().split(/\s+/).filter(Boolean)
  const lower = token.toLowerCase()
  // The first word: the sub-commands it starts, then (for /pokemon) the Pokémon it could make lead.
  if (!before.length) {
    const rows = offered(subs)
      .filter(s => s.word.startsWith(lower))
      .map(s => subRow(s, ''))
    if (!isPlay) rows.push(...members(lower, [...owned.party, ...(owned.box ?? [])], owned, 'lead'))
    if (!isPlay) rows.push(...species(lower, owned, name => `catch ${name} as your lead`))
    return dedupe(rows).slice(0, MAX_ROWS)
  }
  const head = before[0]?.toLowerCase() ?? ''
  const matching = subs.filter(s => s.word === head && s.args)
  // A lead's name in several words (`tapu k`, `mr m`): the token goes on the name.
  if (!isPlay && !subs.some(s => s.word === head)) {
    const rows = [
      ...members(token, [...owned.party, ...(owned.box ?? [])], owned, 'lead', before),
      ...species(token, owned, name => `catch ${name} as your lead`, before),
    ]
    return dedupe(rows).slice(0, MAX_ROWS)
  }
  // A /pokemon-play scene takes one more word; the rest take theirs in order.
  const at = before.length - 1
  const kinds = matching.flatMap(s => s.args?.[isPlay ? 0 : at] ?? [])
  // `give`'s Pokémon comes after its item, which may be typed in several words (`thunder stone`): until the words
  // so far name an item, the token goes on the item.
  if (head === 'give' && at >= 1) {
    const itemWords = before.slice(1).map(w => slug(w))
    const isItem = ITEMS.some(i => i.id === itemWords.join('-'))
    if (isItem) return rowsFor('party', token, owned).slice(0, MAX_ROWS)
    const rows = items(token, owned, itemWords)
    // The Pokémon first and the item after (`give pikachu thunder`), as give reads it too.
    const isMember = owned.party.some(m => slug(typedName(m)) === itemWords.join('-'))
    return (rows.length || !isMember ? rows : items(token, owned)).slice(0, MAX_ROWS)
  }
  // Past the first word of a name (`add mr m`, `buy fire s`): the token goes on the name.
  const name = matching.flatMap(s =>
    at > 0 && !s.args?.[at] && NAMED.includes(s.args?.[0] ?? 'size') ? [s.args?.[0]] : [],
  )
  if (name.length)
    return dedupe(name.flatMap(k => (k ? rowsFor(k, token, owned, before.slice(1)) : []))).slice(0, MAX_ROWS)
  if (isPlay && at > 0) return []
  return dedupe(kinds.flatMap(k => rowsFor(k, token, owned))).slice(0, MAX_ROWS)
}

const offered = (subs: Sub[]) => subs.filter(s => s.word && s.only !== 'help')

// A sub-command's row: it writes the word (and the command before it, when the token is the command), and shows
// only how it's used, so the row stays as narrow as the typeahead's own.
const subRow = (s: Sub, command: string): Suggestion => ({
  text: `${command}${s.word}${s.args ? ' ' : ''}`,
  label: s.usage,
  description: s.about,
})

// The words that are names, maybe several words long: a token after the first goes on the name.
const NAMED: Arg[] = ['party', 'box', 'owned', 'species', 'visitor', 'sale']

// `wordsBefore`: a name's first words already typed (`mr`), so a row writes only the rest of it (`mime`).
function rowsFor(kind: Arg, typed: string, owned: Owned, wordsBefore: string[] = []): Suggestion[] {
  const lower = typed.toLowerCase()
  switch (kind) {
    case 'party':
      return members(typed, owned.party, owned, '', wordsBefore)
    case 'box':
      return members(typed, owned.box ?? [], owned, '', wordsBefore)
    case 'owned':
      return members(typed, [...owned.party, ...(owned.box ?? [])], owned, '', wordsBefore)
    case 'species':
      return species(typed, owned, name => `catch ${name}`, wordsBefore)
    case 'visitor':
      return species(typed, owned, name => `a wild ${name} wanders by`, wordsBefore)
    case 'bag':
      return items(typed, owned)
    case 'sale': {
      const want = slug([...wordsBefore, typed].join(' '))
      return forSale()
        .filter(i => i.id.startsWith(want) && i.id.split('-').length > wordsBefore.length)
        .map(i => ({
          text: `${rest(i.id, wordsBefore, '-')} `,
          label: i.id,
          description: `${i.name} · ${formatMoney(i.price)}`,
        }))
    }
    case 'size':
      return fixed(lower, [
        ['small', 'half the band'],
        ['normal', 'full size'],
        ['auto', 'small on short terminals'],
      ])
    case 'style':
      return fixed(
        lower,
        EVOLUTION_STYLES.map(s => [s, 'evolution screen style']),
      )
    case 'mode':
      return fixed(lower, [
        ['manual', 'they wait for /pokemon evolve'],
        ['auto', 'they evolve by themselves'],
      ])
    case 'landscape':
      return fixed(
        lower,
        LANDSCAPES.map(l => [l, `the ${l}`]),
      )
    case 'phase':
      return fixed(
        lower,
        (Object.keys(PHASE_ABOUT) as Phase[]).map(p => [p, PHASE_ABOUT[p]]),
      )
  }
}

const fixed = (typed: string, words: [string, string][]): Suggestion[] =>
  words.filter(([w]) => w.startsWith(typed)).map(([w, about]) => ({ text: w, description: about }))

// A name as a command reads it back: the species, then its form (`typhlosion hisui`).
const typedName = (m: Member) => (m.form === 'regular' ? m.species : `${m.species} ${m.form}`)

// Your Pokémon whose name starts with what's typed, each once, with its level and where it is.
function members(typed: string, list: Member[], owned: Owned, then = '', wordsBefore: string[] = []): Suggestion[] {
  const want = slug([...wordsBefore, typed].join(' '))
  const isLong = (name: string) => name.split(/[\s-]+/).length > wordsBefore.length
  return list
    .filter(m => isLong(typedName(m)) && slug(typedName(m)).startsWith(want))
    .map(m => {
      const where = owned.party.includes(m) ? (owned.party[0] === m ? 'lead' : 'party') : 'PC box'
      const holds = m.heldItem ? ` · holds ${ITEMS.find(i => i.id === m.heldItem)?.name ?? m.heldItem}` : ''
      const lead = then && where !== 'lead' ? ` · make it ${then}` : ''
      return {
        text: rest(typedName(m), wordsBefore),
        label: typedName(m),
        description: `${nameOf(m)} · Lv ${owned.levelOf(m)} · ${where}${holds}${lead}`,
      }
    })
}

// Any species starting with what's typed (two letters at least: one would list a hundred).
function species(
  typed: string,
  owned: Owned,
  about: (name: string) => string,
  wordsBefore: string[] = [],
): Suggestion[] {
  const want = slug([...wordsBefore, typed].join(' '))
  if (want.length < 2) return []
  const yours = new Set([...owned.party, ...(owned.box ?? [])].map(m => m.species))
  return SPECIES_NAMES.filter(n => n.startsWith(want) && !yours.has(n) && n.split('-').length > wordsBefore.length)
    .slice(0, MAX_ROWS)
    .map(n => ({
      text: rest(n, wordsBefore),
      ...(wordsBefore.length ? { label: n } : {}),
      description: about(displayName(n)),
    }))
}

// A name's words after the first ones already typed, as a row writes them over the token.
const rest = (name: string, wordsBefore: string[], join = ' ') =>
  name
    .split(/[\s-]+/)
    .slice(wordsBefore.length)
    .join(join)

// The items starting with what's typed: the Bag's first, with how many, then the rest of the Mart's with a price.
// `wordsBefore`: an item's first words already typed (`thunder`), so a row writes only the rest of its name.
function items(typed: string, owned: Owned, wordsBefore: string[] = []): Suggestion[] {
  const want = slug([...wordsBefore, typed].join(' '))
  const fits = ITEMS.filter(i => i.id.startsWith(want) && i.id.split('-').length > wordsBefore.length)
  const has = (id: string) => owned.bag?.[id] ?? 0
  const row = (id: string, description: string): Suggestion => ({
    text: `${id.split('-').slice(wordsBefore.length).join('-')} `,
    label: id,
    description,
  })
  return [
    ...fits.filter(i => has(i.id)).map(i => row(i.id, `${i.name} ×${has(i.id)} in your Bag · then <name>`)),
    ...fits
      .filter(i => !has(i.id) && i.isSold !== false)
      .map(i => row(i.id, `${i.name} · none in your Bag: /pokemon buy ${i.id}`)),
  ]
}

const dedupe = (rows: Suggestion[]) => {
  const seen = new Set<string>()
  // By what a row shows: `evolve <name>` and `evolve manual, auto` write the same word, and both are worth seeing.
  return rows.filter(r => (seen.has(r.label ?? r.text) ? false : (seen.add(r.label ?? r.text), true)))
}
