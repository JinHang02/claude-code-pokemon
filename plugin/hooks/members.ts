// One name finder for every command that names a Pokémon: the members a query names in the party and the PC box,
// and the numbered pick among several.
import { itemName } from './items'
import { isSpacedOut, lookup, slug, spell } from './lookup'
import type { Lookup, Pick, Species } from './lookup'
import { displayName, formatParty, nameOf } from './save'
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

// `lv 30`, `lv30` or `level 30` anywhere in a query: only members at that level. `rest`: the query without it.
export function readLevel(query: string): { level?: number; rest: string } {
  const tokens = query.trim().split(/\s+/).filter(Boolean)
  for (const [i, token] of tokens.entries()) {
    const joined = /^(?:lv|level)\.?(\d+)$/i.exec(token)?.[1]
    const next = tokens[i + 1] ?? ''
    const apart = /^(?:lv|level)\.?$/i.test(token) && /^\d+$/.test(next) ? next : undefined
    const level = joined ?? apart
    if (level)
      return { level: Number(level), rest: tokens.filter((_, j) => j < i || j > i + (apart ? 1 : 0)).join(' ') }
  }
  return { rest: query }
}

// The spots `named` picks exactly in `pool` (`vulpix` the plain one, `alolan vulpix` the other); with none of that
// form, a party member of the species, but never another form out of the PC box. Words spelling a name right but
// spaced apart (`porygon 2`) pick it too. The lookup when it picks nothing.
function matching(pool: Spot[], named: string[], wantsShiny: boolean): Spot[] | Lookup | null {
  const found = named.length && pool.length ? lookup(namesOf(pool.map(p => p.member)), named) : null
  const isSpaced = found && 'guess' in found && isSpacedOut(found.guess, named)
  const pick = found && ('pick' in found ? found.pick : isSpaced && 'guess' in found ? found.guess : null)
  if (!pick) return found
  const { species, form } = pick
  const exact = pool.filter(p => p.member.species === species && p.member.form === form)
  const spots = exact.length ? exact : pool.filter(p => p.place === 'party' && p.member.species === species)
  return spots.filter(p => !wantsShiny || p.member.isShiny)
}

const isSpots = (found: Spot[] | Lookup | null): found is Spot[] => Array.isArray(found) && found.length > 0

// Whether `words` are a name of their own among `names` (every species and form), spelled right or only spaced apart.
function isName(names: Species[], words: string[]): boolean {
  const found = names.length && words.length ? lookup(names, words) : null
  return Boolean(found && ('pick' in found || ('guess' in found && isSpacedOut(found.guess, words))))
}

