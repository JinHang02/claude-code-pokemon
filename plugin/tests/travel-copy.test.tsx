// The recovery copy of the journey under store key `journey`: when it is written, read, restored, refused, and kept
// right by two windows.
import { expect, test } from 'claude-code/testing'

import { keptJourney, newJourney } from '../hooks/travel-regions'
import type { Journey } from '../hooks/travel-regions'
import { emptySave } from '../hooks/save'
import type { Save } from '../hooks/save'
import { answerTools, bash, begin, cmd, KIT, LIST, member, mountBand, preFeature, until } from './world'
import type { Net } from './world'

const JOHTO: Journey = { current: 'johto', tickets: ['johto'], starters: { johto: { species: 'chikorita' } } }

const seeded = (): Save => ({ ...emptySave(), party: [member('pikachu', { next: [] })] })

// A store that counts reads and writes of the `journey` key, with `keys` already in it.
function counted(keys: Record<string, unknown> = {}) {
  const calls = { gets: 0, sets: 0 }
  const net: Net = {
    isOnline: true,
    list: JSON.stringify(LIST),
    keys,
    beforeGet: key => void (key === 'journey' && calls.gets++),
    beforeSet: key => void (key === 'journey' && calls.sets++),
  }
  return { calls, net }
}

function otherWindowWrites(w: { store: Map<string, unknown>; saveNow: () => Save }, journey: Journey) {
  w.store.set('save', { ...w.saveNow(), journey })
  w.store.set('journey', journey)
}

test(
  'the first save write in a session copies the journey once; catches, sizes and XP never touch it',
  KIT,
  async ($, on) => {
    answerTools(on)
    const { calls, net } = counted()
    const w = await begin($, on, seeded(), undefined, undefined, net)
    expect(await cmd($, 'pokemon', 'add caterpie')).toMatch(/Caterpie joined your party!/)
    expect(calls).toEqual({ gets: 0, sets: 1 })
    expect(w.store.get('journey')).toEqual(w.saveNow().journey)
    expect(await cmd($, 'pokemon', 'add pichu')).toMatch(/Pichu joined your party!/)
    expect(await cmd($, 'pokemon', 'size small')).toBe('Pokémon size: small.')
    await $.tool.call(bash('pytest -q') as never)
    await until($, () => (w.partyNow()[0]?.xp ?? 0) > 0)
    expect(calls).toEqual({ gets: 0, sets: 1 })
  },
)

test('a first install reads no copy, and its first write copies the new journey', KIT, async ($, on) => {
  const { calls, net } = counted()
  const w = await begin($, on, undefined, undefined, undefined, net)
  expect(await cmd($, 'pokemon', 'size small')).toBe('Pokémon size: small.')
  expect(calls.gets).toBe(0)
  expect(w.store.get('journey')).toEqual(w.saveNow().journey)
  expect(w.saveNow().journey).toMatchObject({ current: newJourney().current, tickets: [] })
})

test('a save that has its journey ignores the copy and never reads it', KIT, async ($, on) => {
  const { calls, net } = counted({ journey: JOHTO })
  const w = await begin($, on, seeded(), undefined, undefined, net)
  expect((await cmd($, 'pokedex')).split('\n')[0]).toBe('In Kanto · 1 of 8 regions open')
  expect(await cmd($, 'pokemon', 'size small')).toBe('Pokémon size: small.')
  expect(calls.gets).toBe(0)
  expect(w.saveNow().journey).toEqual(keptJourney())
  expect(w.store.get('journey')).toEqual(keptJourney())
})

test(
  'a save an older window rewrote without its journey gets the copy back: Johto owned and current, no choice screen',
  KIT,
  async ($, on) => {
    const { calls, net } = counted({ journey: JOHTO })
    const w = await begin($, on, preFeature(seeded()), undefined, undefined, net)
    expect((await cmd($, 'pokedex')).split('\n')[0]).toBe('In Johto · 2 of 8 regions open')
    expect(await cmd($, 'pokemon', 'size small')).toBe('Pokémon size: small.')
    expect(w.saveNow().journey).toEqual(JOHTO)
    expect(w.saveNow().journey.isUndecided).toBeUndefined()
    expect(calls.sets).toBe(0)
    expect(w.store.get('journey')).toEqual(JOHTO)
  },
)

