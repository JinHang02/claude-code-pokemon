// One name finder for every command that names a Pokémon: the members a query names in the party and the PC box,
// and the numbered pick among several.
import { itemName } from './items'
import { lookup, namedPick, slug, spell } from './lookup'
import type { Lookup, Pick, Species } from './lookup'
import { displayName, formatParty, nameOf } from './save'
import type { BoxPick, Member, Save } from './save'

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
  const pick = namedPick(found, named)
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
  return Boolean(namedPick(found, words))
}

// The members `query` names in `places`, party first then the PC box, each in its stored order. `shiny` anywhere asks
// for a shiny one, `lv 30` for one at that level. A last word that is a number picks the nth of the list the words before it name, when they name
// several and it is in range; otherwise the whole words are tried as a name (`porygon 2`: Porygon2, `zygarde 10`),
// then the number as a pick again: of one, 1 picks it. Any other number answers with the list, even of one, unless
// the whole words are a name of their own in `names` (every species and form) that none of yours is: a lead or an add
// then catches that one. So every list's own hint, typed back, picks its line; a suggestion always finds someone.
// `command` is what comes before the name (`'release '`), for a suggestion and the numbered list; `columns`, how wide
// the terminal is, for the party an answer shows.
export function findMembers(
  s: Save,
  query: string,
  places: Place[],
  command: string,
  levelOf: (m: Member) => number,
  names: Species[] = [],
  columns = Infinity,
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
  const where = places.includes('party') ? (places.includes('box') ? 'party or PC box' : 'party') : 'PC box'
  const none = (name: string) =>
    `No ${name} in your ${where}.${places.includes('party') ? ` ${formatParty(s, columns)}` : ''}`
  // No name, only `shiny` or a level: every one of yours it fits, as a list even of one, so no command acts on words
  // that name no one (`evolve lv 16` takes a list of one as its pick).
  if (!named.length && (wantsShiny || atLevel !== undefined)) {
    const fits = pool.filter(p => !wantsShiny || p.member.isShiny)
    return fits.length ? { choices: fits } : { error: none(keep.trim()) }
  }
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
  // What a guess finds typed back as suggested: the guess, or else another form of it that is here (a plain name never
  // takes one out of the PC box), and how many.
  const reach = (guess: Pick, isShiny: boolean) => {
    for (const form of [guess.form, ...pool.filter(p => p.member.species === guess.species).map(p => p.member.form)]) {
      const found = matching(pool, wordsOf(spell({ ...guess, form })), isShiny)
      if (isSpots(found)) return { guess: { ...guess, form }, many: found.length }
    }
    return null
  }
  const inRange = (many: number) => isNumbered && many > 1 && nth > 0 && nth <= many
  // A species of yours spelled right, with only another form of it here, in the PC box (`vulpix`, an Alolan one
  // boxed): that form, with the number when it is in that one's list. A lead or an add still catches the plain one.
  for (const [found, words, number] of [
    [whole, named, ''],
    [before, named.slice(0, -1), ` ${last}`],
  ] as const) {
    const exactly = Array.isArray(found) && pool.length ? lookup(namesOf(pool.map(p => p.member)), [...words]) : null
    const other = exactly && 'pick' in exactly ? reach(exactly.pick, wantsShiny) : null
    if (other && exactly && 'pick' in exactly && other.guess.form !== exactly.pick.form)
      return { error: `${didYouMean(other.guess, `${command}${keep}`)}${number && inRange(other.many) ? number : ''}` }
  }
  // A name of its own that none of yours is (`zygarde 10`, `porygon 2`): no list, and no guess at another one.
  if (isName(names, named)) return { error: none(query.trim()) }
  if (listed.length) return { error: formatChoices(listed, `${keep}${named.slice(0, -1).join(' ')}`, command, levelOf) }
  const guessOf = (found: Spot[] | Lookup | null) => (found && 'guess' in found ? found.guess : undefined)
  const [early, full] = [guessOf(before), guessOf(whole)]
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

// The members of the PC box `query` names (`shiny` alone: every shiny one; `lv 5`: those at that level, by `levelOf`),
// by their places in it: a species named plainly is every form of it there, a form only that form. Why none, or a
// suggestion naming `command`, when it names none; words of symbols only name no Pokémon.
export function inBox(
  s: Save,
  query: string,
  command: string,
  levelOf: (m: Member) => number,
): BoxPick | { error: string } {
  const box = s.box ?? []
  const { level: atLevel, rest } = readLevel(query)
  const words = wordsOf(rest)
  const wantsShiny = words.includes('shiny')
  const named = words.filter(w => w !== 'shiny')
  const lv = atLevel === undefined ? '' : `lv ${atLevel}`
  if (!words.length && !lv) return { error: `No Pokémon called "${query.trim()}" in your PC box.` }
  const none = { error: `No ${query.trim()} in your PC box.` }
  const found = named.length && box.length ? lookup(namesOf(box), named) : null
  const pick = namedPick(found, named)
  if (named.length && !pick)
    return found && 'guess' in found
      ? { error: didYouMean(found.guess, `${command}${wantsShiny ? 'shiny ' : ''}${lv ? `${lv} ` : ''}`) }
      : none
  const at = box.flatMap((m, i) =>
    (!pick || (m.species === pick.species && (pick.form === 'regular' || m.form === pick.form))) &&
    (!wantsShiny || m.isShiny) &&
    (atLevel === undefined || levelOf(m) === atLevel)
      ? [i]
      : [],
  )
  if (!at.length) return none
  const who = pick
    ? `${wantsShiny ? '✨ ' : ''}${displayName(pick.species, pick.form)}`
    : wantsShiny
      ? 'Shiny ones'
      : 'Pokémon'
  const title = `${who}${atLevel === undefined ? '' : ` at Lv ${atLevel}`}`
  return { title, at, words: [...(wantsShiny ? ['shiny'] : []), ...(lv ? [lv] : []), ...named].join(' ') }
}

// Whether an answer is the numbered list: a query whose number is past its end still names someone.
export const isList = (text: string) => text.startsWith('Which ')

// The longest numbered list shown; any number still picks.
export const LIST_MAX = 10

// "Which Eevee?", a line per one, and the hint to type:
//   #1 Eevee ♀ Lv 24 (party)
//   #2 ✨ Eevee ♂ Lv 3 (PC box)
// Add the number: /pokemon release eevee 2
// `#1`, not `1.`: Claude Code renders a reply as Markdown, and `1.` would start a numbered list, dropping the padding
// (`10.` one column right of `9.`) and indenting the hint under the last line.
// Past LIST_MAX, the rest are counted, with the ways to narrow them that still leave a list (`shiny`, a level two or
// more share), so a hint typed back never acts on one the list didn't show. A lone shiny past the first ten gets its
// own numbered line instead. The number in the hint is one on screen.
export function formatChoices(choices: Spot[], query: string, command: string, levelOf: (m: Member) => number): string {
  const first = choices[0]?.member
  const isOneForm = choices.every(c => c.member.form === first?.form)
  const words = wordsOf(query)
  const typed = words.join(' ')
  const hint = (text: string) => `/pokemon ${command}${text}`
  const shinies = choices.filter(c => c.member.isShiny)
  const isShinyNarrowing = !words.includes('shiny') && shinies.length < choices.length
  const lone = isShinyNarrowing && shinies.length === 1 ? choices.indexOf(shinies[0] as Spot) : -1
  const at = choices.flatMap((_, i) => (i < LIST_MAX || i === lone ? [i] : []))
  const digits = String((at[at.length - 1] ?? 0) + 1).length
  const lines = at.map(i => {
    const { place, member: m } = choices[i] as Spot
    const held = m.heldItem ? ` holding ${itemName(m.heldItem)}` : ''
    const where = place === 'party' ? 'party' : 'PC box'
    return `  ${`#${i + 1}`.padStart(digits + 1)} ${nameOf(m)} Lv ${levelOf(m)}${held} (${where})`
  })
  const more = choices.length - at.length
  if (more) {
    const isLevelled = words.some(w => /^(lv|level)\d*$/.test(w))
    const sharing = (lv: number) => choices.filter(c => levelOf(c.member) === lv).length
    // The level of the first one not shown that another shares, unless every one is at it.
    const level = isLevelled
      ? undefined
      : choices
          .filter((_, i) => !at.includes(i))
          .map(c => levelOf(c.member))
          .find(lv => sharing(lv) >= 2 && sharing(lv) < choices.length)
    const ways = [
      ...(isShinyNarrowing && shinies.length >= 2 ? [hint(`shiny ${typed}`)] : []),
      ...(level === undefined ? [] : [hint(`${typed} lv ${level}`)]),
    ]
    lines.push(`  … and ${more} more.${ways.length ? ' Fewer:' : ''}`, ...ways.map(way => `    ${way}`))
  }
  const name = first ? displayName(first.species, isOneForm ? first.form : 'regular') : typed
  const example = more ? LIST_MAX : choices.length
  return [`Which ${name}?`, ...lines, `Add the number: ${hint(typed)} ${example}`].join('\n')
}
