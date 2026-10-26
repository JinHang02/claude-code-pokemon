// Friendship from good work: a passing test run or a commit counts as ten minutes together for every party member,
// written to the session's own ledger like XP, so it counts once however many windows are open.
import type { Register } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { FRIENDSHIP_MS } from '../hooks/evolution'
import { WORK, WORK_MS } from '../hooks/friendship'
import type { Work } from '../hooks/friendship'
import { register } from '../hooks/register'
import { emptySave, formatSpan } from '../hooks/save'
import type { Ledger, Save } from '../hooks/save'
import { answerTools, ART, bash, begin, KIT, LIST, cmd, member, until } from './world'
import type { Net } from './world'

// Work credit in every session ledger of the store, by member id.
function credit(store: Map<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [key, l] of store)
    if (key.startsWith('xp:'))
      for (const [id, n] of Object.entries((l as Ledger).friendship ?? {})) out[id] = (out[id] ?? 0) + n
  return out
}

const pair = (): Save => ({
  ...emptySave(),
  party: [
    member('pikachu', { id: 'p', next: [], gender: 'male' }),
    member('eevee', { id: 'e', next: [], gender: 'male', heldItem: 'soothe-bell' }),
  ],
})

test(
  'a passing test run and a commit each add 10 minutes to every party member; a Soothe Bell 1.5 times; failures nothing',
  KIT,
  async ($, on) => {
    answerTools(on)
    const w = await begin($, on, pair())
    await cmd($, 'pokemon', 'party')
    await $.tool.call(bash('pytest -q') as never)
    await until($, () => credit(w.store).p === WORK_MS)
    expect(credit(w.store)).toEqual({ p: WORK_MS, e: 1.5 * WORK_MS })
    await $.tool.call(bash('git commit -m x') as never)
    await until($, () => credit(w.store).p === 2 * WORK_MS)
    // Failures take nothing away, and add nothing.
    await $.tool.call(bash('pytest -q', true) as never)
    await $.tool.call(bash('git commit -m y', true) as never)
    await $.tool.call(bash('grep -rn nothing .', true) as never)
    await cmd($, 'pokemon', 'party')
    expect(credit(w.store)).toEqual({ p: 2 * WORK_MS, e: 3 * WORK_MS })
    const party = await cmd($, 'pokemon', 'party')
    expect(party).toMatch(/Pikachu .*together 20m \(20m from work\)/)
    expect(party).toMatch(/Eevee .*together 30m \(30m from work\)/)
    // Never in the save: it lives in the ledger.
    expect(JSON.stringify(w.saveNow())).not.toContain('friendship')
  },
)

test('the party line shows time together with how much came from work', KIT, async ($, on) => {
  answerTools(on)
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu', { id: 'p', next: [] })] }, ART, undefined, {
    isOnline: true,
    list: JSON.stringify(LIST),
    keys: {
      together: { at: 0, ms: { p: 4 * 3_600_000 } },
      'xp:old': { at: 1, xp: {}, money: 0, friendship: { p: 7_200_000 } },
    },
  })
  expect(await cmd($, 'pokemon', 'party')).toMatch(/Pikachu .*together 6h \(2h from work\)/)
  await $.tool.call(bash('pytest -q') as never)
  await until($, () => (credit(w.store).p ?? 0) > 7_200_000)
  expect(await cmd($, 'pokemon', 'party')).toMatch(/together 6h 10m \(2h 10m from work\)/)
})

const pichu = (evolution: 'auto' | 'manual', ms: number): [Save, Net] => [
  { ...emptySave(), evolution, party: [member('pichu', { id: 'p' })] },
  { isOnline: true, list: JSON.stringify(LIST), keys: { together: { at: 0, ms: { p: ms } } } },
]

test('a Pichu 5 minutes short evolves after one passing test run (auto)', KIT, async ($, on) => {
  answerTools(on)
  const [s, net] = pichu('auto', FRIENDSHIP_MS - 5 * 60_000)
  const w = await begin($, on, s, ART, undefined, net)
  await until($, () => w.saveNow().party[0]?.next !== undefined)
  expect(await cmd($, 'pokemon', 'party')).toContain('evolves with friendship (♥ 99%, 5m to go)')
  await $.tool.call(bash('pytest -q') as never)
  await until($, () => w.saveNow().party[0]?.species === 'pikachu')
  expect(w.toasts).toEqual(['What? Pichu evolved into Pikachu!'])
})

test('a Pichu 5 minutes short becomes ready after one passing test run (manual)', KIT, async ($, on) => {
  answerTools(on)
  const [s, net] = pichu('manual', FRIENDSHIP_MS - 5 * 60_000)
  const w = await begin($, on, s, ART, undefined, net)
  await until($, () => w.saveNow().party[0]?.next !== undefined)
  expect(await cmd($, 'pokemon', 'party')).not.toContain('ready to evolve')
  await $.tool.call(bash('pytest -q') as never)
  await until($, () => w.toasts.length > 0)
  expect(w.toasts).toEqual(['Pichu is ready to evolve! /pokemon evolve pichu'])
  expect(await cmd($, 'pokemon', 'party')).toContain('· ready to evolve')
  expect(w.saveNow().party[0]?.species).toBe('pichu')
  expect(await cmd($, 'pokemon', 'evolve pichu')).toBe('Pichu evolved into Pikachu!')
})

type Handler = (...args: unknown[]) => Promise<unknown>

