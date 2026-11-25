// The starter choice in the band: a new player's Kanto choice instead of a random first Pokémon, the first arrival's
// choice after a voyage, choosing (party, box, once only), a choice left pending (dismissed, a session ended), two
// windows choosing, a refused write, malformed posts, typing, and what the open dialog holds back (Mart, visitors).
import type { Register } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { STARTER_SCENE_ROWS } from '../hooks/dialogs'
import type { DialogProps } from '../hooks/dialogs'
import { FERRY_MS, SAILED_MS } from '../hooks/ferry-screen'
import { register } from '../hooks/register'
import { balanceOf, emptySave, MAX_PARTY } from '../hooks/save'
import type { Save } from '../hooks/save'
import { TRAVEL_REGIONS } from '../hooks/travel-regions'
import type { Journey, TravelRegion } from '../hooks/travel-regions'
import { ART, begin, cmd, hourAt, LIST, member } from './world'
import type { Net } from './world'

const SLOW = { timeoutMs: 90_000 }
const BULBASAUR = 0x0b0c0d
const PIKACHU = 0x0a0b0c
const JOHTO = TRAVEL_REGIONS[1] as TravelRegion
const ALL_STARTERS = TRAVEL_REGIONS.flatMap(r => r.starters)

const CHARMANDER = 0x0d0e0f
const ART_COLORS = ['#ff0000', '#0000ff', '#00ff00']
const KANTO_CHOSEN = { kanto: { species: 'bulbasaur' } }
const TO_JOHTO: Journey = { current: 'kanto', tickets: ['johto'], starters: KANTO_CHOSEN }
const JOHTO_DUE: Journey = { current: 'johto', tickets: ['johto'], starters: { ...KANTO_CHOSEN, johto: 'due' } }

/** `size` rows of `size` columns of one colour. */
const solid = (rgb: number, size: number) => {
  const c = `${(rgb >> 16) & 255};${(rgb >> 8) & 255};${rgb & 255}`
  return Array.from({ length: size }, () => `\x1b[38;2;${c}m\x1b[48;2;${c}m▀\x1b[0m`.repeat(size)).join('\n')
}
const hex = (rgb: number) => `#${rgb.toString(16).padStart(6, '0')}`
const net = (extra: Partial<Net> = {}): Net => ({
  isOnline: true,
  list: JSON.stringify(LIST),
  now: hourAt(12),
  sprites: { bulbasaur: solid(BULBASAUR, 6), pikachu: solid(PIKACHU, 6) },
  ...extra,
})
const player = (journey: Journey, extra: Partial<Save> = {}): Save => ({
  ...emptySave(),
  party: [member('pikachu', { next: [] })],
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

const mount = ($: Mountable, maxRows = 30, bodyColumns = 80) =>
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
/** The band drawn afresh, as the Client's or Raster's own element: its rows. */
async function heightOf(band: Band): Promise<number> {
  await band.redraw()
  const node = findNode(await band.drawn(), n => n.type === 'Client' && n.props?.key === 'dialog')
  return Number(node?.props?.height ?? 0)
}
const textOf = (p: DialogProps | null) => (p ? p.lines.map(l => l.map(r => r[0]).join('')).join('\n') : '')
const colorsOf = (p: DialogProps | null) => new Set((p?.lines ?? []).flatMap(l => l.flatMap(r => [r[1], r[2]])))
const picks = (p: DialogProps | null) =>
  [...new Set((p?.hits ?? []).flatMap(h => (typeof h.act === 'object' && 'pick' in h.act ? [h.act.pick] : [])))].sort()
const act = (band: Band, a: unknown) => band.post({ act: a }, { in: 'dialog' })
const decode = (cells: string) => [...new Uint32Array(Uint8Array.from(atob(cells), c => c.charCodeAt(0)).buffer)]
/** The characters of the band's scene Raster drawn afresh; '' with none. */
async function sceneText(band: Band): Promise<string> {
  await band.redraw()
  const raster = findNode(await band.drawn(), n => n.type === 'Raster' && n.props?.key === 'scene')
  if (!raster) return ''
  const words = decode(String(raster.props?.cells ?? ''))
  const chars: number[] = []
  for (let i = 0; i < words.length; i += 3) chars.push(words[i] ?? 0x20)
  return String.fromCodePoint(...chars)
}
/** @returns what the band showed before the dialog was drawn, in order, and how long that took. */
async function untilDialog(w: World, band: Band, maxMs: number): Promise<{ before: string[]; ms: number }> {
  const before: string[] = []
  for (let ms = 0; ms <= maxMs; ms += 100) {
    if (await dialogOf(band)) return { before, ms }
    before.push(await sceneText(band))
    await w.clock.advance(100)
  }
  throw new Error(`no dialog within ${maxMs} ms`)
}
const stored = (w: World): Save | undefined => w.store.get('save') as Save | undefined
const owned = (s: Save | undefined) => [...(s?.party ?? []), ...(s?.box ?? [])]
const startersOwned = (s: Save | undefined) => owned(s).filter(m => ALL_STARTERS.includes(m.species))
const restart = async ($: {
  session: { start: (e: never) => Promise<unknown>; end: (e: never) => Promise<unknown> }
}) => {
  await $.session.end({ reason: 'other', sessionId: 'before' } as never)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true } as never)
}

