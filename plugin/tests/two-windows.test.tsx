// Two Claude Code windows on one store, writing at the same moment: neither undoes the other, and no change is ever
// made twice. Two writes within one store round trip may still lose one change, as accepted. The window under test
// is the kit's; the other is this file's own copy of the plugin (a module of its own, with its own save in memory)
// driven through its hooks, over the same store.
import type { Register } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { register } from '../hooks/register'
import { emptySave } from '../hooks/save'
import type { Save } from '../hooks/save'
import { ART, begin, cmd, KIT, LIST, member, mountBand } from './world'
import type { Net } from './world'

type Handler = (...args: unknown[]) => Promise<unknown>
// Gates on the other window's store: its writes held until let go (`set`), or its `at`-th read of the save from now
// held and answered late, with what it read then (`read`).
type Gates = { set?: Promise<void>; read?: { at: number; until: Promise<void> } }

// The other window, over `store`: its commands, and the gates its store calls wait at.
async function otherWindow(store: Map<string, unknown>) {
  const hooks = new Map<string, Handler>()
  const on = ((event: string, ...rest: unknown[]) => {
    const handler = rest[rest.length - 1] as Handler
    const match = rest.length > 1 ? (rest[0] as { command?: string }) : {}
    hooks.set(match.command ? `${event}:${match.command}` : event, handler)
  }) as unknown as Parameters<Register>[0]
  register(on, {} as never)
  const gates: Gates = {}
  const state = new Map<string, { value: unknown; version: number }>()
  const ref = (r: { key: string; id?: string }) => `${r.key}|${r.id ?? ''}`
  const nothing = (): unknown =>
    new Proxy(() => {}, { get: (_t, p) => (p === 'then' ? undefined : nothing()), apply: () => Promise.resolve() })
  const $ = new Proxy(
    {
      store: {
        get: async (key: string) => {
          const value = store.get(key)
          const held = key === 'save' && gates.read && --gates.read.at === 0 ? gates.read.until : undefined
          if (held) await held
          return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
        },
        set: async (key: string, value: unknown) => {
          const gate = gates.set
          if (gate) await gate
          store.set(key, JSON.parse(JSON.stringify(value)))
        },
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
        // No timers in this window: it runs only what its commands do.
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
  // Started up, its save read, before any gate shuts.
  await run('pokemon', 'party')
  return { run, gates }
}

// A gate and the call that lets it go.
function gate() {
  let open = () => {}
  const shut = new Promise<void>(resolve => (open = resolve))
  return { shut, open }
}

const saved = (): Save => ({
  ...emptySave(),
  party: [
    member('pikachu', { id: 'p', next: [], gender: 'male' }),
    member('eevee', { id: 'e', next: [], gender: 'male' }),
  ],
  earned: 10_000,
})

// The other window runs `line`, its `at`-th read of the save held until `mine` has run in this window (`w`).
async function readBefore(
  w: { clock: { settle: () => Promise<void> } },
  other: Awaited<ReturnType<typeof otherWindow>>,
  line: string,
  at: number,
  mine: () => Promise<unknown>,
) {
  const held = gate()
  other.gates.read = { at, until: held.shut }
  const [command = '', ...args] = line.split(' ')
  const theirs = other.run(command, args.join(' '))
  for (let i = 0; i < 20 && other.gates.read.at > 0; i++) await w.clock.settle()
  // Held at the read asked for: it read before this window's change.
  expect(other.gates.read.at).toBe(0)
  await mine()
  held.open()
  return theirs
}

test(
  "/pokemon on here while the other window's /pokemon everstone read the save before it: both stand",
  { timeoutMs: 30_000 },
  async ($, on) => {
    const w = await begin($, on, saved())
    expect(await cmd($, 'pokemon', 'off')).toMatch(/resting/)
    const other = await otherWindow(w.store)
    // Its sync, then the read its write is made from.
    const everstone = readBefore(w, other, 'pokemon everstone eevee', 2, async () =>
      expect(await cmd($, 'pokemon', 'on')).toBe('Your Pokémon are back in the meadow!'),
    )
    expect(await everstone).toMatch(/holds an everstone/)
    expect(w.saveNow().isOff).toBeUndefined()
    expect(w.saveNow().party.find(m => m.id === 'e')?.heldItem).toBe('everstone')
  },
)

test(
  "the other window's /pokemon size reads before this window's /pokemon on and writes after: both stand",
  { timeoutMs: 30_000 },
  async ($, on) => {
    const w = await begin($, on, saved())
    expect(await cmd($, 'pokemon', 'off')).toMatch(/resting/)
    const other = await otherWindow(w.store)
    const small = readBefore(w, other, 'pokemon size small', 1, async () =>
      expect(await cmd($, 'pokemon', 'on')).toBe('Your Pokémon are back in the meadow!'),
    )
    expect(await small).toBe('Pokémon size: small.')
    expect(w.saveNow().isOff).toBeUndefined()
    expect(w.saveNow().size).toBe('small')
  },
)

test(
  "a buy here while the other window's catch was made from an older read: the Fire Stone and the new Pokémon both stay",
  { timeoutMs: 30_000 },
  async ($, on) => {
    const w = await begin($, on, saved())
    await cmd($, 'pokemon', 'party')
    const other = await otherWindow(w.store)
    // Its sync, its look in the PC box, then the read the catch is made from.
    const caught = readBefore(w, other, 'pokemon add caterpie', 3, async () =>
      expect(await cmd($, 'pokemon', 'buy fire stone')).toMatch(/^Bought a Fire Stone!/),
    )
    expect(await caught).toMatch(/Caterpie joined your party!/)
    await cmd($, 'pokemon', 'party')
    expect(w.saveNow().party.map(m => m.species)).toEqual(['pikachu', 'eevee', 'caterpie'])
    expect(w.saveNow().bag).toEqual({ 'fire-stone': 1 })
    expect(w.saveNow().spent).toBe(3000)
  },
)

test(
  "the other window's buy made from an older read while this window catches: both stay, and the ₽ is spent once",
  { timeoutMs: 30_000 },
  async ($, on) => {
    const w = await begin($, on, saved())
    await cmd($, 'pokemon', 'party')
    const other = await otherWindow(w.store)
    const bought = readBefore(w, other, 'pokemon buy fire stone', 2, async () =>
      expect(await cmd($, 'pokemon', 'add caterpie')).toMatch(/Caterpie joined your party!/),
    )
    expect(await bought).toMatch(/^Bought a Fire Stone!/)
    await w.clock.advance(10_000)
    await cmd($, 'pokemon', 'party')
    await other.run('pokemon', 'party')
    expect(w.saveNow().party.map(m => m.species)).toEqual(['pikachu', 'eevee', 'caterpie'])
    expect(w.saveNow().bag).toEqual({ 'fire-stone': 1 })
    expect(w.saveNow().spent).toBe(3000)
  },
)

test(
  'two writes within one store round trip: the later one stands, and nothing is made twice afterwards',
  { timeoutMs: 30_000 },
  async ($, on) => {
    const w = await begin($, on, {
      ...emptySave(),
      party: [
        member('eevee', { id: 'e1', next: [], gender: 'male' }),
        member('eevee', { id: 'e2', next: [], gender: 'male' }),
        member('eevee', { id: 'e3', next: [], gender: 'male' }),
      ],
      earned: 10_000,
    })
    await cmd($, 'pokemon', 'party')
    const other = await otherWindow(w.store)
    // Its write held after its last read: past every check, as two windows writing at the same moment are.
    const held = gate()
    other.gates.set = held.shut
    const theirs = other.run('pokemon', 'release eevee 1')
    for (let i = 0; i < 20; i++) await w.clock.settle()
    expect(await cmd($, 'pokemon', 'release eevee 2')).toMatch(/^Bye bye, Eevee/)
    other.gates.set = undefined
    held.open()
    expect(await theirs).toMatch(/^Bye bye, Eevee/)
    for (let i = 0; i < 3; i++) {
      await w.clock.advance(10_000)
      await cmd($, 'pokemon', 'party')
      await other.run('pokemon', 'party')
    }
    // This window's release was lost in the race; e3, which nobody named, is still there.
    expect(w.saveNow().party.map(m => m.id)).toEqual(['e2', 'e3'])
  },
)

// A window of an older version writes the save: what it read, less the fields it doesn't know (such as the write
// stamps of an earlier 1.5.0 build), with its own change.
function olderWindowWrites(store: Map<string, unknown>, change: (s: Record<string, unknown>) => void) {
  const s = JSON.parse(JSON.stringify(store.get('save'))) as Record<string, unknown>
  delete s.revs
  change(s)
  store.set('save', s)
}

test(
  'a buy here, a write by an older window, more writes here: the Fire Stone is bought once',
  { timeoutMs: 30_000 },
  async ($, on) => {
    const w = await begin($, on, saved())
    await cmd($, 'pokemon', 'party')
    expect(await cmd($, 'pokemon', 'buy fire stone')).toMatch(/^Bought a Fire Stone!/)
    olderWindowWrites(w.store, s => (s.size = 'small'))
    expect(await cmd($, 'pokemon', 'everstone pikachu')).toMatch(/everstone/)
    await w.clock.advance(10_000)
    await cmd($, 'pokemon', 'party')
    expect(w.saveNow().spent).toBe(3000)
    expect(w.saveNow().bag).toEqual({ 'fire-stone': 1 })
    expect(w.saveNow().size).toBe('small')
  },
)

type Band = { drawn: () => Promise<unknown>; redraw: () => Promise<void> }
// The ₽ button's props as drawn afresh.
async function shopOf(band: Band) {
  await band.redraw()
  const find = (node: unknown): unknown => {
    if (typeof node !== 'object' || node === null) return null
    const n = node as { type?: string; props?: { key?: string; props?: unknown } }
    if (n.type === 'Client' && n.props?.key === 'shop') return n.props.props ?? null
    for (const child of Object.values(node)) {
      const found = find(child)
      if (found) return found
    }
    return null
  }
  return find(await band.drawn())
}

test(
  "a write the store refuses (another window holds its lock) isn't shown here: the ₽ stays as stored",
  KIT,
  async ($, on) => {
    const net: Net = { isOnline: true, list: JSON.stringify(LIST) }
    const w = await begin($, on, saved(), ART, undefined, net)
    await cmd($, 'pokemon', 'party')
    const band = (await mountBand($)) as Band
    expect(await shopOf(band)).toMatchObject({ balance: 13_000 })
    let isLocked = true
    net.beforeSet = key => {
      if (key !== 'save' || !isLocked) return
      isLocked = false
      throw new Error('Lock file is already being held')
    }
    expect(await cmd($, 'pokemon', 'buy fire stone')).toMatch(/^Couldn't reach the Pokémon/)
    await w.clock.settle()
    expect(w.saveNow().bag).toBeUndefined()
    expect(await shopOf(band)).toMatchObject({ balance: 13_000 })
    // The next buy goes through.
    expect(await cmd($, 'pokemon', 'buy fire stone')).toMatch(/^Bought a Fire Stone!/)
    expect(await shopOf(band)).toMatchObject({ balance: 10_000 })
  },
)