// Another window on the same store: this plugin's module again, with its own memory, driven through its hooks. No
// timers run in it: only what its commands and tool calls do.
async function otherWindow(store: Map<string, unknown>) {
  const hooks = new Map<string, Handler>()
  const on = ((event: string, ...rest: unknown[]) => {
    const handler = rest[rest.length - 1] as Handler
    const match = rest.length > 1 ? (rest[0] as { command?: string }) : {}
    hooks.set(match.command ? `${event}:${match.command}` : event, handler)
  }) as unknown as Parameters<Register>[0]
  register(on, {} as never)
  const state = new Map<string, { value: unknown; version: number }>()
  const ref = (r: { key: string; id?: string }) => `${r.key}|${r.id ?? ''}`
  const nothing = (): unknown =>
    new Proxy(() => {}, { get: (_t, p) => (p === 'then' ? undefined : nothing()), apply: () => Promise.resolve() })
  const $ = new Proxy(
    {
      store: {
        get: async (key: string) => {
          const value = store.get(key)
          return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
        },
        set: async (key: string, value: unknown) => void store.set(key, JSON.parse(JSON.stringify(value))),
        keys: async () => [...store.keys()],
        delete: async (key: string) => void store.delete(key),
      },
      state: {
        get: async (r: { key: string; id?: string }) => state.get(ref(r)) ?? { value: undefined, version: 0 },
        set: async (r: { key: string; id?: string }, value: unknown) => {
          const version = (state.get(ref(r))?.version ?? 0) + 1
          state.set(ref(r), { value, version })
          return { isSet: true, version }
        },
      },
      clock: {
        now: async () => Date.now(),
        sleep: () => new Promise<void>(() => {}),
        after: () => ({ cancel: () => {} }),
        every: () => ({ cancel: () => {} }),
      },
      http: {
        fetch: async (url: string) => {
          if (url.endsWith('/pokemon.json')) return { status: 200, ok: true, headers: {}, text: JSON.stringify(LIST) }
          if (/pokemon-species|chain/.test(url))
            return { status: 200, ok: true, headers: {}, text: JSON.stringify({ chain: { evolves_to: [] } }) }
          return { status: 200, ok: true, headers: {}, text: ART }
        },
      },
      env: { get: async () => undefined },
      process: { run: async () => ({ exitCode: 0, stdout: '+0800\n', stderr: '' }) },
    },
    { get: (t, p) => (p in t ? t[p as keyof typeof t] : nothing()) },
  )
  await hooks.get('session.start')?.($, { cwd: '/tmp' }, async (e: unknown) => e)
  const run = async (command: string, args = '') =>
    ((await hooks.get(`command.run:${command}`)?.($, { command, args })) as { text?: string } | undefined)?.text ?? ''
  const tool = (command: string) =>
    hooks.get('tool.call')?.($, bash(command), async () => ({ result: { stdout: '', stderr: '', interrupted: false } }))
  await run('pokemon', 'party')
  return { run, tool }
}

test(
  'two windows: each one’s work counts once, and a folded ledger’s credit moves to its own key without counting twice',
  { timeoutMs: 120_000 },
  async ($, on) => {
    answerTools(on)
    const w = await begin($, on, pair(), ART, undefined, {
      isOnline: true,
      list: JSON.stringify(LIST),
      // A session that ended long ago, its ledger not folded yet.
      keys: { 'xp:old': { at: 1, xp: { p: 5 }, money: 50, friendship: { p: WORK_MS } } },
    })
    await cmd($, 'pokemon', 'party')
    const other = await otherWindow(w.store)
    // Pikachu's line in each window, the other one synced first (it runs no timers), and as it should read: time
    // together from the store, with every bit of work counted once.
    const lines = async () => {
      await other.run('pokemon', 'buy')
      const pikachu = (text: string) =>
        text
          .split('\n')
          .find(l => l.includes('Pikachu'))
          ?.replace(/^\s*Lead\s*/, '')
      return [pikachu(await cmd($, 'pokemon', 'party')), pikachu(await other.run('pokemon', 'party'))]
    }
    const expected = (work: number) =>
      `together ${formatSpan((w.togetherNow().p ?? 0) + work)} (${formatSpan(work)} from work)`
    // A test run here and a commit there, at the same moment.
    await Promise.all([$.tool.call(bash('pytest -q') as never), other.tool('git commit -m x')])
    await until($, () => credit(w.store).p === 3 * WORK_MS)
    for (const line of await lines()) expect(line).toContain(expected(3 * WORK_MS))
    // At rest while the clock runs: folding goes on, and the band draws nothing (so the test runs light).
    await cmd($, 'pokemon', 'off')
    // The old ledger folds: its credit goes under the work key, marked, and is counted once in both windows.
    for (let i = 0; i < 40 && !w.store.get(WORK); i++) await w.clock.advance(10_000)
    expect(w.store.get(WORK)).toEqual({ ms: { p: WORK_MS }, folded: { 'xp:old': { p: WORK_MS } } })
    for (const line of await lines()) expect(line).toContain(expected(3 * WORK_MS))
    // A round later the old ledger goes, and its mark on the next: still counted once.
    for (let i = 0; i < 70 && w.store.has('xp:old'); i++) await w.clock.advance(10_000)
    expect(w.store.has('xp:old')).toBe(false)
    for (const line of await lines()) expect(line).toContain(expected(3 * WORK_MS))
    for (let i = 0; i < 40 && Object.keys((w.store.get(WORK) as Work).folded).length; i++) await w.clock.advance(10_000)
    expect(w.store.get(WORK)).toEqual({ ms: { p: WORK_MS }, folded: {} })
    await cmd($, 'pokemon', 'on')
    await other.tool('git commit -m y')
    await until($, () => credit(w.store).p === 3 * WORK_MS)
    for (const line of await lines()) expect(line).toContain(expected(4 * WORK_MS))
  },
)
