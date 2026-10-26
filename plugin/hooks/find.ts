// `/pokemon find <query>`: one search over the party and the PC box together, by name, `shiny`, a level, or any of
// them at once, listing where each one is. It only reads the save.
import { itemName } from './items'
import { lookup, namedPick, slug, spell } from './lookup'
import { didYouMean, LIST_MAX, namesOf, readLevel } from './members'
import type { Spot } from './members'
import { BOX_PAGE, boxPages, displayName, nameOf } from './save'
import type { Member, Save } from './save'

export const FIND_USAGE = 'Find which? /pokemon find <name>, shiny or lv <n>, or several (shiny eevee lv 5).'

// Claude Code indents a command's reply this many columns (under its "⎿"), as save.ts counts it.
const REPLY_INDENT = 5
// Terminal columns a text takes: ✨ is drawn two wide.
const widthOf = (text: string) => [...text].length + (text.match(/✨/g)?.length ?? 0)

// Rows of columns, each padded to its widest entry; a column nobody fills takes no room.
function lineUp(rows: string[][]): string[] {
  const widths = (rows[0] ?? []).map((_, c) => Math.max(...rows.map(r => widthOf(r[c] ?? ''))))
  const pad = (text: string, c: number) => text + ' '.repeat((widths[c] ?? 0) - widthOf(text))
  return rows.map(r =>
    `  ${r
      .flatMap((text, c) => (widths[c] ? [pad(text, c)] : []))
      .join('  ')
      .trimEnd()}`.trimEnd(),
  )
}

// Where a spot is, as the party and the box lists number it: `lead`, `party #3`, `PC box #34, page 2` (the page only
// when the box takes more than one).
function placeOf(s: Save, { place, at }: Spot): string {
  if (place === 'party') return at === 0 ? 'lead' : `party #${at + 1}`
  const page = boxPages(s.box?.length ?? 0) > 1 ? `, page ${Math.floor(at / BOX_PAGE) + 1}` : ''
  return `PC box #${at + 1}${page}`
}

// One row a member on one line when the terminal is wide enough; else the name and level on theirs and the rest
// beneath, so nothing is cut off at 40 columns.
function fitRows(rows: string[][], columns: number): string[] {
  const wide = lineUp(rows)
  const room = columns - REPLY_INDENT
  if (!(columns > 0) || wide.every(line => widthOf(line) <= room)) return wide
  const withPlace = lineUp(rows.map(r => r.slice(0, 3)))
  const keep = withPlace.every(line => widthOf(line) <= room) ? 3 : 2
  const heads = keep === 3 ? withPlace : lineUp(rows.map(r => r.slice(0, 2)))
  return rows.flatMap((r, i) => {
    const under = r.slice(keep).filter(Boolean).join(' · ')
    return [heads[i] ?? '', ...(under ? [`      ${under}`] : [])]
  })
}

// Every member `query` names in the party and the PC box: a name spelled right (a species plainly is every form of it,
// a form only that form), else the start of one (`char`: Charmander and Charizard), else a guess at a misspelt one;
// `shiny` and `lv <n>` narrow it. The first LIST_MAX, then how many more and how to narrow them. `columns`: how wide
// the terminal is.
export function formatFind(s: Save, query: string, levelOf: (m: Member) => number, columns = Infinity): string {
  const { level: atLevel, rest } = readLevel(query)
  const words = slug(rest).split('-').filter(Boolean)
  const wantsShiny = words.includes('shiny')
  const named = words.filter(w => w !== 'shiny')
  if (!query.trim()) return FIND_USAGE
  if (!named.length && !wantsShiny && atLevel === undefined) return `No Pokémon called "${query.trim()}".`
  const all: Spot[] = [
    ...s.party.map((member, at) => ({ place: 'party' as const, at, member })),
    ...(s.box ?? []).map((member, at) => ({ place: 'box' as const, at, member })),
  ]
  if (!all.length) return 'You have no Pokémon yet. /pokemon <name> picks a lead.'
  const lv = atLevel === undefined ? '' : `lv ${atLevel}`
  // What a suggestion keeps in front of the name: `shiny`, the level.
  const keep = `${wantsShiny ? 'shiny ' : ''}${lv ? `${lv} ` : ''}`
  let isNamed = (_: Member) => true
  let who = 'Pokémon'
  if (named.length) {
    const found = lookup(namesOf(all.map(p => p.member)), named, named.join(' '))
    const pick = namedPick(found, named)
    const start = named.join('-')
    if (pick) {
      isNamed = m => m.species === pick.species && (pick.form === 'regular' || m.form === pick.form)
      who = displayName(pick.species, pick.form)
    } else if (all.some(p => slug(spell(p.member)).startsWith(start))) {
      isNamed = m => slug(spell(m)).startsWith(start)
      who = `Pokémon named ${named.join(' ')}…`
    } else if ('guess' in found) return didYouMean(found.guess, `find ${keep}`)
    else return `No Pokémon called "${query.trim()}" in your party or PC box.`
  }
  const what = `${wantsShiny ? 'shiny ' : ''}${who}${lv ? ` at Lv ${atLevel}` : ''}`
  const fits = all.filter(
    p =>
      isNamed(p.member) &&
      (!wantsShiny || p.member.isShiny) &&
      (atLevel === undefined || levelOf(p.member) === atLevel),
  )
  if (!fits.length) return `No ${what} in your party or PC box.`
  const shown = fits.slice(0, LIST_MAX)
  const rows = shown.map(p => [
    nameOf(p.member),
    `Lv ${levelOf(p.member)}`,
    placeOf(s, p),
    p.member.heldItem ? `holds ${itemName(p.member.heldItem)}` : '',
  ])
  const lines = [`${fits.length} ${what} in your party and PC box:`, ...fitRows(rows, columns)]
  const more = fits.length - shown.length
  if (more) {
    const typed = named.join(' ')
    const hint = (text: string) => `/pokemon find ${text}`.trimEnd()
    const shinies = fits.filter(p => p.member.isShiny).length
    const sharing = (level: number) => fits.filter(p => levelOf(p.member) === level).length
    // The level of the first one not shown that another shares, unless every one is at it.
    const level = lv
      ? undefined
      : fits
          .slice(LIST_MAX)
          .map(p => levelOf(p.member))
          .find(l => sharing(l) >= 2 && sharing(l) < fits.length)
    const ways = [
      ...(!wantsShiny && shinies && shinies < fits.length ? [hint(`shiny ${lv ? `${lv} ` : ''}${typed}`)] : []),
      ...(level === undefined ? [] : [hint(`${keep}${typed} lv ${level}`.replace(/\s+/g, ' '))]),
    ]
    const missing = [...(named.length ? [] : ['a name']), ...(wantsShiny ? [] : ['shiny']), ...(lv ? [] : ['lv <n>'])]
    const or = `${missing.slice(0, -1).join(', ')}${missing.length > 1 ? ' or ' : ''}${missing[missing.length - 1] ?? ''}`
    if (ways.length) lines.push(`  … and ${more} more. Fewer:`, ...ways.map(way => `    ${way}`))
    else if (missing.length) lines.push(`  … and ${more} more. Add ${or} for fewer.`)
    else lines.push(`  … and ${more} more.`)
  }
  return lines.join('\n')
}
