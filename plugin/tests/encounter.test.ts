import { expect, test } from 'claude-code/testing'

import { drawWild, isWildForm, weightOf } from '../hooks/encounter'
import type { Where } from '../hooks/encounter'
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

test('no gift, event or grooming form is wild: those come only by name', () => {
  const wild = (n: string, f: string) => SPECIES[n]?.forms[f]?.isWild
  for (const [n, f] of [
    ['pichu', 'spiky-eared'],
    ['zarude', 'dada'],
    ['magearna', 'original'],
    ['vivillon', 'fancy'],
    ['vivillon', 'poke-ball'],
    ['greninja', 'ash'],
    ['floette', 'eternal'],
    ['eevee', 'starter'],
    ['pikachu', 'partner-cap'],
  ])
    expect([n, f, wild(n ?? '', f ?? '')]).toEqual([n, f, false])
  const trims = Object.keys(SPECIES.furfrou?.forms ?? {})
  expect(trims).toHaveLength(9)
  for (const f of trims) expect([f, wild('furfrou', f)]).toEqual([f, false])
  // Their natural kin still turn up.
  expect(wild('vivillon', 'garden')).toBe(true)
  expect(wild('floette', 'blue')).toBe(true)
  expect(isWildForm('furfrou', 'regular')).toBe(true)
  // A newer sprite list's event form, not in the table yet, isn't wild either.
  expect(isWildForm('pichu', 'spiky-eared')).toBe(false)
  expect(isWildForm('newmon', 'dada')).toBe(false)
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

// A small seeded generator so the odds checks are repeatable.
const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}
const at = (landscape: Where['landscape'], phase: Where['phase'], dex: Where['dex'] = {}): Where => ({
  landscape,
  phase,
  dex,
})

test('rarity, stage, place, time and novelty multiply', () => {
  const meadowDay = at('meadow', 'day')
  // Pidgey (no alternate forms): rate 255, stage 1, Normal/Flying fits the meadow (x4), Normal fits the day (x2),
  // unseen x2.5.
  expect(Math.abs(weightOf('pidgey', 'regular', meadowDay) - 1 * 1 * 4 * 2 * 2.5) < 1e-9).toBe(true)
  const seen = at('meadow', 'day', { pidgey: { seen: 1, shiny: 0, first: 0 } })
  expect(Math.abs(weightOf('pidgey', 'regular', seen) - 1 * 4 * 2) < 1e-9).toBe(true)
  // Vulpix keeps 7/8 for its regular form, Alolan Vulpix (Ice) gets the other 1/8 and fits the mountains.
  const mountainsDay = at('mountains', 'day')
  expect(Math.abs(weightOf('vulpix', 'alola', mountainsDay) - Math.sqrt(190 / 255) * (1 / 8) * 4 * 2.5) < 1e-9).toBe(
    true,
  )
  expect(weightOf('charizard', 'mega-x', meadowDay)).toBe(0)
})

test('stage, baby, dusk Ghost, mythical and form-share weights, each on its own', () => {
  // Lake at dusk fits none of these types by place, and every species is marked seen, so only the factor under test is left.
  const everSeen = Object.fromEntries(
    ['ivysaur', 'venusaur', 'tyrogue', 'gastly', 'mew', 'mewtwo', 'vulpix'].map(n => [
      n,
      { seen: 1, shiny: 0, first: 0 },
    ]),
  )
  const lakeDusk = at('lake', 'dusk', everSeen)
  const lakeDay = at('lake', 'day', everSeen)
  const near = (a: number, b: number) => expect(Math.abs(a - b) < 1e-9, `${a} vs ${b}`).toBe(true)
  near(weightOf('ivysaur', 'regular', lakeDusk), Math.sqrt(45 / 255) * 0.75)
  near(weightOf('venusaur', 'regular', lakeDusk), Math.sqrt(45 / 255) * 0.55)
  near(weightOf('tyrogue', 'regular', lakeDusk), Math.sqrt(75 / 255) * 0.4)
  near(weightOf('gastly', 'regular', lakeDusk), Math.sqrt(190 / 255) * 1.5)
  near(weightOf('gastly', 'regular', lakeDay), Math.sqrt(190 / 255))
  // Inside the rare pool a mythical counts half a legendary.
  near(weightOf('mew', 'regular', lakeDay), 0.5)
  near(weightOf('mewtwo', 'regular', lakeDay), 1)
  // A species with an eligible alternate form keeps 7/8 for its regular one.
  near(weightOf('vulpix', 'regular', lakeDusk), Math.sqrt(190 / 255) * (7 / 8))
})

test('a form the species list does not offer has no weight, and the regular form then keeps the whole share', () => {
  const where = at('mountains', 'day')
  expect(weightOf('vulpix', 'alola', where, ['regular'])).toBe(0)
  expect(weightOf('vulpix', 'alola', where, ['regular', 'alola'])).toBeGreaterThan(0)
  const alone = weightOf('vulpix', 'regular', at('lake', 'dusk', { vulpix: { seen: 1, shiny: 0, first: 0 } }), [
    'regular',
  ])
  expect(Math.abs(alone - Math.sqrt(190 / 255)) < 1e-9).toBe(true)
})

test('about 1% of wild Pokémon are legendary, mythical or Ultra Beasts', { timeoutMs: 60_000 }, () => {
  const rand = seeded(1)
  const where = at('meadow', 'day')
  let rare = 0
  for (let i = 0; i < 100_000; i++) {
    const p = drawWild(LIST, where, rand)
    if (SPECIES[p.species]?.tier !== 'common') rare++
  }
  expect(rare / 100_000).toBeGreaterThan(0.008)
  expect(rare / 100_000).toBeLessThan(0.012)
})

test('Water types come to the lake', { timeoutMs: 60_000 }, () => {
  const share = (landscape: Where['landscape']) => {
    const rand = seeded(2)
    const where = at(landscape, 'day')
    let water = 0
    for (let i = 0; i < 100_000; i++) {
      const p = drawWild(LIST, where, rand)
      const info = SPECIES[p.species]
      const types = p.form === 'regular' ? info?.types : info?.forms[p.form]?.types
      if (types?.includes('water')) water++
    }
    return water / 100_000
  }
  expect(share('lake')).toBeGreaterThan(2 * share('mountains'))
})

test('no wild Pokémon is ever in a form that only exists in battle or as a costume', { timeoutMs: 60_000 }, () => {
  const rand = seeded(3)
  const where = at('forest', 'night')
  for (let i = 0; i < 100_000; i++) {
    const p = drawWild(LIST, where, rand)
    expect(p.form === 'regular' || isWildForm(p.species, p.form), `${p.species} ${p.form}`).toBe(true)
  }
})

test('every species can be met somewhere, some time', { timeoutMs: 120_000 }, () => {
  const rand = seeded(4)
  const met = new Set<string>()
  const places = ['meadow', 'hills', 'mountains', 'lake', 'forest'] as const
  const times = ['dawn', 'day', 'dusk', 'night'] as const
  // 20 place x time pairs, 50,000 draws each (one table per pair: the draw caches the last one).
  for (const place of places)
    for (const time of times) {
      const where = at(place, time)
      for (let i = 0; i < 50_000; i++) met.add(drawWild(LIST, where, rand).species)
    }
  expect(LIST.filter(s => !met.has(s.name)).map(s => s.name)).toEqual([])
})

test('unmet Pokémon come about 2.5x as often', { timeoutMs: 60_000 }, () => {
  const full = Object.fromEntries(LIST.map(s => [s.name, { seen: 1, shiny: 0, first: 0 }]))
  const { pidgey: _, ...allButPidgey } = full
  const count = (dex: Where['dex']) => {
    const rand = seeded(5)
    const where = at('meadow', 'day', dex)
    let n = 0
    for (let i = 0; i < 200_000; i++) if (drawWild(LIST, where, rand).species === 'pidgey') n++
    return n
  }
  expect(count(allButPidgey) / count(full)).toBeGreaterThan(2)
  expect(count(allButPidgey) / count(full)).toBeLessThan(3)
})

test("a species or form the table doesn't know still works", () => {
  const list = [...LIST, { name: 'newmon', forms: ['regular', 'mega'] }]
  expect(weightOf('newmon', 'regular', at('meadow', 'day'))).toBeGreaterThan(0)
  expect(weightOf('newmon', 'mega', at('meadow', 'day'))).toBe(0)
  expect(() => drawWild(list, at('meadow', 'day'), seeded(6))).not.toThrow()
})

test('on average over the 20 place and time pairs a Pidgey is 1 in 189, an Eevee 1 in 966, a Dratini 1 in 1,893', () => {
  // Exact chance per visit from the weights (nothing met yet, so the 2.5x cancels): the common pool gets 99% of visits.
  const places = ['meadow', 'hills', 'mountains', 'lake', 'forest'] as const
  const times = ['dawn', 'day', 'dusk', 'night'] as const
  const sum: Record<string, number> = { pidgey: 0, eevee: 0, dratini: 0 }
  for (const place of places)
    for (const time of times) {
      const where = at(place, time)
      let total = 0
      const own: Record<string, number> = { pidgey: 0, eevee: 0, dratini: 0 }
      for (const { name, forms } of LIST) {
        if (SPECIES[name]?.tier !== 'common') continue
        for (const form of forms) {
          const w = weightOf(name, form, where, forms)
          total += w
          if (name in own) own[name] = (own[name] ?? 0) + w
        }
      }
      for (const n of Object.keys(sum)) sum[n] = (sum[n] ?? 0) + (0.99 * (own[n] ?? 0)) / total
    }
  const oneIn = (n: string) => 20 / (sum[n] ?? 0)
  for (const [n, want] of [
    ['pidgey', 189],
    ['eevee', 966],
    ['dratini', 1893],
  ] as const)
    expect(Math.abs(oneIn(n) / want - 1) < 0.15, `${n}: 1 in ${oneIn(n)}`).toBe(true)
})

test('item and event dependent forms are not wild, Wormadam cloaks are', () => {
  const wild = (n: string, f: string) => SPECIES[n]?.forms[f]?.isWild
  for (const f of ['heat', 'wash', 'frost', 'fan', 'mow']) expect([f, wild('rotom', f)]).toEqual([f, false])
  for (const f of ['attack', 'defense', 'speed']) expect([f, wild('deoxys', f)]).toEqual([f, false])
  for (const n of ['tornadus', 'thundurus', 'landorus', 'enamorus']) expect([n, wild(n, 'therian')]).toEqual([n, false])
  for (const n of ['giratina', 'dialga', 'palkia']) expect([n, wild(n, 'origin')]).toEqual([n, false])
  for (const f of ['burn', 'chill', 'douse', 'shock']) expect([f, wild('genesect', f)]).toEqual([f, false])
  expect(wild('shaymin', 'sky')).toBe(false)
  expect(wild('keldeo', 'resolute')).toBe(false)
  const sweets = Object.entries(SPECIES.alcremie?.forms ?? {})
  expect(sweets).toHaveLength(73) // 72 sweets and Gigantamax
  expect(sweets.filter(([, v]) => v.isWild)).toEqual([])
  expect(wild('wormadam', 'sandy')).toBe(true)
  expect(wild('wormadam', 'trash')).toBe(true)
  // Never drawn, even if a newer sprite list offers them.
  expect(isWildForm('landorus', 'therian')).toBe(false)
  expect(isWildForm('newmon', 'origin')).toBe(false)
})
