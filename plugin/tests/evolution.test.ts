import { expect, test } from 'claude-code/testing'

import {
  dueStages,
  evolvedForm,
  FRIENDSHIP_MS,
  genderOf,
  nextStages,
  pokeapiForm,
  timeMatches,
  wayOf,
} from '../hooks/evolution'
import type { ChainLink, Stage } from '../hooks/evolution'

const link = (name: string, details: ChainLink['evolution_details'], ...evolves_to: ChainLink[]): ChainLink => ({
  species: { name },
  evolution_details: details,
  evolves_to,
})
const lv = (species: string, level: number, extra: Partial<Stage> = {}): Stage => ({
  species,
  ...extra,
  way: { kind: 'level', level },
})
const fallback = (species: string, level: number, extra: Partial<Stage> = {}): Stage => ({
  species,
  ...extra,
  way: { kind: 'level', level, isFallback: true },
})
const charmander = link(
  'charmander',
  [],
  link('charmeleon', [{ min_level: 16 }], link('charizard', [{ min_level: 36 }])),
)
const eevee = link('eevee', [], link('vaporeon', [{}]), link('espeon', [{ min_level: null }]))
const wurmple = link(
  'wurmple',
  [],
  link('silcoon', [{ min_level: 7 }, { min_level: 7 }]),
  link('cascoon', [{ min_level: 7 }]),
)

test('level evolutions happen at the level from the games', () => {
  expect(nextStages(charmander, 'charmander')).toEqual([lv('charmeleon', 16)])
  expect(nextStages(charmander, 'charmeleon')).toEqual([lv('charizard', 36)])
  expect(nextStages(charmander, 'charizard')).toEqual([])
  expect(nextStages(charmander, 'mew')).toEqual([])
})

const named = (name: string) => ({ name })
const realPichu = link(
  'pichu',
  [],
  link(
    'pikachu',
    [{ trigger: named('level-up'), min_happiness: 220 }],
    link('raichu', [{ trigger: named('use-item'), item: named('thunder-stone') }]),
  ),
)

test('each PokeAPI detail becomes the way it works here', () => {
  expect(wayOf({ trigger: named('level-up'), min_level: 16 })).toEqual({ kind: 'level', level: 16 })
  expect(wayOf({ trigger: named('level-up'), min_level: 25, time_of_day: 'night' })).toEqual({
    kind: 'level',
    level: 25,
    time: 'night',
  })
  expect(wayOf({ trigger: named('level-up'), min_level: 32, party_type: named('dark') })).toEqual({
    kind: 'level',
    level: 32,
    partyType: 'dark',
  })
  expect(wayOf({ trigger: named('use-item'), item: named('thunder-stone') })).toEqual({
    kind: 'item',
    item: 'thunder-stone',
  })
  expect(wayOf({ trigger: named('use-item'), item: named('peat-block'), time_of_day: 'full-moon' })).toEqual({
    kind: 'item',
    item: 'peat-block',
    time: 'night',
  })
  // A trade while holding an item is giving that item; a plain trade is the Linking Cord.
  expect(wayOf({ trigger: named('trade'), held_item: named('reaper-cloth') })).toEqual({
    kind: 'item',
    item: 'reaper-cloth',
  })
  expect(wayOf({ trigger: named('trade') })).toEqual({ kind: 'item', item: 'linking-cord' })
  expect(wayOf({ trigger: named('trade'), trade_species: named('shelmet') })).toEqual({
    kind: 'item',
    item: 'linking-cord',
  })
  expect(wayOf({ trigger: named('level-up'), held_item: named('razor-claw'), time_of_day: 'night' })).toEqual({
    kind: 'hold',
    item: 'razor-claw',
    time: 'night',
  })
  expect(wayOf({ trigger: named('spin'), held_item: named('strawberry-sweet'), time_of_day: 'day' })).toEqual({
    kind: 'hold',
    item: 'strawberry-sweet',
    time: 'day',
  })
  expect(wayOf({ trigger: named('level-up'), min_happiness: 160, time_of_day: 'day' })).toEqual({
    kind: 'friendship',
    time: 'day',
  })
  expect(wayOf({ trigger: named('level-up'), party_species: named('remoraid') })).toEqual({
    kind: 'party',
    species: 'remoraid',
  })
  expect(wayOf({ trigger: named('shed') })).toEqual({ kind: 'shed' })
  // Moves, unsold items, places and battles: nothing the plugin can do.
  expect(wayOf({ trigger: named('level-up'), known_move_type: named('fairy'), min_happiness: 160 })).toBeNull()
  expect(wayOf({ trigger: named('level-up'), known_move: named('ancient-power') })).toBeNull()
  expect(wayOf({ trigger: named('use-item'), item: named('syrupy-apple') })).toBeNull()
  expect(wayOf({ trigger: named('spin'), held_item: named('ribbon-sweet') })).toBeNull()
  expect(wayOf({ trigger: named('level-up') })).toBeNull()
  expect(wayOf({ trigger: named('three-critical-hits') })).toBeNull()
})