test('a save without its journey and no copy loads undecided, and that is what gets copied', KIT, async ($, on) => {
  const { net } = counted()
  const w = await begin($, on, preFeature(seeded()), undefined, undefined, net)
  expect(await cmd($, 'pokemon', 'size small')).toBe('Pokémon size: small.')
  expect(w.saveNow().journey).toEqual({ ...keptJourney(), isUndecided: true })
  expect(w.store.get('journey')).toEqual({ ...keptJourney(), isUndecided: true })
})

test('a malformed copy loads kept and undecided', KIT, async ($, on) => {
  const { net } = counted({ journey: 'x' })
  const w = await begin($, on, preFeature(seeded()), undefined, undefined, net)
  expect((await cmd($, 'pokedex')).split('\n')[0]).toBe('In Kanto · 1 of 8 regions open')
  expect(await cmd($, 'pokemon', 'size small')).toBe('Pokémon size: small.')
  expect(w.saveNow().journey).toEqual({ ...keptJourney(), isUndecided: true })
})

test('a sync after an older window strips the journey restores it from the copy', KIT, async ($, on) => {
  const { net } = counted()
  const w = await begin($, on, seeded(), undefined, undefined, net)
  expect(await cmd($, 'pokemon', 'add caterpie')).toMatch(/Caterpie joined your party!/)
  w.store.set('save', preFeature(w.saveNow()))
  w.store.set('journey', JOHTO)
  await w.clock.advance(11_000)
  expect((await cmd($, 'pokedex')).split('\n')[0]).toBe('In Johto · 2 of 8 regions open')
})

test(
  'a refused copy write still lands the save, is reported once, and the next writes retry the copy',
  KIT,
  async ($, on) => {
    const { calls, net } = counted()
    // A hook that throws is retried by the engine, then the plugin's store.set rejects.
    let isRefusing = true
    net.beforeSet = key => {
      if (key !== 'journey') return
      if (isRefusing) throw new Error('journey copy refused')
      calls.sets++
    }
    const refusals = () => w.toasts.filter(t => t.startsWith('Pokémon: '))
    const w = await begin($, on, seeded(), undefined, undefined, net)
    expect(await cmd($, 'pokemon', 'size small')).toBe('Pokémon size: small.')
    expect(w.saveNow().size).toBe('small')
    expect(w.store.has('journey')).toBe(false)
    expect(await cmd($, 'pokemon', 'size normal')).toBe('Pokémon size: normal.')
    expect(w.saveNow().size).toBe('normal')
    expect(w.store.has('journey')).toBe(false)
    expect(refusals()).toHaveLength(1)
    isRefusing = false
    expect(await cmd($, 'pokemon', 'size auto')).toBe('Pokémon size: auto.')
    expect(calls.sets).toBe(1)
    expect(w.store.get('journey')).toEqual(w.saveNow().journey)
    expect(await cmd($, 'pokemon', 'size small')).toBe('Pokémon size: small.')
    expect(calls.sets).toBe(1)
    expect(refusals()).toHaveLength(1)
  },
)

test("another window's journey change: this window's stale memory never leaves a wrong copy", KIT, async ($, on) => {
  const { calls, net } = counted()
  const w = await begin($, on, seeded(), undefined, undefined, net)
  expect(await cmd($, 'pokemon', 'size small')).toBe('Pokémon size: small.')
  expect(calls.sets).toBe(1)
  otherWindowWrites(w, JOHTO)
  expect(await cmd($, 'pokemon', 'add caterpie')).toMatch(/Caterpie joined your party!/)
  expect(w.saveNow().journey).toEqual(JOHTO)
  expect(calls.sets).toBe(2)
  expect(w.store.get('journey')).toEqual(w.saveNow().journey)
  expect(await cmd($, 'pokemon', 'size normal')).toBe('Pokémon size: normal.')
  expect(calls.sets).toBe(2)
  expect(w.store.get('journey')).toEqual(JOHTO)
})