// The members `query` names in `places`, party first then the PC box, each in its stored order. `shiny` anywhere asks
// for a shiny one, `lv 30` for one at that level. A last word that is a number picks the nth of the list the words before it name, when they name
// several and it is in range; otherwise the whole words are tried as a name (`porygon 2`: Porygon2, `zygarde 10`),
// then the number as a pick again: of one, 1 picks it. Any other number answers with the list, even of one, unless
// the whole words are a name of their own in `names` (every species and form) that none of yours is: a lead or an add
// then catches that one. So every list's own hint, typed back, picks its line; a suggestion always finds someone.
// `command` is what comes before the name (`'release '`), for a suggestion and the numbered list.
export function findMembers(
  s: Save,
  query: string,
  places: Place[],
  command: string,
  levelOf: (m: Member) => number,
  names: Species[] = [],
): Found {
  const { level: atLevel, rest } = readLevel(query)
  const words = wordsOf(rest)
  const wantsShiny = words.includes('shiny')
  const named = words.filter(w => w !== 'shiny')
  // What a suggestion or a list's hint keeps in front of the name: `shiny`, the level.
  const keep = `${wantsShiny ? 'shiny ' : ''}${atLevel === undefined ? '' : `lv ${atLevel} `}`
  const pool = (['party', 'box'] as const)
    .filter(place => places.includes(place))
    .flatMap(place => (place === 'party' ? s.party : (s.box ?? [])).map((member, at) => ({ place, at, member })))
    .filter(p => atLevel === undefined || levelOf(p.member) === atLevel)
  const last = named[named.length - 1] ?? ''
  const isNumbered = named.length > 1 && /^\d+$/.test(last)
  // `-1` slugs to `1` and `1.5` to `15`: only a whole number as typed picks; a signed one or a fraction is out of
  // range like `0`. It is the last word that isn't `shiny` (`eevee -1 shiny`), on its own or after a hyphen (`eevee-2`).
  const token = rest
    .trim()
    .split(/\s+/)
    .filter(t => wordsOf(t).some(w => w !== 'shiny'))
    .pop()
  const nth = /^(?:[^-].*-)?\d+$/.test(token ?? '') ? Number(last) : 0
  const before = isNumbered ? matching(pool, named.slice(0, -1), wantsShiny) : null
  const listed = isSpots(before) ? before : []
  const picked = listed.length > 1 && nth > 0 ? listed[nth - 1] : undefined
  if (picked) return { spot: picked }
  const whole = matching(pool, named, wantsShiny)
  if (isSpots(whole)) return whole.length === 1 && whole[0] ? { spot: whole[0] } : { choices: whole }
  // Just one of the name before the number: 1 is that one (`porygon 1`).
  const only = listed.length === 1 && nth === 1 ? listed[0] : undefined
  if (only) return { spot: only }
  const where = places.includes('party') ? (places.includes('box') ? 'party or PC box' : 'party') : 'PC box'
  const none = (name: string) => `No ${name} in your ${where}.${places.includes('party') ? ` ${formatParty(s)}` : ''}`
  // A name of its own that none of yours is (`zygarde 10`, `porygon 2`): no list, and no guess at another one.
  if (isName(names, named)) return { error: none(query.trim()) }
  if (listed.length) return { error: formatChoices(listed, `${keep}${named.slice(0, -1).join(' ')}`, command, levelOf) }
  // What a guess finds typed back as suggested: the guess, or else another form of it that is here (a plain name never
  // takes one out of the PC box), and how many.
  const reach = (guess: Pick, isShiny: boolean) => {
    for (const form of [guess.form, ...pool.filter(p => p.member.species === guess.species).map(p => p.member.form)]) {
      const found = matching(pool, wordsOf(spell({ ...guess, form })), isShiny)
      if (isSpots(found)) return { guess: { ...guess, form }, many: found.length }
    }
    return null
  }
  const guessOf = (found: Spot[] | Lookup | null) => (found && 'guess' in found ? found.guess : undefined)
  const [early, full] = [guessOf(before), guessOf(whole)]
  const inRange = (many: number) => isNumbered && many > 1 && nth > 0 && nth <= many
  // The whole query guessing another name took the number for part of it (`porygn 2`: Porygon2), unless the words
  // before it guess a list the number is in, as `porygon 2` with two Porygon picks the second.
  const isPartOfName = Boolean(
    early && full && full.species !== early.species && !inRange(reach(early, wantsShiny)?.many ?? 0),
  )
  const guess = isPartOfName ? full : (early ?? full)
  const found = guess && reach(guess, wantsShiny)
  if (found) {
    const number = !isPartOfName && inRange(found.many) ? ` ${last}` : ''
    return { error: `${didYouMean(found.guess, `${command}${keep}`)}${number}` }
  }
  // A shiny asked for, and only plain ones of the guess here.
  const plain = wantsShiny && guess ? reach(guess, false) : null
  return { error: none(plain ? `shiny ${displayName(plain.guess.species, plain.guess.form)}` : query.trim()) }
}

// Whether an answer is the numbered list: a query whose number is past its end still names someone.
export const isList = (text: string) => text.startsWith('Which ')

// The longest numbered list shown; any number still picks.
export const LIST_MAX = 10

// "Which Eevee?", a line per one (up to LIST_MAX, then how to narrow them down), and the hint to type:
//   1. Eevee ♀ Lv 24 (party)
//   2. ✨ Eevee ♂ Lv 3 (PC box)
// Add the number: /pokemon release eevee 2
export function formatChoices(choices: Spot[], query: string, command: string, levelOf: (m: Member) => number): string {
  const first = choices[0]?.member
  const isOneForm = choices.every(c => c.member.form === first?.form)
  const shown = choices.slice(0, LIST_MAX)
  const digits = String(shown.length).length
  const lines = shown.map(({ place, member: m }, i) => {
    const held = m.heldItem ? ` holding ${itemName(m.heldItem)}` : ''
    const where = place === 'party' ? 'party' : 'PC box'
    return `  ${`${i + 1}.`.padStart(digits + 1)} ${nameOf(m)} Lv ${levelOf(m)}${held} (${where})`
  })
  const typed = wordsOf(query).join(' ')
  const name = first ? displayName(first.species, isOneForm ? first.form : 'regular') : typed
  const hint = (words: string) => `/pokemon ${command}${words}`
  const more = choices.length - shown.length
  if (more) {
    const words = wordsOf(query)
    const isShinyMixed = choices.some(c => c.member.isShiny) && choices.some(c => !c.member.isShiny)
    const next = choices[LIST_MAX]?.member
    const isLevelled = words.some(w => /^(lv|level)\d*$/.test(w))
    const isLevelMixed = !isLevelled && choices.some(c => levelOf(c.member) !== levelOf(choices[0]?.member ?? c.member))
    const ways = [
      ...(isShinyMixed && !words.includes('shiny') ? [hint(`shiny ${typed}`)] : []),
      ...(isLevelMixed && next ? [hint(`${typed} lv ${levelOf(next)}`)] : []),
    ]
    lines.push(`  … and ${more} more.${ways.length ? ` Fewer: ${ways.join(' · ')}` : ''}`)
  }
  return [`Which ${name}?`, ...lines, `Add the number: ${hint(typed)} ${choices.length}`].join('\n')
}
