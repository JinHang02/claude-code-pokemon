import { expect, test } from 'claude-code/testing'

import { findMembers, formatChoices } from '../hooks/members'
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
