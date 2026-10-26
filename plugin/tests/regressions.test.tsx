// Bugs found in the October 2026 audit: each test failed before its fix.
import { expect, test } from 'claude-code/testing'

import { localHourOf } from '../hooks/backdrop'
import { chooseStage } from '../hooks/evolution'
import { emptySave, SAVE_VERSION } from '../hooks/save'
import { CHAIN_OF, CHAINS } from './fixtures/evolutions'
import { begin, cmd, KIT, LIST, member, until } from './world'

test('a save read the store refuses at start-up leaves the lead alone: nothing new is caught', KIT, async ($, on) => {
  let reads = 0
  const net = {
    isOnline: true,
    list: JSON.stringify(LIST),
    isStoreBroken: true,
    // Only the first read of the save fails, as when another window holds the store's lock.
    beforeGet: (key: string) => {
      if (key === 'save' && ++reads > 1) net.isStoreBroken = false
    },
  }
  const saved = { ...emptySave(), party: [member('charizard', { id: 'zard', xp: 9000, next: [] })] }
  const w = await begin($, on, saved, undefined, undefined, net)
  for (let i = 0; i < 20; i++) await w.clock.settle()
  await cmd($, 'pokemon', 'party')
  expect(w.saveNow().party.map(m => m.id)).toEqual(['zard'])
  expect(w.saveNow().box ?? []).toEqual([])
})

test(
  'a fold round folds every ended session in one save write, and the next round removes them',
  KIT,
  async ($, on) => {
    const N = 200
    const keys: Record<string, unknown> = {}
    for (let i = 0; i < N; i++) keys[`xp:old${i}`] = { at: 1, xp: { p: 2 }, money: 20 }
    let gets = 0
    let saveWrites = 0
    const saved = { ...emptySave(), party: [member('pikachu', { id: 'p', next: [], gender: 'male' })] }
    const w = await begin($, on, saved, undefined, undefined, {
      isOnline: true,
      list: JSON.stringify(LIST),
      keys,
      beforeGet: () => void gets++,
      beforeSet: (key: string) => void (key === 'save' && saveWrites++),
    })
    await cmd($, 'pokemon', 'party')
    ;[gets, saveWrites] = [0, 0]
    // 30 syncs make one fold round.
    for (let i = 0; i < 30; i++) await w.clock.advance(10_000)
    const s = w.saveNow()
    expect([s.folded?.length, s.party[0]?.xp, s.earned]).toEqual([N, 2 * N, 20 * N])
    expect(saveWrites).toBe(1)
    // Each sync reads every ledger once (30 * N); the fold itself adds a few reads per ledger, not N per ledger.
    expect(gets).toBeLessThan(35 * N)
    for (let i = 0; i < 30; i++) await w.clock.advance(10_000)
    expect([...w.store.keys()].filter(k => k.startsWith('xp:old')).length).toBe(0)
  },
)

test('a save stamped by a newer release is never written over: the command says to update', KIT, async ($, on) => {
  const newer = {
    ...emptySave(),
    party: [member('pikachu', { id: 'p', next: [] })],
    version: 99,
    badges: ['boulder'],
  }
  const w = await begin($, on, newer as never)
  const said = await cmd($, 'pokemon', 'add eevee')
  expect(said).toContain('A newer Pokémon Journey wrote your save')
  const raw = w.store.get('save') as { version?: number; badges?: string[]; party: unknown[] }
  expect([raw.version, raw.badges, raw.party.length]).toEqual([99, ['boulder'], 1])
})

test('every save written carries its version', KIT, async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu', { id: 'p', next: [] })] })
  await cmd($, 'pokemon', 'add eevee')
  expect((w.store.get('save') as { version?: number }).version).toBe(SAVE_VERSION)
})

// Ids whose roll lands on each of the two branches.
const ROLLS = ['a', 'b'].map(want => {
  for (let i = 0; ; i++) if (chooseStage(`x${i}`, ['a', 'b']) === want) return `x${i}`
})
for (const id of ROLLS)
  test(`a Thunder Stone makes a plain Pikachu a plain Raichu (id ${id})`, KIT, async ($, on) => {
    const pika = CHAINS[CHAIN_OF.pikachu ?? -1]
    const list = [
      { name: 'pikachu', forms: ['regular'] },
      { name: 'raichu', forms: ['regular', 'alola'] },
    ]
    const w = await begin(
      $,
      on,
      { ...emptySave(), bag: { 'thunder-stone': 1 }, party: [member('pikachu', { id })] },
      undefined,
      undefined,
      { isOnline: true, list: JSON.stringify(list), chains: { pikachu: pika, raichu: pika } },
    )
    await cmd($, 'pokemon', 'give thunder-stone pikachu')
    await until($, () => w.saveNow().party[0]?.species === 'raichu')
    expect(w.saveNow().party[0]?.form).toBe('regular')
  })

test('the local hour follows the clocks going back: a London session open across it reads 18:30 GMT as 18', () => {
  const at = Date.UTC(2026, 9, 26, 18, 30) // Monday 26 October, 18:30 GMT
  // Opened on Saturday in summer time: the clock knew its offset (+60), so no host offset was kept.
  expect(localHourOf(at, 0, null) % 24).toBe(18)
  // In summer time the same instant is 19.
  expect(localHourOf(at, 60, null) % 24).toBe(19)
  // A clock that claims UTC on a host at +08:00 uses the host's offset.
  expect(localHourOf(at, 0, 480) % 24).toBe(2)
})

test('a species PokeAPI has never heard of is looked up once, not every minute', KIT, async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('mewtwo', { id: 'm' })] }, undefined, undefined, {
    isOnline: true,
    list: JSON.stringify(LIST),
    missing: ['mewtwo'],
  })
  for (let i = 0; i < 10; i++) await w.clock.advance(60_000)
  expect(w.saveNow().party[0]?.next).toEqual([])
  expect(w.fetched.filter(u => u.includes('pokemon-species/mewtwo')).length).toBeLessThanOrEqual(2)
})

test(
  'a sprite cut short by a crash mid-write is fetched again, not drawn from the cache forever',
  KIT,
  async ($, on) => {
    const whole = '\x1b[38;2;255;0;0m\x1b[48;2;0;0;255m▀\x1b[0m\n\x1b[38;2;255;0;0m█\x1b[0m'
    const cut = whole.slice(0, whole.indexOf('\n') + 6)
    const files = new Map([['/home/ash/.cache/claude-code-pokemon/sprites/regular/pikachu', cut]])
    const w = await begin($, on, { ...emptySave(), party: [member('pikachu', { id: 'p', next: [] })] }, whole, files)
    await cmd($, 'pokemon', 'party')
    expect(w.fetched.some(u => u.endsWith('/regular/pikachu'))).toBe(true)
  },
)
