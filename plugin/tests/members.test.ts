import { expect, test } from 'claude-code/testing'

import { findMembers, formatChoices, isList } from '../hooks/members'
import type { Spot } from '../hooks/members'
import { emptySave, level } from '../hooks/save'
import type { Member, Save } from '../hooks/save'
import { member } from './world'

const levelOf = (m: Member) => level(m.xp)
const both: ('party' | 'box')[] = ['party', 'box']
const LV24 = 4 * 23 * 23

function eevees(): { s: Save; girl: Member; boy: Member } {
  const girl = member('eevee', { gender: 'female', xp: LV24 })
  const boy = member('eevee', { gender: 'male', xp: 16, isShiny: true })
  return { s: { ...emptySave(), party: [member('pikachu'), girl], box: [boy] }, girl, boy }
}
const ids = (found: ReturnType<typeof findMembers>) =>
  'spot' in found ? found.spot.member.id : 'choices' in found ? found.choices.map(c => c.member.id) : found.error

test('a name that fits several lists them, party first; a number picks one', () => {
  const { s, girl, boy } = eevees()
  const found = findMembers(s, 'eevee', both, 'release ', levelOf)
  expect(found).toEqual({
    choices: [
      { place: 'party', at: 1, member: girl },
      { place: 'box', at: 0, member: boy },
    ],
  })
  expect(findMembers(s, 'eevee 2', both, 'release ', levelOf)).toEqual({ spot: { place: 'box', at: 0, member: boy } })
  expect(findMembers(s, 'Eevee 1', both, 'release ', levelOf)).toEqual({
    spot: { place: 'party', at: 1, member: girl },
  })
  const out = findMembers(s, 'eevee 3', both, 'release ', levelOf)
  expect('error' in out && out.error).toContain('1. Eevee ♀ Lv 24 (party) · 2. ✨ Eevee ♂ Lv 3 (PC box)')
  expect(findMembers(s, 'pikachu', both, 'release ', levelOf)).toEqual({
    spot: { place: 'party', at: 0, member: s.party[0] },
  })
})

test('shiny and a form narrow the match before any list', () => {
  const { s, boy } = eevees()
  expect(ids(findMembers(s, 'shiny eevee', both, '', levelOf))).toBe(boy.id)
  const alolan = member('vulpix', { form: 'alola' })
  const foxes = { ...emptySave(), party: [member('vulpix'), alolan] }
  expect(ids(findMembers(foxes, 'alolan vulpix', ['party'], '', levelOf))).toBe(alolan.id)
})

test('a last word that is a form stays the form', () => {
  const a = member('unown', { form: 'a' })
  const unowns = { ...emptySave(), party: [member('unown', { form: 'b' }), a] }
  expect(ids(findMembers(unowns, 'unown a', ['party'], '', levelOf))).toBe(a.id)
  const ten = member('zygarde', { form: '10' })
  const zygardes = { ...emptySave(), party: [member('zygarde'), ten] }
  expect(ids(findMembers(zygardes, 'zygarde 10', ['party'], '', levelOf))).toBe(ten.id)
  // Two of that form: the number after the form picks one.
  const twin = member('zygarde', { form: '10' })
  const twins = { ...emptySave(), party: [ten, twin] }
  expect(ids(findMembers(twins, 'zygarde 10', ['party'], '', levelOf))).toEqual([ten.id, twin.id])
  expect(ids(findMembers(twins, 'zygarde 10 2', ['party'], '', levelOf))).toBe(twin.id)
})

test('only the places a command allows; a near miss gets a suggestion naming the command', () => {
  const s = { ...emptySave(), party: [member('pikachu')], box: [member('eevee')] }
  expect(ids(findMembers(s, 'eevee', ['party'], 'deposit ', levelOf))).toMatch(/^No eevee in your party\. Your party:/)
  expect(ids(findMembers(s, 'pikachu', ['box'], '', levelOf))).toBe('No pikachu in your PC box.')
  expect(ids(findMembers(s, 'eeve', ['box'], 'add ', levelOf))).toBe('Did you mean Eevee? Run /pokemon add eevee')
  expect(ids(findMembers(s, 'pikachoo', ['party'], 'everstone ', levelOf))).toBe(
    'Did you mean Pikachu? Run /pokemon everstone pikachu',
  )
  // A near miss with a number keeps the number.
  const two = { ...emptySave(), party: [member('eevee'), member('eevee')] }
  expect(ids(findMembers(two, 'eeve 2', ['party'], 'take ', levelOf))).toBe(
    'Did you mean Eevee? Run /pokemon take eevee 2',
  )
})

