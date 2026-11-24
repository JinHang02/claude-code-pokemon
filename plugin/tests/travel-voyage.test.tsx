// `/pokemon travel <region>` and the ferry voyage: the replies, the crossing drawn in the band (party, empty party,
// a sprite left out, a short or narrow band, a shrink mid-crossing), what the voyage holds back (wild visitors,
// evolution screens) and what travel ends (a stray visitor, the Mart, a screen playing).
import { expect, test } from 'claude-code/testing'

import { BOX, SCREEN_MS, TEXT_COLUMN } from '../hooks/evolution-screen'
import { FERRY_MS, FERRY_ROWS, SAILED_MS } from '../hooks/ferry-screen'
import { regionOf } from '../hooks/travel-regions'
import type { Journey } from '../hooks/travel-regions'
import { balanceOf, emptySave } from '../hooks/save'
import type { Save } from '../hooks/save'
import { begin, cmd, hourAt, LIST, member, until } from './world'
import type { Net } from './world'

const SLOW = { timeoutMs: 60_000 }
const PIKACHU = 0x0a0b0c
const EEVEE = 0x010203
const VAPOREON = 0x070809
const WILD = 0x00ffff
const SAILING_TEXTS = ['Your party is boarding…', 'Sailing to ', 'Welcome to ']

const KANTO_WITH_JOHTO: Journey = {
  current: 'kanto',
  tickets: ['johto'],
  starters: { kanto: { species: 'pikachu' }, johto: { species: 'chikorita' } },
}
const IN_JOHTO: Journey = {
  ...KANTO_WITH_JOHTO,
  current: 'johto',
  starters: { ...KANTO_WITH_JOHTO.starters, johto: { species: 'chikorita' } },
}

/** `size` rows of `width` columns of one colour. */
const solid = (rgb: number, size: number, width = size) => {
  const c = `${(rgb >> 16) & 255};${(rgb >> 8) & 255};${rgb & 255}`
  return Array.from({ length: size }, () => `\x1b[38;2;${c}m\x1b[48;2;${c}m▀\x1b[0m`.repeat(width)).join('\n')
}
/** The test network: sprites 6 rows tall (a band of 9 rows, room for an evolution screen). */
const net = (extra: Partial<Net> = {}): Net => ({
  isOnline: true,
  list: JSON.stringify(LIST),
  now: hourAt(12),
  sprites: {
    pikachu: solid(PIKACHU, 6),
    eevee: solid(EEVEE, 6),
    vaporeon: solid(VAPOREON, 6),
  },
  ...extra,
})
/** Four Kanto species and one Johto species to draw random visitors from, each drawn as a cyan block. */
const MIXED = ['caterpie', 'weedle', 'pidgey', 'rattata', 'chikorita']
const mixedNet = (): Net =>
  net({
    list: JSON.stringify([...MIXED, 'pikachu'].map(name => ({ name, forms: ['regular'] }))),
    sprites: { pikachu: solid(PIKACHU, 6), ...Object.fromEntries(MIXED.map(n => [n, solid(WILD, 3)])) },
  })
const player = (extra: Partial<Save> = {}): Save => ({
  ...emptySave(),
  party: [member('pikachu', { next: [] }), member('eevee', { next: [] })],
  journey: KANTO_WITH_JOHTO,
  ...extra,
})

type Node = { type?: string; props?: Record<string, unknown> }
type Band = { drawn: () => Promise<unknown>; redraw: () => Promise<void> }
type World = Awaited<ReturnType<typeof begin>>
const mount = ($: { ui: { mount: (t: never) => Promise<unknown> } }, maxRows = 30, bodyColumns = 80) =>
  $.ui.mount({
    plugin: 'pokemon',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows, bodyColumns },
  } as never) as Promise<Band>
type On = Parameters<typeof begin>[1]
/** The world and a session in it, with the engine's own row answering a band the plugin doesn't draw. */
function sail($: Parameters<typeof begin>[0], on: On, saved: Save, n: Net) {
  on('ui.render', async () => ({ type: 'Text', children: ['engine'] }) as never)
  return begin($, on, saved, undefined, undefined, n)
}
const findNode = (node: unknown, is: (n: Node) => boolean): Node | null => {
  if (typeof node !== 'object' || node === null) return null
  if (is(node as Node)) return node as Node
  for (const child of Object.values(node)) {
    const found = findNode(child, is)
    if (found) return found
  }
  return null
}
const decode = (cells: string) => [...new Uint32Array(Uint8Array.from(atob(cells), c => c.charCodeAt(0)).buffer)]