test(
  'another window sails away and back: this window, its memory matching again, writes no copy and the copy is right',
  KIT,
  async ($, on) => {
    const { calls, net } = counted()
    const w = await begin($, on, seeded(), undefined, undefined, net)
    expect(await cmd($, 'pokemon', 'size small')).toBe('Pokémon size: small.')
    const kanto = { ...JOHTO, current: 'kanto' as const }
    otherWindowWrites(w, JOHTO)
    otherWindowWrites(w, kanto)
    otherWindowWrites(w, keptJourney())
    expect(await cmd($, 'pokemon', 'size normal')).toBe('Pokémon size: normal.')
    expect(calls.sets).toBe(1)
    expect(w.store.get('journey')).toEqual(w.saveNow().journey)
  },
)

const OWNS_JOHTO: Journey = { current: 'kanto', tickets: ['johto'], starters: { johto: { species: 'chikorita' } } }
const IN_JOHTO: Journey = { ...OWNS_JOHTO, current: 'johto' }

test(
  'this window sails to Johto, another back to Kanto, this one to Johto again: the copy follows, and a 1.7.x rewrite restores Johto',
  KIT,
  async ($, on) => {
    const { net } = counted()
    const w = await begin($, on, { ...seeded(), journey: OWNS_JOHTO }, undefined, undefined, net)
    expect(await cmd($, 'pokemon', 'travel johto')).toMatch(/Johto/)
    expect(w.store.get('journey')).toEqual(IN_JOHTO)
    otherWindowWrites(w, OWNS_JOHTO)
    expect(await cmd($, 'pokemon', 'travel johto')).toMatch(/Johto/)
    expect(w.saveNow().journey).toEqual(IN_JOHTO)
    expect(w.store.get('journey')).toEqual(IN_JOHTO)
    w.store.set('save', preFeature(w.saveNow()))
    await w.clock.advance(11_000)
    expect((await cmd($, 'pokedex')).split('\n')[0]).toBe('In Johto · 2 of 8 regions open')
  },
)

test(
  'this window back in Kanto, another sails to Johto, this one back to Kanto: the copy says Kanto',
  KIT,
  async ($, on) => {
    const { net } = counted()
    const w = await begin($, on, { ...seeded(), journey: IN_JOHTO }, undefined, undefined, net)
    expect(await cmd($, 'pokemon', 'travel kanto')).toMatch(/Kanto/)
    expect(w.store.get('journey')).toEqual(OWNS_JOHTO)
    otherWindowWrites(w, IN_JOHTO)
    expect(await cmd($, 'pokemon', 'travel kanto')).toMatch(/Kanto/)
    expect(w.store.get('journey')).toEqual(w.saveNow().journey)
    expect(w.store.get('journey')).toEqual(OWNS_JOHTO)
  },
)

test(
  'restarted here, Johto bought there, restarted here again: the copy is the new journey, so a 1.7.x rewrite brings back no Johto',
  KIT,
  async ($, on) => {
    on('ui.render', async () => ({ type: 'Text', children: ['engine'] }) as never)
    const { net } = counted()
    const w = await begin($, on, { ...seeded(), journey: IN_JOHTO }, undefined, undefined, net)
    await cmd($, 'pokemon', 'party')
    await mountBand($ as never)
    for (const round of [1, 2]) {
      if (round === 2) otherWindowWrites(w, IN_JOHTO)
      expect(await cmd($, 'pokemon', 'restart')).toMatch(/confirmation is open/)
      expect(await cmd($, 'pokemon', 'restart yes')).toBe('Started fresh with ₽3,000.')
      expect(w.store.get('journey')).toEqual(newJourney())
    }
    w.store.set('save', preFeature(w.saveNow()))
    await w.clock.advance(11_000)
    expect((await cmd($, 'pokedex')).split('\n')[0]).toBe('In Kanto · 1 of 8 regions open')
    expect(await cmd($, 'pokemon', 'travel johto')).toBe('You have no Johto ferry ticket.')
  },
)