test('a plain name reaches another form in the party only, never in the PC box', () => {
  const alolan = member('vulpix', { form: 'alola' })
  expect(ids(findMembers({ ...emptySave(), party: [alolan] }, 'vulpix', ['party'], '', levelOf))).toBe(alolan.id)
  expect(ids(findMembers({ ...emptySave(), box: [alolan] }, 'vulpix', ['box'], '', levelOf))).toMatch(/^No vulpix/)
})

test('the numbered list: gender, shiny, level, what it holds and where it is', () => {
  const { girl, boy } = eevees()
  const choices: Spot[] = [
    { place: 'party', at: 1, member: girl },
    { place: 'box', at: 0, member: boy },
  ]
  expect(formatChoices(choices, 'eevee', 'release ', levelOf)).toBe(
    'Which Eevee? 1. Eevee ♀ Lv 24 (party) · 2. ✨ Eevee ♂ Lv 3 (PC box) — add the number: /pokemon release eevee 2',
  )
  const held = [{ ...choices[0], member: { ...girl, heldItem: 'everstone' } } as Spot, choices[1] as Spot]
  expect(formatChoices(held, 'eevee', 'give water-stone ', levelOf)).toBe(
    'Which Eevee? 1. Eevee ♀ Lv 24 holding Everstone (party) · 2. ✨ Eevee ♂ Lv 3 (PC box) — add the number: /pokemon give water-stone eevee 2',
  )
})

test('a number that is part of a name stays in the name; a suggestion keeps a number it can pick', () => {
  const two = member('porygon2')
  const one = { ...emptySave(), party: [member('pikachu'), two] }
  expect(ids(findMembers(one, 'porygon 2', ['party'], 'remove ', levelOf))).toBe(two.id)
  const both = { ...emptySave(), party: [member('porygon'), two] }
  expect(ids(findMembers(both, 'porygon 2', ['party'], 'remove ', levelOf))).toBe(two.id)
  // Two Porygon: the number picks the second, as their list says, even with a Porygon2 there.
  const pair = { ...emptySave(), party: [member('porygon'), member('porygon', { id: 'second' })] }
  expect(ids(findMembers(pair, 'porygon 2', ['party'], 'remove ', levelOf))).toBe('second')
  const three = { ...pair, party: [...pair.party, two] }
  expect(ids(findMembers(three, 'porygon 2', ['party'], 'remove ', levelOf))).toBe('second')
  expect(ids(findMembers(three, 'porygon 3', ['party'], 'remove ', levelOf))).toMatch(/^Which Porygon\? /)
  // A near miss with a number no list of it reaches drops the number.
  expect(ids(findMembers(one, 'porygn 2', ['party'], 'remove ', levelOf))).toBe(
    'Did you mean Porygon2? Run /pokemon remove porygon2',
  )
  // One Porygon: no list of one to pick from. 1 is that one; any other number names none of yours (a near miss at
  // most), so a lead or an add goes on to catch Porygon2.
  const lone = { ...emptySave(), party: [member('pikachu')], box: [member('porygon', { id: 'lone' })] }
  const owned: ('party' | 'box')[] = ['party', 'box']
  expect(ids(findMembers(lone, 'porygon 2', owned, '', levelOf))).toBe('Did you mean Porygon? Run /pokemon porygon')
  expect(ids(findMembers(lone, 'porygon 2', ['box'], 'add ', levelOf))).toBe(
    'Did you mean Porygon? Run /pokemon add porygon',
  )
  expect(ids(findMembers(lone, 'porygon 3', owned, '', levelOf))).toBe('Did you mean Porygon? Run /pokemon porygon')
  expect(ids(findMembers(lone, 'porygon 1', owned, '', levelOf))).toBe('lone')
  const zygarde = { ...emptySave(), party: [member('zygarde', { id: 'plain' })] }
  expect(ids(findMembers(zygarde, 'zygarde 10', owned, '', levelOf))).toMatch(
    /^No zygarde 10 in your party or PC box\./,
  )
  expect(ids(findMembers(zygarde, 'zygarde 1', owned, '', levelOf))).toBe('plain')
  const unowns = { ...emptySave(), box: [member('unown', { form: 'a' }), member('unown', { form: 'a' })] }
  expect(ids(findMembers(unowns, 'unown 2', ['box'], 'add ', levelOf))).toBe(
    'Did you mean Unown (A)? Run /pokemon add unown a 2',
  )
})

