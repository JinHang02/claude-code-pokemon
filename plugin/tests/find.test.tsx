// Several of one name in the typeahead, a row each and numbered as the commands read a pick; and /pokemon find, one
// search over the party and the PC box.
import { expect, test } from 'claude-code/testing'

import { ALL_HELP, POKEMON_HELP, suggest } from '../hooks/commands'
import type { Owned } from '../hooks/commands'
import { formatFind } from '../hooks/find'
import { findMembers } from '../hooks/members'
import type { Place } from '../hooks/members'
import { emptySave, level, xpForLevel } from '../hooks/save'
import type { Member, Save } from '../hooks/save'
import { begin, cmd, KIT, member } from './world'

const levelOf = (m: Member) => level(m.xp)
const twins = (): Save => ({
  ...emptySave(),
  party: [
    member('pikachu', { id: 'p', gender: 'female' }),
    member('eevee', { id: 'e1', gender: 'male', xp: xpForLevel(12), heldItem: 'lucky-egg' }),
    member('eevee', { id: 'e2', gender: 'female' }),
  ],
  box: [
    member('eevee', { id: 'e3', gender: 'male', isShiny: true }),
    member('charmander', { id: 'c', gender: 'male' }),
  ],
})
const ownedOf = (s: Save): Owned => ({ party: s.party, box: s.box, bag: { 'lucky-egg': 1 }, levelOf })
const rows = (text: string, s = twins()) => {
  const start = /\S*$/.exec(text)?.index ?? text.length
  return suggest(text, text.length, text.slice(start), start, ownedOf(s))
}

test('twins get a row each, numbered among the places the command looks in', () => {
  expect(rows('/pokemon release ee')).toEqual([
    { text: 'eevee 1', label: 'eevee 1', description: 'Eevee ♂ · Lv 12 · party · holds Lucky Egg' },
    { text: 'eevee 2', label: 'eevee 2', description: 'Eevee ♀ · Lv 1 · party' },
    { text: 'eevee 3', label: 'eevee 3', description: '✨ Eevee ♂ · Lv 1 · PC box' },
  ])
  // The party alone: the box's Eevee is no third.
  expect(rows('/pokemon deposit ee').map(r => r.text)).toEqual(['eevee 1', 'eevee 2'])
  expect(rows('/pokemon evolve ee').map(r => r.text)).toEqual(['eevee 1', 'eevee 2'])
  expect(rows('/pokemon give lucky-egg ee').map(r => r.text)).toEqual(['eevee 1', 'eevee 2'])
  expect(rows('/pokemon take ee').map(r => r.text)).toEqual(['eevee 1', 'eevee 2', 'eevee 3'])
  // A lead: party and box, and each says it would lead.
  expect(
    rows('/pokemon ee')
      .filter(r => r.text.startsWith('eevee'))
      .map(r => [r.text, r.description]),
  ).toEqual([
    ['eevee 1', 'Eevee ♂ · Lv 12 · party · holds Lucky Egg · make it lead'],
    ['eevee 2', 'Eevee ♀ · Lv 1 · party · make it lead'],
    ['eevee 3', '✨ Eevee ♂ · Lv 1 · PC box · make it lead'],
  ])
  // `box eevee 2` would be a page, and find reads no number: one row each.
  expect(rows('/pokemon box ee').map(r => r.text)).toEqual(['eevee'])
  expect(rows('/pokemon find ee').map(r => r.text)).toEqual(['eevee'])
  // One of a name keeps its plain row.
  expect(rows('/pokemon release char')).toEqual([
    { text: 'charmander', label: 'charmander', description: 'Charmander ♂ · Lv 1 · PC box' },
  ])
  expect(rows('/pokemon deposit pika').map(r => r.text)).toEqual(['pikachu'])
})