/**
 * The band as drawn afresh. `kind`: a ferry crossing (its text box shows a sailing message), an evolution screen
 * (another message), the band, the Mart or nothing. `lines`: the characters of each row; `cells`: the raw cells.
 */
type Look = {
  kind: 'ferry' | 'screen' | 'band' | 'mart' | 'none'
  rows: number
  text: string
  lines: string[]
  colors: Set<number>
  cells: string
}
async function look(band: Band): Promise<Look> {
  await band.redraw()
  const tree = await band.drawn()
  const raster = findNode(tree, n => n.type === 'Raster' && n.props?.key === 'scene')
  const none = { rows: 0, text: '', lines: [], colors: new Set<number>(), cells: '' }
  if (!raster) {
    if (findNode(tree, n => n.type === 'Client' && n.props?.key === 'mart')) return { kind: 'mart', ...none }
    if (findNode(tree, n => n.type === 'Client' && n.props?.key === 'aim')) return { kind: 'band', ...none }
    return { kind: 'none', ...none }
  }
  const columns = Number(raster.props?.columns)
  const cells = String(raster.props?.cells ?? '')
  const words = decode(cells)
  const rows = words.length / 3 / columns
  const colors = new Set<number>()
  for (let i = 0; i < words.length; i += 3) colors.add(words[i + 1] ?? 0).add(words[i + 2] ?? 0)
  const cell = (x: number, y: number) => words.slice((y * columns + x) * 3, (y * columns + x) * 3 + 3)
  const lines = Array.from({ length: rows }, (_, y) =>
    String.fromCodePoint(...Array.from({ length: columns }, (_, x) => cell(x, y)[0] ?? 0x20)),
  )
  const isBoxed = rows >= 3 && cell(0, rows - 2)[2] === BOX.margin && cell(TEXT_COLUMN - 1, rows - 2)[2] === BOX.fill
  const text = isBoxed ? (lines[rows - 2] ?? '').trim() : ''
  const kind = !isBoxed ? 'band' : SAILING_TEXTS.some(t => text.startsWith(t)) ? 'ferry' : 'screen'
  return { kind, rows, text, lines, colors, cells }
}
/** @returns what the band shows every `step` ms for `ms`. */
async function watch(w: World, band: Band, ms: number, step = 100): Promise<Look[]> {
  const seen: Look[] = []
  for (let t = 0; t < ms; t += step) {
    await w.clock.advance(step)
    seen.push(await look(band))
  }
  return seen
}
async function waitForPikachu($: never, band: Band) {
  for (let i = 0; i < 50 && !(await look(band)).colors.has(PIKACHU); i++) await cmd($, 'pokemon', 'party')
  expect((await look(band)).colors.has(PIKACHU)).toBe(true)
}
const current = (w: World) => w.saveNow().journey.current
const balance = (w: World) => balanceOf(w.saveNow(), 0)
const caughtState = (s: Save) => ({
  party: s.party.map(m => m.id),
  box: (s.box ?? []).map(m => m.id),
  caught: Object.values(s.dex).reduce((n, e) => n + (e.caught ?? 0), 0),
})
const ferries = (seen: Look[]) => seen.filter(l => l.kind === 'ferry')

// ── Replies ──

test(
  'travel johto with the ticket: Sailing to Johto…, Johto current in the store, ₽ unchanged',
  SLOW,
  async ($, on) => {
    const w = await sail($, on, player(), net())
    const band = await mount($)
    await waitForPikachu($ as never, band)
    const was = balance(w)
    expect(await cmd($, 'pokemon', 'travel johto')).toBe('Sailing to Johto…')
    expect(current(w)).toBe('johto')
    expect(w.store.get('journey')).toEqual(w.saveNow().journey)
    expect(balance(w)).toBe(was)
  },
)

test('travel kanto from Johto: Sailing to Kanto…, Kanto current, ₽ unchanged', SLOW, async ($, on) => {
  const w = await sail($, on, player({ journey: IN_JOHTO }), net())
  const band = await mount($)
  await waitForPikachu($ as never, band)
  const was = balance(w)
  expect(await cmd($, 'pokemon', 'travel kanto')).toBe('Sailing to Kanto…')
  expect(current(w)).toBe('kanto')
  expect(balance(w)).toBe(was)
})

