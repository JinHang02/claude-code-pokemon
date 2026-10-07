import { titleCase } from './save'

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
// then a prefix, then a near miss), the words left over a form of it. Resolves an error text when nothing fits.
function closestPick(list: Species[], words: string[]): Pick | string {
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
        const label = titleCase(found.name)
        failure ??= forms.length
          ? `${label} has no "${rest.join(' ')}" form. Try: ${forms.join(', ')}.`
          : `${label} has no other forms.`
      }
  return failure ?? `No Pokémon called "${words.join(' ')}".`
}

// Only an exact spelling picks a Pokémon; a near miss or a partial name comes back as a guess to confirm.
export function lookup(list: Species[], words: string[]): Lookup {
  const pick = exact(list, words)
  if (pick) return { pick }
  const guess = closestPick(list, words)
  return typeof guess === 'string' ? { error: guess } : { guess }
}

// The words that pick `p` exactly: "charizard mega x".
export const spell = (p: Pick) => [p.species, ...(p.form === 'regular' ? [] : [p.form])].join(' ').replace(/-/g, ' ')

// Any species; now and then one of its alternate forms.
export function randomPick(list: Species[], rand = Math.random): Pick {
  const dex = Math.floor(rand() * list.length)
  const forms = list[dex]?.forms.filter(f => f !== 'regular') ?? []
  const form = forms.length && rand() < FORM_CHANCE ? forms[Math.floor(rand() * forms.length)] : undefined
  return pickOf(list, dex, form)
}
