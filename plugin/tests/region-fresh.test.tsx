// The fresh-or-keep screen for a save from before regions (who sees it, keep, start fresh, left undecided, two
// windows, a refused write) and /pokemon restart (the confirmation, yes, no, two windows, no band, never a name).
import type { Register } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import type { DialogProps } from '../hooks/dialogs'
import { register } from '../hooks/register'
import { emptySave } from '../hooks/save'
import type { DexEntry, Member, Save } from '../hooks/save'
import { speciesIn, TRAVEL_REGIONS } from '../hooks/travel-regions'
import type { Journey, TravelRegion } from '../hooks/travel-regions'
import { ART, begin, cmd, hourAt, LIST, member, preFeature } from './world'
import type { Net, PreFeatureSave } from './world'

const SLOW = { timeoutMs: 90_000 }
const [KANTO, JOHTO, HOENN] = TRAVEL_REGIONS as [TravelRegion, TravelRegion, TravelRegion]
const KANTO_STARTERS = KANTO.starters

const FRESH_LEDGER = 'xp:earlier'
const KEPT: Journey = { current: 'kanto', tickets: [], starters: {} }
const UNDECIDED: Journey = { current: 'kanto', tickets: [], starters: {}, isUndecided: true }
const NEW: Journey = { current: 'kanto', tickets: [], starters: { kanto: 'due' } }
const WITH_JOHTO: Journey = {
  current: 'johto',
  tickets: ['johto'],
  starters: { kanto: { species: 'bulbasaur' }, johto: { species: 'chikorita' } },
}

const net = (extra: Partial<Net> = {}): Net => ({
  isOnline: true,
  list: JSON.stringify(LIST),
  now: hourAt(12),
  ...extra,
})
const seen = (names: string[]): Record<string, DexEntry> =>
  Object.fromEntries(names.map(n => [n, { seen: 1, shiny: 0, first: 1 }]))
const pikachus = (n: number): Member[] => Array.from({ length: n }, () => member('pikachu', { next: [] }))

/** A pre-feature save: 40 Pokémon (3 in the party), 300 dex entries, ₽80,000, a stone, settings set. */
const veteran = (extra: Partial<Save> = {}): PreFeatureSave =>
  preFeature({
    ...emptySave(),
    party: pikachus(3),
    box: pikachus(37),
    dex: seen([...speciesIn(KANTO), ...speciesIn(JOHTO), ...speciesIn(HOENN).slice(0, 49)]),
    earned: 77_000,
    bag: { 'fire-stone': 2 },
    evolutionStyle: 'white',
    size: 'small',
    ...extra,
  })
/** A save with a journey and a party of one. */
const player = (journey: Journey, extra: Partial<Save> = {}): Save => ({
  ...emptySave(),
  party: pikachus(1),
  journey,
  ...extra,
})

type Band = {
  post: (data: unknown, scope?: { in?: string }) => Promise<void>
  key: (e: { key: string; in?: string }) => Promise<void>
  drawn: () => Promise<unknown>
  redraw: () => Promise<void>
}
type Mountable = { ui: { mount: (t: never) => Promise<unknown> } }
type Node = { type?: string; props?: Record<string, unknown> }
type World = Awaited<ReturnType<typeof begin>>

const mount = ($: Mountable, maxRows = 30, bodyColumns = 100) =>
  $.ui.mount({
    plugin: 'pokemon',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows, bodyColumns },
  } as never) as Promise<Band>