test('travel in any case: JOHTO and Johto sail too', SLOW, async ($, on) => {
  const w = await sail($, on, player(), net())
  const band = await mount($)
  await waitForPikachu($ as never, band)
  expect(await cmd($, 'pokemon', 'travel JOHTO')).toBe('Sailing to Johto…')
  expect(current(w)).toBe('johto')
})

test("another window's travel: this window picks up Johto at its sync and draws no voyage", SLOW, async ($, on) => {
  const w = await sail($, on, player(), net())
  const band = await mount($)
  await waitForPikachu($ as never, band)
  w.store.set('save', { ...w.saveNow(), journey: IN_JOHTO })
  w.store.set('journey', IN_JOHTO)
  const seen = await watch(w, band, 12_000, 250)
  expect(await cmd($, 'pokemon', 'travel johto')).toBe("You're already in Johto.")
  expect(ferries(seen)).toEqual([])
  expect(seen.every(l => l.kind === 'band')).toBe(true)
})

test('travel hoenn without the ticket: refused, Kanto still current, no voyage', SLOW, async ($, on) => {
  const w = await sail($, on, player(), net())
  const band = await mount($)
  await waitForPikachu($ as never, band)
  expect(await cmd($, 'pokemon', 'travel hoenn')).toBe('You have no Hoenn ferry ticket.')
  expect(current(w)).toBe('kanto')
  expect(ferries(await watch(w, band, 1000))).toEqual([])
})

test('travel kanto in Kanto: already there, nothing changes and nobody is summoned', SLOW, async ($, on) => {
  const w = await sail($, on, player(), net())
  const before = caughtState(w.saveNow())
  expect(await cmd($, 'pokemon', 'travel kanto')).toBe("You're already in Kanto.")
  expect(current(w)).toBe('kanto')
  expect(caughtState(w.saveNow())).toEqual(before)
})

const NAMES = 'Regions: Kanto, Johto, Hoenn, Sinnoh, Unova, Kalos, Alola, Galar.'

test('travel atlantis lists the eight region names, the word echoed as typed', SLOW, async ($, on) => {
  const w = await sail($, on, player(), net())
  expect(await cmd($, 'pokemon', 'travel atlantis')).toBe(`There's no region called atlantis. ${NAMES}`)
  expect(current(w)).toBe('kanto')
})

test('an unknown region word is echoed only as its slug: letters, digits and dashes', SLOW, async ($, on) => {
  const w = await sail($, on, player(), net())
  const long = `<B>${'x'.repeat(190)}!${'y'.repeat(6)}`
  expect(long).toHaveLength(200)
  expect(await cmd($, 'pokemon', `travel ${long}`)).toBe(
    `There's no region called b${'x'.repeat(190)}${'y'.repeat(6)}. ${NAMES}`,
  )
  expect(await cmd($, 'pokemon', 'travel jo!hto')).toBe(`There's no region called johto. ${NAMES}`)
  expect(current(w)).toBe('kanto')
})

test('travel alone lists the unlocked regions in order; nobody is summoned', SLOW, async ($, on) => {
  const w = await sail($, on, player(), net())
  const before = caughtState(w.saveNow())
  expect(await cmd($, 'pokemon', 'travel')).toBe('Sail where? You can visit Kanto, Johto: /pokemon travel <region>')
  expect(caughtState(w.saveNow())).toEqual(before)
  expect(current(w)).toBe('kanto')
})

test('travel with no ticket lists Kanto alone; a word of punctuation alone is no region', SLOW, async ($, on) => {
  const w = await sail($, on, player({ journey: { current: 'kanto', tickets: [], starters: {} } }), net())
  const before = caughtState(w.saveNow())
  const sailWhere = 'Sail where? You can visit Kanto: /pokemon travel <region>'
  expect(await cmd($, 'pokemon', 'travel')).toBe(sailWhere)
  expect(await cmd($, 'pokemon', 'travel !!!')).toBe(sailWhere)
  expect(caughtState(w.saveNow())).toEqual(before)
})

