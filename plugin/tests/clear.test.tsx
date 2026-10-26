// A /clear: Claude Code ends the session (`session.end`, reason `clear`) and goes on in the same process under a
// new session id, with the session's state ($.state) empty and no `session.start`; the classic SessionStart hook
// fires with source `clear`. The plugin's own variables, timers and store live on.
import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { emptySave, level } from '../hooks/save'
import { answerTools, bash, begin, cmd, KIT, member, mountBand, until } from './world'

type Band = {
  pointer: (e: { type: 'down'; x: number; y: number; button: 'left'; in?: string }) => Promise<void>
  key: (e: { key: string; in?: string }) => Promise<void>
  drawn: () => Promise<unknown>
  redraw: () => Promise<void>
}

// The props of the `Client` keyed `key` in the band as drawn afresh, or null when it isn't there.
async function clientProps(band: Band, key: string): Promise<Record<string, unknown> | null> {
  await band.redraw()
  const find = (node: unknown): Record<string, unknown> | null => {
    if (typeof node !== 'object' || node === null) return null
    const n = node as { type?: string; props?: { key?: string; props?: Record<string, unknown> } }
    if (n.type === 'Client' && n.props?.key === key) return n.props.props ?? null
    for (const child of Object.values(node)) {
      const found = find(child)
      if (found) return found
    }
    return null
  }
  return find(await band.drawn())
}

// The session's state as Claude Code holds it, which a /clear empties.
function sessionState(on: On) {
  let held = new Map<string, { value: unknown; version: number }>()
  on('state.get', async (_$, e) => ({ value: held.get(e.key) ?? { value: undefined, version: 0 } }))
  on('state.set', async (_$, e) => {
    const version = (held.get(e.key)?.version ?? 0) + 1
    held.set(e.key, { value: e.value, version })
    return { value: { isSet: true, version } }
  })
  on('session.end', async (_$, e) => ({ sessionId: e.sessionId }))
  on('classic.SessionStart', async () => ({}))
  return {
    get: (key: string) => held.get(key)?.value,
    // The engine's /clear, in its order: the old session ends, its state goes, the new one's SessionStart.
    clear: async ($: {
      session: { end: (e: never) => Promise<unknown> }
      classic: { SessionStart: (e: never) => Promise<unknown> }
    }) => {
      await $.session.end({ reason: 'clear', sessionId: 'before', resume: { id: 'before' } } as never)
      held = new Map()
      await $.classic.SessionStart({ source: 'clear' } as never)
    },
  }
}

const scene = async (band: Band) => {
  await band.redraw()
  const drawn = JSON.stringify(await band.drawn())
  return drawn.includes('"key":"scene"') ? Number(/"rows":(\d+)/.exec(drawn)?.[1]) : null
}

// Longer than the default 5 seconds: the first test of a file loads the plugin, slow on a busy machine.
test(
  'after /clear the band draws the same party again by itself, with no party change',
  { timeoutMs: 30_000 },
  async ($, on) => {
    const state = sessionState(on)
    const w = await begin($, on, { ...emptySave(), party: [member('pikachu'), member('eevee')] })
    await cmd($, 'pokemon', 'party')
    const band = (await mountBand($)) as Band
    const rows = await scene(band)
    expect(rows).toBeGreaterThan(0)
    expect((state.get('party') as unknown[]).length).toBe(2)

    await state.clear($)
    // The party comes back in the background, from sprites already fetched: no command, no party change.
    await w.clock.advance(100)
    expect((state.get('party') as unknown[] | undefined)?.length).toBe(2)
    expect(await scene(band)).toBe(rows)
    expect(w.saveNow().party.map(m => m.species)).toEqual(['pikachu', 'eevee'])
  },
)

test(
  'an open Mart is still open after /clear; it closes, and the ₽ button shows +₽ for what is earned after',
  KIT,
  async ($, on) => {
    answerTools(on)
    const state = sessionState(on)
    const w = await begin($, on, { ...emptySave(), party: [member('pikachu')] })
    await cmd($, 'pokemon', 'party')
    const band = (await mountBand($)) as Band
    await band.pointer({ type: 'down', x: 3, y: 0, button: 'left', in: 'shop' })
    expect(await clientProps(band, 'mart')).toMatchObject({ balance: 3000 })

    await state.clear($)
    await w.clock.advance(100)
    expect(await clientProps(band, 'mart')).toMatchObject({ balance: 3000 })
    await band.key({ key: 'x', in: 'mart' })
    expect(await clientProps(band, 'mart')).toBeNull()
    await $.tool.call(bash('git commit -m x') as never)
    // The ₽ lands in the background: a command waits for it.
    await cmd($, 'pokemon', 'party')
    expect(await clientProps(band, 'shop')).toMatchObject({ balance: 3100, plus: 100 })
    await w.clock.advance(1500)
    expect(await clientProps(band, 'shop')).toMatchObject({ balance: 3100, plus: 0 })
  },
)

