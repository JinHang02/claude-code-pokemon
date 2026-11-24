import { expect, test } from 'claude-code/testing'

import { drawWild, isWildForm, weightOf } from '../hooks/encounter'
import type { Where } from '../hooks/encounter'
import { regionOf, TRAVEL_REGIONS } from '../hooks/travel-regions'
import type { RegionId } from '../hooks/travel-regions'
import { SPECIES } from '../hooks/species-data'
import { LIST } from './fixtures/evolutions'

test('the species table covers every species and form in the sprite list', { timeoutMs: 30_000 }, () => {
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
const at = (
  landscape: Where['landscape'],
  phase: Where['phase'],
  dex: Where['dex'] = {},
  region: RegionId = 'kanto',
): Where => ({ landscape, phase, dex, region })

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
    if (SPECIES[p?.species ?? '']?.tier !== 'common') rare++
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
      const info = SPECIES[p?.species ?? '']
      const types = p?.form === 'regular' ? info?.types : info?.forms[p?.form ?? '']?.types
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
    expect(p !== null && (p.form === 'regular' || isWildForm(p.species, p.form)), `${p?.species} ${p?.form}`).toBe(true)
  }
})

test('every species can be met somewhere, some time, in its own region', { timeoutMs: 120_000 }, () => {
  const rand = seeded(4)
  const met = new Set<string>()
  const places = ['meadow', 'hills', 'mountains', 'lake', 'forest'] as const
  const times = ['dawn', 'day', 'dusk', 'night'] as const
  for (const { id } of TRAVEL_REGIONS)
    for (const place of places)
      for (const time of times) {
        const where = at(place, time, {}, id)
        for (let i = 0; i < 7_000; i++) met.add(drawWild(LIST, where, rand)?.species ?? '')
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
    for (let i = 0; i < 200_000; i++) if (drawWild(LIST, where, rand)?.species === 'pidgey') n++
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

test('in Kanto, on average over the 20 place and time pairs a Pidgey is 1 in 33, an Eevee 1 in 167, a Dratini 1 in 323', () => {
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
        if (SPECIES[name]?.tier !== 'common' || regionOf(name)?.id !== 'kanto') continue
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
    ['pidgey', 33],
    ['eevee', 167],
    ['dratini', 323],
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

const alwaysRare = (seed: number) => {
  const rand = seeded(seed)
  let n = 0
  return () => (n++ % 2 === 0 ? 0 : rand())
}
const draws = (list: typeof LIST, where: Where, n: number, rand: () => number) =>
  Array.from({ length: n }, () => drawWild(list, where, rand))

test(
  'in Kanto every random visitor is #1-151, in any wild form, Alolan Rattata included',
  { timeoutMs: 60_000 },
  () => {
    const rand = seeded(7)
    const picks = draws(LIST, at('forest', 'night'), 50_000, rand)
    const outside = new Set(picks.filter(p => p === null || regionOf(p.species)?.id !== 'kanto').map(p => p?.species))
    expect([...outside].slice(0, 5)).toEqual([])
    expect(picks.some(p => p?.species === 'rattata' && p.form === 'alola')).toBe(true)
    expect(new Set(picks.map(p => p?.species)).size).toBeGreaterThan(140)
  },
)

test(
  'in Kanto an unseen Pikachu comes about 2.5x as often as when seen, against seen Kanto species',
  { timeoutMs: 60_000 },
  () => {
    const kanto = Object.fromEntries(
      LIST.filter(s => regionOf(s.name)?.id === 'kanto').map(s => [s.name, { seen: 1, shiny: 0, first: 0 }]),
    )
    const { pikachu: _, ...allButPikachu } = kanto
    const count = (dex: Where['dex']) =>
      draws(LIST, at('meadow', 'day', dex), 200_000, seeded(8)).filter(p => p?.species === 'pikachu').length
    const ratio = count(allButPikachu) / count(kanto)
    expect(ratio).toBeGreaterThan(2.2)
    expect(ratio).toBeLessThan(2.8)
  },
)

test('a rare visitor in Kanto is Articuno, Zapdos, Moltres, Mewtwo or Mew; in Johto one of its six', () => {
  const rare = (region: RegionId) =>
    new Set(draws(LIST, at('lake', 'night', {}, region), 3_000, alwaysRare(9)).map(p => p?.species))
  expect([...rare('kanto')].sort()).toEqual(['articuno', 'mew', 'mewtwo', 'moltres', 'zapdos'])
  expect([...rare('johto')].sort()).toEqual(['celebi', 'entei', 'ho-oh', 'lugia', 'raikou', 'suicune'])
})

test('a region with nothing in the list to draw gives no visitor, rare or common', () => {
  const johto = [
    { name: 'chikorita', forms: ['regular'] },
    { name: 'lugia', forms: ['regular'] },
  ]
  expect(drawWild(johto, at('meadow', 'day'), seeded(10))).toBeNull()
  expect(drawWild(johto, at('meadow', 'day'), alwaysRare(10))).toBeNull()
  expect(drawWild([], at('meadow', 'day'), seeded(10))).toBeNull()
  expect(drawWild([{ name: 'charizard', forms: ['mega-x', 'gmax'] }], at('meadow', 'day'), seeded(10))).toBeNull()
  expect(drawWild(johto, at('meadow', 'day', {}, 'johto'), seeded(10))?.species).toBe('chikorita')
})

test('a species past #905 belongs to no region and is never drawn', () => {
  const list = [
    { name: 'sprigatito', forms: ['regular'] },
    { name: 'koraidon', forms: ['regular'] },
    { name: 'pidgey', forms: ['regular'] },
  ]
  expect(new Set(draws(list, at('meadow', 'day'), 2_000, seeded(11)).map(p => p?.species))).toEqual(new Set(['pidgey']))
  expect(draws(list, at('meadow', 'day'), 200, alwaysRare(11)).every(p => p?.species === 'pidgey')).toBe(true)
  for (const { id } of TRAVEL_REGIONS.slice(1))
    expect([id, drawWild(list, at('meadow', 'day', {}, id), seeded(11))]).toEqual([id, null])
})

test('the same list, place, time and Pokédex in another region draws from that region', () => {
  const dex: Where['dex'] = {}
  const kanto = at('meadow', 'day', dex)
  const johto: Where = { ...kanto, region: 'johto' }
  expect(draws(LIST, kanto, 500, seeded(12)).every(p => regionOf(p?.species ?? '')?.id === 'kanto')).toBe(true)
  expect(draws(LIST, johto, 500, seeded(12)).every(p => regionOf(p?.species ?? '')?.id === 'johto')).toBe(true)
  expect(draws(LIST, kanto, 500, seeded(12)).every(p => regionOf(p?.species ?? '')?.id === 'kanto')).toBe(true)
})