test('a refused store write: a one-line error, Kanto still current, no voyage', SLOW, async ($, on) => {
  const refusing: Net = net()
  const w = await sail($, on, player(), refusing)
  const band = await mount($)
  await waitForPikachu($ as never, band)
  refusing.beforeSet = key => {
    if (key === 'save') throw new Error('store locked')
  }
  const reply = await cmd($, 'pokemon', 'travel johto')
  expect(reply).toMatch(/^Couldn't /)
  expect(reply).not.toContain('\n')
  expect(reply).not.toMatch(/Sail/)
  expect(current(w)).toBe('kanto')
  refusing.beforeSet = undefined
  expect(ferries(await watch(w, band, 1000))).toEqual([])
})

// ── The voyage ──

test(
  'with Pikachu and Eevee at 30 rows: the crossing plays at 18 rows, both on board, Welcome to JOHTO! by 7.7 s, then the band',
  SLOW,
  async ($, on) => {
    const w = await sail($, on, player(), net())
    const band = await mount($)
    await waitForPikachu($ as never, band)
    const scene = await look(band)
    expect(scene.kind).toBe('band')
    expect(await cmd($, 'pokemon', 'travel johto')).toBe('Sailing to Johto…')
    const first = await look(band)
    expect(first.kind).toBe('ferry')
    expect(first.rows).toBe(FERRY_ROWS)
    expect(first.cells).not.toBe(scene.cells)
    const seen = await watch(w, band, FERRY_MS + 1500)
    const ferry = ferries(seen)
    expect(ferry[0]?.text).toBe('Your party is boarding…')
    expect(ferry.some(l => l.text === 'Sailing to Johto…')).toBe(true)
    const welcome = seen.findIndex(l => l.text === 'Welcome to JOHTO!')
    expect(welcome).toBeGreaterThanOrEqual(0)
    expect((welcome + 1) * 100).toBeLessThanOrEqual(FERRY_MS)
    expect(ferry.some(l => l.colors.has(PIKACHU) && l.colors.has(EEVEE))).toBe(true)
    const last = seen.map(l => l.kind).lastIndexOf('ferry')
    expect((last + 1) * 100).toBeLessThanOrEqual(FERRY_MS + 300)
    const after = seen[seen.length - 1]!
    expect(after.kind).toBe('band')
    expect(after.colors.has(PIKACHU)).toBe(true)
  },
)

test('the way back from Johto ends with Welcome to KANTO!', SLOW, async ($, on) => {
  const w = await sail($, on, player({ journey: IN_JOHTO }), net())
  const band = await mount($)
  await waitForPikachu($ as never, band)
  await cmd($, 'pokemon', 'travel kanto')
  const seen = await watch(w, band, FERRY_MS + 1000)
  expect(seen.some(l => l.text === 'Welcome to KANTO!')).toBe(true)
  expect(seen[seen.length - 1]?.kind).toBe('band')
})

test(
  'an empty party at 30 rows: the band shows the crossing, nobody boards, then no band again',
  SLOW,
  async ($, on) => {
    const noFirstPokemon = net({ isOnline: false })
    const w = await sail($, on, player({ party: [] }), noFirstPokemon)
    const band = await mount($)
    expect((await look(band)).kind).toBe('none')
    expect(await cmd($, 'pokemon', 'travel johto')).toBe('Sailing to Johto…')
    const seen = await watch(w, band, FERRY_MS + 1000)
    const ferry = ferries(seen)
    expect(ferry.length).toBeGreaterThan(FERRY_MS / 100 - 6)
    expect(ferry.every(l => l.rows === FERRY_ROWS)).toBe(true)
    expect(ferry.some(l => l.colors.has(PIKACHU) || l.colors.has(EEVEE))).toBe(false)
    expect(seen.some(l => l.text === 'Welcome to JOHTO!')).toBe(true)
    expect(seen[seen.length - 1]?.kind).toBe('none')
    expect(w.saveNow().party).toEqual([])
  },
)

test("Eevee's sprite still downloading: only Pikachu boards, with no stand-in for Eevee", SLOW, async ($, on) => {
  const w = await sail(
    $,
    on,
    player(),
    net({ artStall: file => (file === 'eevee' ? new Promise<void>(() => {}) : undefined) }),
  )
  const band = await mount($)
  for (let i = 0; i < 50 && !w.fetched.some(u => u.endsWith('/eevee')); i++) await w.clock.advance(100)
  let reply: string | undefined
  void cmd($, 'pokemon', 'travel johto').then(text => (reply = text))
  for (let t = 0; t < 100 && reply === undefined; t++) await w.clock.advance(100)
  expect(reply).toBe('Sailing to Johto…')
  const ferry = ferries(await watch(w, band, FERRY_MS))
  expect(ferry.length).toBeGreaterThan(FERRY_MS / 100 - 6)
  expect(ferry.some(l => l.colors.has(PIKACHU))).toBe(true)
  expect(ferry.some(l => l.colors.has(EEVEE))).toBe(false)
})

test('a session ended mid-voyage: the next session is in Johto', SLOW, async ($, on) => {
  on('session.end', async (_$, e) => ({ sessionId: e.sessionId }))
  const w = await sail($, on, player(), net())
  const band = await mount($)
  await waitForPikachu($ as never, band)
  await cmd($, 'pokemon', 'travel johto')
  await w.clock.advance(2000)
  expect((await look(band)).kind).toBe('ferry')
  await $.session.end({ reason: 'other', sessionId: 'before' } as never)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true } as never)
  expect(current(w)).toBe('johto')
  expect(await cmd($, 'pokemon', 'travel johto')).toBe("You're already in Johto.")
})

