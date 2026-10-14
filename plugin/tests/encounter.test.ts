import { expect, test } from 'claude-code/testing'

import { SPECIES } from '../hooks/species-data'
import { LIST } from './fixtures/evolutions'

test('the species table covers every species and form in the sprite list', () => {
  for (const { name, forms } of LIST) {
    const info = SPECIES[name]
    expect(info, name).toBeDefined()
    for (const f of forms.filter(f => f !== 'regular')) expect(info?.forms[f], `${name} ${f}`).toBeDefined()
  }
})

test('no Mega, Gigantamax, Primal or costume form is wild', () => {
  const wild = (n: string, f: string) => SPECIES[n]?.forms[f]?.isWild
  expect(wild('charizard', 'mega-x')).toBe(false)
  expect(wild('charizard', 'gmax')).toBe(false)
  expect(wild('groudon', 'primal')).toBe(false)
  expect(wild('darmanitan', 'galar-zen')).toBe(false)
  expect(wild('pikachu', 'starter')).toBe(false)
  expect(wild('necrozma', 'dusk')).toBe(false)
  expect(wild('lycanroc', 'dusk')).toBe(true)
  expect(wild('vulpix', 'alola')).toBe(true)
  expect(SPECIES.vulpix?.forms.alola?.types).toEqual(['ice'])
  expect(SPECIES.darmanitan?.forms.galar).toEqual({ types: ['ice'], isWild: true })
  expect(wild('castform', 'rainy')).toBe(false)
  expect(wild('meloetta', 'pirouette')).toBe(false)
})

test('tiers, babies and stages', () => {
  expect(SPECIES.mewtwo?.tier).toBe('legendary')
  expect(SPECIES.mew?.tier).toBe('mythical')
  expect(SPECIES.nihilego?.tier).toBe('ultra-beast')
  expect(SPECIES.pidgey).toMatchObject({ tier: 'common', rate: 255, stage: 1, isBaby: false })
  expect(SPECIES.pichu).toMatchObject({ isBaby: true })
  expect(SPECIES.pikachu?.stage).toBe(1)
  expect(SPECIES.raichu?.stage).toBe(2)
  expect(SPECIES.charizard?.stage).toBe(3)
})
