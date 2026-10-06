import { expect, test } from 'claude-code/testing'

import {
  emptySave,
  formatBox,
  formatDex,
  formatParty,
  earnInto,
  extraXp,
  foldLedger,
  loadLedger,
  withExtra,
  isDueToEvolve,
  level,
  loadSave,
  recordCaught,
  recordSeen,
  spriteBudget,
  storeCaught,
  xpForLevel,
} from '../hooks/save'
import type { Member } from '../hooks/save'

const pikachu: Member = { id: 'p1', species: 'pikachu', form: 'regular', isShiny: false, xp: 0, evolutions: 0 }

test('a missing or broken save loads as a fresh one', () => {
  expect(loadSave(undefined)).toEqual(emptySave())
  expect(loadSave('garbage')).toEqual(emptySave())
  const broken = loadSave({ party: [pikachu, { species: 3 }, null], size: 'huge', dex: null, recent: ['eevee', 4] })
  expect(broken).toEqual({ party: [pikachu], size: 'auto', dex: {}, recent: ['eevee'] })
  expect(loadSave({ party: [pikachu, pikachu, pikachu, pikachu] }).party.length).toBe(3)
})

test('a malformed save is cleaned field by field: numbers, flags, names and Pokédex entries', () => {
  const s = loadSave({
    party: [
      {
        species: 'eevee',
        form: 'regular',
        xp: -50,
        isShiny: 'false',
        hasEverstone: 'no',
        evolutions: 'x',
        evolveAt: 0,
      },
      { species: '../../.zshrc', form: 'regular', xp: 1 },
    ],
    dex: { eevee: { seen: 2, shiny: 'x' }, '../x': { seen: 1 }, mew: 'junk' },
    recent: ['eevee', '../x'],
  })
  expect(s.party).toEqual([
    { id: '0-eevee-regular', species: 'eevee', form: 'regular', isShiny: false, xp: 0, evolutions: 0 },
  ])
  expect(s.dex).toEqual({ eevee: { seen: 2, shiny: 0, first: 0 } })
  expect(s.recent).toEqual(['eevee'])
  // Members saved before ids existed get the same id in every session; duplicates get told apart.
  expect(loadSave({ party: [pikachu, pikachu] }).party.map(m => m.id)).toEqual(['p1', 'p1-1'])
})

test('levels grow with the square root of xp', () => {
  expect([0, 3, 4, 16, 324, 1444].map(level)).toEqual([1, 1, 2, 3, 10, 20])
  for (const lv of [2, 5, 10, 20]) {
    expect(level(xpForLevel(lv))).toBe(lv)
    expect(level(xpForLevel(lv) - 1)).toBe(lv - 1)
  }
})

test('each session writes the XP it earns to its own ledger; the party counts every ledger', () => {
  const eevee = { ...pikachu, id: 'e1', species: 'eevee' }
  const save = { ...emptySave(), party: [{ ...pikachu, xp: 2 }, eevee] }
  const mine = earnInto(earnInto({ at: 0, xp: {} }, save.party, 2, 5), save.party, 5, 9)
  expect(mine).toEqual({ at: 9, xp: { p1: 7, e1: 7 } })
  const theirs = { at: 3, xp: { p1: 10 } }
  const extra = extraXp({ 'xp:me': mine, 'xp:them': theirs })
  expect(extra).toEqual({ p1: 17, e1: 7 })
  expect(withExtra(save, extra).party.map(m => m.xp)).toEqual([19, 7])
  // The save itself never holds ledger XP.
  expect(save.party.map(m => m.xp)).toEqual([2, 0])
  expect(loadLedger({ at: 'x', xp: { p1: -3, e1: 4.7, x: 'y' } })).toEqual({ at: 0, xp: { e1: 4 } })
})