test(
  'at 9 rows: no crossing, the band says Sailed to Johto. for a moment, and Johto is current',
  SLOW,
  async ($, on) => {
    const w = await sail($, on, player(), net())
    const band = await mount($, 9)
    await waitForPikachu($ as never, band)
    expect(await cmd($, 'pokemon', 'travel johto')).toBe('Sailed to Johto.')
    expect(current(w)).toBe('johto')
    const seen = await watch(w, band, SAILED_MS + 1000)
    expect(ferries(seen)).toEqual([])
    const labelled = seen.filter(l => l.lines.some(line => line.includes('Sailed to Johto.')))
    expect(labelled.length).toBeGreaterThan(SAILED_MS / 100 - 6)
    expect(labelled.every(l => l.rows <= 9)).toBe(true)
    expect(seen[seen.length - 1]?.lines.some(line => line.includes('Sailed'))).toBe(false)
  },
)

test('a band narrower than 40 columns: Sailed to Johto., no crossing', SLOW, async ($, on) => {
  const w = await sail($, on, player(), net())
  const band = await mount($, 30, 39)
  await waitForPikachu($ as never, band)
  expect(await cmd($, 'pokemon', 'travel johto')).toBe('Sailed to Johto.')
  expect(ferries(await watch(w, band, 1000))).toEqual([])
})

test('the terminal shrinking to 9 rows mid-crossing ends the voyage; it does not come back', SLOW, async ($, on) => {
  const w = await sail($, on, player(), net())
  const tall = await mount($)
  await waitForPikachu($ as never, tall)
  await cmd($, 'pokemon', 'travel johto')
  await w.clock.advance(2000)
  expect((await look(tall)).kind).toBe('ferry')
  const short = await mount($, 9)
  const shrunk = await look(short)
  expect(shrunk.kind).toBe('band')
  expect(shrunk.rows).toBeLessThanOrEqual(9)
  await w.clock.advance(500)
  const again = await mount($)
  expect(ferries(await watch(w, again, 2000))).toEqual([])
  expect(current(w)).toBe('johto')
})

test('the party put away mid-crossing ends the voyage; it does not play on once back', SLOW, async ($, on) => {
  const w = await sail($, on, player(), net())
  const band = await mount($)
  await waitForPikachu($ as never, band)
  await cmd($, 'pokemon', 'travel johto')
  await w.clock.advance(1000)
  await cmd($, 'pokemon', 'off')
  await cmd($, 'pokemon', 'on')
  await waitForPikachu($ as never, band)
  expect(ferries(await watch(w, band, 2000))).toEqual([])
})

// ── Visitors ──

test('after the voyage, the next random visitor is from Johto', SLOW, async ($, on) => {
  const w = await sail($, on, player({ party: [member('pikachu', { next: [] })] }), mixedNet())
  const band = await mount($)
  await waitForPikachu($ as never, band)
  await cmd($, 'pokemon', 'travel johto')
  await watch(w, band, FERRY_MS + 500, 500)
  expect(await cmd($, 'pokemon-play', 'wild')).toBe('A wild Chikorita wanders by.')
})

