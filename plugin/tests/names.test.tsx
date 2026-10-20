// Names and the commands that take one: who a name picks, what each answer says, and that nobody is lost on the way.
import { expect, test } from 'claude-code/testing'

import { emptySave, xpForLevel } from '../hooks/save'
import type { Save } from '../hooks/save'
import { ART, begin, cmd, LIST, member } from './world'

const NUMBERED = [...LIST, { name: 'zygarde', forms: ['regular', '10', 'complete'] }]
const numbered = { isOnline: true, list: JSON.stringify(NUMBERED) }
const where = (s: Save) => [s.party.map(m => `${m.id}:${m.heldItem ?? '-'}`), (s.box ?? []).map(m => m.id)]
// The command a list's hint says to type, with `n` for its number.
const hintOf = (text: string, n: number) => {
  const hint = /\nAdd the number: \/pokemon (.*) \d+$/.exec(text)?.[1]
  expect(hint).toBeDefined()
  return `${hint} ${n}`
}
test('a name you own none of: the new one leads, and the old lead goes into the PC box with its level and item', async ($, on) => {
  const w = await begin($, on, {
    ...emptySave(),
    party: [member('pikachu', { id: 'p', xp: xpForLevel(12), heldItem: 'lucky-egg' }), member('eevee', { id: 'e' })],
  })
  expect((await cmd($, 'pokemon', 'charmander')).replace(/^✨ /, '')).toBe(
    "A wild Charmander appeared! It's your new lead. Pikachu (Lv 12) went into the PC box.",
  )
  const s = w.saveNow()
  expect(s.party.map(m => m.species)).toEqual(['charmander', 'eevee'])
  expect(s.box?.map(m => [m.id, m.xp, m.heldItem])).toEqual([['p', xpForLevel(12), 'lucky-egg']])
  expect(s.bag).toBeUndefined()
  // A random one too: nobody goes back to the wild.
  expect(await cmd($, 'pokemon', '')).toMatch(/It's your new lead\. (✨ )?Charmander \(Lv 1\) went into the PC box\.$/)
  expect(w.saveNow().box?.map(m => m.species)).toEqual(['pikachu', 'charmander'])
  expect(w.saveNow().party.length).toBe(2)
})

test('a full party: add catches no one and sends no one away', async ($, on) => {
  const w = await begin($, on, {
    ...emptySave(),
    party: [member('pikachu', { id: 'p' }), member('eevee', { id: 'e' }), member('raichu', { id: 'r' })],
    box: [member('charmander', { id: 'c' })],
  })
  const before = JSON.stringify(where(w.saveNow()))
  expect(await cmd($, 'pokemon', 'add mewtwo')).toContain('Your party is full (3)')
  expect(await cmd($, 'pokemon', 'add charmander')).toContain('Your party is full (3)')
  expect(await cmd($, 'pokemon', 'add')).toContain('Your party is full (3)')
  expect(JSON.stringify(where(w.saveNow()))).toBe(before)
})

test('add right after another session made room: it sees the room at once', async ($, on) => {
  const w = await begin($, on, {
    ...emptySave(),
    party: [member('pikachu', { id: 'p' }), member('eevee', { id: 'e1' }), member('eevee', { id: 'e2' })],
    box: [member('charmander', { id: 'c' })],
  })
  await cmd($, 'pokemon', 'party')
  // Another session releases one Eevee.
  w.store.set('save', { ...w.saveNow(), party: w.saveNow().party.filter(m => m.id !== 'e2') })
  expect(await cmd($, 'pokemon', 'add charmander')).toBe('Charmander came out of the PC box and joined your party!')
  expect(where(w.saveNow())).toEqual([['p:-', 'e1:-', 'c:-'], []])
})

test('`shiny` after a number: the list is of shiny ones, and its hint, typed back, picks its line', async ($, on) => {
  const w = await begin($, on, {
    ...emptySave(),
    party: [
      member('pikachu', { id: 'p' }),
      member('eevee', { id: 's1', isShiny: true }),
      member('eevee', { id: 'p1' }),
    ],
    box: [member('eevee', { id: 's2', isShiny: true })],
  })
  const list = await cmd($, 'pokemon', 'release eevee 3 shiny')
  expect(list).toBe(
    'Which Eevee?\n  1. ✨ Eevee Lv 1 (party)\n  2. ✨ Eevee Lv 1 (PC box)\nAdd the number: /pokemon release shiny eevee 2',
  )
  expect(await cmd($, 'pokemon', hintOf(list, 2))).toBe('Bye bye, ✨ Eevee (Lv 1, PC box)! It went back to the wild.')
  expect(where(w.saveNow())).toEqual([['p:-', 's1:-', 'p1:-'], []])
})

test('a number below 1 with `shiny` after it lists them and releases no one', async ($, on) => {
  const w = await begin($, on, {
    ...emptySave(),
    party: [
      member('pikachu', { id: 'p' }),
      member('eevee', { id: 's1', isShiny: true }),
      member('eevee', { id: 's2', isShiny: true }),
    ],
  })
  for (const query of ['eevee -1 shiny', 'eevee 0 shiny', 'shiny eevee -1', 'eevee shiny -2'])
    expect([query, await cmd($, 'pokemon', `release ${query}`)]).toEqual([
      query,
      'Which Eevee?\n  1. ✨ Eevee Lv 1 (party)\n  2. ✨ Eevee Lv 1 (party)\nAdd the number: /pokemon release shiny eevee 2',
    ])
  expect(where(w.saveNow())).toEqual([['p:-', 's1:-', 's2:-'], []])
})

test('take lists the party and the PC box with one numbering; every one is reachable by its number', async ($, on) => {
  const w = await begin($, on, {
    ...emptySave(),
    party: [member('pikachu', { id: 'p' }), member('eevee', { id: 'e0', heldItem: 'everstone' })],
    box: [member('eevee', { id: 'b1', heldItem: 'soothe-bell' }), member('eevee', { id: 'b2', heldItem: 'lucky-egg' })],
  })
  const held = () => [
    w.saveNow().party.map(m => m.heldItem ?? '-'),
    (w.saveNow().box ?? []).map(m => m.heldItem ?? '-'),
  ]
  const list = await cmd($, 'pokemon', 'take eevee')
  expect(list).toBe(
    'Which Eevee?\n  1. Eevee Lv 1 holding Everstone (party)\n  2. Eevee Lv 1 holding Soothe Bell (PC box)\n  3. Eevee Lv 1 holding Lucky Egg (PC box)\nAdd the number: /pokemon take eevee 3',
  )
  expect(await cmd($, 'pokemon', 'take eevee 4')).toBe(list)
  expect(await cmd($, 'pokemon', hintOf(list, 2))).toBe("Eevee's Soothe Bell went back to your Bag.")
  expect(held()).toEqual([
    ['-', 'everstone'],
    ['-', 'lucky-egg'],
  ])
  // The one holding something, when just one is: no list needed.
  expect(await cmd($, 'pokemon', 'take eevee')).toContain('Which Eevee?')
  expect(await cmd($, 'pokemon', 'take eevee 1')).toBe('Eevee dropped its everstone and can evolve again.')
  expect(await cmd($, 'pokemon', 'take eevee')).toBe("Eevee's Lucky Egg went back to your Bag.")
  expect(held()).toEqual([
    ['-', '-'],
    ['-', '-'],
  ])
  expect(w.saveNow().bag).toEqual({ 'soothe-bell': 1, 'lucky-egg': 1 })
})

test('give and take with a number past the end answer with the list, even of one', async ($, on) => {
  await begin($, on, {
    ...emptySave(),
    party: [member('pikachu'), member('eevee', { heldItem: 'lucky-egg' })],
    box: [member('eevee')],
    bag: { 'water-stone': 1 },
  })
  expect(await cmd($, 'pokemon', 'give water stone eevee 2')).toBe(
    'Which Eevee?\n  1. Eevee Lv 1 holding Lucky Egg (party)\nAdd the number: /pokemon give water-stone eevee 1',
  )
  expect(await cmd($, 'pokemon', 'take eevee 3')).toBe(
    'Which Eevee?\n  1. Eevee Lv 1 holding Lucky Egg (party)\n  2. Eevee Lv 1 (PC box)\nAdd the number: /pokemon take eevee 2',
  )
  expect(await cmd($, 'pokemon', 'deposit eevee 2')).toBe(
    'Which Eevee?\n  1. Eevee Lv 1 holding Lucky Egg (party)\nAdd the number: /pokemon deposit eevee 1',
  )
})

test('zygarde 10 with two plain Zygarde owned is the 10% form; their own numbers still pick them', async ($, on) => {
  const w = await begin(
    $,
    on,
    {
      ...emptySave(),
      party: [member('pikachu', { id: 'p' })],
      box: [member('zygarde', { id: 'z1' }), member('zygarde', { id: 'z2' })],
    },
    undefined,
    undefined,
    numbered,
  )
  const list = await cmd($, 'pokemon', 'release zygarde 3')
  expect(list).toBe(
    'Which Zygarde?\n  1. Zygarde Lv 1 (PC box)\n  2. Zygarde Lv 1 (PC box)\nAdd the number: /pokemon release zygarde 2',
  )
  expect(await cmd($, 'pokemon', 'release zygarde 10')).toMatch(/^No zygarde 10 in your party or PC box\./)
  expect((await cmd($, 'pokemon', 'zygarde 10')).replace(/^✨ /, '')).toBe(
    "A wild Zygarde (10) appeared! It's your new lead. Pikachu (Lv 1) went into the PC box.",
  )
  expect((await cmd($, 'pokemon', hintOf(list, 2).replace(/^release /, ''))).replace(' ✨ ', ' ')).toBe(
    'Zygarde (Lv 1) came out of the PC box to lead your party. Zygarde (10) (Lv 1) went into the PC box.',
  )
  expect(w.saveNow().party.map(m => m.id)).toEqual(['z2'])
  expect(w.saveNow().box?.map(m => `${m.species}:${m.form}`)).toEqual([
    'zygarde:regular',
    'pikachu:regular',
    'zygarde:10',
  ])
})

test('"Did you mean" names only someone it then finds: a form only in the PC box, never a shiny you lack', async ($, on) => {
  const w = await begin($, on, {
    ...emptySave(),
    party: [member('pikachu', { id: 'p' }), member('eevee', { id: 'e' })],
    box: [member('rattata', { id: 'r', form: 'alola' })],
  })
  const guess = await cmd($, 'pokemon', 'release ratata')
  expect(guess).toBe('Did you mean Rattata (Alola)? Run /pokemon release rattata alola')
  expect(await cmd($, 'pokemon', 'take ratata')).toBe('Did you mean Rattata (Alola)? Run /pokemon take rattata alola')
  expect(await cmd($, 'pokemon', 'release shiny eevve')).toMatch(/^No shiny Eevee in your party or PC box\./)
  expect(await cmd($, 'pokemon', 'release shiny eevee')).toMatch(/^No shiny eevee in your party or PC box\./)
  expect(await cmd($, 'pokemon', guess.replace(/^.*Run \/pokemon /, ''))).toBe(
    'Bye bye, Rattata (Alola) (Lv 1, PC box)! It went back to the wild.',
  )
  expect(where(w.saveNow())).toEqual([['p:-', 'e:-'], []])
})

// `/pokemon shiny eevee` with none of it shiny: one rule for no, one or two plain ones, in the party or the box.
const plainOnes: [string, Save][] = [
  ['none', { ...emptySave(), party: [member('pikachu', { id: 'p' })] }],
  ['one in the box', { ...emptySave(), party: [member('pikachu', { id: 'p' })], box: [member('eevee', { id: 'e1' })] }],
  ['one in the party', { ...emptySave(), party: [member('pikachu', { id: 'p' }), member('eevee', { id: 'e1' })] }],
  [
    'two',
    {
      ...emptySave(),
      party: [member('pikachu', { id: 'p' }), member('eevee', { id: 'e1' })],
      box: [member('eevee', { id: 'e2' })],
    },
  ],
]
for (const [owned, saved] of plainOnes)
  test(`/pokemon shiny eevee with ${owned} plain: a new shiny one leads, the old lead into the box`, async ($, on) => {
    const w = await begin($, on, saved)
    const ids = [...saved.party, ...(saved.box ?? [])].map(m => m.id)
    expect(await cmd($, 'pokemon', 'shiny eevee')).toBe(
      "✨ A wild Eevee appeared! It's your new lead. Pikachu (Lv 1) went into the PC box.",
    )
    const s = w.saveNow()
    expect(s.party[0]?.isShiny).toBe(true)
    expect(
      [...s.party, ...(s.box ?? [])]
        .map(m => m.id)
        .filter(id => ids.includes(id))
        .sort(),
    ).toEqual(ids.sort())
  })

test('each answer names which one: ✨ and gender in goodbyes, deposits, leads and comings-out', async ($, on) => {
  const w = await begin($, on, {
    ...emptySave(),
    party: [
      member('pikachu', { id: 'p', gender: 'female' }),
      member('eevee', { id: 'g', gender: 'female' }),
      member('eevee', { id: 'b', gender: 'male', isShiny: true, xp: xpForLevel(16) }),
    ],
  })
  expect(await cmd($, 'pokemon', 'eevee 2')).toBe('✨ Eevee ♂ leads the party again (Lv 16).')
  expect(await cmd($, 'pokemon', 'deposit eevee 1')).toBe('✨ Eevee ♂ (Lv 16) went into the PC box.')
  expect(await cmd($, 'pokemon', 'shiny eevee')).toBe(
    '✨ Eevee ♂ (Lv 16) came out of the PC box to lead your party. Pikachu ♀ (Lv 1) went into the PC box.',
  )
  expect(await cmd($, 'pokemon', 'deposit shiny eevee')).toBe('✨ Eevee ♂ (Lv 16) went into the PC box.')
  expect(await cmd($, 'pokemon', 'add shiny eevee')).toBe('✨ Eevee ♂ came out of the PC box and joined your party!')
  expect(await cmd($, 'pokemon', 'deposit shiny eevee')).toBe('✨ Eevee ♂ (Lv 16) went into the PC box.')
  expect(await cmd($, 'pokemon', 'release shiny eevee')).toBe(
    'Bye bye, ✨ Eevee ♂ (Lv 16, PC box)! It went back to the wild.',
  )
  expect(await cmd($, 'pokemon', 'pikachu')).toBe(
    'Pikachu ♀ (Lv 1) came out of the PC box to lead your party. Eevee ♀ (Lv 1) went into the PC box.',
  )
  expect(await cmd($, 'pokemon', 'release eevee')).toBe('Bye bye, Eevee ♀ (Lv 1, PC box)! It went back to the wild.')
  expect(where(w.saveNow())).toEqual([['p:-'], []])
})

test('a full Bag says the same in every command: release, give, take and buy', async ($, on) => {
  const w = await begin($, on, {
    ...emptySave(),
    party: [member('pikachu', { heldItem: 'fire-stone' }), member('eevee', { heldItem: 'lucky-egg' })],
    bag: { 'fire-stone': 999, 'lucky-egg': 999, 'soothe-bell': 1 },
  })
  const full = (name: string) => `Your Bag can't hold another ${name} (999 already).`
  expect(await cmd($, 'pokemon', 'release eevee')).toBe(full('Lucky Egg'))
  expect(await cmd($, 'pokemon', 'take pikachu')).toBe(full('Fire Stone'))
  expect(await cmd($, 'pokemon', 'give soothe bell eevee')).toBe(full('Lucky Egg'))
  expect(await cmd($, 'pokemon', 'buy fire stone')).toBe(full('Fire Stone'))
  expect(w.saveNow().bag).toEqual({ 'fire-stone': 999, 'lucky-egg': 999, 'soothe-bell': 1 })
  expect(await cmd($, 'pokemon', 'buy thunder stone 3')).toMatch(/^Not enough ₽: ₽[\d,]+ more to go\.$/)
})

// Only a form's name (`zygarde 10`) needs the species list: with none cached and a network that hangs, a name
// command waits for it a moment, then reads the name without it.
test('a name command never waits long for a species list that hangs: it answers within about 2 seconds', async ($, on) => {
  const sprites = '/home/ash/.cache/claude-code-pokemon/sprites/regular'
  const files = new Map([
    [`${sprites}/pikachu`, ART],
    [`${sprites}/charmander`, ART],
  ])
  const w = await begin(
    $,
    on,
    {
      ...emptySave(),
      party: [member('pikachu', { next: [], gender: null }), member('charmander', { next: [], gender: null })],
      box: [member('eevee'), member('eevee', { isShiny: true })],
    },
    ART,
    files,
    { isOnline: true, list: JSON.stringify(LIST), stall: new Promise(() => {}) },
  )
  const timed = async (args: string) => {
    let said: string | null = null
    void cmd($, 'pokemon', args).then(text => (said = text))
    await w.clock.advance(2100)
    return said
  }
  expect(await timed('release shiny eevee')).toBe('Bye bye, ✨ Eevee (Lv 1, PC box)! It went back to the wild.')
  // Each command waits afresh, never for the stalled download's whole 20 seconds.
  expect(await timed('deposit charmander')).toBe('Charmander (Lv 1) went into the PC box.')
  expect(await timed('take eevee')).toBe("Eevee isn't holding anything.")
})

test('give with a number below 1 or not whole answers with the list, spends nothing, and echoes what was typed', async ($, on) => {
  const w = await begin($, on, {
    ...emptySave(),
    party: [member('pikachu', { id: 'p' }), member('eevee', { id: 'e1' }), member('eevee', { id: 'e2' })],
    bag: { 'rare-candy': 2, 'fire-stone': 1 },
  })
  for (const n of ['-1', '0', '1.5', '+1', '-2'])
    expect([n, await cmd($, 'pokemon', `give rare candy eevee ${n}`)]).toEqual([
      n,
      expect.stringMatching(/^Which Eevee\?/),
    ])
  expect(w.saveNow().bag).toEqual({ 'rare-candy': 2, 'fire-stone': 1 })
  expect(w.saveNow().party.map(m => m.xp)).toEqual([0, 0, 0])
  expect(await cmd($, 'pokemon', 'give fire stone 1.5')).toMatch(/^No 1\.5 in your party\./)
  expect(await cmd($, 'pokemon', 'give fire stone -1')).toMatch(/^No -1 in your party\./)
  // A hint for a misspelt item keeps the sign, so typing it back still lists.
  expect(await cmd($, 'pokemon', 'give rare cndy eevee -1')).toBe(
    'Did you mean Rare Candy? Run /pokemon give rare-candy eevee -1',
  )
  expect(await cmd($, 'pokemon', 'give rare candy eevee 2')).toBe('Eevee grew to Lv 2!')
  expect(w.saveNow().party.map(m => m.id === 'e2' && m.xp > 0)).toEqual([false, false, true])
})

test('a fraction is not a pick: release eevee 1.5 with fifteen Eevee lists them', async ($, on) => {
  const w = await begin($, on, {
    ...emptySave(),
    party: [member('pikachu', { id: 'p' })],
    box: Array.from({ length: 15 }, (_, i) => member('eevee', { id: `e${i + 1}` })),
  })
  for (const n of ['1.5', '1,5', '15.0'])
    expect([n, await cmd($, 'pokemon', `release eevee ${n}`)]).toEqual([n, expect.stringMatching(/^Which Eevee\?/)])
  expect(w.saveNow().box?.length).toBe(15)
  expect(await cmd($, 'pokemon', '-1')).toBe('No Pokémon called "-1".')
  expect(await cmd($, 'pokemon', 'add 1.5')).toBe('No Pokémon called "1.5".')
})

test('a level narrows a name in every command, and a level none of yours is at never catches a new one', async ($, on) => {
  const w = await begin($, on, {
    ...emptySave(),
    party: [member('pikachu', { id: 'p' })],
    box: Array.from({ length: 25 }, (_, i) =>
      member('eevee', { id: `e${i}`, xp: xpForLevel((i % 5) + 1), isShiny: i >= 20 }),
    ),
  })
  const list = await cmd($, 'pokemon', 'release eevee')
  expect(list.split('\n').slice(-2)).toEqual([
    '  … and 15 more. Fewer: /pokemon release shiny eevee · /pokemon release eevee lv 1',
    'Add the number: /pokemon release eevee 25',
  ])
  expect(list.split('\n').length).toBe(13)
  expect(await cmd($, 'pokemon', 'release eevee lv 3')).toBe(
    [
      'Which Eevee?',
      '  1. Eevee Lv 3 (PC box)',
      '  2. Eevee Lv 3 (PC box)',
      '  3. Eevee Lv 3 (PC box)',
      '  4. Eevee Lv 3 (PC box)',
      '  5. ✨ Eevee Lv 3 (PC box)',
      'Add the number: /pokemon release eevee lv 3 5',
    ].join('\n'),
  )
  expect(await cmd($, 'pokemon', 'release shiny eevee lv 4')).toBe(
    'Bye bye, ✨ Eevee (Lv 4, PC box)! It went back to the wild.',
  )
  expect(await cmd($, 'pokemon', 'release eevee lv 3 5')).toBe(
    'Bye bye, ✨ Eevee (Lv 3, PC box)! It went back to the wild.',
  )
  expect(w.saveNow().box?.map(m => m.id)).not.toContain('e22')
  expect(await cmd($, 'pokemon', 'eevee lv 99')).toMatch(/^No eevee lv 99 in your party or PC box\./)
  expect(await cmd($, 'pokemon', 'add eevee lv 99')).toBe('No eevee lv 99 in your PC box.')
  expect(where(w.saveNow())[0]).toEqual(['p:-'])
  expect(await cmd($, 'pokemon', 'add eevee lv 2 1')).toBe('Eevee came out of the PC box and joined your party!')
  expect(w.saveNow().party.map(m => m.id)).toEqual(['p', 'e1'])
  expect(w.saveNow().box?.length).toBe(22)
})

test('/pokemon box shows 30 to a page, says which page, and how to see the next; a name narrows it', async ($, on) => {
  const kinds = ['caterpie', 'eevee', 'pikachu']
  const box = Array.from({ length: 75 }, (_, i) =>
    member(kinds[i % 3] ?? 'caterpie', { id: `b${i + 1}`, isShiny: i === 4 || i === 70, next: [] }),
  )
  box.push(member('porygon2', { id: 'p2', next: [] }))
  const list = JSON.stringify([
    ...LIST,
    { name: 'porygon', forms: ['regular'] },
    { name: 'porygon2', forms: ['regular'] },
  ])
  await begin($, on, { ...emptySave(), party: [member('raichu', { next: [] })], box }, undefined, undefined, {
    isOnline: true,
    list,
  })
  const rows = (text: string) => text.split('\n').filter(l => /^ {2}\d+\. /.test(l))
  const numbers = (text: string) => rows(text).map(l => Number(/\d+/.exec(l)?.[0]))
  const first = await cmd($, 'pokemon', 'box')
  expect(first.split('\n')[0]).toBe('Your PC box (76 / 960) · page 1 of 3:')
  expect(numbers(first)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1))
  expect(first.split('\n').at(-1)).toBe('Next page: /pokemon box 2')
  const last = await cmd($, 'pokemon', 'box 3')
  expect(last.split('\n')[0]).toBe('Your PC box (76 / 960) · page 3 of 3:')
  expect(numbers(last)).toEqual(Array.from({ length: 16 }, (_, i) => i + 61))
  expect(last.split('\n').at(-1)).toMatch(/^ {2}76\. /)
  for (const page of ['4', '0', '-1', '1.5', '+2'])
    expect([page, await cmd($, 'pokemon', `box ${page}`)]).toEqual([
      page,
      `There's no page ${page}: pages go from 1 to 3.`,
    ])
  // A name: only those, each with its place in the box, paged the same way.
  const eevees = await cmd($, 'pokemon', 'box eevee')
  expect(eevees.split('\n')[0]).toBe('Eevee in your PC box (25 of 76):')
  expect(numbers(eevees)).toEqual(Array.from({ length: 25 }, (_, i) => 3 * i + 2))
  expect(eevees.split('\n').at(-1)).toMatch(/^ {2}74\. /)
  const shiny = await cmd($, 'pokemon', 'box shiny')
  expect(shiny.split('\n')[0]).toBe('Shiny ones in your PC box (2 of 76):')
  expect(numbers(shiny)).toEqual([5, 71])
  expect(numbers(await cmd($, 'pokemon', 'box shiny eevee'))).toEqual([5, 71])
  expect(await cmd($, 'pokemon', 'box shiny pikachu')).toBe('No shiny pikachu in your PC box.')
  expect(await cmd($, 'pokemon', 'box eevee 2')).toBe("There's no page 2: it all fits on one.")
  expect(await cmd($, 'pokemon', 'box eeve')).toBe('Did you mean Eevee? Run /pokemon box eevee')
  expect(await cmd($, 'pokemon', 'box mewtwo')).toBe('No mewtwo in your PC box.')
  // `porygon 2` is Porygon2 when no Porygon is there to have a page 2.
  expect(numbers(await cmd($, 'pokemon', 'box porygon 2'))).toEqual([76])
})
