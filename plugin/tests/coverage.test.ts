import { expect, test } from 'claude-code/testing'

import { nextStages, pokeapiForm } from '../hooks/evolution'
import type { ChainLink, Stage } from '../hooks/evolution'
import { isForSale, itemById } from '../hooks/items'
import { LIST } from './fixtures/evolutions'
import { chainFor, evolutionPaths } from './paths'

const PATHS = evolutionPaths()
const LISTED = new Set(LIST.map(s => s.name))
const path = (from: string, to: string, fromForm = 'regular', toForm?: string) =>
  PATHS.find(p => p.from === from && p.to === to && p.fromForm === fromForm && (!toForm || p.toForm === toForm))

test('every evolution between two plugin species has a rule the plugin can carry out', () => {
  expect(PATHS.length).toBeGreaterThan(450)
  for (const p of PATHS) {
    const w = p.stage.way
    if (w.kind === 'item' || w.kind === 'hold') expect(isForSale(itemById(w.item))).toBe(true)
  }
  // Every listed child of a listed species is reached some way, from some form. A child PokeAPI gives no way at all
  // isn't an evolution (Phione → Manaphy: only breeding links them).
  const walk = (link: ChainLink) => {
    for (const child of link.evolves_to) {
      if (LISTED.has(link.species.name) && LISTED.has(child.species.name) && child.evolution_details?.length)
        expect(PATHS.some(p => p.from === link.species.name && p.to === child.species.name)).toBe(true)
      walk(child)
    }
  }
  for (const name of new Set(LIST.map(s => s.name))) {
    const chain = chainFor(name)
    if (chain?.species.name === name) walk(chain)
  }
})

test('no Pokémon evolves twice in a row: a level way is always above the level its species is reached at', () => {
  for (const p of PATHS) {
    if (p.stage.way.kind !== 'level') continue
    const into = PATHS.filter(q => q.to === p.from && q.stage.way.kind === 'level')
    for (const q of into) if (q.stage.way.kind === 'level') expect(p.stage.way.level).toBeGreaterThan(q.stage.way.level)
  }
})

test('the evolutions named in the design follow the games', () => {
  const way = (from: string, to: string, fromForm?: string, toForm?: string): Stage['way'] | undefined =>
    path(from, to, fromForm, toForm)?.stage.way
  expect(way('dusclops', 'dusknoir')).toEqual({ kind: 'item', item: 'reaper-cloth' })
  expect(way('pikachu', 'raichu')).toEqual({ kind: 'item', item: 'thunder-stone' })
  expect(way('pichu', 'pikachu')).toEqual({ kind: 'friendship' })
  expect(way('piloswine', 'mamoswine')).toEqual({ kind: 'level', level: 43, isFallback: true })
  expect(way('rockruff', 'lycanroc', 'regular', 'midnight')).toEqual({ kind: 'level', level: 25, time: 'night' })
  expect(way('rockruff', 'lycanroc', 'regular', 'dusk')).toEqual({ kind: 'level', level: 25, time: 'dusk' })
  // Plain and Hisuian Decidueye from one level, so either can come; Cubone's night way is Alolan Marowak's.
  expect(way('dartrix', 'decidueye', 'regular', 'hisui')).toEqual({ kind: 'level', level: 34 })
  expect(way('cubone', 'marowak', 'regular', 'alola')).toEqual({ kind: 'level', level: 28, time: 'night' })
  expect(way('eevee', 'sylveon')).toEqual({ kind: 'level', level: 30, isFallback: true })
  expect(way('nincada', 'shedinja')).toEqual({ kind: 'shed' })
  expect(path('nincada', 'shedinja')?.siblingLevel).toBe(20)
  expect(way('mantyke', 'mantine')).toEqual({ kind: 'party', species: 'remoraid' })
  expect(way('pancham', 'pangoro')).toEqual({ kind: 'level', level: 32, partyType: 'dark' })
  expect(way('slowpoke', 'slowbro', 'galar', 'galar')).toEqual({ kind: 'item', item: 'galarica-cuff' })
  expect(path('milcery', 'alcremie')?.stage.way).toMatchObject({ kind: 'hold', item: 'strawberry-sweet' })
  expect(
    PATHS.some(
      p =>
        p.from === 'kubfu' &&
        p.to === 'urshifu' &&
        p.stage.way.kind === 'item' &&
        p.stage.way.item === 'scroll-of-waters',
    ),
  ).toBe(true)
  expect(path('phione', 'manaphy')).toBeUndefined()
  // The design's 17 paths with no workable mechanic, and only those, fall back to a level.
  const fallbacks = PATHS.filter(p => p.kind === 'fallback').map(p => pokeapiForm(p.from, p.fromForm))
  expect([...new Set(fallbacks)].sort()).toEqual(
    [
      ...[
        'mime-jr',
        'yanma',
        'piloswine',
        'aipom',
        'poipole',
        'steenee',
        'lickitung',
        'clobbopus',
        'tangela',
        'bonsly',
      ],
      ...['stantler', 'meltan', 'basculin-white-striped', 'yamask-galar', 'farfetchd-galar', 'qwilfish-hisui', 'eevee'],
    ].sort(),
  )
  expect(PATHS.filter(p => p.from === 'eevee' && p.kind === 'fallback').map(p => p.to)).toEqual(['sylveon'])
  expect(nextStages(chainFor('caterpie') as ChainLink, 'caterpie')).toEqual([
    { species: 'metapod', way: { kind: 'level', level: 7 } },
  ])
})