test('stones and friendship evolve the way the games do', () => {
  expect(nextStages(realPichu, 'pichu')).toEqual([{ species: 'pikachu', way: { kind: 'friendship' } }])
  expect(nextStages(realPichu, 'pikachu')).toEqual([
    { species: 'raichu', way: { kind: 'item', item: 'thunder-stone' } },
  ])
})

test('what the plugin cannot do falls back to a level 10 past the one the species was reached at, at least 30', () => {
  const ice = link(
    'swinub',
    [],
    link(
      'piloswine',
      [{ trigger: named('level-up'), min_level: 33 }],
      link('mamoswine', [{ trigger: named('level-up'), known_move: named('ancient-power') }]),
    ),
  )
  expect(nextStages(ice, 'piloswine')).toEqual([fallback('mamoswine', 43)])
  const mime = link('mime-jr', [], link('mr-mime', [{ trigger: named('level-up'), known_move: named('mimic') }]))
  expect(nextStages(mime, 'mime-jr')).toEqual([fallback('mr-mime', 30)])
})

test('Shedinja comes along with Ninjask; the time of day names Lycanroc', () => {
  const bug = link(
    'nincada',
    [],
    link('ninjask', [{ trigger: named('level-up'), min_level: 20 }]),
    link('shedinja', [{ trigger: named('shed') }]),
  )
  expect(nextStages(bug, 'nincada')).toEqual([lv('ninjask', 20), { species: 'shedinja', way: { kind: 'shed' } }])
  const dog = link(
    'rockruff',
    [],
    link('lycanroc', [
      { trigger: named('level-up'), min_level: 25, time_of_day: 'day' },
      { trigger: named('level-up'), min_level: 25, time_of_day: 'night' },
    ]),
  )
  expect(nextStages(dog, 'rockruff')).toEqual([
    { species: 'lycanroc', form: 'lycanroc-midday', way: { kind: 'level', level: 25, time: 'day' } },
    { species: 'lycanroc', form: 'lycanroc-midnight', way: { kind: 'level', level: 25, time: 'night' } },
  ])
  // As PokeAPI has it: Dusk Lycanroc comes from Own Tempo Rockruff, which the sprites draw as plain Rockruff.
  const tempo = (time: string, from: string, to: string) => ({
    trigger: named('level-up'),
    min_level: 25,
    time_of_day: time,
    required_pokemon_form: named(from),
    evolved_pokemon_form: named(to),
  })
  const realDog = link(
    'rockruff',
    [],
    link('lycanroc', [
      tempo('day', 'rockruff', 'lycanroc-midday'),
      tempo('night', 'rockruff', 'lycanroc-midnight'),
      tempo('dusk', 'rockruff-own-tempo', 'lycanroc-dusk'),
    ]),
  )
  expect(nextStages(realDog, 'rockruff', 'rockruff', null, [])).toEqual([
    { species: 'lycanroc', form: 'lycanroc-midday', way: { kind: 'level', level: 25, time: 'day' } },
    { species: 'lycanroc', form: 'lycanroc-midnight', way: { kind: 'level', level: 25, time: 'night' } },
    { species: 'lycanroc', form: 'lycanroc-dusk', way: { kind: 'level', level: 25, time: 'dusk' } },
  ])
})

