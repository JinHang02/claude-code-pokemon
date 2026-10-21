import { ITEMS } from './items'
import type { Item } from './items'
import { speciesName } from './save'

export type Species = { name: string; forms: string[] }

const FORM_CHANCE = 1 / 8
const ADJECTIVES: Record<string, string> = { alolan: 'alola', galarian: 'galar', hisuian: 'hisui', gigantamax: 'gmax' }

// Lowercase, hyphenated, accents and punctuation dropped: "Mr. Mime" -> "mr-mime", "Flabébé" -> "flabebe",
// "Nidoran♀" -> "nidoran-f".
export const slug = (text: string) =>
  text
    .replace(/♀/g, ' f')
    .replace(/♂/g, ' m')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')

// `rest`, a run of `slug(text)`'s words at its front or back, as typed: with the signs and dots `slug` drops, so
// `eevee -1` stays a number below 1 and `1.5` is no 15. The words themselves when a typed word straddles the run.
export function typedRest(text: string, rest: string[]): string {
  const words = slug(text).split('-').filter(Boolean)
  const tail = words.length - rest.length
  const isTail = rest.every((w, i) => words[tail + i] === w)
  const [from, to] = isTail ? [tail, words.length] : [0, rest.length]
  const edge = isTail ? from : to
  const kept: string[] = []
  let at = 0
  for (const token of text.trim().split(/\s+/).filter(Boolean)) {
    const start = at
    at += slug(token).split('-').filter(Boolean).length
    if (start < edge && at > edge) return rest.join(' ')
    // A token of no words (`-`) at the edge goes with the run.
    if (start >= from && at <= to) kept.push(token)
  }
  return at === words.length ? kept.join(' ') : rest.join(' ')
}

export type Pick = { dex: number; species: string; form: string }

const pickOf = (list: Species[], dex: number, form = 'regular'): Pick => ({ dex, species: list[dex]?.name ?? '', form })

