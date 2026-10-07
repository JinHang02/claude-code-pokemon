import { expect, test } from 'claude-code/testing'

import { evolvedForm, genderOf, nextStages, OTHER_EVOLVE_LEVEL, pokeapiForm } from '../hooks/evolution'
import type { ChainLink } from '../hooks/evolution'

const link = (name: string, details: ChainLink['evolution_details'], ...evolves_to: ChainLink[]): ChainLink => ({
  species: { name },
  evolution_details: details,
  evolves_to,
})
const charmander = link(
  'charmander',
  [],
  link('charmeleon', [{ min_level: 16 }], link('charizard', [{ min_level: 36 }])),
)
const pichu = link('pichu', [], link('pikachu', [{ min_level: null }], link('raichu', [{ min_level: null }])))
const eevee = link('eevee', [], link('vaporeon', [{}]), link('espeon', [{ min_level: null }]))
const wurmple = link(
  'wurmple',
  [],
  link('silcoon', [{ min_level: 7 }, { min_level: 7 }]),
  link('cascoon', [{ min_level: 7 }]),
)

test('level evolutions happen at the level from the games', () => {
  expect(nextStages(charmander, 'charmander')).toEqual([{ species: 'charmeleon', level: 16 }])
  expect(nextStages(charmander, 'charmeleon')).toEqual([{ species: 'charizard', level: 36 }])
  expect(nextStages(charmander, 'charizard')).toEqual([])
  expect(nextStages(charmander, 'mew')).toEqual([])
})

test('stones, friendship and other conditions happen at a set level', () => {
  expect(OTHER_EVOLVE_LEVEL).toBe(30)
  expect(nextStages(pichu, 'pichu')).toEqual([{ species: 'pikachu', level: 30 }])
  expect(nextStages(pichu, 'pikachu')).toEqual([{ species: 'raichu', level: 30 }])
})

test('branching evolutions offer every branch with its own level', () => {
  expect(nextStages(eevee, 'eevee')).toEqual([
    { species: 'vaporeon', level: 30 },
    { species: 'espeon', level: 30 },
  ])
  expect(nextStages(wurmple, 'wurmple')).toEqual([
    { species: 'silcoon', level: 7 },
    { species: 'cascoon', level: 7 },
  ])
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
  expect(nextStages(meowth, 'meowth', 'meowth')).toEqual([{ species: 'persian', level: 28 }])
  expect(nextStages(meowth, 'meowth', 'meowth-galar')).toEqual([{ species: 'perrserker', level: 28 }])
  expect(nextStages(meowth, 'meowth', 'meowth-alola')).toEqual([
    { species: 'persian', form: 'persian-alola', level: 30 },
  ])
  // A form with no evolutions of its own (Gigantamax) evolves as the plain species.
  expect(nextStages(meowth, 'meowth', 'meowth-gmax')).toEqual([{ species: 'persian', level: 28 }])
  expect(nextStages(mimeJr, 'mr-mime', 'mr-mime')).toEqual([])
  expect(nextStages(mimeJr, 'mr-mime', 'mr-mime-galar')).toEqual([{ species: 'mr-rime', level: 42 }])
  expect(nextStages(mimeJr, 'mime-jr')).toEqual([
    { species: 'mr-mime', level: 30 },
    { species: 'mr-mime', form: 'mr-mime-galar', level: 30 },
  ])
})

test('a branch with no level evolves alongside its levelled sibling, so neither shuts the other out', () => {
  expect(nextStages(slowpoke, 'slowpoke')).toEqual([
    { species: 'slowbro', level: 37 },
    { species: 'slowking', level: 37 },
  ])
})

test("the evolved form: the one the games name if it has a sprite, else the member's own if the species has it", () => {
  expect(pokeapiForm('meowth', 'galar')).toBe('meowth-galar')
  expect(pokeapiForm('pikachu', 'regular')).toBe('pikachu')
  const raichu = ['regular', 'alola']
  expect(evolvedForm({ species: 'raichu', level: 30, form: 'raichu-alola' }, 'regular', raichu)).toBe('alola')
  expect(evolvedForm({ species: 'lycanroc', level: 25, form: 'lycanroc-midday' }, 'regular', ['regular', 'dusk'])).toBe(
    'regular',
  )
  expect(evolvedForm({ species: 'raichu', level: 30 }, 'gmax', raichu)).toBe('regular')
  expect(evolvedForm({ species: 'ninetales', level: 30 }, 'alola', ['regular', 'alola'])).toBe('alola')
  const darmanitan = ['regular', 'galar', 'galar-zen', 'zen']
  expect(
    evolvedForm({ species: 'darmanitan', level: 35, form: 'darmanitan-galar-standard' }, 'galar', darmanitan),
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
  expect(nextStages(burmy, 'burmy', 'burmy', 'female', forms)).toEqual([
    { species: 'wormadam', form: 'wormadam-plant', level: 20 },
  ])
  expect(nextStages(burmy, 'burmy', 'burmy', 'male', forms)).toEqual([{ species: 'mothim', level: 20 }])
  expect(nextStages(burmy, 'burmy', 'burmy-sandy', 'female', forms)).toEqual([
    { species: 'wormadam', form: 'wormadam-sandy', level: 20 },
  ])
  expect(nextStages(burmy, 'burmy', 'burmy-sandy', 'male', forms)).toEqual([{ species: 'mothim', level: 20 }])
  expect(nextStages(burmy, 'burmy', 'burmy', null, forms)).toEqual([])
})