test('the same way in several games is one stage, at the lowest level', () => {
  const darumaka = link(
    'darumaka',
    [],
    link('darmanitan', [
      { trigger: named('level-up'), min_level: 35 },
      { trigger: named('level-up'), min_level: 35 },
    ]),
  )
  expect(nextStages(darumaka, 'darumaka')).toEqual([lv('darmanitan', 35)])
})

test("level ways into one species from different games share the lowest level; the time of day's own form wins", () => {
  // Legends: Arceus's Lv 36 for Hisuian Decidueye would never come: Dartrix evolves at 34 first. Both come at 34.
  const dartrix = link(
    'dartrix',
    [],
    link('decidueye', [
      { trigger: named('level-up'), min_level: 34 },
      { trigger: named('level-up'), min_level: 36, evolved_pokemon_form: named('decidueye-hisui') },
    ]),
  )
  expect(nextStages(dartrix, 'dartrix')).toEqual([
    lv('decidueye', 34),
    lv('decidueye', 34, { form: 'decidueye-hisui' }),
  ])
  // Cubone becomes Marowak by day and Alolan Marowak at night, as in Sun and Moon.
  const plain = lv('marowak', 28)
  const alolan = {
    species: 'marowak',
    form: 'marowak-alola',
    way: { kind: 'level', level: 28, time: 'night' },
  } as Stage
  const base = { level: 28, togetherMs: 0, party: [], partyTypes: [] }
  expect(dueStages([plain, alolan], { ...base, phase: 'day' })).toEqual([plain])
  expect(dueStages([plain, alolan], { ...base, phase: 'night' })).toEqual([alolan])
  // Only within one species: Eevee's Sylveon (by level) stays beside Espeon (by friendship, by day).
  const sylveon = lv('sylveon', 30)
  const espeon = { species: 'espeon', way: { kind: 'friendship', time: 'day' } } as Stage
  expect(dueStages([sylveon, espeon], { ...base, level: 30, togetherMs: FRIENDSHIP_MS, phase: 'day' })).toEqual([
    sylveon,
    espeon,
  ])
})

test('what is due: level and time, a held item, friendship time, a party member, never with an Everstone', () => {
  const base = { level: 20, phase: 'day' as const, togetherMs: 0, party: [], partyTypes: [] }
  const night = { species: 'lycanroc', way: { kind: 'level', level: 25, time: 'night' } } as Stage
  expect(dueStages([night], { ...base, level: 25 })).toEqual([])
  expect(dueStages([night], { ...base, level: 25, phase: 'night' })).toEqual([night])
  // Dawn is morning: "day" evolutions happen then too.
  expect(timeMatches('day', 'dawn')).toBe(true)
  expect(timeMatches('dusk', 'night')).toBe(false)
  expect(timeMatches(undefined, 'night')).toBe(true)
  const claw = { species: 'weavile', way: { kind: 'hold', item: 'razor-claw', time: 'night' } } as Stage
  expect(dueStages([claw], { ...base, phase: 'night' })).toEqual([])
  expect(dueStages([claw], { ...base, phase: 'night', heldItem: 'razor-claw' })).toEqual([claw])
  const love = { species: 'crobat', way: { kind: 'friendship' } } as Stage
  expect(dueStages([love], { ...base, togetherMs: FRIENDSHIP_MS - 1 })).toEqual([])
  expect(dueStages([love], { ...base, togetherMs: FRIENDSHIP_MS })).toEqual([love])
  const fish = { species: 'mantine', way: { kind: 'party', species: 'remoraid' } } as Stage
  expect(dueStages([fish], { ...base, party: ['mantyke', 'remoraid'] })).toEqual([fish])
  const panda = { species: 'pangoro', way: { kind: 'level', level: 32, partyType: 'dark' } } as Stage
  expect(dueStages([panda], { ...base, level: 32 })).toEqual([])
  expect(dueStages([panda], { ...base, level: 32, partyTypes: ['normal', 'dark'] })).toEqual([panda])
  // Given items and Shedinja are never due by themselves.
  const stone = { species: 'raichu', way: { kind: 'item', item: 'thunder-stone' } } as Stage
  expect(dueStages([stone, { species: 'shedinja', way: { kind: 'shed' } }], { ...base, level: 100 })).toEqual([])
  expect(dueStages([lv('charmeleon', 16)], { ...base, level: 16, heldItem: 'everstone' })).toEqual([])
})