test("a finished session's ledger folds into the save once, and is never counted twice", () => {
  const save = { ...emptySave(), party: [{ ...pikachu, xp: 2 }] }
  const old = { at: 1, xp: { p1: 40 } }
  const folded = foldLedger(save, 'xp:old', old)
  expect(folded.party[0]?.xp).toBe(42)
  expect(folded.folded).toEqual(['xp:old'])
  expect(foldLedger(folded, 'xp:old', old)).toBe(folded)
  expect(extraXp({ 'xp:old': old }, folded.folded)).toEqual({})
  expect(loadSave(folded).folded).toEqual(['xp:old'])
  expect(loadSave({ ...folded, folded: ['nope', 4] }).folded).toBeUndefined()
})

test('evolves once it reaches its own evolution level, never with an everstone or at a final stage', () => {
  expect(isDueToEvolve({ ...pikachu, evolveAt: 16, xp: xpForLevel(16) - 1 })).toBe(false)
  expect(isDueToEvolve({ ...pikachu, evolveAt: 16, xp: xpForLevel(16) })).toBe(true)
  expect(isDueToEvolve({ ...pikachu, evolveAt: 36, xp: xpForLevel(30) })).toBe(false)
  expect(isDueToEvolve({ ...pikachu, evolveAt: null, xp: xpForLevel(60) })).toBe(false)
  expect(isDueToEvolve({ ...pikachu, xp: xpForLevel(60) })).toBe(false)
  expect(isDueToEvolve({ ...pikachu, evolveAt: 16, xp: xpForLevel(16), hasEverstone: true })).toBe(false)
})

test('the evolution level survives a reload; a malformed one is looked up again', () => {
  expect(loadSave({ party: [{ ...pikachu, evolveAt: 16 }] }).party[0]?.evolveAt).toBe(16)
  expect(loadSave({ party: [{ ...pikachu, evolveAt: null }] }).party[0]?.evolveAt).toBeNull()
  expect('evolveAt' in (loadSave({ party: [{ ...pikachu, evolveAt: 'soon' }] }).party[0] ?? {})).toBe(false)
})

test('sightings count up, shinies too, and recent ones stay unique', () => {
  let save = recordSeen(emptySave(), 'pikachu', false, 1)
  save = recordSeen(save, 'eevee', true, 2)
  save = recordSeen(save, 'pikachu', true, 3)
  expect(save.dex.pikachu).toEqual({ seen: 2, shiny: 1, first: 1 })
  expect(save.recent).toEqual(['pikachu', 'eevee'])
})

test('the Pokédex counts per generation and lists shinies', () => {
  const names = Array.from({ length: 905 }, (_, i) => (i === 0 ? 'bulbasaur' : i === 151 ? 'chikorita' : `mon-${i}`))
  let save = recordSeen(emptySave(), 'bulbasaur', true, 1)
  save = recordSeen(save, 'chikorita', false, 2)
  const text = formatDex(save, names)
  expect(text).toContain('Pokédex: 2 / 905 seen · 0 caught · 1 shiny')
  expect(text).toContain('Gen 1  ░░░░░░░░░░  1/151')
  expect(text).toContain('Gen 2  ░░░░░░░░░░  1/100')
  expect(text).toContain('Shinies: Bulbasaur')
  expect(text).toContain('Recently seen: Chikorita, Bulbasaur')
})

test('the party lists levels, xp to go and when each evolves', () => {
  const save = {
    ...emptySave(),
    party: [
      { ...pikachu, xp: 40, evolveAt: 30 },
      { ...pikachu, species: 'eevee', hasEverstone: true, evolveAt: 30 },
      { ...pikachu, species: 'charizard', evolveAt: null },
      { ...pikachu, species: 'mew' },
    ],
  }
  expect(formatParty(save)).toBe(
    [
      'Your party:',
      '  Lead  Pikachu    Lv 4  (24 xp to Lv 5)  · evolves at Lv 30',
      '  2.    Eevee      Lv 1  (4 xp to Lv 2)   · everstone',
      '  3.    Charizard  Lv 1  (4 xp to Lv 2)   · final form',
      '  4.    Mew        Lv 1  (4 xp to Lv 2)',
    ].join('\n'),
  )
  expect(formatParty(emptySave())).toContain('empty')
})