test("each twin row's text, typed back, picks the member it describes", () => {
  const s = twins()
  const cases: [string, Place[], string[]][] = [
    ['/pokemon release ee', ['party', 'box'], ['e1', 'e2', 'e3']],
    ['/pokemon take ee', ['party', 'box'], ['e1', 'e2', 'e3']],
    ['/pokemon ee', ['party', 'box'], ['e1', 'e2', 'e3']],
    ['/pokemon deposit ee', ['party'], ['e1', 'e2']],
    ['/pokemon evolve ee', ['party'], ['e1', 'e2']],
    ['/pokemon everstone ee', ['party'], ['e1', 'e2']],
    ['/pokemon give lucky-egg ee', ['party'], ['e1', 'e2']],
  ]
  for (const [draft, places, ids] of cases) {
    const picked = rows(draft, s)
      .filter(r => r.text.startsWith('eevee'))
      .map(r => {
        const found = findMembers(s, r.text, places, '', levelOf)
        return 'spot' in found ? found.spot.member.id : JSON.stringify(found)
      })
    expect([draft, picked]).toEqual([draft, ids])
  }
  // A name of two words: the row writes the rest of it and the number.
  const mimes: Save = { ...emptySave(), party: [member('mr-mime', { id: 'a' }), member('mr-mime', { id: 'b' })] }
  expect(rows('/pokemon release mr m', mimes).map(r => [r.text, r.label])).toEqual([
    ['mime 1', 'mr-mime 1'],
    ['mime 2', 'mr-mime 2'],
  ])
})

test('a twin row run as the command acts on that one, without asking which', KIT, async ($, on) => {
  const s = twins()
  const w = await begin($, on, {
    ...s,
    party: s.party.map(m => (m.id === 'e2' ? { ...m, heldItem: 'soothe-bell' } : m)),
    box: (s.box ?? []).map(m => (m.id === 'e3' ? { ...m, heldItem: 'kings-rock' } : m)),
  })
  const held = () =>
    [...w.saveNow().party, ...(w.saveNow().box ?? [])].map(m => `${m.id}:${m.heldItem ?? '-'}`).join(' ')
  const take = rows('/pokemon take ee', w.saveNow()).map(r => r.text)
  expect(take).toEqual(['eevee 1', 'eevee 2', 'eevee 3'])
  expect(await cmd($, 'pokemon', `take ${take[2]}`)).toBe("Eevee's King's Rock went back to your Bag.")
  expect(held()).toBe('p:- e1:lucky-egg e2:soothe-bell e3:- c:-')
  expect(await cmd($, 'pokemon', `take ${take[1]}`)).toBe("Eevee's Soothe Bell went back to your Bag.")
  expect(held()).toBe('p:- e1:lucky-egg e2:- e3:- c:-')
  const lead = rows('/pokemon ee', w.saveNow()).map(r => r.text)
  expect(await cmd($, 'pokemon', lead[2])).toBe(
    '✨ Eevee ♂ (Lv 1) came out of the PC box to lead your party. Pikachu ♀ (Lv 1) went into the PC box.',
  )
  expect(w.saveNow().party.map(m => m.id)).toEqual(['e3', 'e1', 'e2'])
})

const many = (): Save => ({
  ...emptySave(),
  party: [
    member('pikachu', { id: 'p', gender: 'female', xp: xpForLevel(30), heldItem: 'lucky-egg' }),
    member('eevee', { id: 'e1', gender: 'male', isShiny: true, xp: xpForLevel(5) }),
    member('charmander', { id: 'c', gender: 'female', xp: xpForLevel(5) }),
  ],
  box: [
    member('eevee', { id: 'e2', gender: 'female', xp: xpForLevel(30), heldItem: 'everstone' }),
    member('charizard', { id: 'z', gender: 'male', isShiny: true, xp: xpForLevel(36) }),
    member('vulpix', { id: 'v', gender: 'female', form: 'alola' }),
  ],
})
const find = (query: string, s = many(), columns = Infinity) => formatFind(s, query, levelOf, columns)