test('branching evolutions offer every branch with its own level', () => {
  expect(nextStages(eevee, 'eevee')).toEqual([fallback('vaporeon', 30), fallback('espeon', 30)])
  expect(nextStages(wurmple, 'wurmple')).toEqual([lv('silcoon', 7), lv('cascoon', 7)])
})

// Shapes from PokeAPI's real chains: forms named on each way a species is reached.
const form = (name: string) => ({ name })
const meowth = link(
  'meowth',
  [],
  link('persian', [
    { min_level: 28 },
    { min_level: null, required_pokemon_form: form('meowth-alola'), evolved_pokemon_form: form('persian-alola') },
  ]),
  link('perrserker', [{ min_level: 28, required_pokemon_form: form('meowth-galar') }]),
)
const mimeJr = link(
  'mime-jr',
  [],
  link(
    'mr-mime',
    [{ min_level: null }, { min_level: null, evolved_pokemon_form: form('mr-mime-galar') }],
    link('mr-rime', [{ min_level: 42, required_pokemon_form: form('mr-mime-galar') }]),
  ),
)
const slowpoke = link('slowpoke', [], link('slowbro', [{ min_level: 37 }]), link('slowking', [{ min_level: null }]))

test('a regional form evolves only the way its region does', () => {
  expect(nextStages(meowth, 'meowth', 'meowth')).toEqual([lv('persian', 28)])
  expect(nextStages(meowth, 'meowth', 'meowth-galar')).toEqual([lv('perrserker', 28)])
  expect(nextStages(meowth, 'meowth', 'meowth-alola')).toEqual([fallback('persian', 30, { form: 'persian-alola' })])
  // A form with no evolutions of its own (Gigantamax) evolves as the plain species.
  expect(nextStages(meowth, 'meowth', 'meowth-gmax')).toEqual([lv('persian', 28)])
  expect(nextStages(mimeJr, 'mr-mime', 'mr-mime')).toEqual([])
  expect(nextStages(mimeJr, 'mr-mime', 'mr-mime-galar')).toEqual([lv('mr-rime', 42)])
  expect(nextStages(mimeJr, 'mime-jr')).toEqual([
    fallback('mr-mime', 30),
    fallback('mr-mime', 30, { form: 'mr-mime-galar' }),
  ])
})

test("a branch with no way here falls back to its own level, not its sibling's", () => {
  expect(nextStages(slowpoke, 'slowpoke')).toEqual([lv('slowbro', 37), fallback('slowking', 30)])
})

test("the evolved form: the one the games name if it has a sprite, else the member's own if the species has it", () => {
  expect(pokeapiForm('meowth', 'galar')).toBe('meowth-galar')
  expect(pokeapiForm('pikachu', 'regular')).toBe('pikachu')
  const raichu = ['regular', 'alola']
  expect(
    evolvedForm({ species: 'raichu', form: 'raichu-alola', way: { kind: 'level', level: 30 } }, 'regular', raichu),
  ).toBe('alola')
  expect(
    evolvedForm({ species: 'lycanroc', form: 'lycanroc-midday', way: { kind: 'level', level: 25 } }, 'regular', [
      'regular',
      'dusk',
    ]),
  ).toBe('regular')
  expect(evolvedForm(lv('raichu', 30), 'gmax', raichu)).toBe('regular')
  expect(evolvedForm(lv('ninetales', 30), 'alola', ['regular', 'alola'])).toBe('alola')
  const darmanitan = ['regular', 'galar', 'galar-zen', 'zen']
  expect(
    evolvedForm(
      { species: 'darmanitan', form: 'darmanitan-galar-standard', way: { kind: 'level', level: 35 } },
      'galar',
      darmanitan,
    ),
  ).toBe('galar')
})