// Simulates 3 minutes of the frame and heartbeat timers (120 s, then 60 s).
test(
  'XP, ₽, the Bag, held items, time together, the Pokédex and evolutions all count once across a /clear',
  { timeoutMs: 30_000 },
  async ($, on) => {
    answerTools(on)
    const state = sessionState(on)
    const w = await begin($, on, {
      ...emptySave(),
      party: [
        member('pikachu', { id: 'p', next: [], gender: 'male', heldItem: 'lucky-egg' }),
        member('vaporeon', { id: 'v', next: [], gender: 'male', evolutions: 1 }),
      ],
      bag: { 'rare-candy': 1 },
      dex: {
        pikachu: { seen: 3, shiny: 0, first: 0 },
        vaporeon: { seen: 1, shiny: 1, first: 0, caught: 1 },
        eevee: { seen: 2, shiny: 0, first: 0, caught: 2 },
      },
    })
    await cmd($, 'pokemon', 'party')
    // The first heartbeat sets the shared stamp; the next adds a minute.
    await w.clock.advance(120_000)
    await $.tool.call(bash('pytest -q') as never)
    await until($, () => [...w.store].some(([k, l]) => k.startsWith('xp:') && (l as { money?: number }).money === 50))
    expect(await cmd($, 'pokemon', 'buy fire stone')).toBe('Bought a Fire Stone! ₽50 left.')
    const xp = w.partyNow().map(m => m.xp)
    const together = w.togetherNow()
    const pokedex = async () => (await cmd($, 'pokedex')).split('\n\nYour party')[0]
    const dex = await pokedex()
    expect(dex).toMatch(/^Pokédex: 3 \/ 32 seen · 2 caught · 1 shiny\n/)
    const key = [...w.store.keys()].find(k => k.startsWith('xp:'))
    expect(state.get('ledger')).toBe(key)

    await state.clear($)
    await w.clock.advance(60_000)
    await $.tool.call(bash('git commit -m x') as never)
    await until($, () => (w.store.get(key ?? '') as { money?: number } | undefined)?.money === 150)

    // XP: the save's and this process's one ledger, each earning once (Pikachu's Lucky Egg gives half again).
    expect([...w.store.keys()].filter(k => k.startsWith('xp:'))).toEqual([key])
    expect(state.get('ledger')).toBe(key)
    expect(w.partyNow().map(m => m.xp)).toEqual([xp[0]! + 15, xp[1]! + 10])
    expect(xp).toEqual([7, 5])
    // Time together: two minutes, and two pieces of work (one each side of the clear), each counted once.
    const party = await cmd($, 'pokemon', 'party')
    expect(party).toMatch(new RegExp(`Lead  Pikachu ♂ +Lv ${level(8 + 15)} .*together 22m \\(20m from work\\)`))
    expect(party).toMatch(new RegExp(`Vaporeon ♂ +Lv ${level(5 + 10)} .*together 22m \\(20m from work\\)`))
    // ₽: 3,000 + 50 + 100 earned − 3,000 spent; the Bag and held items as they were.
    expect(await cmd($, 'pokemon', 'bag')).toMatch(/^Bag · ₽150\n/)
    expect(w.saveNow().bag).toEqual({ 'rare-candy': 1, 'fire-stone': 1 })
    expect(w.saveNow().spent).toBe(3000)
    expect(w.saveNow().party.map(m => [m.heldItem, m.evolutions])).toEqual([
      ['lucky-egg', 0],
      [undefined, 1],
    ])
    // Time together: the minute after the clear, once.
    expect(w.togetherNow()).toEqual({ p: together.p! + 60_000, v: together.v! + 60_000 })
    expect(together).toEqual({ p: 60_000, v: 60_000 })
    expect(await pokedex()).toBe(dex)
  },
)