test(
  'a random Kanto visitor out at travel leaves uncaught: party, box and caught count unchanged',
  SLOW,
  async ($, on) => {
    const w = await sail($, on, player({ party: [member('pikachu', { next: [] })] }), mixedNet())
    const band = await mount($)
    await waitForPikachu($ as never, band)
    const visitor = await cmd($, 'pokemon-play', 'wild')
    expect(visitor).toMatch(/^A wild (Caterpie|Weedle|Pidgey|Rattata) wanders by\.$/)
    const before = caughtState(w.saveNow())
    expect(await cmd($, 'pokemon', 'travel johto')).toBe('Sailing to Johto…')
    expect(w.toasts.some(t => /^The wild .+ ran off: you're in Johto now\.$/.test(t))).toBe(true)
    const seen = await watch(w, band, FERRY_MS + 3000, 250)
    expect(seen[seen.length - 1]?.colors.has(WILD)).toBe(false)
    expect(caughtState(w.saveNow())).toEqual(before)
    expect(w.toasts.some(t => t.startsWith('Gotcha'))).toBe(false)
  },
)

test('a named visitor is refused while the ferry sails', SLOW, async ($, on) => {
  const w = await sail($, on, player({ party: [member('pikachu', { next: [] })] }), mixedNet())
  const band = await mount($)
  await waitForPikachu($ as never, band)
  await cmd($, 'pokemon', 'travel johto')
  await w.clock.advance(500)
  expect(await cmd($, 'pokemon-play', 'wild chikorita')).toBe('No wild Pokémon comes by while the ferry sails.')
  expect((await look(band)).kind).toBe('ferry')
})

test("the timer's visitor due during the voyage comes only once it has ended, from Johto", SLOW, async ($, on) => {
  const w = await sail($, on, player({ party: [member('pikachu', { next: [] })] }), mixedNet())
  const band = await mount($)
  await waitForPikachu($ as never, band)
  const firstVisitorDueMs = 10 * 60_000
  const intoVoyageMs = 3000
  for (let i = 0; i < 9; i++) await w.clock.advance(60_000)
  await w.clock.advance(firstVisitorDueMs - 9 * 60_000 - intoVoyageMs)
  const appeared = () => w.toasts.filter(t => /A wild .+ appeared!$/.test(t))
  expect(appeared()).toEqual([])
  await cmd($, 'pokemon', 'travel johto')
  const seen: { kind: string; isOut: boolean }[] = []
  for (let t = 0; t < FERRY_MS + 3000; t += 100) {
    await w.clock.advance(100)
    seen.push({ kind: (await look(band)).kind, isOut: appeared().length > 0 })
  }
  const end = seen.map(l => l.kind).lastIndexOf('ferry')
  expect(end).toBeGreaterThan(FERRY_MS / 100 - 6)
  expect(seen.slice(0, end + 1).some(l => l.isOut)).toBe(false)
  expect(appeared()).toEqual(['A wild Chikorita appeared!'])
  expect(regionOf('chikorita')?.id).toBe('johto')
})

// ── Interplay ──

/** Eevee ready to evolve by a Water Stone, with its evolutions learned. */
async function stoneWorld($: never, on: never) {
  const saved = player({ party: [member('eevee', { id: 'e', gender: 'male' })], bag: { 'water-stone': 2 } })
  const w = await sail($, on, saved, net())
  await until($, () => w.saveNow().party.every(m => m.next !== undefined))
  return w
}
const evolvedToasts = (toasts: string[]) => toasts.filter(t => t.includes(' evolved into '))

test(
  'travel while an evolution screen plays: the evolution is told at once, and the voyage plays',
  SLOW,
  async ($, on) => {
    const w = await stoneWorld($ as never, on as never)
    const band = await mount($)
    await w.clock.advance(500)
    expect(await cmd($, 'pokemon', 'give water stone eevee')).toBe('What? Eevee is evolving!')
    await w.clock.advance(2000)
    expect((await look(band)).kind).toBe('screen')
    expect(evolvedToasts(w.toasts)).toEqual([])
    expect(await cmd($, 'pokemon', 'travel johto')).toBe('Sailing to Johto…')
    expect(evolvedToasts(w.toasts)).toEqual(['What? Eevee evolved into Vaporeon!'])
    const seen = await watch(w, band, FERRY_MS + 1500)
    expect(seen[0]?.kind).toBe('ferry')
    expect(seen.some(l => l.kind === 'screen')).toBe(false)
    expect(seen[seen.length - 1]?.colors.has(VAPOREON)).toBe(true)
    expect(evolvedToasts(w.toasts)).toHaveLength(1)
  },
)

test('an evolution during the voyage waits for it: its screen plays once the ferry has docked', SLOW, async ($, on) => {
  const w = await stoneWorld($ as never, on as never)
  const band = await mount($)
  await w.clock.advance(500)
  await cmd($, 'pokemon', 'travel johto')
  await w.clock.advance(1000)
  expect(await cmd($, 'pokemon', 'give water stone eevee')).toBe('What? Eevee is evolving!')
  const seen = await watch(w, band, FERRY_MS + SCREEN_MS, 200)
  const lastFerry = seen.map(l => l.kind).lastIndexOf('ferry')
  const firstScreen = seen.findIndex(l => l.kind === 'screen')
  expect(lastFerry).toBeGreaterThan(0)
  expect(firstScreen).toBeGreaterThan(lastFerry)
  expect(seen.slice(0, lastFerry).every(l => l.kind === 'ferry')).toBe(true)
})

test('travel with the party off: Sailed to Johto., Johto current, nothing drawn', SLOW, async ($, on) => {
  const w = await sail($, on, player(), net())
  const band = await mount($)
  await waitForPikachu($ as never, band)
  await cmd($, 'pokemon', 'off')
  expect(await cmd($, 'pokemon', 'travel johto')).toBe('Sailed to Johto.')
  expect(current(w)).toBe('johto')
  const seen = await watch(w, band, 1000)
  expect(seen.every(l => l.kind === 'none')).toBe(true)
})

const JOHTO_NOT_REACHED: Journey = { current: 'kanto', tickets: ['johto'], starters: { kanto: { species: 'pikachu' } } }
const dialogIn = async (band: Band) => {
  await band.redraw()
  return findNode(await band.drawn(), n => n.type === 'Client' && n.props?.key === 'dialog')
}

test(
  'travel while the band is too short to draw: Sailed to Johto., and once it is back, the Johto choice and no ferry',
  SLOW,
  async ($, on) => {
    const w = await sail($, on, player({ journey: JOHTO_NOT_REACHED }), net())
    await waitForPikachu($ as never, await mount($))
    const short = await mount($, 1)
    expect(await cmd($, 'pokemon', 'travel johto')).toBe('Sailed to Johto.')
    expect(w.saveNow().journey.starters.johto).toBe('due')
    await short.redraw()
    const back = await mount($)
    expect(await dialogIn(back)).not.toBeNull()
    expect(ferries(await watch(w, back, 1000))).toEqual([])
  },
)

test('travel with the party off, then /pokemon on: the Johto choice opens', SLOW, async ($, on) => {
  const w = await sail($, on, player({ journey: JOHTO_NOT_REACHED }), net())
  const band = await mount($)
  await waitForPikachu($ as never, band)
  await cmd($, 'pokemon', 'off')
  expect(await cmd($, 'pokemon', 'travel johto')).toBe('Sailed to Johto.')
  expect(await dialogIn(band)).toBeNull()
  await cmd($, 'pokemon', 'on')
  expect(await dialogIn(band)).not.toBeNull()
  expect(w.saveNow().journey.starters.johto).toBe('due')
})

test("another window's arrival while the party is off: /pokemon on here opens its choice", SLOW, async ($, on) => {
  const w = await sail($, on, player({ journey: JOHTO_NOT_REACHED }), net())
  const band = await mount($)
  await waitForPikachu($ as never, band)
  await cmd($, 'pokemon', 'off')
  w.store.set('save', {
    ...w.saveNow(),
    journey: { ...JOHTO_NOT_REACHED, current: 'johto', starters: { ...JOHTO_NOT_REACHED.starters, johto: 'due' } },
  })
  await cmd($, 'pokemon', 'on')
  expect(await dialogIn(band)).not.toBeNull()
})

test('travel with the Mart open: the Mart closes and the voyage plays', SLOW, async ($, on) => {
  const w = await sail($, on, player(), net())
  const band = await mount($)
  await waitForPikachu($ as never, band)
  await cmd($, 'pokemon', 'mart')
  expect((await look(band)).kind).toBe('mart')
  await cmd($, 'pokemon', 'travel johto')
  expect((await look(band)).kind).toBe('ferry')
  expect(current(w)).toBe('johto')
})