const findNode = (node: unknown, is: (n: Node) => boolean): Node | null => {
  if (typeof node !== 'object' || node === null) return null
  if (is(node as Node)) return node as Node
  for (const child of Object.values(node)) {
    const found = findNode(child, is)
    if (found) return found
  }
  return null
}
/** The band drawn afresh: the dialog's props, or null with no dialog drawn. */
async function dialogOf(band: Band): Promise<DialogProps | null> {
  await band.redraw()
  const node = findNode(await band.drawn(), n => n.type === 'Client' && n.props?.key === 'dialog')
  return (node?.props?.props as DialogProps | undefined) ?? null
}
/** The band drawn afresh: whether the Mart covers it. */
async function isMartDrawn(band: Band): Promise<boolean> {
  await band.redraw()
  return findNode(await band.drawn(), n => n.type === 'Client' && n.props?.key === 'mart') !== null
}
const textOf = (p: DialogProps | null) => (p ? p.lines.map(l => l.map(r => r[0]).join('')).join('\n') : '')
const flat = (p: DialogProps | null) => textOf(p).replace(/\s+/g, ' ')
const act = (band: Band, a: unknown) => band.post({ act: a }, { in: 'dialog' })
const stored = (w: World): Record<string, unknown> => w.store.get('save') as Record<string, unknown>
/** The stored save without the fields every write may touch. */
const kept = (s: Record<string, unknown>) => {
  const { journey: _j, version: _v, ...rest } = s
  return rest
}
/** `/pokemon restart` typed, then the band drawn afresh; the reply. */
async function restartIn($: Parameters<typeof cmd>[0], band: Band): Promise<string> {
  const reply = await cmd($, 'pokemon', 'restart')
  await band.redraw()
  return reply
}
const endSession = ($: { session: { end: (e: never) => Promise<unknown> } }) =>
  $.session.end({ reason: 'other', sessionId: 'before' } as never)
const newSession = async ($: {
  session: { start: (e: never) => Promise<unknown>; end: (e: never) => Promise<unknown> }
}) => {
  await endSession($)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true } as never)
}

/** The world and a session in it, with the engine's own row answering a band the plugin doesn't draw. */
function play(
  $: Parameters<typeof begin>[0],
  on: Parameters<typeof begin>[1],
  saved: Save | PreFeatureSave | undefined,
  n: Net = net(),
) {
  on('ui.render', async () => ({ type: 'Text', children: ['engine'] }) as never)
  on('session.end', async (_$, e) => ({ sessionId: e.sessionId }))
  return begin($, on, saved, ART, undefined, n)
}

type Handler = (...args: unknown[]) => Promise<unknown>
/**
 * Another window: its own copy of the plugin over `store`, driven through its hooks.
 * @returns `run`: a command's reply; `act`: a dialog act posted to its band; `toasts`; `gates.read`: its `at`-th read
 *   of the save from now held until `until`, answered with what it read then.
 */