// Edit distance, capped: anything past `max` counts as `max + 1`.
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++)
      row[j] = Math.min((prev[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = row
  }
  return Math.min(prev[b.length] ?? max + 1, max + 1)
}

const typos = (text: string) => (text.length <= 5 ? 1 : 2)

function closest(names: string[], wanted: string): number {
  let [best, bestAt] = [typos(wanted) + 1, -1]
  names.forEach((name, at) => {
    const d = distance(wanted, name, typos(wanted))
    if (d < best) [best, bestAt] = [d, at]
  })
  return bestAt
}

type Match = 'exact' | 'prefix' | 'typo'

function findSpecies(list: Species[], name: string, match: Match): number {
  if (match === 'exact') return list.findIndex(p => p.name === name)
  if (match === 'prefix') return name.length >= 3 ? list.findIndex(p => p.name.startsWith(name)) : -1
  return closest(
    list.map(p => p.name),
    name,
  )
}

function findForm(forms: string[], rest: string[]): string | undefined {
  const wanted = rest.join('-')
  return (
    forms.find(f => f === wanted) ??
    forms.find(f => f.startsWith(wanted)) ??
    forms.find(f => rest.every(w => f.split('-').includes(w))) ??
    forms[closest(forms, wanted)]
  )
}

export type Lookup = { pick: Pick } | { guess: Pick } | { error: string }

// The tokens of `typed` outside its words `from` to `to` (the species), as typed, so `unown 1.5` says "1.5", not
// "15". Null when `typed` doesn't split into `words` along its tokens.
function typedOutside(typed: string, words: string[], from: number, to: number): string | null {
  const kept: string[] = []
  let at = 0
  for (const token of typed.trim().split(/\s+/).filter(Boolean)) {
    const start = at
    at += slug(token).split('-').filter(Boolean).length
    if (at === start) continue
    if (start >= from && at <= to) continue
    if (start < to && at > from) return null
    kept.push(token)
  }
  return at === words.length && words.join('-') === slug(typed).split('-').filter(Boolean).join('-')
    ? kept.join(' ')
    : null
}

const sameWords = (a: string[], b: string[]) => a.length === b.length && a.every(w => b.includes(w))

// The species and form a query names, spelled right: a run of its words is exactly a species and the
// words left over (in any order, "alolan" read as "alola") exactly one of its forms.
function exact(list: Species[], words: string[]): Pick | null {
  for (let len = words.length; len > 0; len--)
    for (let at = 0; at + len <= words.length; at++) {
      const dex = findSpecies(list, words.slice(at, at + len).join('-'), 'exact')
      const found = list[dex]
      if (!found) continue
      const rest = [...words.slice(0, at), ...words.slice(at + len)].map(w => ADJECTIVES[w] ?? w)
      if (rest.length === 0) return pickOf(list, dex)
      const form = found.forms.find(f => f !== 'regular' && sameWords(f.split('-'), rest))
      if (form) return pickOf(list, dex, form)
    }
  return null
}

// The closest species and form to a misspelt or partial query: a run of its words is the species (exact,
// then a prefix, then a near miss), the words left over a form of it. Resolves an error text when nothing fits, naming
// the query as `typed` (the words by default).
function closestPick(list: Species[], words: string[], typed = words.join(' ')): Pick | string {
  let failure: string | undefined
  const formWords = new Set([...Object.keys(ADJECTIVES), ...list.flatMap(p => p.forms.flatMap(f => f.split('-')))])
  for (const match of ['exact', 'prefix', 'typo'] as const)
    for (let len = words.length; len > 0; len--)
      for (let at = 0; at + len <= words.length; at++) {
        // With other words to be the species, a form word (`mega`) is the form, not the start of a name.
        if (match === 'prefix' && len === 1 && words.length > 1 && formWords.has(words[at] ?? '')) continue
        const dex = findSpecies(list, words.slice(at, at + len).join('-'), match)
        const found = list[dex]
        if (!found) continue
        const rest = [...words.slice(0, at), ...words.slice(at + len)].map(w => ADJECTIVES[w] ?? w)
        if (rest.length === 0) return pickOf(list, dex)
        const forms = found.forms.filter(f => f !== 'regular')
        const form = findForm(forms, rest)
        if (form) return pickOf(list, dex, form)
        const label = speciesName(found.name)
        const asTyped = typedOutside(typed, words, at, at + len) ?? rest.join(' ')
        failure ??= forms.length
          ? `${label} has no "${asTyped}" form. Try: ${forms.join(', ')}.`
          : `${label} has no other forms.`
      }
  return failure ?? `No Pokémon called "${typed}".`
}

// Only an exact spelling picks a Pokémon; a near miss or a partial name comes back as a guess to confirm. `typed`: the
// query as typed, for the answer that names it.
export function lookup(list: Species[], words: string[], typed?: string): Lookup {
  const pick = exact(list, words)
  if (pick) return { pick }
  const guess = closestPick(list, words, typed)
  return typeof guess === 'string' ? { error: guess } : { guess }
}

// What a query names among every species and form, read one way by every command that catches or summons one:
// `shiny` anywhere asks for a shiny one; words spelling a name right but spaced apart (`porygon 2`) are that name; a
// near miss is a guess to confirm. No name (nothing, or `shiny` alone) leaves the pick to the caller (null); words of
// symbols only name no Pokémon. An answer quotes the query as typed.
export function readName(
  list: Species[],
  query: string,
): { pick: Pick | null; wantsShiny: boolean } | { guess: Pick; wantsShiny: boolean } | { error: string } {
  const words = slug(query).split('-').filter(Boolean)
  const wantsShiny = words.includes('shiny')
  const named = words.filter(w => w !== 'shiny')
  if (!words.length && query.trim()) return { error: `No Pokémon called "${query.trim()}".` }
  if (!named.length) return { pick: null, wantsShiny }
  const typed = query
    .trim()
    .split(/\s+/)
    .filter(t => slug(t) !== 'shiny')
    .join(' ')
  const found = lookup(list, named, typed)
  if ('error' in found) return found
  if ('guess' in found && !isSpacedOut(found.guess, named)) return { guess: found.guess, wantsShiny }
  return { pick: 'pick' in found ? found.pick : found.guess, wantsShiny }
}

// The item a give most likely meant when none is spelled exactly (`thunderstone`, `upgrade`, `fire ston`): a run of
// words at the front or the back a near miss of an item's id or name, the closest one, and the words left over for
// the Pokémon. Null when nothing is close.
export function guessItem(
  words: string[],
  isWanted: (item: Item) => boolean = () => true,
): { item: Item; rest: string[] } | null {
  let best: { item: Item; rest: string[]; d: number } | null = null
  for (let n = words.length; n > 0; n--) {
    const splits: [string[], string[]][] = [
      [words.slice(0, n), words.slice(n)],
      [words.slice(words.length - n), words.slice(0, words.length - n)],
    ]
    for (const [run, rest] of splits) {
      const wanted = run.join('-')
      for (const item of ITEMS.filter(isWanted))
        for (const name of new Set([item.id, slug(item.name)])) {
          const d = distance(wanted, name, typos(wanted))
          if (d <= typos(wanted) && (!best || d < best.d)) best = { item, rest, d }
        }
    }
  }
  return best && { item: best.item, rest: best.rest }
}

// The words that pick `p` exactly: "charizard mega x". A party member, which has no dex number, spells the same way.
export const spell = (p: Omit<Pick, 'dex'> & { dex?: number }) =>
  [p.species, ...(p.form === 'regular' ? [] : [p.form])].join(' ').replace(/-/g, ' ')

// Whether `words` spell `p` right, only spaced apart: `porygon 2` is Porygon2.
export const isSpacedOut = (p: Pick, words: string[]) => spell(p).replace(/ /g, '') === words.join('')

// Any species; now and then one of its alternate forms.
export function randomPick(list: Species[], rand = Math.random): Pick {
  const dex = Math.floor(rand() * list.length)
  const forms = list[dex]?.forms.filter(f => f !== 'regular') ?? []
  const form = forms.length && rand() < FORM_CHANCE ? forms[Math.floor(rand() * forms.length)] : undefined
  return pickOf(list, dex, form)
}
