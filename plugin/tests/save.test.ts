import { expect, test } from 'claude-code/testing'

import {
  addTogether,
  balanceOf,
  buy,
  displayName,
  earnInto,
  emptySave,
  evolveLevel,
  evolvesText,
  extraMoney,
  extraXp,
  foldLedger,
  formatBag,
  formatBox,
  formatDex,
  formatParty,
  formatSpan,
  isBoxFull,
  level,
  loadLedger,
  loadSave,
  loadTogether,
  MAX_BOX,
  nameOf,
  putInBag,
  recordCaught,
  recordSeen,
  releaseMember,
  spriteBudget,
  styleOf,
  STARTING_MONEY,
  storeCaught,
  takeFromBag,
  TOGETHER_CAP_MS,
  togetherOf,
  withExtra,
  withTogether,
  xpForLevel,
} from '../hooks/save'
import type { Member } from '../hooks/save'
import { FRIENDSHIP_MS } from '../hooks/evolution'
import type { Stage } from '../hooks/evolution'
import { itemById } from '../hooks/items'

const pikachu: Member = { id: 'p1', species: 'pikachu', form: 'regular', isShiny: false, xp: 0, evolutions: 0 }

test('a missing or broken save loads as a fresh one', () => {
  expect(loadSave(undefined)).toEqual(emptySave())
  expect(loadSave('garbage')).toEqual(emptySave())
  const broken = loadSave({ party: [pikachu, { species: 3 }, null], size: 'huge', dex: null, recent: ['eevee', 4] })
  expect(broken).toEqual({ party: [pikachu], size: 'auto', evolution: 'manual', dex: {}, recent: ['eevee'] })
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
        heldItem: 'no-such-item',
        evolutions: 'x',
        next: 'soon',
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

test('party members past the third, from an older save, go into the PC box instead of being lost', () => {
  const m = (id: string, species: string) => ({ id, species, form: 'regular', isShiny: false, xp: 900, evolutions: 0 })
  const s = loadSave({
    party: [m('a', 'pikachu'), m('b', 'eevee'), m('c', 'mew'), m('d', 'ditto')],
    box: [m('e', 'caterpie')],
  })
  expect(s.party.map(p => p.id)).toEqual(['a', 'b', 'c'])
  expect(s.box?.map(p => [p.id, p.xp])).toEqual([
    ['e', 900],
    ['d', 900],
  ])
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
  const mine = earnInto(earnInto({ at: 0, xp: {}, money: 0 }, save.party, 2, 5), save.party, 5, 9)
  expect(mine).toEqual({ at: 9, xp: { p1: 7, e1: 7 }, money: 70 })
  const theirs = { at: 3, xp: { p1: 10 }, money: 0 }
  const extra = extraXp({ 'xp:me': mine, 'xp:them': theirs })
  expect(extra).toEqual({ p1: 17, e1: 7 })
  expect(withExtra(save, extra).party.map(m => m.xp)).toEqual([19, 7])
  // The save itself never holds ledger XP.
  expect(save.party.map(m => m.xp)).toEqual([2, 0])
  expect(loadLedger({ at: 'x', xp: { p1: -3, e1: 4.7, x: 'y' } })).toEqual({ at: 0, xp: { e1: 4 }, money: 0 })
})

test('member ids are unique across the party and the box, however the save was written', () => {
  const m = (species: string, id?: string) => ({ ...(id ? { id } : {}), species, form: 'regular', xp: 0 })
  const ids = (raw: unknown) => {
    const s = loadSave(raw)
    return [...s.party, ...(s.box ?? [])].map(p => p.id)
  }
  const unique = (list: string[]) => new Set(list).size === list.length
  expect(unique(ids({ party: [m('pikachu', 'a'), m('eevee', 'a-2'), m('mew', 'a')] }))).toBe(true)
  expect(unique(ids({ party: [m('pikachu')], box: [m('pikachu')] }))).toBe(true)
  expect(unique(ids({ party: [m('pikachu', 'a')], box: [m('eevee', 'a'), m('mew', 'a')] }))).toBe(true)
})

test('a member id that is also a built-in name counts XP like any other', () => {
  const save = { ...emptySave(), party: [{ ...pikachu, id: 'constructor', xp: 100 }] }
  const ledger = earnInto(loadLedger(undefined), save.party, 5, 1)
  expect(ledger.xp.constructor).toBe(5)
  expect(withExtra(save, extraXp({})).party[0]?.xp).toBe(100)
  expect(withExtra(save, extraXp({ 'xp:a': loadLedger(ledger) })).party[0]?.xp).toBe(105)
  expect(foldLedger(save, 'xp:a', loadLedger(ledger)).party[0]?.xp).toBe(105)
})

test('XP a session writes after its ledger was folded still counts, and is folded once', () => {
  const save = { ...emptySave(), party: [{ ...pikachu, xp: 10 }] }
  const folded = foldLedger(save, 'xp:s', loadLedger({ at: 1, xp: { p1: 5 } }))
  expect(folded.party[0]?.xp).toBe(15)
  const later = loadLedger({ at: 2, xp: { p1: 8 } })
  expect(extraXp({ 'xp:s': later }, folded.folded, folded.foldedXp).p1).toBe(3)
  const again = foldLedger(loadSave(folded), 'xp:s', later)
  expect(again.party[0]?.xp).toBe(18)
  expect(extraXp({ 'xp:s': later }, again.folded, again.foldedXp).p1).toBeUndefined()
  expect(foldLedger(again, 'xp:s', later)).toBe(again)
  // A mark left by a version that kept no record of what it added: nothing more is added.
  const { foldedXp: _, ...old } = folded
  expect(foldLedger(old, 'xp:s', later)).toBe(old)
  expect(extraXp({ 'xp:s': later }, old.folded)).toEqual({})
})

test("a finished session's ledger folds into the save once, and is never counted twice", () => {
  const save = { ...emptySave(), party: [{ ...pikachu, xp: 2 }] }
  const old = { at: 1, xp: { p1: 40 }, money: 0 }
  const folded = foldLedger(save, 'xp:old', old)
  expect(folded.party[0]?.xp).toBe(42)
  expect(folded.folded).toEqual(['xp:old'])
  expect(foldLedger(folded, 'xp:old', old)).toBe(folded)
  expect(extraXp({ 'xp:old': old }, folded.folded)).toEqual({})
  expect(loadSave(folded).folded).toEqual(['xp:old'])
  expect(loadSave({ ...folded, folded: ['nope', 4] }).folded).toBeUndefined()
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
  expect(text).toContain('Gen 1  ░░░░░░░░░░  1/151 seen · 0 caught · 1 shiny')
  expect(text).toContain('Gen 2  ░░░░░░░░░░  1/100 seen · 0 caught · 0 shiny')
  expect(text).toContain('Shinies: Bulbasaur')
  expect(text).toContain('Recently seen: Chikorita, Bulbasaur')
})

test("a generation's bar shows its caught cells, then the ones only seen", () => {
  const names = Array.from({ length: 905 }, (_, i) => `mon-${i}`)
  let save = emptySave()
  for (let i = 0; i < 76; i++) save = recordSeen(save, `mon-${i}`, false, i)
  for (let i = 0; i < 31; i++) save = recordCaught(save, `mon-${i}`, i)
  // A catch never seen before counts as seen too.
  save = recordCaught(save, 'mon-151', 1)
  const text = formatDex(save, names)
  expect(text).toContain('Gen 1  ██▓▓▓░░░░░  76/151 seen · 31 caught · 0 shiny')
  expect(text).toContain('Gen 2  ░░░░░░░░░░  1/100 seen · 1 caught · 0 shiny')
  expect(text).toContain('Gen 3  ░░░░░░░░░░  0/135 seen · 0 caught · 0 shiny')
})

test('the party lists levels, xp to go and when each evolves', () => {
  const save = {
    ...emptySave(),
    party: [
      { ...pikachu, xp: 40, next: [{ species: 'raichu', way: { kind: 'level', level: 30 } }] as Stage[] },
      { ...pikachu, species: 'eevee', heldItem: 'everstone', next: [] },
      { ...pikachu, species: 'charizard', next: [] },
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

test('a long "evolves" text goes last, so time together and the held item line up for everyone', () => {
  const branches: Stage[] = ['water-stone', 'thunder-stone', 'fire-stone', 'leaf-stone'].map(item => ({
    species: item,
    way: { kind: 'item' as const, item },
  }))
  const save = {
    ...emptySave(),
    party: [
      { ...pikachu, species: 'eevee', togetherMs: 3 * 3600000, heldItem: 'lucky-egg', next: branches },
      { ...pikachu, togetherMs: 7200000, next: [] },
    ],
  }
  const lines = formatParty(save).split('\n')
  expect(lines[1]).toMatch(/^ {2}Lead {2}Eevee {4}Lv 1 .*· together 3h .*· holds a Lucky Egg {2}· evolves /)
  expect(lines[1]!.indexOf('· together')).toBe(lines[2]!.indexOf('· together'))
  expect(lines[2]!.indexOf('· final form')).toBe(lines[1]!.indexOf('· evolves'))
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
  expect(loadSave(old)).toEqual({ ...old, evolution: 'manual' })
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

test('a catch joins the party while it has room, twin or not, else goes to the PC box; the Pokédex counts it', () => {
  const eevee: Member = { ...pikachu, id: 'e1', species: 'eevee', isCaught: true }
  const roomy = storeCaught({ ...emptySave(), party: [pikachu] }, eevee)
  expect(roomy.isInParty).toBe(true)
  expect(roomy.save.party.map(m => m.id)).toEqual(['p1', 'e1'])
  const twin = storeCaught({ ...emptySave(), party: [pikachu, eevee] }, { ...eevee, id: 'e2' })
  expect(twin.isInParty).toBe(true)
  expect(twin.save.party.map(m => m.id)).toEqual(['p1', 'e1', 'e2'])
  expect(twin.save.box).toBeUndefined()
  const three = [pikachu, { ...pikachu, id: 'x', species: 'mew' }, { ...pikachu, id: 'y', species: 'abra' }]
  expect(storeCaught({ ...emptySave(), party: three }, eevee).save.box?.map(m => m.id)).toEqual(['e1'])
  // A full PC box takes no more: nothing changes. An older save holding more keeps them all.
  const full = {
    ...emptySave(),
    party: three,
    box: Array.from({ length: MAX_BOX }, (_, i) => ({ ...pikachu, id: `b${i}` })),
  }
  expect(storeCaught(full, eevee)).toEqual({ save: full, isInParty: false, isStored: false })
  expect(isBoxFull({ ...full, box: full.box.slice(1) })).toBe(false)
  const over = { ...emptySave(), party: [], box: Array.from({ length: 1000 }, (_, i) => ({ ...pikachu, id: `o${i}` })) }
  expect(loadSave(JSON.parse(JSON.stringify(over))).box).toHaveLength(1000)
  let save = recordSeen(emptySave(), 'eevee', false, 5)
  save = recordCaught(recordCaught(save, 'eevee', 6), 'eevee', 7)
  expect(save.dex.eevee).toEqual({ seen: 1, shiny: 0, first: 5, caught: 2 })
  expect(recordCaught(emptySave(), 'abra', 9).dex.abra).toEqual({ seen: 1, shiny: 0, first: 9, caught: 1 })
})

test('the PC box lists its Pokémon like the party; ◓ marks the ones caught with a ball', () => {
  const boxed: Member = { ...pikachu, id: 'b1', species: 'eevee', xp: 40, isCaught: true }
  const save = { ...emptySave(), party: [{ ...pikachu, isCaught: true as const }], box: [boxed] }
  expect(formatParty(save)).toContain('Lead  Pikachu ◓  Lv 1')
  expect(formatBox(save)).toBe(['Your PC box (1 / 960):', '  #1  Eevee ◓  Lv 4  (24 xp to Lv 5)'].join('\n'))
  expect(formatBox(emptySave())).toBe('Your PC box is empty.')
  expect(withExtra(save, { b1: 24 }).box?.[0]?.xp).toBe(64)
  const names = ['bulbasaur', 'eevee', ...Array.from({ length: 903 }, (_, i) => `mon-${i}`)]
  const dex = recordCaught(recordSeen(emptySave(), 'eevee', false, 1), 'eevee', 2)
  expect(formatDex(dex, names)).toContain('Pokédex: 1 / 905 seen · 1 caught · 0 shiny')
})

const stone = { species: 'raichu', way: { kind: 'item', item: 'thunder-stone' } } as const

test('a 1.2.0 save loads: the everstone is held, cached levels are looked up again, ₽3,000 to spend', () => {
  const old = loadSave({
    party: [
      { id: 'a', species: 'pikachu', form: 'regular', xp: 40, evolveAt: 30, hasEverstone: true },
      { id: 'b', species: 'eevee', form: 'regular', xp: 0, evolveAt: 30 },
    ],
  })
  expect(old.party[0]).toEqual({
    id: 'a',
    species: 'pikachu',
    form: 'regular',
    isShiny: false,
    xp: 40,
    evolutions: 0,
    heldItem: 'everstone',
  })
  expect(old.party[1]?.next).toBeUndefined()
  expect(balanceOf(old, 0)).toBe(STARTING_MONEY)
})

test('next stages, held items and the Bag load only when well formed; time together stays out of the save', () => {
  const raw = {
    party: [
      { id: 'a', species: 'pikachu', form: 'regular', next: [stone], heldItem: 'lucky-egg', togetherMs: 5000 },
      { id: 'b', species: 'eevee', form: 'regular', next: [{ species: 'x', way: { kind: 'teleport' } }] },
      { id: 'c', species: 'onix', form: 'regular', heldItem: 'gimmighoul-coin', togetherMs: -4 },
    ],
    box: [{ id: 'a', species: 'pichu', form: 'regular', togetherMs: 7000 }],
    bag: { 'fire-stone': 2, 'rare-candy': 1000, everstone: 1, constructor: 3, 'ice-stone': 0.5 },
    spent: 300,
    earned: 50,
    togetherAt: 99,
  }
  const s = loadSave(raw)
  expect(s.party[0]).toMatchObject({ next: [stone], heldItem: 'lucky-egg' })
  // One unreadable stage: the whole list is looked up again.
  expect(s.party[1]?.next).toBeUndefined()
  expect('heldItem' in (s.party[2] ?? {})).toBe(false)
  expect(s.bag).toEqual({ 'fire-stone': 2, 'rare-candy': 999 })
  expect([s.spent, s.earned]).toEqual([300, 50])
  // A save from before the `together` key: its time moves there, by the ids its members load with.
  expect(JSON.stringify(s)).not.toContain('together')
  expect(s.box?.[0]?.id).toBe('a-0')
  expect(togetherOf(raw)).toEqual({ at: 99, ms: { a: 5000, 'a-0': 7000 } })
  expect(togetherOf(undefined)).toEqual({ at: 0, ms: {} })
  expect(loadTogether({ at: -1, ms: { a: 60_000, b: 'x', c: -5, d: 1.5 } })).toEqual({ at: 0, ms: { a: 60_000, d: 1 } })
  expect(loadTogether(null)).toEqual({ at: 0, ms: {} })
})

test('earning: ₽ once per event, XP per member, a Lucky Egg holder gets half again', () => {
  const party = [
    { id: 'a', species: 'pikachu', form: 'regular', isShiny: false, xp: 0, evolutions: 0 },
    { id: 'b', species: 'eevee', form: 'regular', isShiny: false, xp: 0, evolutions: 0, heldItem: 'lucky-egg' },
  ]
  const l = earnInto(loadLedger({}), party, 10, 7)
  expect(l).toEqual({ at: 7, xp: { a: 10, b: 15 }, money: 100 })
  expect(earnInto(l, party, 2, 8).money).toBe(120)
  // Exactly half again, rounded down: a test run's 5 is 7, never 8.
  expect(earnInto(loadLedger({}), party, 5, 9).xp).toEqual({ a: 5, b: 7 })
  expect(earnInto(loadLedger({}), party, 50, 9).xp).toEqual({ a: 50, b: 75 })
  expect(earnInto(loadLedger({}), party, 2, 9).xp.b).toBe(3)
})

test('₽ from two ledgers adds up, and a folded ledger is never counted twice', () => {
  const one = { at: 1, xp: {}, money: 200 }
  const two = { at: 2, xp: {}, money: 50 }
  const s0 = loadSave({})
  expect(balanceOf(s0, extraMoney({ 'xp:1': one, 'xp:2': two }))).toBe(3250)
  const s1 = foldLedger(s0, 'xp:1', one)
  expect(s1.earned).toBe(200)
  expect(balanceOf(s1, extraMoney({ 'xp:1': one, 'xp:2': two }, s1.folded, s1.foldedMoney))).toBe(3250)
  // It earned more after the fold: only the new part is added.
  const s2 = foldLedger(s1, 'xp:1', { ...one, money: 260 })
  expect(s2.earned).toBe(260)
  expect(foldLedger(s2, 'xp:1', { ...one, money: 260 })).toBe(s2)
  expect(loadSave(JSON.parse(JSON.stringify(s2)))).toEqual(s2)
})

test("buying: the price comes off, the Bag fills to 999, and nothing changes when it can't", () => {
  const s = loadSave({})
  const stoneItem = itemById('thunder-stone')!
  const one = buy(s, 0, stoneItem, 1)
  expect(one).toMatchObject({ text: 'Bought a Thunder Stone!', isError: false })
  expect(one.save.bag).toEqual({ 'thunder-stone': 1 })
  expect(balanceOf(one.save, 0)).toBe(0)
  expect(buy(one.save, 0, stoneItem, 1)).toEqual({
    save: one.save,
    text: 'Not enough ₽: ₽3,000 more to go.',
    isError: true,
  })
  for (const qty of [0, -1, 1.5, NaN]) {
    const bad = buy(s, 0, stoneItem, qty)
    expect(bad.save).toBe(s)
    expect(bad.isError).toBe(true)
  }
  const rich = buy(loadSave({ earned: 10_000_000 }), 0, itemById('rare-candy')!, 998)
  expect(rich.text).toBe('Bought 998 × Rare Candy!')
  expect(buy(rich.save, 0, itemById('rare-candy')!, 2).text).toBe('Your Bag has room for 1 more.')
  const full = buy(rich.save, 0, itemById('rare-candy')!, 1).save
  expect(buy(full, 0, itemById('rare-candy')!, 1).text).toBe("Your Bag can't hold another Rare Candy (999 already).")
})

test('the Bag: taking one out removes an emptied item; putting one back stops at 999', () => {
  const s = loadSave({ bag: { 'fire-stone': 1, 'rare-candy': 999 } })
  expect(takeFromBag(s, 'fire-stone').bag).toEqual({ 'rare-candy': 999 })
  expect(putInBag(s, 'fire-stone')?.bag).toEqual({ 'fire-stone': 2, 'rare-candy': 999 })
  expect(putInBag(s, 'rare-candy')).toBeNull()
})

test('time together: the gap since the last beat, capped, a Soothe Bell ×1.5, the same stamp for every session', () => {
  const a = { id: 'a', species: 'pichu', form: 'regular', isShiny: false, xp: 0, evolutions: 0 }
  const b = { ...a, id: 'b', heldItem: 'soothe-bell' }
  const save = loadSave({ party: [a, b], box: [{ ...a, id: 'c' }] })
  const first = addTogether(loadTogether(undefined), save, 1_000)
  expect(first).toEqual({ at: 1_000, ms: {} })
  const next = addTogether(first, save, 61_000)
  expect(next.ms).toEqual({ a: 60_000, b: 90_000 })
  // A laptop closed for a weekend adds the cap, not the weekend.
  const back = addTogether(next, save, 61_000 + 3 * 86_400_000)
  expect(back.ms.a).toBe(60_000 + TOGETHER_CAP_MS)
  // A second session beating just after adds only the moment since.
  expect(addTogether(back, save, 61_000 + 3 * 86_400_000 + 1_000).ms.a).toBe(60_000 + TOGETHER_CAP_MS + 1_000)
  // The PC box keeps its time without adding to it; a member gone from both (released) is dropped.
  const kept = addTogether({ at: 1_000, ms: { a: 5, c: 7, gone: 9 } }, save, 2_000)
  expect(kept.ms).toEqual({ a: 1_005, b: 1_500, c: 7 })
  // Shown on the members, never stored in the save.
  const shown = withTogether(save, kept.ms)
  expect(shown.party.map(m => m.togetherMs)).toEqual([1_005, 1_500])
  expect(shown.box?.[0]?.togetherMs).toBe(7)
  expect(withTogether(shown, {}).party[0]).toEqual(save.party[0])
  expect(formatSpan(((365 + 3) * 24 * 60 + 2 * 60 + 7) * 60_000 + 59_000)).toBe('1y 3d 2h 7m')
  expect(formatSpan(30_000)).toBe('0m')
  expect(formatSpan(2 * 60 * 60_000)).toBe('2h')
})

test('the party says how each one evolves, and the Bag lists what you have', () => {
  const m = (extra: object) => ({
    id: 'x',
    species: 'eevee',
    form: 'regular',
    isShiny: false,
    xp: 0,
    evolutions: 0,
    ...extra,
  })
  expect(evolvesText(m({ next: [{ species: 'charmeleon', way: { kind: 'level', level: 16 } }] }))).toBe(
    'evolves at Lv 16',
  )
  expect(evolvesText(m({ next: [stone] }))).toBe('evolves with a Thunder Stone')
  expect(evolvesText(m({ next: [{ species: 'lycanroc', way: { kind: 'level', level: 25, time: 'night' } }] }))).toBe(
    'evolves at Lv 25 at night',
  )
  expect(
    evolvesText(
      m({ togetherMs: FRIENDSHIP_MS * 0.67, next: [{ species: 'espeon', way: { kind: 'friendship', time: 'day' } }] }),
    ),
  ).toBe('evolves with friendship by day (♥ 67%, 3h 18m to go)')
  expect(evolvesText(m({ next: [] }))).toBe('final form')
  expect(evolvesText(m({ next: [stone], heldItem: 'everstone' }))).toBe('everstone')
  expect(evolveLevel(m({ next: [stone, { species: 'x', way: { kind: 'level', level: 40 } }] }))).toBe(40)
  expect(evolveLevel(m({ next: [stone] }))).toBeNull()
  expect(evolveLevel(m({}))).toBeUndefined()
  const s = withTogether(
    loadSave({
      party: [m({ heldItem: 'soothe-bell', next: [stone] })],
      bag: { 'thunder-stone': 1, 'fire-stone': 2, 'metal-coat': 1, 'rare-candy': 3 },
    }),
    { x: 2 * 3_600_000 },
  )
  expect(formatParty(s)).toContain('Eevee  Lv 1')
  expect(formatParty(s)).toContain('together 2h')
  expect(formatParty(s)).toContain('holds a Soothe Bell')
  expect(formatBag(s, 0)).toBe(
    [
      'Bag · ₽3,000',
      '  Stones      Fire Stone ×2 · Thunder Stone ×1',
      '  Hold items  Metal Coat ×1',
      '  Other       Rare Candy ×3',
      '  Held        Eevee holds a Soothe Bell',
    ].join('\n'),
  )
  expect(formatBag(loadSave({}), 0)).toBe('Bag · ₽3,000\n  Empty. Buy items at the PokéMart: /pokemon mart')
  // PC box holders are listed too, marked.
  const boxed = loadSave({
    party: [m({ id: 'p', heldItem: 'lucky-egg' })],
    box: [m({ id: 'b', species: 'pichu' }), m({ id: 'c', heldItem: 'soothe-bell' })],
  })
  expect(formatBag(boxed, 0)).toBe(
    ['Bag · ₽3,000', '  Held        Eevee holds a Lucky Egg', '              Eevee (box) holds a Soothe Bell'].join(
      '\n',
    ),
  )
  // One holder a line: the party's, then ten of the PC box's and how many more.
  const many = loadSave({
    party: [m({ id: 'p', heldItem: 'lucky-egg' })],
    box: Array.from({ length: 14 }, (_, i) => m({ id: `b${i}`, species: 'pichu', heldItem: 'everstone' })),
  })
  expect(formatBag(many, 0).split('\n')).toEqual([
    'Bag · ₽3,000',
    '  Held        Eevee holds a Lucky Egg',
    ...Array.from({ length: 10 }, () => '              Pichu (box) holds an Everstone'),
    '              … and 4 more in the PC box.',
  ])
})

test('a release: from the party or the PC box, named with its level and place, its held item back to the Bag, the Pokédex kept', () => {
  const eevee: Member = { ...pikachu, id: 'e1', species: 'eevee', heldItem: 'fire-stone', xp: 400 }
  const dex = { pikachu: { seen: 1, shiny: 0, first: 1 }, eevee: { seen: 2, shiny: 0, first: 2, caught: 1 } }
  const s = loadSave({ party: [pikachu], box: [eevee], dex })
  const boxed = releaseMember(s, { place: 'box', at: 0 }, 'eevee')
  expect(boxed).toEqual({
    save: { ...s, box: undefined, bag: { 'fire-stone': 1 } },
    text: 'Bye bye, Eevee (Lv 11, PC box)! It went back to the wild. Its Fire Stone went back to the Bag.',
  })
  // The lead: the next one leads. Nothing held: no Bag line. Its level as the party stands, XP not yet saved too.
  const two = loadSave({ party: [{ ...eevee, heldItem: undefined }, pikachu] })
  const led = releaseMember(two, { place: 'party', at: 0 }, 'eevee', m => level(m.xp + 2116 - 400))
  expect(typeof led === 'object' && led.save.party).toEqual([pikachu])
  expect(typeof led === 'object' && led.text).toBe('Bye bye, Eevee (Lv 24, party)! It went back to the wild.')
  // An Everstone is free and never in the Bag: dropped, as a take drops it.
  const held = loadSave({ party: [pikachu, { ...eevee, heldItem: 'everstone' }], bag: { 'fire-stone': 999 } })
  expect(releaseMember(held, { place: 'party', at: 1 }, 'eevee')).toEqual({
    save: { ...held, party: [pikachu] },
    text: 'Bye bye, Eevee (Lv 11, party)! It went back to the wild.',
  })
  // The only party member stays, whatever the box holds; a Bag already full of its item keeps it.
  expect(releaseMember(s, { place: 'party', at: 0 }, 'pikachu')).toBe('Pick a new lead first.')
  const full = loadSave({ party: [pikachu], box: [eevee], bag: { 'fire-stone': 999 } })
  expect(releaseMember(full, { place: 'box', at: 0 }, 'eevee 2')).toBe(
    "Your Bag can't hold another Fire Stone (999 already).",
  )
})

test('evolutionStyle: absent loads as rays, a valid one is kept, an invalid one is dropped, and it round-trips', () => {
  const old = { party: [pikachu], size: 'auto', dex: {}, recent: [] }
  expect(styleOf(loadSave(old))).toBe('rays')
  expect(loadSave(old)).not.toHaveProperty('evolutionStyle')
  expect(loadSave({ ...old, evolutionStyle: 'white' }).evolutionStyle).toBe('white')
  const bad = loadSave({ ...old, evolutionStyle: 'sparkly' })
  expect(bad).not.toHaveProperty('evolutionStyle')
  expect(styleOf(bad)).toBe('rays')
  const written = JSON.parse(JSON.stringify({ ...loadSave(old), evolutionStyle: 'gradient' }))
  expect(loadSave(written).evolutionStyle).toBe('gradient')
})

test('the level stops at 100 everywhere it shows, however much XP comes after', () => {
  expect(level(xpForLevel(100) - 1)).toBe(99)
  expect(level(xpForLevel(100))).toBe(100)
  expect(level(xpForLevel(100) + 5000)).toBe(100)
  expect(level(1e12)).toBe(100)
  const top = { ...emptySave(), party: [{ ...pikachu, xp: 40_010, next: [] }] }
  expect(formatParty(top)).toBe(['Your party:', '  Lead  Pikachu  Lv 100  (max level)  · final form'].join('\n'))
  expect(formatBox({ ...emptySave(), box: [{ ...pikachu, xp: 1e12 }] })).toBe(
    ['Your PC box (1 / 960):', '  #1  Pikachu  Lv 100  (max level)'].join('\n'),
  )
})

test("names keep the games' punctuation: Farfetch'd, Mr. Mime, Nidoran♀, Type: Null, Ho-Oh, Flabébé", () => {
  const shown = (species: string, form?: string) => displayName(species, form)
  expect(
    [
      'farfetchd',
      'sirfetchd',
      'mr-mime',
      'mime-jr',
      'mr-rime',
      'nidoran-f',
      'nidoran-m',
      'type-null',
      'ho-oh',
      'porygon-z',
      'porygon2',
      'jangmo-o',
      'hakamo-o',
      'kommo-o',
      'flabebe',
      'tapu-koko',
    ].map(n => shown(n)),
  ).toEqual([
    "Farfetch'd",
    "Sirfetch'd",
    'Mr. Mime',
    'Mime Jr.',
    'Mr. Rime',
    'Nidoran♀',
    'Nidoran♂',
    'Type: Null',
    'Ho-Oh',
    'Porygon-Z',
    'Porygon2',
    'Jangmo-o',
    'Hakamo-o',
    'Kommo-o',
    'Flabébé',
    'Tapu Koko',
  ])
  expect(shown('mr-mime', 'galar')).toBe('Mr. Mime (Galar)')
  expect(shown('farfetchd', 'galar')).toBe("Farfetch'd (Galar)")
  // Nidoran's sign is its name: it isn't shown twice.
  expect(nameOf({ ...pikachu, species: 'nidoran-f', gender: 'female' })).toBe('Nidoran♀')
  expect(nameOf({ ...pikachu, species: 'nidoran-m', gender: 'male', isShiny: true })).toBe('✨ Nidoran♂')
  const party = { ...emptySave(), party: [{ ...pikachu, species: 'nidoran-f', gender: 'female' as const }] }
  expect(formatParty(party)).toContain('Lead  Nidoran♀  Lv 1')
  const dex = recordSeen(recordSeen(emptySave(), 'ho-oh', true, 1), 'type-null', false, 2)
  expect(formatDex(dex, ['ho-oh', 'type-null'])).toContain('Shinies: Ho-Oh\nRecently seen: Type: Null, Ho-Oh')
})

test('in a narrow terminal each row keeps its name and level on one line, the rest wrapped beneath', () => {
  const thunder = { species: 'raichu', way: { kind: 'item', item: 'thunder-stone' } } as const
  const save = {
    ...emptySave(),
    party: [
      {
        ...pikachu,
        xp: 400,
        gender: 'female' as const,
        heldItem: 'kings-rock',
        next: [thunder],
        togetherMs: 3 * 3_600_000,
      },
      { ...pikachu, id: 'p2', species: 'charizard', form: 'mega-x', isShiny: true, xp: 40_010, next: [] },
    ],
  }
  // At 100 the XP to the next level still fits beside the level.
  expect(formatParty(save, 100).split('\n').slice(1, 3)).toEqual([
    '  Lead  Pikachu ♀              Lv 11   (84 xp to Lv 12)',
    "        together 3h · holds a King's Rock · evolves with a Thunder Stone",
  ])
  const wide = formatParty(save, 150)
  expect(wide).toBe(formatParty(save))
  expect(wide.split('\n')).toHaveLength(3)
  expect(formatParty(save, 60).split('\n')).toEqual([
    'Your party:',
    '  Lead  Pikachu ♀              Lv 11   (84 xp to Lv 12)',
    "        together 3h · holds a King's Rock",
    '        evolves with a Thunder Stone',
    '  2.    ✨ Charizard (Mega X)  Lv 100  (max level)',
    '        final form',
  ])
  // Narrower still, the XP to the next level is left out: the level says enough.
  expect(formatParty(save, 50).split('\n').slice(1, 4)).toEqual([
    '  Lead  Pikachu ♀              Lv 11',
    "        together 3h · holds a King's Rock",
    '        evolves with a Thunder Stone',
  ])
  // Every line fits the 60 columns less the 5 the reply is indented by.
  for (const columns of [40, 60, 80])
    for (const line of formatParty(save, columns).split('\n'))
      expect([columns, line, [...line].length + (line.includes('✨') ? 1 : 0) <= Math.max(columns - 5, 40)]).toEqual([
        columns,
        line,
        true,
      ])
  const box = { ...emptySave(), box: save.party }
  expect(formatBox(box, 1, undefined, 60).split('\n').slice(0, 3)).toEqual([
    'Your PC box (2 / 960):',
    '  #1  Pikachu ♀              Lv 11   (84 xp to Lv 12)',
    "      together 3h · holds a King's Rock",
  ])
})

// A line Markdown takes for a numbered list item (CommonMark: up to three spaces, up to nine digits, `.` or `)`).
const LIST_ITEM = /^ {0,3}\d{1,9}[.)]( |\t|$)/

test("the PC box rows are labelled #1, #10, which Claude Code doesn't render as a Markdown list", () => {
  const box = Array.from({ length: 31 }, (_, i) => ({ ...pikachu, id: `b${i}`, xp: 40 }))
  const save = { ...emptySave(), box }
  for (const columns of [Infinity, 60])
    for (const page of [1, 2]) {
      const lines = formatBox(save, page, undefined, columns).split('\n')
      expect([columns, page, lines.filter(l => LIST_ITEM.test(l))]).toEqual([columns, page, []])
    }
  const lines = formatBox(save).split('\n')
  expect(lines.slice(1, 3)).toEqual(['  #1   Pikachu  Lv 4  (24 xp to Lv 5)', '  #2   Pikachu  Lv 4  (24 xp to Lv 5)'])
  // Every name starts in the same column, #10 and on too.
  expect(new Set(lines.slice(1, 31).map(l => l.indexOf('Pikachu')))).toEqual(new Set([7]))
  expect(lines.at(-1)).toBe('Next page: /pokemon box 2')
})

test('a width that is not a positive number keeps the wide layout; a Type: Null holder reads one way', () => {
  const thunder = { species: 'raichu', way: { kind: 'item', item: 'thunder-stone' } } as const
  const save = {
    ...emptySave(),
    party: [{ ...pikachu, heldItem: 'kings-rock', next: [thunder], togetherMs: 3 * 3_600_000 }],
  }
  for (const columns of [Number.NaN, 0, -10])
    expect([columns, formatParty(save, columns)]).toEqual([columns, formatParty(save)])
  const nulls = { ...emptySave(), party: [{ ...pikachu, species: 'type-null', heldItem: 'kings-rock' }] }
  expect(formatBag(nulls, 0)).toContain("Held        Type: Null holds a King's Rock")
})

test('a Pokémon waiting for /pokemon evolve reads "ready to evolve", with how to evolve it', () => {
  const due = {
    ...pikachu,
    xp: xpForLevel(30),
    next: [{ species: 'raichu', way: { kind: 'level' as const, level: 30 } }],
  }
  const save = { ...emptySave(), party: [due] }
  const ready = formatParty(save, Infinity, [due.id])
  expect(ready).toContain('· ready to evolve')
  expect(ready.endsWith("/pokemon evolve <name> evolves a Pokémon that's ready.")).toBe(true)
  const waiting = formatParty(save)
  expect(waiting).toContain('· evolves at Lv 30')
  expect(waiting).not.toContain('/pokemon evolve')
})

test("the evolution setting and a member's announcement survive a reload; anything else is manual", () => {
  const told = { ...pikachu, isAnnounced: true as const }
  expect(loadSave({ ...emptySave(), evolution: 'auto', party: [told] })).toMatchObject({
    evolution: 'auto',
    party: [told],
  })
  expect(loadSave({ ...emptySave(), evolution: 'sometimes' }).evolution).toBe('manual')
  expect(loadSave({ ...emptySave(), party: [{ ...pikachu, isAnnounced: 'yes' }] }).party[0]).toEqual(pikachu)
})