test('sprite size: small halves it, auto goes small on a short terminal, all fit the band', () => {
  expect(spriteBudget('normal', 30, 3)).toBe(12)
  expect(spriteBudget('small', 30, 3)).toBe(6)
  expect(spriteBudget('auto', 30, 3)).toBe(12)
  expect(spriteBudget('auto', 15, 3)).toBe(6)
  expect(spriteBudget('normal', 8, 3)).toBe(4)
})

test('a 1.0.0 save loads with no box and no caught counts; box entries that are not Pokémon are dropped', () => {
  const old = { party: [pikachu], size: 'auto', dex: { pikachu: { seen: 1, shiny: 0, first: 1 } }, recent: ['pikachu'] }
  expect(loadSave(old)).toEqual(old)
  const eevee = { ...pikachu, id: 'b1', species: 'eevee', isCaught: true }
  const s = loadSave({
    ...old,
    box: [eevee, { species: 7 }, null],
    dex: { pikachu: { seen: 2, shiny: 0, first: 1, caught: 1 } },
  })
  expect(s.box).toEqual([eevee])
  expect(s.dex.pikachu).toEqual({ seen: 2, shiny: 0, first: 1, caught: 1 })
  expect(loadSave({ ...old, party: [{ ...pikachu, isCaught: 'yes' }] }).party[0]).toEqual(pikachu)
})

test('a catch joins the party while it has room and no twin, else goes to the PC box; the Pokédex counts it', () => {
  const eevee: Member = { ...pikachu, id: 'e1', species: 'eevee', isCaught: true }
  const roomy = storeCaught({ ...emptySave(), party: [pikachu] }, eevee)
  expect(roomy.isInParty).toBe(true)
  expect(roomy.save.party.map(m => m.id)).toEqual(['p1', 'e1'])
  const twin = storeCaught({ ...emptySave(), party: [pikachu] }, { ...pikachu, id: 'p2', isCaught: true })
  expect(twin.isInParty).toBe(false)
  expect(twin.save.party.map(m => m.id)).toEqual(['p1'])
  expect(twin.save.box?.map(m => m.id)).toEqual(['p2'])
  const three = [pikachu, { ...pikachu, id: 'x', species: 'mew' }, { ...pikachu, id: 'y', species: 'abra' }]
  expect(storeCaught({ ...emptySave(), party: three }, eevee).save.box?.map(m => m.id)).toEqual(['e1'])
  let save = recordSeen(emptySave(), 'eevee', false, 5)
  save = recordCaught(recordCaught(save, 'eevee', 6), 'eevee', 7)
  expect(save.dex.eevee).toEqual({ seen: 1, shiny: 0, first: 5, caught: 2 })
  expect(recordCaught(emptySave(), 'abra', 9).dex.abra).toEqual({ seen: 1, shiny: 0, first: 9, caught: 1 })
})

test('the PC box lists its Pokémon like the party; ◓ marks the ones caught with a ball', () => {
  const boxed: Member = { ...pikachu, id: 'b1', species: 'eevee', xp: 40, isCaught: true }
  const save = { ...emptySave(), party: [{ ...pikachu, isCaught: true as const }], box: [boxed] }
  expect(formatParty(save)).toContain('Lead  Pikachu ◓  Lv 1')
  expect(formatBox(save)).toBe(['Your PC box:', '  1.  Eevee ◓  Lv 4  (24 xp to Lv 5)'].join('\n'))
  expect(formatBox(emptySave())).toBe('Your PC box is empty.')
  expect(withExtra(save, { b1: 24 }).box?.[0]?.xp).toBe(64)
  const names = ['bulbasaur', 'eevee', ...Array.from({ length: 903 }, (_, i) => `mon-${i}`)]
  const dex = recordCaught(recordSeen(emptySave(), 'eevee', false, 1), 'eevee', 2)
  expect(formatDex(dex, names)).toContain('Pokédex: 1 / 905 seen · 1 caught · 0 shiny')
})
