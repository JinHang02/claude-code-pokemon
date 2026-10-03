import { expect, test } from 'claude-code/testing'

import { lookup, randomPick, slug, spell } from '../hooks/lookup'

const LIST = [
  { name: 'charizard', forms: ['regular', 'gmax', 'mega-x', 'mega-y'] },
  { name: 'vulpix', forms: ['regular', 'alola'] },
  { name: 'mr-mime', forms: ['regular', 'galar'] },
  { name: 'tauros', forms: ['regular'] },
  { name: 'meganium', forms: ['regular'] },
  { name: 'yanma', forms: ['regular'] },
]

test('an exact spelling picks the Pokémon, forms in any word order', () => {
  expect(lookup(LIST, ['charizard'])).toEqual({ pick: { dex: 0, species: 'charizard', form: 'regular' } })
  expect(lookup(LIST, ['charizard', 'mega', 'y'])).toMatchObject({ pick: { form: 'mega-y' } })
  expect(lookup(LIST, ['mega', 'charizard', 'x'])).toMatchObject({ pick: { form: 'mega-x' } })
  expect(lookup(LIST, ['gmax', 'charizard'])).toMatchObject({ pick: { form: 'gmax' } })
  expect(lookup(LIST, ['alolan', 'vulpix'])).toMatchObject({ pick: { species: 'vulpix', form: 'alola' } })
  expect(lookup(LIST, ['galar', 'mr', 'mime'])).toMatchObject({ pick: { species: 'mr-mime', form: 'galar' } })
})

test('a typo, a partial name or an unfinished form only earns a guess', () => {
  expect(lookup(LIST, ['charized'])).toEqual({ guess: { dex: 0, species: 'charizard', form: 'regular' } })
  expect(lookup(LIST, ['chari'])).toMatchObject({ guess: { species: 'charizard' } })
  expect(lookup(LIST, ['mega', 'charizard'])).toMatchObject({ guess: { species: 'charizard', form: 'mega-x' } })
  expect(lookup(LIST, ['charizard', 'y'])).toMatchObject({ guess: { form: 'mega-y' } })
  expect(lookup(LIST, ['gigantamax', 'charizard'])).toMatchObject({ pick: { form: 'gmax' } })
  expect(lookup(LIST, ['charized', 'mega', 'y'])).toMatchObject({ guess: { species: 'charizard', form: 'mega-y' } })
  expect(lookup(LIST, ['charized', 'mga', 'y'])).toMatchObject({ guess: { species: 'charizard', form: 'mega-y' } })
  expect(lookup(LIST, ['alolan', 'vulpx'])).toMatchObject({ guess: { species: 'vulpix', form: 'alola' } })
  expect(lookup(LIST, ['mega'])).toMatchObject({ guess: { species: 'meganium' } })
})

test("something that isn't a Pokémon, or a form it doesn't have, says so", () => {
  expect(lookup(LIST, ['alola', 'charizard'])).toEqual({
    error: 'Charizard has no "alola" form. Try: gmax, mega-x, mega-y.',
  })
  expect(lookup(LIST, ['mega', 'tauros'])).toEqual({ error: 'Tauros has no other forms.' })
  expect(lookup(LIST, ['agumon'])).toEqual({ error: 'No Pokémon called "agumon".' })
  expect(lookup(LIST, ['y'])).toEqual({ error: 'No Pokémon called "y".' })
})

test('spells a pick back as the words that select it', () => {
  expect(spell({ dex: 0, species: 'charizard', form: 'mega-x' })).toBe('charizard mega x')
  expect(spell({ dex: 2, species: 'mr-mime', form: 'regular' })).toBe('mr mime')
})

test('slugs names the way the sprite set spells them', () => {
  expect(slug('Mr. Mime')).toBe('mr-mime')
  expect(slug("  Farfetch'd ")).toBe('farfetchd')
  expect(slug('Flabébé')).toBe('flabebe')
  expect(slug('Nidoran♀')).toBe('nidoran-f')
  expect(slug('Nidoran ♂')).toBe('nidoran-m')
  expect(slug('✨!!')).toBe('')
})

test('random picks are usually the regular form, sometimes another', () => {
  const list = [{ name: 'vulpix', forms: ['regular', 'alola'] }]
  expect(randomPick(list, () => 0.5)).toEqual({ dex: 0, species: 'vulpix', form: 'regular' })
  expect(randomPick(list, () => 0.01)).toEqual({ dex: 0, species: 'vulpix', form: 'alola' })
})