async function otherWindow(store: Map<string, unknown>) {
  const hooks = new Map<string, Handler>()
  const on = ((event: string, ...rest: unknown[]) => {
    const handler = rest[rest.length - 1] as Handler
    const match = rest.length > 1 ? (rest[0] as { command?: string }) : {}
    hooks.set(match.command ? `${event}:${match.command}` : event, handler)
  }) as unknown as Parameters<Register>[0]
  register(on, {} as never)
  const toasts: string[] = []
  const gates: { read?: { at: number; until: Promise<void> } } = {}
  const state = new Map<string, { value: unknown; version: number }>()
  const ref = (r: { key: string; id?: string }) => `${r.key}|${r.id ?? ''}`
  const nothing = (): unknown =>
    new Proxy(() => {}, { get: (_t, p) => (p === 'then' ? undefined : nothing()), apply: () => Promise.resolve() })
  const within = <T extends object>(t: T) => new Proxy(t, { get: (o, p) => (p in o ? o[p as keyof T] : nothing()) })
  const $ = within({
    store: {
      get: async (key: string) => {
        const value = store.get(key)
        const held = key === 'save' && gates.read && --gates.read.at === 0 ? gates.read.until : undefined
        if (held) await held
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
    ui: within({ toast: (text: string) => void toasts.push(text) }),
  })
  await hooks.get('session.start')?.($, { cwd: '/tmp' }, async (e: unknown) => e)
  const run = async (command: string, args = '') =>
    ((await hooks.get(`command.run:${command}`)?.($, { command, args })) as { text?: string } | undefined)?.text ?? ''
  const actIn = (a: unknown) =>
    hooks.get('ui.message')?.($, { element: 'dialog', data: { act: a } }, async (e: unknown) => e)
  await run('pokemon', 'party')
  return { run, act: actIn, toasts, gates }
}

// ── Who sees it ──

test('a pre-feature save: 40 Pokémon · 300 seen · ₽80,000 and what each option does', SLOW, async ($, on) => {
  await play($, on, veteran())
  await cmd($, 'pokemon', 'party')
  const shown = flat(await dialogOf(await mount($)))
  expect(shown).toContain('40 Pokémon · 300 seen · ₽80,000')
  expect(shown).toContain('Start fresh')
  expect(shown).toContain('Wipes your progress and gives you a Kanto starter.')
  expect(shown).toContain('Keep my save')
  expect(shown).toContain('Keeps everything, but you start in Kanto with later regions locked.')
})

test('a pre-feature save with nothing in it: 0 Pokémon · 0 seen · ₽3,000', SLOW, async ($, on) => {
  await play($, on, preFeature(emptySave()))
  await cmd($, 'pokemon', 'party')
  expect(flat(await dialogOf(await mount($)))).toContain('0 Pokémon · 0 seen · ₽3,000')
})

test('a pre-feature save with one Pokémon in the box and ledger ₽: 1 Pokémon, the ₽ counted', SLOW, async ($, on) => {
  const one = preFeature({ ...emptySave(), box: pikachus(1), dex: seen(['pikachu']) })
  await play($, on, one, net({ keys: { [FRESH_LEDGER]: { at: 1, xp: {}, money: 500 } } }))
  await cmd($, 'pokemon', 'party')
  expect(flat(await dialogOf(await mount($)))).toContain('1 Pokémon · 1 seen · ₽3,500')
})

test('no save: the Kanto starter choice, never the fresh-or-keep screen', SLOW, async ($, on) => {
  await play($, on, undefined)
  await cmd($, 'pokemon', 'party')
  const shown = textOf(await dialogOf(await mount($)))
  expect(shown).toContain('KANTO · NEW PARTNER')
  expect(shown).not.toContain('Keep my save')
})

test('a save with a journey: no dialog at all', SLOW, async ($, on) => {
  const w = await play($, on, player(KEPT))
  await cmd($, 'pokemon', 'party')
  const band = await mount($)
  await w.clock.advance(30_000)
  expect(await dialogOf(band)).toBeNull()
})

// ── Keep my save ──

test(
  'Keep my save: Kanto only and current, no ticket, everything else unchanged, no starter choice',
  SLOW,
  async ($, on) => {
    const w = await play($, on, veteran())
    await cmd($, 'pokemon', 'party')
    const before = kept(stored(w))
    const band = await mount($)
    await act(band, { pick: 1 })
    expect(await dialogOf(band)).toBeNull()
    expect(stored(w).journey).toEqual(KEPT)
    expect(kept(stored(w))).toEqual(before)
    expect(w.toasts).toContain('Kept your save.')
    await w.clock.advance(30_000)
    expect(await dialogOf(band)).toBeNull()
    await newSession($)
    await cmd($, 'pokemon', 'party')
    expect(await dialogOf(await mount($))).toBeNull()
  },
)

test('→ then Enter keeps the save too', SLOW, async ($, on) => {
  const w = await play($, on, veteran())
  await cmd($, 'pokemon', 'party')
  const band = await mount($)
  await band.key({ key: 'right', in: 'dialog' })
  await band.key({ key: 'return', in: 'dialog' })
  expect(stored(w).journey).toEqual(KEPT)
})

test('the kept save with ₽150,000 and 120 Kanto entries buys the Johto ticket', SLOW, async ($, on) => {
  const save = veteran({ dex: seen([...speciesIn(KANTO).slice(0, 120), ...speciesIn(JOHTO).slice(0, 30)]) })
  const w = await play($, on, { ...save, earned: 147_000 })
  await cmd($, 'pokemon', 'party')
  await act(await mount($), { pick: 1 })
  expect(await cmd($, 'pokemon', 'buy johto ticket')).toMatch(/^Bought the Johto ferry ticket\./)
  expect((stored(w).journey as Journey).tickets).toEqual(['johto'])
})

test('acts posted after the choice was made change nothing', SLOW, async ($, on) => {
  const w = await play($, on, veteran())
  await cmd($, 'pokemon', 'party')
  const band = await mount($)
  await act(band, { pick: 1 })
  const after = stored(w)
  for (const a of [{ pick: 0 }, 'yes', { pick: 1 }, 'enter']) await act(band, a)
  expect(stored(w)).toEqual(after)
  expect(await dialogOf(band)).toBeNull()
})

test('posted keep and fresh data, and acts of the wrong shape, are ignored', SLOW, async ($, on) => {
  const w = await play($, on, veteran())
  await cmd($, 'pokemon', 'party')
  const band = await mount($)
  const before = textOf(await dialogOf(band))
  for (const data of [{ keep: true }, { fresh: true }, { act: { pick: 2 } }, { act: { keep: true } }, 'yes', null])
    await band.post(data, { in: 'dialog' })
  expect(textOf(await dialogOf(band))).toBe(before)
  expect(stored(w).journey ?? UNDECIDED).toEqual(UNDECIDED)
})

// ── Start fresh ──

test(
  'Start fresh, Yes: everything empty, no ticket, ₽3,000 with a ledger unfolded, Kanto only, then the Kanto choice',
  SLOW,
  async ($, on) => {
    const ledger = { at: 1, xp: { gone: 900 }, money: 5000 }
    const w = await play($, on, veteran(), net({ keys: { [FRESH_LEDGER]: ledger } }))
    await cmd($, 'pokemon', 'party')
    const band = await mount($)
    await act(band, { pick: 0 })
    const asked = textOf(await dialogOf(band))
    expect(asked).toContain('Start fresh?')
    expect(asked).toContain('Yes, wipe it')
    expect(stored(w).journey ?? UNDECIDED).toEqual(UNDECIDED)
    await act(band, 'yes')
    const s = w.saveNow()
    expect(s.party).toEqual([])
    expect(s.box ?? []).toEqual([])
    expect(s.dex).toEqual({})
    expect(s.bag ?? {}).toEqual({})
    expect(s.journey).toEqual(NEW)
    expect([s.evolutionStyle, s.size]).toEqual(['white', 'small'])
    expect(await cmd($, 'pokemon', 'bag')).toMatch(/^Bag · ₽3,000\n/)
    expect(await cmd($, 'pokemon', 'party')).toBe('Your party is empty. /pokemon <name> picks a lead.')
    expect(w.toasts).toContain('Started fresh with ₽3,000.')
    expect(textOf(await dialogOf(band))).toContain('KANTO · NEW PARTNER')
    await act(band, { pick: 0 })
    await act(band, 'yes')
    expect(w.saveNow().party.map(m => m.species)).toEqual(['bulbasaur'])
  },
)

test('Start fresh, No: nothing changes and the choice is shown again', SLOW, async ($, on) => {
  const w = await play($, on, veteran())
  await cmd($, 'pokemon', 'party')
  const before = stored(w)
  const band = await mount($)
  await act(band, { pick: 0 })
  await act(band, 'no')
  const shown = flat(await dialogOf(band))
  expect(shown).toContain('Keep my save')
  expect(shown).toContain('40 Pokémon · 300 seen · ₽80,000')
  expect(stored(w)).toEqual(before)
})

// ── Undecided ──

test('dismissed: plays as Kanto only with the save unchanged; the next session opens it again', SLOW, async ($, on) => {
  const w = await play($, on, veteran())
  await cmd($, 'pokemon', 'party')
  const before = stored(w)
  const band = await mount($)
  await band.key({ key: 'x', in: 'dialog' })
  expect(await dialogOf(band)).toBeNull()
  expect(stored(w)).toEqual(before)
  expect(await cmd($, 'pokemon', 'travel johto')).toBe('You have no Johto ferry ticket.')
  expect(await cmd($, 'pokemon', 'travel')).toBe('Sail where? You can visit Kanto: /pokemon travel <region>')
  await newSession($)
  await cmd($, 'pokemon', 'party')
  expect(flat(await dialogOf(await mount($)))).toContain('Keep my save')
})

test('typing into it closes it, still undecided', SLOW, async ($, on) => {
  on('prompt.fill', async () => ({ isFilled: true }))
  const w = await play($, on, veteran())
  await cmd($, 'pokemon', 'party')
  const band = await mount($)
  for (const key of [...'/pokemon']) await band.key({ key, in: 'dialog' })
  expect(await dialogOf(band)).toBeNull()
  expect(stored(w).journey ?? UNDECIDED).toEqual(UNDECIDED)
})

test('a session ended with the screen open: it opens in the next session', SLOW, async ($, on) => {
  await play($, on, veteran())
  await cmd($, 'pokemon', 'party')
  expect(await dialogOf(await mount($))).not.toBeNull()
  await newSession($)
  await cmd($, 'pokemon', 'party')
  expect(flat(await dialogOf(await mount($)))).toContain('Keep my save')
})

test('a session ended with the screen open: another window opens it', SLOW, async ($, on) => {
  const w = await play($, on, veteran())
  await cmd($, 'pokemon', 'party')
  await mount($)
  await endSession($)
  const other = await otherWindow(w.store)
  await other.act({ pick: 1 })
  expect((w.store.get('save') as Save).journey).toEqual(KEPT)
  expect(other.toasts).toContain('Kept your save.')
})

// ── Two windows ──

test('kept in another window: this one closes its screen at sync and never opens it again', SLOW, async ($, on) => {
  const w = await play($, on, veteran())
  await cmd($, 'pokemon', 'party')
  const band = await mount($)
  const other = await otherWindow(w.store)
  await other.act({ pick: 1 })
  await w.clock.advance(10_500)
  expect(await dialogOf(band)).toBeNull()
  expect(w.toasts).toContain('Your save was kept in another window.')
  await newSession($)
  await cmd($, 'pokemon', 'party')
  expect(await dialogOf(await mount($))).toBeNull()
})

test('kept here: a Start fresh confirmed later in another window wipes nothing', SLOW, async ($, on) => {
  const w = await play($, on, veteran())
  await cmd($, 'pokemon', 'party')
  const other = await otherWindow(w.store)
  await other.act({ pick: 0 })
  await act(await mount($), { pick: 1 })
  const after = stored(w)
  await other.act('yes')
  expect(stored(w)).toEqual(after)
  expect(other.toasts).toContain('Your save was already chosen.')
})

test('fresh here and keep there at once: one takes effect, both windows show that save', SLOW, async ($, on) => {
  const w = await play($, on, veteran())
  await cmd($, 'pokemon', 'party')
  const band = await mount($)
  const other = await otherWindow(w.store)
  let release = () => {}
  other.gates.read = { at: 1, until: new Promise<void>(resolve => (release = resolve)) }
  const theirs = other.act({ pick: 1 })
  for (let i = 0; i < 20 && other.gates.read.at > 0; i++) await w.clock.settle()
  expect(other.gates.read.at).toBe(0)
  await act(band, { pick: 0 })
  await act(band, 'yes')
  release()
  await theirs
  expect(w.saveNow().journey).toEqual(NEW)
  expect(w.saveNow().party).toEqual([])
  expect(other.toasts).toContain('Your save was already chosen.')
  expect(other.toasts).not.toContain('Kept your save.')
  const empty = 'Your party is empty. /pokemon <name> picks a lead.'
  expect(await cmd($, 'pokemon', 'party')).toBe(empty)
  expect(await other.run('pokemon', 'party')).toBe(empty)
})

// ── Restart ──

test('/pokemon restart: the confirmation lists what is wiped; nothing changes yet', SLOW, async ($, on) => {
  const w = await play($, on, player(WITH_JOHTO, { earned: 9000 }))
  await cmd($, 'pokemon', 'party')
  const before = stored(w)
  const band = await mount($)
  expect(await cmd($, 'pokemon', 'restart')).toMatch(/confirmation is open above the prompt/)
  const shown = flat(await dialogOf(band))
  expect(shown).toContain('Restart your journey from scratch?')
  expect(shown).toContain('party, box, Pokédex, ₽, items, XP, stats and ferry tickets')
  expect(stored(w)).toEqual(before)
})

test(
  'restart confirmed with the Johto ticket owned: wiped, no ticket, Kanto only, the Kanto choice',
  SLOW,
  async ($, on) => {
    const w = await play($, on, player(WITH_JOHTO, { earned: 9000, bag: { 'fire-stone': 1 } }))
    await cmd($, 'pokemon', 'party')
    const band = await mount($)
    await restartIn($, band)
    await act(band, 'yes')
    const s = w.saveNow()
    expect([s.party, s.box ?? [], s.dex, s.bag ?? {}]).toEqual([[], [], {}, {}])
    expect(s.journey).toEqual(NEW)
    expect(await cmd($, 'pokemon', 'bag')).toMatch(/^Bag · ₽3,000\n/)
    expect(textOf(await dialogOf(band))).toContain('KANTO · NEW PARTNER')
  },
)

test('y by key on the wipe confirmation, fresh or restart, wipes nothing', SLOW, async ($, on) => {
  on('prompt.fill', async () => ({ isFilled: true }))
  const w = await play($, on, veteran())
  await cmd($, 'pokemon', 'party')
  const before = stored(w)
  const band = await mount($)
  await act(band, { pick: 0 })
  expect(textOf(await dialogOf(band))).toContain('Start fresh?')
  await band.key({ key: 'y', in: 'dialog' })
  expect(stored(w)).toEqual(before)
  expect(await cmd($, 'pokemon', 'keep')).toBe('Kept your save.')
  const afterKeep = stored(w)
  await restartIn($, band)
  await band.key({ key: 'y', in: 'dialog' })
  expect(stored(w)).toEqual(afterKeep)
})

test(
  'restart with an idle ledger holding ₽5,000: the wallet stays ₽3,000 through the fold rounds',
  SLOW,
  async ($, on) => {
    const ledger = { at: 1, xp: {}, money: 5000 }
    const w = await play($, on, player(WITH_JOHTO, { earned: 9000 }), net({ keys: { [FRESH_LEDGER]: ledger } }))
    await cmd($, 'pokemon', 'party')
    const band = await mount($)
    await restartIn($, band)
    await act(band, 'yes')
    expect(await cmd($, 'pokemon', 'bag')).toMatch(/^Bag · ₽3,000\n/)
    // 30 syncs make one fold round; the second removes the folded ledger.
    for (let i = 0; i < 60; i++) await w.clock.advance(10_000)
    expect(w.store.has(FRESH_LEDGER)).toBe(false)
    expect(await cmd($, 'pokemon', 'bag')).toMatch(/^Bag · ₽3,000\n/)
  },
)

test('restart declined or dismissed: nothing changes and the band is back', SLOW, async ($, on) => {
  const w = await play($, on, player(WITH_JOHTO))
  await cmd($, 'pokemon', 'party')
  const before = stored(w)
  const band = await mount($)
  for (const a of ['no', 'close']) {
    await restartIn($, band)
    await act(band, a)
    expect(await dialogOf(band)).toBeNull()
    expect(stored(w)).toEqual(before)
  }
  await restartIn($, band)
  await band.key({ key: 'n', in: 'dialog' })
  expect(await dialogOf(band)).toBeNull()
  expect(stored(w)).toEqual(before)
})

test(
  'restart confirmed here: another window shows the fresh save; the Kanto starter is made once',
  SLOW,
  async ($, on) => {
    const w = await play($, on, player(WITH_JOHTO))
    await cmd($, 'pokemon', 'party')
    const band = await mount($)
    const watching = await otherWindow(w.store)
    await restartIn($, band)
    await act(band, 'yes')
    expect(await watching.run('pokemon', 'party')).toBe('Your party is empty. /pokemon <name> picks a lead.')
    expect(await watching.run('pokemon', 'bag')).toMatch(/^Bag · ₽3,000\n/)
    const opened = await otherWindow(w.store)
    await opened.act({ pick: 2 })
    await opened.act('yes')
    await act(band, { pick: 0 })
    await act(band, 'yes')
    const starters = w.saveNow().party.filter(m => KANTO_STARTERS.includes(m.species))
    expect(starters.map(m => m.species)).toEqual(['squirtle'])
    expect(w.toasts).toContain('You already chose Squirtle as your Kanto starter.')
  },
)

test('restart while the fresh-or-keep screen is open: confirmed, the save starts fresh', SLOW, async ($, on) => {
  const w = await play($, on, veteran())
  await cmd($, 'pokemon', 'party')
  const band = await mount($)
  expect(flat(await dialogOf(band))).toContain('Keep my save')
  await restartIn($, band)
  expect(flat(await dialogOf(band))).toContain('Restart your journey from scratch?')
  await act(band, 'yes')
  expect(w.saveNow().journey).toEqual(NEW)
  expect(w.saveNow().party).toEqual([])
  expect(textOf(await dialogOf(band))).toContain('KANTO · NEW PARTNER')
})

test('restart with the Mart open: the Mart closes for the confirmation', SLOW, async ($, on) => {
  await play($, on, player(KEPT))
  await cmd($, 'pokemon', 'party')
  const band = await mount($)
  await cmd($, 'pokemon', 'mart')
  expect(await isMartDrawn(band)).toBe(true)
  await restartIn($, band)
  expect(await isMartDrawn(band)).toBe(false)
  expect(flat(await dialogOf(band))).toContain('Restart your journey from scratch?')
})

test('restart with the party off, or no band drawn: refused, nothing changes', SLOW, async ($, on) => {
  const w = await play($, on, player(WITH_JOHTO))
  await cmd($, 'pokemon', 'party')
  expect(await cmd($, 'pokemon', 'restart')).toMatch(/isn't showing here/)
  const band = await mount($)
  await cmd($, 'pokemon', 'off')
  const before = stored(w)
  expect(await cmd($, 'pokemon', 'restart')).toMatch(/isn't showing here/)
  expect(await dialogOf(band)).toBeNull()
  expect(stored(w)).toEqual(before)
})

test('restart is never read as a name, in any case, even with the species list stalled', SLOW, async ($, on) => {
  const w = await play($, on, player(KEPT))
  await cmd($, 'pokemon', 'party')
  const band = await mount($)
  const before = stored(w)
  w.net.stall = new Promise<void>(() => {})
  for (const word of ['restart', 'RESTART', 'Restart']) {
    let reply: string | null = null
    void cmd($, 'pokemon', word).then(text => (reply = text))
    await w.clock.advance(500)
    expect(reply).toMatch(/confirmation is open above the prompt/)
    expect(flat(await dialogOf(band))).toContain('Restart your journey from scratch?')
    await act(band, 'close')
  }
  expect(stored(w)).toEqual(before)
})

// ── A refused write ──

test(
  "a refused store write on Start fresh: the save and the confirmation stay, Couldn't do that; Yes again works",
  SLOW,
  async ($, on) => {
    const refusing = net()
    const w = await play($, on, veteran(), refusing)
    await cmd($, 'pokemon', 'party')
    const before = stored(w)
    const band = await mount($)
    await act(band, { pick: 0 })
    refusing.beforeSet = key => {
      if (key === 'save') throw new Error('store locked')
    }
    await act(band, 'yes')
    expect(textOf(await dialogOf(band))).toContain('Start fresh?')
    expect(w.toasts.filter(t => t.startsWith("Couldn't do that: "))).toHaveLength(1)
    expect(stored(w)).toEqual(before)
    refusing.beforeSet = undefined
    await act(band, 'yes')
    expect(w.saveNow().journey).toEqual(NEW)
  },
)

test("a refused store write on Keep my save: the screen stays, Couldn't do that", SLOW, async ($, on) => {
  const refusing = net()
  const w = await play($, on, veteran(), refusing)
  await cmd($, 'pokemon', 'party')
  const band = await mount($)
  refusing.beforeSet = key => {
    if (key === 'save') throw new Error('store locked')
  }
  await act(band, { pick: 1 })
  expect(flat(await dialogOf(band))).toContain('Keep my save')
  expect(w.toasts.filter(t => t.startsWith("Couldn't do that: "))).toHaveLength(1)
  expect(stored(w).journey ?? UNDECIDED).toEqual(UNDECIDED)
})

// ── Typed answers ──

const WIPED_WORDS = ['party', 'box', 'Pokédex', '₽', 'items', 'XP', 'stats', 'ferry tickets']

test(
  '/pokemon keep answers the fresh-or-keep screen: kept, the screen gone; again, already chosen (A118)',
  SLOW,
  async ($, on) => {
    const w = await play($, on, veteran())
    await cmd($, 'pokemon', 'party')
    const band = await mount($)
    const before = kept(stored(w))
    expect(flat(await dialogOf(band))).toContain('Keep my save')
    expect(await cmd($, 'pokemon', 'keep')).toBe('Kept your save.')
    expect(w.saveNow().journey).toEqual(KEPT)
    expect(kept(stored(w))).toEqual(before)
    expect(await dialogOf(band)).toBeNull()
    expect(await cmd($, 'pokemon', 'keep')).toBe('Your save was already chosen.')
    expect(w.saveNow().journey).toEqual(KEPT)
  },
)

test(
  '/pokemon fresh asks first, stating what is wiped; /pokemon fresh yes wipes and opens the Kanto choice',
  SLOW,
  async ($, on) => {
    const w = await play($, on, veteran())
    await cmd($, 'pokemon', 'party')
    const band = await mount($)
    const before = stored(w)
    const asked = await cmd($, 'pokemon', 'fresh')
    for (const word of WIPED_WORDS) expect(asked).toContain(word)
    expect(asked).toContain('/pokemon fresh yes')
    expect(flat(await dialogOf(band))).toContain('Start fresh?')
    expect(stored(w)).toEqual(before)
    expect(await cmd($, 'pokemon', 'fresh yes')).toBe('Started fresh with ₽3,000.')
    expect(w.saveNow().journey).toEqual(NEW)
    expect(w.saveNow().party).toEqual([])
    expect(textOf(await dialogOf(band))).toContain('KANTO · NEW PARTNER')
  },
)

test('/pokemon fresh no goes back to the choice; fresh yes with nothing asked is refused', SLOW, async ($, on) => {
  const w = await play($, on, veteran())
  await cmd($, 'pokemon', 'party')
  const band = await mount($)
  const before = stored(w)
  const refused = await cmd($, 'pokemon', 'fresh yes')
  expect(refused.split('\n')).toHaveLength(1)
  expect(refused).toContain('/pokemon fresh')
  expect(stored(w)).toEqual(before)
  await cmd($, 'pokemon', 'fresh')
  expect(await cmd($, 'pokemon', 'fresh no')).toMatch(/nothing changed/i)
  expect(flat(await dialogOf(band))).toContain('Keep my save')
  expect(stored(w)).toEqual(before)
})

test('/pokemon fresh on a save already chosen is refused in one line, nothing changes', SLOW, async ($, on) => {
  const w = await play($, on, player(WITH_JOHTO))
  await cmd($, 'pokemon', 'party')
  await mount($)
  const before = stored(w)
  for (const args of ['fresh', 'fresh yes', 'keep'])
    expect(await cmd($, 'pokemon', args)).toBe('Your save was already chosen.')
  expect(stored(w)).toEqual(before)
})

test('/pokemon restart yes confirms the open restart; no closes it; with none open, refused', SLOW, async ($, on) => {
  const w = await play($, on, player(WITH_JOHTO))
  await cmd($, 'pokemon', 'party')
  const band = await mount($)
  const before = stored(w)
  const refused = await cmd($, 'pokemon', 'restart yes')
  expect(refused.split('\n')).toHaveLength(1)
  expect(refused).toContain('/pokemon restart')
  expect(stored(w)).toEqual(before)
  await cmd($, 'pokemon', 'restart')
  expect(await cmd($, 'pokemon', 'restart no')).toMatch(/nothing changed/i)
  expect(await dialogOf(band)).toBeNull()
  expect(stored(w)).toEqual(before)
  const asked = await cmd($, 'pokemon', 'restart')
  for (const word of WIPED_WORDS) expect(asked).toContain(word)
  expect(asked).not.toContain('ctrl+x')
  expect(await cmd($, 'pokemon', 'restart yes')).toBe('Started fresh with ₽3,000.')
  expect(w.saveNow().journey).toEqual(NEW)
  expect(textOf(await dialogOf(band))).toContain('KANTO · NEW PARTNER')
})

test('keep, fresh and choose are never read as names, even with the species list stalled', SLOW, async ($, on) => {
  const w = await play($, on, player(KEPT))
  await cmd($, 'pokemon', 'party')
  await mount($)
  w.net.stall = new Promise<void>(() => {})
  for (const args of ['keep', 'FRESH', 'choose bulbasaur']) {
    let reply: string | null = null
    void cmd($, 'pokemon', args).then(text => (reply = text))
    await w.clock.advance(500)
    expect([args, reply]).toEqual([args, expect.stringMatching(/already chosen|no starter to choose/i)])
  }
})

test('a confirmation too small to show what it wipes takes no yes, by key or post', SLOW, async ($, on) => {
  const w = await play($, on, player(WITH_JOHTO))
  await cmd($, 'pokemon', 'party')
  const before = stored(w)
  await restartIn($, await mount($))
  const small = await mount($, 1, 40)
  expect(flat(await dialogOf(small))).toMatch(/too small/i)
  await act(small, 'yes')
  expect(stored(w)).toEqual(before)
  expect(flat(await dialogOf(small))).toMatch(/too small/i)
  await small.key({ key: 'y', in: 'dialog' })
  expect(stored(w)).toEqual(before)
})

test(
  'undecided and dismissed: no ticket can be bought nor sailed on; Keep then gives Kanto with no ticket (R37)',
  SLOW,
  async ($, on) => {
    const w = await play($, on, veteran({ earned: 1_000_000 }))
    await cmd($, 'pokemon', 'party')
    const band = await mount($)
    await act(band, 'close')
    expect(await cmd($, 'pokemon', 'buy johto ticket')).toMatch(/keep your save or start fresh first/i)
    expect(await cmd($, 'pokemon', 'travel johto')).toBe('You have no Johto ferry ticket.')
    expect(await cmd($, 'pokemon', 'keep')).toBe('Kept your save.')
    expect(w.saveNow().journey).toEqual(KEPT)
  },
)