test('find searches the party and the PC box together, by name, shiny, level or all of them', () => {
  expect(find('eevee')).toBe(
    [
      '2 Eevee in your party and PC box:',
      '  ✨ Eevee ♂  Lv 5   party #2',
      '  Eevee ♀     Lv 30  PC box #1  holds Everstone',
    ].join('\n'),
  )
  expect(find('shiny')).toBe(
    [
      '2 shiny Pokémon in your party and PC box:',
      '  ✨ Eevee ♂      Lv 5   party #2',
      '  ✨ Charizard ♂  Lv 36  PC box #2',
    ].join('\n'),
  )
  expect(find('lv 5').split('\n')).toEqual([
    '2 Pokémon at Lv 5 in your party and PC box:',
    '  ✨ Eevee ♂    Lv 5  party #2',
    '  Charmander ♀  Lv 5  party #3',
  ])
  expect(find('lv 30').split('\n')[1]).toBe('  Pikachu ♀  Lv 30  lead       holds Lucky Egg')
  expect(find('shiny eevee').split('\n')).toEqual([
    '1 shiny Eevee in your party and PC box:',
    '  ✨ Eevee ♂  Lv 5  party #2',
  ])
  expect(find('eevee lv 30').split('\n')[0]).toBe('1 Eevee at Lv 30 in your party and PC box:')
  // The start of a name: every one it starts.
  expect(find('char').split('\n')).toEqual([
    '2 Pokémon named char… in your party and PC box:',
    '  Charmander ♀    Lv 5   party #3',
    '  ✨ Charizard ♂  Lv 36  PC box #2',
  ])
  // A form, by its own words or plainly by the species.
  expect(find('alolan vulpix').split('\n')[0]).toBe('1 Vulpix (Alola) in your party and PC box:')
  expect(find('vulpix').split('\n')[1]).toBe('  Vulpix (Alola) ♀  Lv 1  PC box #3')
  expect(find('eevve')).toBe('Did you mean Eevee? Run /pokemon find eevee')
  expect(find('shiny eevve')).toBe('Did you mean Eevee? Run /pokemon find shiny eevee')
  expect(find('shiny charmander')).toBe('No shiny Charmander in your party or PC box.')
  expect(find('lv 99')).toBe('No Pokémon at Lv 99 in your party or PC box.')
  expect(find('mewtwo')).toBe('No Pokémon called "mewtwo" in your party or PC box.')
  expect(find('')).toContain('/pokemon find <name>')
  expect(find('???')).toBe('No Pokémon called "???".')
  expect(find('eevee', emptySave())).toBe('You have no Pokémon yet. /pokemon <name> picks a lead.')
})

test("find fits a narrow terminal: what doesn't fit goes on a line beneath", () => {
  const narrow = find('eevee', many(), 40)
  expect(narrow.split('\n').filter(l => [...l].length > 35)).toEqual([])
  expect(narrow).toContain('holds Everstone')
})

test('more than ten: the first ten, how many more and how to narrow them; a box page when it has several', () => {
  const box = Array.from({ length: 35 }, (_, i) =>
    member('pikachu', { id: `b${i}`, gender: 'male', isShiny: i === 33 || i === 34, xp: xpForLevel(i < 20 ? 3 : 4) }),
  )
  const s: Save = { ...emptySave(), party: [member('eevee', { id: 'e', gender: 'male' })], box }
  const lines = find('pikachu', s).split('\n')
  expect(lines[0]).toBe('35 Pikachu in your party and PC box:')
  expect(lines.slice(1, 11).every(l => l.includes('Pikachu'))).toBe(true)
  expect(lines.slice(11)).toEqual([
    '  … and 25 more. Fewer:',
    '    /pokemon find shiny pikachu',
    '    /pokemon find pikachu lv 3',
  ])
  expect(find('shiny pikachu', s).split('\n').slice(1)).toEqual([
    '  ✨ Pikachu ♂  Lv 4  PC box #34, page 2',
    '  ✨ Pikachu ♂  Lv 4  PC box #35, page 2',
  ])
  expect(find('lv 3', s).split('\n').pop()).toBe('  … and 10 more. Add a name or shiny for fewer.')
})

test('find is in both helps, within their widths, and reads without writing', KIT, async ($, on) => {
  expect(POKEMON_HELP).toContain('find <name>')
  expect(ALL_HELP).toContain('find <name>')
  expect(POKEMON_HELP.split('\n').filter(l => [...l].length > 55)).toEqual([])
  const w = await begin($, on, many())
  // What find could change: who is where, holding what, at what XP; and the Bag.
  const state = () =>
    JSON.stringify([
      [...w.saveNow().party, ...(w.saveNow().box ?? [])].map(m => [m.id, m.species, m.form, m.xp, m.heldItem]),
      w.saveNow().party.length,
      w.saveNow().bag,
    ])
  const before = state()
  expect(await cmd($, 'pokemon', 'find eevee')).toBe(find('eevee'))
  expect(await cmd($, 'pokemon', 'find shiny')).toBe(find('shiny'))
  expect(await cmd($, 'pokemon', 'find lv 5')).toBe(find('lv 5'))
  expect(await cmd($, 'pokemon', 'find eevve')).toBe('Did you mean Eevee? Run /pokemon find eevee')
  expect(await cmd($, 'pokemon', 'find')).toContain('/pokemon find <name>')
  expect(state()).toBe(before)
})