/** The world and a session in it, with the engine's own row answering a band the plugin doesn't draw. */
function play($: Parameters<typeof begin>[0], on: Parameters<typeof begin>[1], saved: Save | undefined, n: Net) {
  on('ui.render', async () => ({ type: 'Text', children: ['engine'] }) as never)
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

// ── A new player ──

test(
  'no save: the Kanto choice opens with Bulbasaur, its sprite, Grass/Poison, three balls; the party stays empty',
  SLOW,
  async ($, on) => {
    const w = await play($, on, undefined, net())
    expect(await cmd($, 'pokemon', 'party')).toBe('Your party is empty. /pokemon <name> picks a lead.')
    const band = await mount($)
    let shown = await dialogOf(band)
    for (let i = 0; i < 50 && !colorsOf(shown).has(hex(BULBASAUR)); i++) {
      await w.clock.advance(100)
      shown = await dialogOf(band)
    }
    const text = textOf(shown)
    expect(text).toContain('KANTO · NEW PARTNER')
    expect(text).toContain('BULBASAUR')
    expect(text).toMatch(/Grass +Poison/)
    expect(colorsOf(shown).has(hex(BULBASAUR))).toBe(true)
    expect(picks(shown)).toEqual([0, 1, 2])
    expect(await heightOf(band)).toBe(STARTER_SCENE_ROWS)
    await w.clock.advance(30_000)
    expect(owned(stored(w))).toEqual([])
    expect(await dialogOf(band)).not.toBeNull()
  },
)

const spriteFetches = (w: World, species: string) =>
  w.fetched.filter(url => url.endsWith(`/colorscripts/small/regular/${species}`)).length

test(
  'the first save read failing: the Kanto choice opens at the next sync once the store answers',
  SLOW,
  async ($, on) => {
    let reads = 0
    const n = net({ isStoreBroken: true })
    n.beforeGet = key => void (key === 'save' && ++reads > 1 && (n.isStoreBroken = false))
    const w = await play($, on, undefined, n)
    const band = await mount($)
    expect(await dialogOf(band)).toBeNull()
    await w.clock.advance(11_000)
    expect(textOf(await dialogOf(band))).toContain('KANTO · NEW PARTNER')
  },
)

test('the first save read failing on a pre-region save: fresh-or-keep opens at the next sync', SLOW, async ($, on) => {
  let reads = 0
  const n = net({ isStoreBroken: true })
  n.beforeGet = key => void (key === 'save' && ++reads > 1 && (n.isStoreBroken = false))
  const { journey: _, ...preRegion } = player(TO_JOHTO)
  const w = await play($, on, preRegion as Save, n)
  const band = await mount($)
  expect(await dialogOf(band)).toBeNull()
  await w.clock.advance(11_000)
  expect(textOf(await dialogOf(band))).toContain('Keep my save')
})

test('one stalled starter sprite holds back neither of the others', SLOW, async ($, on) => {
  const w = await play(
    $,
    on,
    undefined,
    net({
      sprites: { bulbasaur: solid(BULBASAUR, 6), charmander: solid(CHARMANDER, 6) },
      artStall: file => (file === 'bulbasaur' ? new Promise<void>(() => {}) : undefined),
    }),
  )
  await cmd($, 'pokemon', 'party')
  const band = await mount($)
  await act(band, 'right')
  for (let i = 0; i < 20 && !colorsOf(await dialogOf(band)).has(hex(CHARMANDER)); i++) await w.clock.advance(100)
  expect(colorsOf(await dialogOf(band)).has(hex(CHARMANDER))).toBe(true)
})

test('a periodic retry while the opening download stalls starts no second download', SLOW, async ($, on) => {
  let release = () => {}
  const stalled = new Promise<void>(resolve => (release = resolve))
  const w = await play($, on, undefined, net({ artStall: file => (file === 'bulbasaur' ? stalled : undefined) }))
  const band = await mount($)
  await w.clock.advance(15_000)
  expect(spriteFetches(w, 'bulbasaur')).toBe(1)
  release()
  for (let i = 0; i < 20 && !colorsOf(await dialogOf(band)).has(hex(BULBASAUR)); i++) await w.clock.advance(100)
  expect(colorsOf(await dialogOf(band)).has(hex(BULBASAUR))).toBe(true)
  expect(spriteFetches(w, 'bulbasaur')).toBe(1)
})

test('a hover on the ball already highlighted redraws nothing', SLOW, async ($, on) => {
  const w = await play($, on, undefined, net())
  const band = await mount($)
  await w.clock.advance(1000)
  expect(await dialogOf(band)).not.toBeNull()
  const before = w.band.invalidated
  await act(band, { hover: 0 })
  await act(band, { hover: 0 })
  expect(w.band.invalidated).toBe(before)
  await act(band, { hover: 1 })
  expect(w.band.invalidated).toBeGreaterThan(before)
})

test('the arrow right: the panel shows Charmander, Fire; ← back to Bulbasaur', SLOW, async ($, on) => {
  await play($, on, undefined, net())
  await cmd($, 'pokemon', 'party')
  const band = await mount($)
  await act(band, 'right')
  const right = textOf(await dialogOf(band))
  expect(right).toContain('CHARMANDER')
  expect(right).toContain('Fire')
  expect(right).not.toContain('BULBASAUR')
  await band.key({ key: 'left', in: 'dialog' })
  expect(textOf(await dialogOf(band))).toContain('BULBASAUR')
})

test(
  'ball 3 clicked: the question, nothing added; Yes: Squirtle in the party, caught, in the dex, the dialog gone',
  SLOW,
  async ($, on) => {
    const w = await play($, on, undefined, net())
    await cmd($, 'pokemon', 'party')
    const band = await mount($)
    await act(band, { pick: 2 })
    expect(textOf(await dialogOf(band))).toContain('Take SQUIRTLE as your Kanto partner?')
    expect(owned(stored(w))).toEqual([])
    await act(band, 'yes')
    expect(await dialogOf(band)).toBeNull()
    const s = w.saveNow()
    expect(s.party.map(m => [m.species, m.isCaught])).toEqual([['squirtle', true]])
    expect(s.dex.squirtle?.seen).toBeGreaterThanOrEqual(1)
    expect(s.dex.squirtle?.caught).toBe(1)
    expect(s.journey.starters.kanto).toEqual({ species: 'squirtle' })
    expect(w.toasts).toContain('Squirtle joined your party!')
    expect(await cmd($, 'pokemon', 'party')).toContain('Squirtle')
  },
)

test('asked about Squirtle, No: back to the balls with Squirtle highlighted, nothing added', SLOW, async ($, on) => {
  const w = await play($, on, undefined, net())
  await cmd($, 'pokemon', 'party')
  const band = await mount($)
  await act(band, { pick: 2 })
  await act(band, 'no')
  const back = await dialogOf(band)
  expect(textOf(back)).not.toContain('Take SQUIRTLE as your Kanto partner?')
  expect(textOf(back)).toContain('SQUIRTLE')
  expect(textOf(back)).toContain('Water')
  expect(picks(back)).toEqual([0, 1, 2])
  expect(owned(stored(w))).toEqual([])
})

test('Enter then Enter by key: the highlighted starter is chosen', SLOW, async ($, on) => {
  const w = await play($, on, undefined, net())
  await cmd($, 'pokemon', 'party')
  const band = await mount($)
  await band.key({ key: 'right', in: 'dialog' })
  await band.key({ key: 'return', in: 'dialog' })
  expect(textOf(await dialogOf(band))).toContain('Take CHARMANDER as your Kanto partner?')
  await band.key({ key: 'return', in: 'dialog' })
  expect(w.saveNow().party.map(m => m.species)).toEqual(['charmander'])
})

test(
  "Charmander's sprite can't be downloaded: its name and type still show, and it can be chosen",
  SLOW,
  async ($, on) => {
    const w = await play(
      $,
      on,
      undefined,
      net({ sprites: { bulbasaur: solid(BULBASAUR, 6), charmander: 'not a sprite' } }),
    )
    await cmd($, 'pokemon', 'party')
    const band = await mount($)
    for (let i = 0; i < 50 && !colorsOf(await dialogOf(band)).has(hex(BULBASAUR)); i++) await w.clock.advance(100)
    expect(colorsOf(await dialogOf(band)).has(hex(BULBASAUR))).toBe(true)
    await act(band, 'right')
    const shown = await dialogOf(band)
    expect(textOf(shown)).toContain('CHARMANDER')
    expect(textOf(shown)).toContain('Fire')
    for (const color of [hex(BULBASAUR), ...ART_COLORS]) expect(colorsOf(shown).has(color)).toBe(false)
    await act(band, 'enter')
    await act(band, 'yes')
    expect(w.saveNow().party.map(m => m.species)).toEqual(['charmander'])
  },
)

test(
  'dismissed: the party stays empty, no Pokémon arrives, and the next session opens it again',
  SLOW,
  async ($, on) => {
    on('session.end', async (_$, e) => ({ sessionId: e.sessionId }))
    const w = await play($, on, undefined, net())
    await cmd($, 'pokemon', 'party')
    const band = await mount($)
    await act(band, 'close')
    expect(await dialogOf(band)).toBeNull()
    await w.clock.advance(30_000)
    expect(owned(stored(w))).toEqual([])
    await restart($)
    await cmd($, 'pokemon', 'party')
    expect(textOf(await dialogOf(await mount($)))).toContain('KANTO · NEW PARTNER')
    expect(owned(stored(w))).toEqual([])
  },
)

test('a kept save with an empty party: no dialog, nothing added; /pokemon pikachu still works', SLOW, async ($, on) => {
  const w = await play($, on, { ...emptySave() }, net())
  await cmd($, 'pokemon', 'party')
  const band = await mount($)
  await w.clock.advance(30_000)
  expect(await dialogOf(band)).toBeNull()
  expect(w.saveNow().party).toEqual([])
  expect(await cmd($, 'pokemon', 'pikachu')).toMatch(/A wild Pikachu appeared! It's your new lead\.$/)
  expect(w.saveNow().party.map(m => m.species)).toEqual(['pikachu'])
  expect(await dialogOf(band)).toBeNull()
})

// ── The first arrival ──

test(
  'the first sail to Johto: after Welcome to JOHTO!, the Johto choice offers Chikorita, Cyndaquil, Totodile',
  SLOW,
  async ($, on) => {
    const w = await play($, on, player(TO_JOHTO), net())
    await cmd($, 'pokemon', 'party')
    const band = await mount($)
    expect(await dialogOf(band)).toBeNull()
    expect(await cmd($, 'pokemon', 'travel johto')).toBe('Sailing to Johto…')
    const { before, ms } = await untilDialog(w, band, FERRY_MS + 2000)
    expect(ms).toBeGreaterThanOrEqual(FERRY_MS - 300)
    expect(before.some(t => t.includes('Welcome to JOHTO!'))).toBe(true)
    const names: string[] = []
    for (const _ of [0, 1, 2]) {
      const t = textOf(await dialogOf(band))
      expect(t).toContain('JOHTO · NEW PARTNER')
      names.push(['Chikorita', 'Cyndaquil', 'Totodile'].find(n => t.includes(n.toUpperCase())) ?? '')
      await act(band, 'right')
    }
    expect(names).toEqual(['Chikorita', 'Cyndaquil', 'Totodile'])
    expect(w.saveNow().journey.starters.johto).toBe('due')
  },
)

test('on a short band: the Johto choice opens after Sailed to Johto.', SLOW, async ($, on) => {
  const w = await play($, on, player(TO_JOHTO), net())
  await cmd($, 'pokemon', 'party')
  const band = await mount($, 9)
  expect(await cmd($, 'pokemon', 'travel johto')).toBe('Sailed to Johto.')
  const { before, ms } = await untilDialog(w, band, SAILED_MS + 2000)
  expect(ms).toBeGreaterThanOrEqual(SAILED_MS - 300)
  expect(before.some(t => t.includes('Sailed to Johto.'))).toBe(true)
  expect(textOf(await dialogOf(band))).toContain('▶ Chikorita')
  expect(await heightOf(band)).toBe(9)
})

test('a kept save sailing to Johto for the first time gets the Johto choice', SLOW, async ($, on) => {
  const kept: Journey = { ...emptySave().journey, tickets: ['johto'] }
  const w = await play($, on, player(kept), net())
  await cmd($, 'pokemon', 'party')
  const band = await mount($, 9)
  expect(await dialogOf(band)).toBeNull()
  await cmd($, 'pokemon', 'travel johto')
  await untilDialog(w, band, SAILED_MS + 2000)
  expect(textOf(await dialogOf(band))).toContain('Johto · choose your partner')
})

test('Johto chosen, then back to Kanto and to Johto again: no choice on either arrival', SLOW, async ($, on) => {
  const w = await play($, on, player(TO_JOHTO), net())
  await cmd($, 'pokemon', 'party')
  const band = await mount($, 9)
  await cmd($, 'pokemon', 'travel johto')
  await untilDialog(w, band, SAILED_MS + 2000)
  await act(band, { pick: 1 })
  await act(band, 'yes')
  expect(w.saveNow().journey.starters.johto).toEqual({ species: 'cyndaquil' })
  for (const to of ['kanto', 'johto']) {
    expect(await cmd($, 'pokemon', `travel ${to}`)).toMatch(/^Sailed to /)
    for (let t = 0; t < SAILED_MS + 1500; t += 250) {
      await w.clock.advance(250)
      expect(await dialogOf(band)).toBeNull()
    }
  }
  expect(startersOwned(w.saveNow()).map(m => m.species)).toEqual(['cyndaquil'])
})

test('a Galar arrival offers Grookey, Scorbunny, Sobble', SLOW, async ($, on) => {
  const later = TRAVEL_REGIONS.slice(1, 7)
  const toGalar: Journey = {
    current: 'alola',
    tickets: [...later.map(r => r.id), 'galar'],
    starters: Object.fromEntries([
      ['kanto', { species: 'bulbasaur' }],
      ...later.map(r => [r.id, { species: r.starters[0] }]),
    ]),
  }
  const w = await play($, on, player(toGalar), net())
  await cmd($, 'pokemon', 'party')
  const band = await mount($, 9)
  await cmd($, 'pokemon', 'travel galar')
  await untilDialog(w, band, SAILED_MS + 2000)
  const names: string[] = []
  for (const _ of [0, 1, 2]) {
    const t = textOf(await dialogOf(band))
    expect(t).toContain('Galar · choose your partner')
    names.push(['Grookey', 'Scorbunny', 'Sobble'].find(n => t.includes(`▶ ${n}`)) ?? '')
    await act(band, 'right')
  }
  expect(names).toEqual(['Grookey', 'Scorbunny', 'Sobble'])
})

// ── Room ──

test('a full party: Totodile goes to the PC box as caught, and a toast says so', SLOW, async ($, on) => {
  const full = Array.from({ length: MAX_PARTY }, () => member('pikachu', { next: [] }))
  const w = await play($, on, player(JOHTO_DUE, { party: full }), net())
  await cmd($, 'pokemon', 'party')
  const band = await mount($)
  await act(band, { pick: 2 })
  await act(band, 'yes')
  expect(w.saveNow().party).toHaveLength(MAX_PARTY)
  expect((w.saveNow().box ?? []).map(m => [m.species, m.isCaught])).toEqual([['totodile', true]])
  expect(w.toasts).toContain('Totodile was sent to the PC box.')
  expect(await dialogOf(band)).toBeNull()
})

// ── Pending choices ──

test('a second choice after choosing adds nothing: the stale one is refused, naming the first', SLOW, async ($, on) => {
  const w = await play($, on, player(JOHTO_DUE), net())
  await cmd($, 'pokemon', 'party')
  const band = await mount($)
  const other = await otherWindow(w.store)
  await act(band, { pick: 0 })
  await act(band, 'yes')
  expect(await dialogOf(band)).toBeNull()
  await other.act({ pick: 2 })
  await other.act('yes')
  expect(other.toasts).toContain('You already chose Chikorita as your Johto starter.')
  expect(startersOwned(w.saveNow()).map(m => m.species)).toEqual(['chikorita'])
  expect(w.saveNow().journey.starters.johto).toEqual({ species: 'chikorita' })
})

test(
  'the Johto choice dismissed: Johto current, the ticket owned, ₽ as it was; the next session opens it again',
  SLOW,
  async ($, on) => {
    on('session.end', async (_$, e) => ({ sessionId: e.sessionId }))
    const w = await play($, on, player(TO_JOHTO, { earned: 200_000 }), net())
    await cmd($, 'pokemon', 'party')
    const band = await mount($, 9)
    await cmd($, 'pokemon', 'travel johto')
    await untilDialog(w, band, SAILED_MS + 2000)
    const balance = balanceOf(w.saveNow(), 0)
    await band.key({ key: 'x', in: 'dialog' })
    expect(await dialogOf(band)).toBeNull()
    const s = w.saveNow()
    expect(s.journey).toMatchObject({ current: 'johto', tickets: ['johto'], starters: { johto: 'due' } })
    expect(balanceOf(s, 0)).toBe(balance)
    expect(startersOwned(s).map(m => m.species)).toEqual([])
    await restart($)
    await cmd($, 'pokemon', 'party')
    expect(textOf(await dialogOf(await mount($)))).toContain('JOHTO · NEW PARTNER')
  },
)

test('a session ended with the Johto choice open: it opens in another window', SLOW, async ($, on) => {
  on('session.end', async (_$, e) => ({ sessionId: e.sessionId }))
  const w = await play($, on, player(TO_JOHTO), net())
  await cmd($, 'pokemon', 'party')
  const band = await mount($, 9)
  await cmd($, 'pokemon', 'travel johto')
  await untilDialog(w, band, SAILED_MS + 2000)
  await $.session.end({ reason: 'other', sessionId: 'before' } as never)
  const other = await otherWindow(w.store)
  await other.act({ pick: 1 })
  await other.act('yes')
  expect(startersOwned(stored(w)).map(m => m.species)).toEqual(['cyndaquil'])
  expect(other.toasts).toContain('Cyndaquil joined your party!')
})

test(
  'a session ended mid-voyage on the first arrival: Johto current, its choice open at the next start',
  SLOW,
  async ($, on) => {
    on('session.end', async (_$, e) => ({ sessionId: e.sessionId }))
    const w = await play($, on, player(TO_JOHTO), net())
    await cmd($, 'pokemon', 'party')
    const band = await mount($)
    await cmd($, 'pokemon', 'travel johto')
    await w.clock.advance(2000)
    expect(await dialogOf(band)).toBeNull()
    await $.session.end({ reason: 'other', sessionId: 'before' } as never)
    expect(stored(w)?.journey.current).toBe('johto')
    const other = await otherWindow(w.store)
    await other.act({ pick: 2 })
    await other.act('yes')
    expect(startersOwned(stored(w)).map(m => m.species)).toEqual(['totodile'])
  },
)

test(
  'Johto pending at start opens it; dismissed, a sail to Kanto opens nothing, a sail back to Johto opens it again',
  SLOW,
  async ($, on) => {
    const pending: Journey = { ...JOHTO_DUE, current: 'kanto' }
    const w = await play($, on, player(pending), net())
    await cmd($, 'pokemon', 'party')
    const band = await mount($, 9)
    expect(textOf(await dialogOf(band))).toContain('Johto · choose your partner')
    await act(band, 'close')
    expect(await cmd($, 'pokemon', 'travel johto')).toBe('Sailed to Johto.')
    await untilDialog(w, band, SAILED_MS + 2000)
    await act(band, 'close')
    await cmd($, 'pokemon', 'travel kanto')
    for (let t = 0; t < SAILED_MS + 1500; t += 250) {
      await w.clock.advance(250)
      expect(await dialogOf(band)).toBeNull()
    }
    expect(w.saveNow().journey.starters.johto).toBe('due')
  },
)

// ── While a dialog is open ──

test('the Mart refuses while a dialog is open; no wild visitor comes', SLOW, async ($, on) => {
  const w = await play($, on, player(JOHTO_DUE), net())
  await cmd($, 'pokemon', 'party')
  const band = await mount($)
  expect(await cmd($, 'pokemon', 'mart')).toMatch(/^A dialog is open/)
  expect(await dialogOf(band)).not.toBeNull()
  for (let i = 0; i < 25; i++) await w.clock.advance(60_000)
  expect(w.toasts.filter(t => /A wild .+ appeared!$/.test(t))).toEqual([])
  expect(await dialogOf(band)).not.toBeNull()
})

test('typing into the dialog closes it, still pending, and puts what was typed in the prompt', SLOW, async ($, on) => {
  const box = { text: '' }
  on('prompt.fill', async (_$, e) => {
    box.text += e.text
    return { isFilled: true }
  })
  const w = await play($, on, player(JOHTO_DUE), net())
  await cmd($, 'pokemon', 'party')
  const band = await mount($)
  for (const key of [...'/pokemon party']) await band.key({ key, in: 'dialog' })
  expect(await dialogOf(band)).toBeNull()
  expect(box.text).toBe('/pokemon party')
  expect(w.saveNow().journey.starters.johto).toBe('due')
})

// ── Failures and bad input ──

test(
  "a refused store write on Yes: the dialog stays open and says Couldn't do that; Yes again chooses",
  SLOW,
  async ($, on) => {
    const refusing = net()
    const w = await play($, on, player(JOHTO_DUE), refusing)
    await cmd($, 'pokemon', 'party')
    const band = await mount($)
    await act(band, { pick: 0 })
    refusing.beforeSet = key => {
      if (key === 'save') throw new Error('store locked')
    }
    await act(band, 'yes')
    expect(await dialogOf(band)).not.toBeNull()
    expect(w.toasts.filter(t => t.startsWith("Couldn't do that: "))).toHaveLength(1)
    expect(w.saveNow().journey.starters.johto).toBe('due')
    refusing.beforeSet = undefined
    await act(band, 'yes')
    expect(await dialogOf(band)).toBeNull()
    expect(w.saveNow().journey.starters.johto).toEqual({ species: 'chikorita' })
  },
)

test('posted acts of the wrong shape are ignored', SLOW, async ($, on) => {
  const w = await play($, on, player(JOHTO_DUE), net())
  await cmd($, 'pokemon', 'party')
  const band = await mount($)
  const before = textOf(await dialogOf(band))
  for (const data of [
    { act: 'jump' },
    { act: { pick: -1 } },
    { act: { pick: 1.5 } },
    { act: { pick: '1' } },
    { act: { pick: 0, hover: 1 } },
    { act: null },
    { act: ['yes'] },
    { choose: 'mewtwo' },
    'yes',
    null,
  ])
    await band.post(data, { in: 'dialog' })
  expect(textOf(await dialogOf(band))).toBe(before)
  expect(w.saveNow().journey.starters.johto).toBe('due')
  expect(startersOwned(w.saveNow())).toEqual([])
})

// ── Two windows ──

test(
  'both windows open; the other picks Totodile: this one closes it at its sync, only Totodile added',
  SLOW,
  async ($, on) => {
    const w = await play($, on, player(JOHTO_DUE), net())
    await cmd($, 'pokemon', 'party')
    const band = await mount($)
    expect(await dialogOf(band)).not.toBeNull()
    const other = await otherWindow(w.store)
    await other.act({ pick: 2 })
    await other.act('yes')
    await w.clock.advance(10_500)
    expect(await dialogOf(band)).toBeNull()
    expect(w.toasts.some(t => t.includes('Totodile'))).toBe(true)
    expect(startersOwned(w.saveNow()).map(m => m.species)).toEqual(['totodile'])
  },
)

test('Chikorita here and Totodile there at once: one is added, and both windows say which', SLOW, async ($, on) => {
  const w = await play($, on, player(JOHTO_DUE), net())
  await cmd($, 'pokemon', 'party')
  const band = await mount($)
  const other = await otherWindow(w.store)
  await other.act({ pick: 2 })
  let release = () => {}
  other.gates.read = { at: 1, until: new Promise<void>(resolve => (release = resolve)) }
  const theirs = other.act('yes')
  for (let i = 0; i < 20 && other.gates.read.at > 0; i++) await w.clock.settle()
  expect(other.gates.read.at).toBe(0)
  await act(band, { pick: 0 })
  await act(band, 'yes')
  release()
  await theirs
  expect(startersOwned(w.saveNow()).map(m => m.species)).toEqual(['chikorita'])
  expect(w.toasts).toContain('Chikorita joined your party!')
  expect(other.toasts.some(t => t.includes('Chikorita'))).toBe(true)
  expect(other.toasts.some(t => t.includes('Totodile'))).toBe(false)
  expect(JOHTO.starters).toContain('chikorita')
})

// ── Typed answers ──

test(
  '/pokemon choose cyndaquil with the Johto choice pending: it joins as caught, the dialog closes (A117)',
  SLOW,
  async ($, on) => {
    const w = await play($, on, player(JOHTO_DUE), net())
    await cmd($, 'pokemon', 'party')
    const band = await mount($)
    expect(textOf(await dialogOf(band))).toContain('JOHTO')
    expect(await cmd($, 'pokemon', 'choose Cyndaquil')).toBe('Cyndaquil joined your party!')
    expect(w.saveNow().journey.starters.johto).toEqual({ species: 'cyndaquil' })
    expect(w.saveNow().party.map(m => m.species)).toEqual(['pikachu', 'cyndaquil'])
    expect(w.saveNow().party[1]?.isCaught).toBe(true)
    expect(w.saveNow().dex.cyndaquil?.caught).toBe(1)
    expect(await dialogOf(band)).toBeNull()
    expect(w.toasts.filter(t => t.includes('another window'))).toEqual([])
  },
)

test('/pokemon choose with no choice pending: one line, nothing changes (A119)', SLOW, async ($, on) => {
  const w = await play($, on, player(TO_JOHTO), net())
  await cmd($, 'pokemon', 'party')
  const before = w.saveNow()
  const reply = await cmd($, 'pokemon', 'choose bulbasaur')
  expect(reply.split('\n')).toHaveLength(1)
  expect(reply).toMatch(/no starter to choose/i)
  expect(w.saveNow()).toEqual(before)
})

test("/pokemon choose names only the pending region's starters; alone, it lists them", SLOW, async ($, on) => {
  const w = await play($, on, player(JOHTO_DUE), net())
  await cmd($, 'pokemon', 'party')
  const band = await mount($)
  const before = w.saveNow()
  expect(await cmd($, 'pokemon', 'choose bulbasaur')).toBe(
    "Bulbasaur isn't one of Johto's starters: /pokemon choose chikorita, cyndaquil or totodile",
  )
  expect(await cmd($, 'pokemon', 'choose')).toBe(
    'Choose your Johto starter: /pokemon choose chikorita, cyndaquil or totodile',
  )
  expect(w.saveNow()).toEqual(before)
  expect(await dialogOf(band)).not.toBeNull()
})

test('/pokemon choose works with no band drawn: a new player takes Squirtle', SLOW, async ($, on) => {
  const w = await play($, on, undefined, net())
  await cmd($, 'pokemon', 'party')
  expect(await cmd($, 'pokemon', 'choose squirtle')).toBe('Squirtle joined your party!')
  expect(w.saveNow().party.map(m => m.species)).toEqual(['squirtle'])
  expect(await cmd($, 'pokemon', 'choose squirtle')).toBe("There's no starter to choose right now.")
})

test('the hint rows name the typed answers, not ctrl+x tab', SLOW, async ($, on) => {
  await play($, on, undefined, net())
  const band = await mount($)
  const text = textOf(await dialogOf(band))
  expect(text).toContain('/pokemon choose')
  expect(text).not.toContain('ctrl+x')
})
