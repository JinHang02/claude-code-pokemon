// One name finder for every command that names a Pokémon: the members a query names in the party and the PC box,
// and the numbered pick among several.
import { itemName } from './items'
import { lookup, slug, spell } from './lookup'
import type { Lookup, Pick, Species } from './lookup'
import { displayName, formatParty } from './save'
import type { Member, Save } from './save'

export type Place = 'party' | 'box'
export type Spot = { place: Place; at: number; member: Member }
export type Found = { spot: Spot } | { choices: Spot[] } | { error: string }

// "Did you mean Charizard? Run /pokemon charizard" for a guess at what someone meant.
export const didYouMean = (guess: Pick, command: string) =>
  `Did you mean ${displayName(guess.species, guess.form)}? Run /pokemon ${command}${spell(guess)}`

// The species and forms among `members`, for looking a name up among them.
function namesOf(members: Member[]): Species[] {
  const names: Species[] = []
  for (const m of members) {
    const known = names.find(n => n.name === m.species)
    if (known) known.forms.push(m.form)
    else names.push({ name: m.species, forms: [m.form] })
  }
  return names
}

const wordsOf = (query: string) => slug(query).split('-').filter(Boolean)

// The spots `named` picks exactly in `pool` (`vulpix` the plain one, `alolan vulpix` the other); with none of that
// form, a party member of the species, but never another form out of the PC box. Words spelling a name right but
// spaced apart (`porygon 2`) pick it too. The lookup when it picks nothing.
function matching(pool: Spot[], named: string[], wantsShiny: boolean): Spot[] | Lookup | null {
  const found = named.length && pool.length ? lookup(namesOf(pool.map(p => p.member)), named) : null
  const isSpaced = found && 'guess' in found && spell(found.guess).replace(/ /g, '') === named.join('')
  const pick = found && ('pick' in found ? found.pick : isSpaced && 'guess' in found ? found.guess : null)
  if (!pick) return found
  const { species, form } = pick
  const exact = pool.filter(p => p.member.species === species && p.member.form === form)
  const spots = exact.length ? exact : pool.filter(p => p.place === 'party' && p.member.species === species)
  return spots.filter(p => !wantsShiny || p.member.isShiny)
}

const isSpots = (found: Spot[] | Lookup | null): found is Spot[] => Array.isArray(found) && found.length > 0

// The members `query` names in `places`, party first then the PC box, each in its stored order. `shiny` anywhere asks
// for a shiny one. A last word that is a number picks the nth of the list the words before it name, when they name
// several and it is in range; otherwise the whole words are tried as a name (`porygon 2`: Porygon2, `zygarde 10`),
// then the number as a pick again. So every list's own hint, typed back, picks its line.
// `command` is what comes before the name (`'release '`), for a suggestion and the numbered list.
export function findMembers(
  s: Save,
  query: string,
  places: Place[],
  command: string,
  levelOf: (m: Member) => number,
): Found {
  const words = wordsOf(query)
  const wantsShiny = words.includes('shiny')
  const named = words.filter(w => w !== 'shiny')
  const pool = (['party', 'box'] as const)
    .filter(place => places.includes(place))
    .flatMap(place => (place === 'party' ? s.party : (s.box ?? [])).map((member, at) => ({ place, at, member })))
  const last = named[named.length - 1] ?? ''
  const isNumbered = named.length > 1 && /^\d+$/.test(last)
  // `-1` slugs to `1`: a signed number is below 1, out of range like `0`.
  const nth = /^-/.test(query.trim().split(/\s+/).pop() ?? '') ? 0 : Number(last)
  const before = isNumbered ? matching(pool, named.slice(0, -1), wantsShiny) : null
  const picked = isSpots(before) && before.length > 1 && nth > 0 ? before[nth - 1] : undefined
  if (picked) return { spot: picked }
  const whole = matching(pool, named, wantsShiny)
  if (isSpots(whole)) return whole.length === 1 && whole[0] ? { spot: whole[0] } : { choices: whole }
  if (isSpots(before)) {
    const spot = nth > 0 ? before[nth - 1] : undefined
    const name = words.slice(0, words.lastIndexOf(last)).join(' ')
    return spot ? { spot } : { error: formatChoices(before, name, command, levelOf) }
  }
  const guessOf = (found: Spot[] | Lookup | null) => (found && 'guess' in found ? found.guess : undefined)
  const [early, full] = [guessOf(before), guessOf(whole)]
  // The whole query guessing another name took the number for part of it (`porygn 2`: Porygon2).
  const isPartOfName = Boolean(early && full && full.species !== early.species)
  const guess = isPartOfName ? full : (early ?? full)
  if (guess) {
    const many = pool.filter(
      ({ member: m }) => m.species === guess.species && m.form === guess.form && (!wantsShiny || m.isShiny),
    ).length
    const number = isNumbered && !isPartOfName && many > 1 && nth > 0 && nth <= many ? ` ${last}` : ''
    return { error: `${didYouMean(guess, `${command}${wantsShiny ? 'shiny ' : ''}`)}${number}` }
  }
  const where = places.includes('party') ? (places.includes('box') ? 'party or PC box' : 'party') : 'PC box'
  return { error: `No ${query.trim()} in your ${where}.${places.includes('party') ? ` ${formatParty(s)}` : ''}` }
}

// Whether an answer is the numbered list: a query whose number is past its end still names someone.
export const isList = (text: string) => text.startsWith('Which ')

// "Which Eevee? 1. Eevee ♀ Lv 24 (party) · 2. ✨ Eevee ♂ Lv 3 (PC box) — add the number: /pokemon release eevee 2".
export function formatChoices(choices: Spot[], query: string, command: string, levelOf: (m: Member) => number): string {
  const first = choices[0]?.member
  const isOneForm = choices.every(c => c.member.form === first?.form)
  const lines = choices.map(({ place, member: m }, i) => {
    const sign = m.gender === 'female' ? ' ♀' : m.gender === 'male' ? ' ♂' : ''
    const held = m.heldItem ? ` holding ${itemName(m.heldItem)}` : ''
    const where = place === 'party' ? 'party' : 'PC box'
    return `${i + 1}. ${m.isShiny ? '✨ ' : ''}${displayName(m.species, m.form)}${sign} Lv ${levelOf(m)}${held} (${where})`
  })
  const name = first ? displayName(first.species, isOneForm ? first.form : 'regular') : wordsOf(query).join(' ')
  return `Which ${name}? ${lines.join(' · ')} — add the number: /pokemon ${command}${wordsOf(query).join(' ')} ${choices.length}`
}