test('a number below 1 picks no one: it answers with the list', () => {
  const two = { ...emptySave(), party: [member('eevee'), member('eevee')] }
  for (const query of ['eevee -1', 'eevee 0', 'eevee -2']) {
    const found = findMembers(two, query, ['party'], 'remove ', levelOf)
    expect('error' in found && found.error).toBe(
      'Which Eevee? 1. Eevee Lv 1 (party) · 2. Eevee Lv 1 (party) — add the number: /pokemon remove eevee 2',
    )
  }
})

test('a list of several forms names the species, and each line its form', () => {
  const unowns = { ...emptySave(), party: [member('unown', { form: 'b' }), member('unown', { form: 'a' })] }
  const found = findMembers(unowns, 'unown', ['party'], 'remove ', levelOf)
  expect('choices' in found && formatChoices(found.choices, 'unown', 'remove ', levelOf)).toBe(
    'Which Unown? 1. Unown (B) Lv 1 (party) · 2. Unown (A) Lv 1 (party) — add the number: /pokemon remove unown 2',
  )
})

test('every line of a numbered list, its hint typed back, picks that line', () => {
  const m = member
  const saves: Save[] = [
    { ...emptySave(), party: [m('porygon'), m('porygon'), m('porygon2')], box: [m('porygon2'), m('porygon')] },
    { ...emptySave(), party: [m('porygon2'), m('porygon2')], box: [m('porygon-z'), m('porygon-z'), m('porygon')] },
    {
      ...emptySave(),
      party: [m('zygarde'), m('zygarde', { form: '10' }), m('zygarde')],
      box: [m('zygarde', { form: '10' }), m('zygarde'), m('zygarde', { form: '10' })],
    },
    { ...emptySave(), party: [m('unown', { form: 'b' }), m('unown', { form: 'a' }), m('unown', { form: 'a' })] },
    {
      ...emptySave(),
      party: [m('eevee'), m('eevee', { isShiny: true })],
      box: [m('eevee', { isShiny: true }), m('mr-mime'), m('mr-mime')],
    },
    { ...emptySave(), party: [m('vulpix', { form: 'alola' }), m('vulpix', { form: 'alola' }), m('nidoran-f')] },
  ]
  const queries = [
    'porygon',
    'porygon2',
    'porygon 2',
    'porygon z',
    'porygonz',
    'zygarde',
    'zygarde 10',
    'unown',
    'unown a',
    'eevee',
    'shiny eevee',
    'mr mime',
    'mrmime',
    'vulpix',
    'alolan vulpix',
    'porygon 9',
    'zygarde 10 9',
  ]
  let lists = 0
  for (const s of saves)
    for (const places of [['party'], ['box'], both] as ('party' | 'box')[][])
      for (const query of queries) {
        const found = findMembers(s, query, places, 'release ', levelOf)
        // A number past the end lists the words before it: those are what the hint numbers.
        const listed =
          'choices' in found
            ? found
            : 'error' in found && isList(found.error)
              ? findMembers(s, query.replace(/ \d+$/, ''), places, 'release ', levelOf)
              : null
        if (!listed || !('choices' in listed)) continue
        const text =
          'choices' in found
            ? formatChoices(found.choices, query, 'release ', levelOf)
            : 'error' in found
              ? found.error
              : ''
        const hint = /add the number: \/pokemon release (.*) \d+$/.exec(text)?.[1]
        expect(hint).toBeDefined()
        listed.choices.forEach((choice, i) => {
          lists++
          expect([query, i + 1, ids(findMembers(s, `${hint} ${i + 1}`, places, 'release ', levelOf))]).toEqual([
            query,
            i + 1,
            choice.member.id,
          ])
        })
      }
  expect(lists).toBeGreaterThan(40)
})