const burmy = link(
  'burmy',
  [],
  link('wormadam', [
    {
      min_level: 20,
      gender: 1,
      required_pokemon_form: form('burmy-plant'),
      evolved_pokemon_form: form('wormadam-plant'),
    },
    {
      min_level: 20,
      gender: 1,
      required_pokemon_form: form('burmy-sandy'),
      evolved_pokemon_form: form('wormadam-sandy'),
    },
  ]),
  link('mothim', [{ min_level: 20, gender: 2 }]),
)

test('gender: single-gender species always have theirs, others keep theirs or roll by the ratio', () => {
  expect(genderOf(-1, 'female')).toBeNull()
  expect(genderOf(0, 'female')).toBe('male')
  expect(genderOf(8, undefined)).toBe('female')
  expect(genderOf(4, 'male', () => 0)).toBe('male')
  expect(genderOf(1, undefined, () => 0.1)).toBe('female')
  expect(genderOf(1, undefined, () => 0.2)).toBe('male')
  expect(genderOf(undefined, 'male')).toBeNull()
})

test('a gender-only evolution waits for the right gender; a cloak decides only the female line', () => {
  const forms = ['sandy', 'trash']
  expect(nextStages(burmy, 'burmy', 'burmy', 'female', forms)).toEqual([lv('wormadam', 20, { form: 'wormadam-plant' })])
  expect(nextStages(burmy, 'burmy', 'burmy', 'male', forms)).toEqual([lv('mothim', 20)])
  expect(nextStages(burmy, 'burmy', 'burmy-sandy', 'female', forms)).toEqual([
    lv('wormadam', 20, { form: 'wormadam-sandy' }),
  ])
  expect(nextStages(burmy, 'burmy', 'burmy-sandy', 'male', forms)).toEqual([lv('mothim', 20)])
  expect(nextStages(burmy, 'burmy', 'burmy', null, forms)).toEqual([])
})

// Every way out of Scatterbug and Sinistea names a form the sprite list doesn't have; Wooper's Paldean way names one
// too, beside a way of its own.
const scatterbug = link(
  'scatterbug',
  [],
  link('spewpa', [
    { min_level: 9, required_pokemon_form: form('scatterbug-meadow'), evolved_pokemon_form: form('spewpa-meadow') },
    { min_level: 9, required_pokemon_form: form('scatterbug-polar'), evolved_pokemon_form: form('spewpa-polar') },
  ]),
)
const sinistea = link(
  'sinistea',
  [],
  link('polteageist', [
    {
      trigger: form('use-item'),
      item: form('cracked-pot'),
      required_pokemon_form: form('sinistea-phony'),
      evolved_pokemon_form: form('polteageist-phony'),
    },
    {
      trigger: form('use-item'),
      item: form('chipped-pot'),
      required_pokemon_form: form('sinistea-antique'),
      evolved_pokemon_form: form('polteageist-antique'),
    },
  ]),
)
const wooper = link(
  'wooper',
  [],
  link('quagsire', [{ min_level: 20 }]),
  link('clodsire', [{ min_level: 20, required_pokemon_form: form('wooper-paldea') }]),
)

test('a species whose every way names a form the sprites lack evolves by those ways; one with its own keeps it', () => {
  expect(nextStages(scatterbug, 'scatterbug', 'scatterbug', 'male', [])).toEqual([
    lv('spewpa', 9, { form: 'spewpa-meadow' }),
    lv('spewpa', 9, { form: 'spewpa-polar' }),
  ])
  expect(nextStages(sinistea, 'sinistea', 'sinistea', null, [])).toEqual([
    { species: 'polteageist', form: 'polteageist-phony', way: { kind: 'item', item: 'cracked-pot' } },
    { species: 'polteageist', form: 'polteageist-antique', way: { kind: 'item', item: 'chipped-pot' } },
  ])
  expect(nextStages(wooper, 'wooper', 'wooper', 'female', [])).toEqual([lv('quagsire', 20)])
})

test('a link with no way at all is no evolution: PokeAPI ties Phione to Manaphy, which only breeds it', () => {
  const phione: ChainLink = {
    species: { name: 'phione' },
    evolves_to: [{ species: { name: 'manaphy' }, evolves_to: [] }],
  }
  expect(nextStages(phione, 'phione', 'phione', null, [])).toEqual([])
})
