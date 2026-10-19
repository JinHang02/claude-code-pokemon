// Evolutions on their own screen over the band: when it shows, what it shows, and what waits for it.
import { expect, test } from 'claude-code/testing'

import { BOX, SCREEN_MS, TEXT_COLUMN } from '../hooks/evolution-screen'
import { emptySave, xpForLevel } from '../hooks/save'
import type { Save } from '../hooks/save'
import { answerTools, bash, begin, cmd, hourAt, LIST, lv, member, until } from './world'
import type { Net } from './world'

// Ten seconds and more of frames, each drawn afresh: slow on a busy machine.
const SLOW = { timeoutMs: 60_000 }
const COLUMNS = 80
const DEFAULT = 0x01000000
const EEVEE = 0x010203
const VAPOREON = 0x070809
const CATERPIE = 0x00ffff
const WHITE = 0xffffff
const RAYS = [0x0d0e1c, 0x161834, 0x1d2047, 0x2a2e5a, 0xffffff, 0x9fb3ff]
const OFF_WHITE = 0xf8f8f0
const GRADIENT_TOP = 0x4e78d6

// `size` rows of `width` columns: 12 rows of pixels make a band of 9 rows, room for the screen.
const solid = (rgb: string, size: number, width = size) =>
  Array.from({ length: size }, () => `\x1b[38;2;${rgb}m\x1b[48;2;${rgb}m▀\x1b[0m`.repeat(width)).join('\n')
const net = (size = 6, extra: Partial<Net> = {}): Net => ({
  isOnline: true,
  list: JSON.stringify(LIST),
  now: hourAt(12),
  sprites: {
    eevee: solid('1;2;3', size),
    vaporeon: solid('7;8;9', size),
    espeon: solid('7;8;9', size),
    umbreon: solid('7;8;9', size),
    charmander: solid('1;2;3', size),
    charmeleon: solid('7;8;9', size),
    caterpie: solid('0;255;255', 4),
  },
  ...extra,
})
const withEevee = (extra: Partial<Save> = {}): Save => ({
  ...emptySave(),
  party: [member('eevee', { id: 'e', gender: 'male' })],
  bag: { 'water-stone': 2 },
  ...extra,
})

type Node = { type?: string; props?: Record<string, unknown> }
type Band = { drawn: () => Promise<unknown>; redraw: () => Promise<void> }
const findNode = (node: unknown, test: (n: Node) => boolean): Node | null => {
  if (typeof node !== 'object' || node === null) return null
  if (test(node as Node)) return node as Node
  for (const child of Object.values(node)) {
    const found = findNode(child, test)
    if (found) return found
  }
  return null
}
const decode = (cells: string) => [...new Uint32Array(Uint8Array.from(atob(cells), c => c.charCodeAt(0)).buffer)]

// The band as drawn afresh: its one picture, what kind of band it is, and the screen's message if it is one.
type Look = {
  kind: 'screen' | 'band' | 'aim' | 'mart' | 'none'
  words: number[]
  rows: number
  text: string
  colors: Set<number>
  hasShop: boolean
}
async function look(band: Band): Promise<Look> {
  await band.redraw()
  const tree = await band.drawn()
  const hasShop = Boolean(findNode(tree, n => n.type === 'Client' && n.props?.key === 'shop'))
  const raster = findNode(tree, n => n.type === 'Raster' && n.props?.key === 'scene')
  const none = { words: [], rows: 0, text: '', colors: new Set<number>(), hasShop }
  if (!raster) {
    if (findNode(tree, n => n.type === 'Client' && n.props?.key === 'aim')) return { kind: 'aim', ...none }
    if (findNode(tree, n => n.type === 'Client' && n.props?.key === 'mart')) return { kind: 'mart', ...none }
    return { kind: 'none', ...none }
  }
  const words = decode(String(raster.props?.cells ?? ''))
  const rows = Number(raster.props?.rows)
  const colors = new Set<number>()
  for (let i = 0; i < words.length; i += 3) colors.add(words[i + 1] ?? 0).add(words[i + 2] ?? 0)
  const cell = (x: number, y: number) => words.slice((y * COLUMNS + x) * 3, (y * COLUMNS + x) * 3 + 3)
  // The text box's middle row: the margin, then the box's fill, under the message.
  const isScreen = rows >= 3 && cell(0, rows - 2)[2] === BOX.margin && cell(TEXT_COLUMN - 1, rows - 2)[2] === BOX.fill
  const text = isScreen
    ? String.fromCodePoint(...Array.from({ length: COLUMNS }, (_, x) => cell(x, rows - 2)[0] ?? 0x20)).trim()
    : ''
  return { kind: isScreen ? 'screen' : 'band', words, rows, text, colors, hasShop }
}
const mount = ($: { ui: { mount: (t: never) => Promise<unknown> } }, maxRows = 30) =>
  $.ui.mount({
    plugin: 'pokemon',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows, bodyColumns: COLUMNS },
  } as never) as Promise<Band>
type Clock = { advance: (ms: number) => Promise<void> }
// What the band shows every `step` ms for `ms`.
async function watch(clock: Clock, band: Band, ms: number, step = 100): Promise<Look[]> {
  const seen: Look[] = []
  for (let t = 0; t < ms; t += step) {
    await clock.advance(step)
    seen.push(await look(band))
  }
  return seen
}
// Where each screen starts in what was watched: after a band, or after another screen's last words.
const starts = (seen: Look[]) =>
  seen.flatMap((l, i) => {
    const was = seen[i - 1]
    const isNew = !was || was.kind !== 'screen' || (was.text.startsWith('Congratulations') && !l.text.startsWith('C'))
    return l.kind === 'screen' && isNew ? [i] : []
  })
// The walker's leftmost column in a band frame.
const leftOf = (l: Look, color: number) => {
  for (let x = 0; x < COLUMNS; x++)
    for (let y = 0; y < l.rows; y++) {
      const i = (y * COLUMNS + x) * 3
      if (l.words[i + 1] === color || l.words[i + 2] === color) return x
    }
  return -1
}

async function stoneWorld($: never, on: never, saved = withEevee(), size = 6, extra: Partial<Net> = {}) {
  const w = await begin($, on, saved, undefined, undefined, net(size, extra))
  await until($, () => w.saveNow().party.every(m => m.next !== undefined))
  return w
}

test(
  'a stone evolution replaces the band with its screen for the whole sequence, then the new form walks on',
  SLOW,
  async ($, on) => {
    const w = await stoneWorld($ as never, on as never)
    const band = await mount($)
    await w.clock.advance(500)
    expect((await look(band)).kind).toBe('band')
    expect(await cmd($, 'pokemon', 'give water stone eevee')).toBe('Eevee evolved into Vaporeon!')
    // Saved before the screen plays, and announced as before.
    expect(w.saveNow().party[0]?.species).toBe('vaporeon')
    expect(w.toasts).toContain('What? Eevee evolved into Vaporeon!')
    const seen = await watch(w.clock, band, SCREEN_MS + 1500)
    const screens = seen.filter(l => l.kind === 'screen')
    // About ten seconds of screen, one of them, from the first frame on.
    expect(seen[0]?.kind).toBe('screen')
    expect(starts(seen)).toEqual([0])
    expect(screens.length).toBeGreaterThanOrEqual(SCREEN_MS / 100 - 4)
    expect(screens.length).toBeLessThanOrEqual(SCREEN_MS / 100 + 4)
    // The screen's own colours, none of the meadow's: the rays stage, the box, and Eevee.
    const intro = seen[14]!
    const allowed = new Set([...RAYS, BOX.fill, BOX.border, BOX.margin, BOX.text, EEVEE, DEFAULT])
    expect([...intro.colors].filter(c => !allowed.has(c))).toEqual([])
    expect(intro.text).toBe('What? EEVEE is evolving!')
    expect(seen.some(l => l.text === 'Congratulations! Your EEVEE evolved into VAPOREON!')).toBe(true)
    // No ₽ label over the screen; the band comes back with it.
    expect(screens.every(l => !l.hasShop)).toBe(true)
    const after = seen[seen.length - 1]!
    expect(after.kind).toBe('band')
    expect(after.hasShop).toBe(true)
    expect(after.colors.has(VAPOREON)).toBe(true)
    expect(after.colors.has(EEVEE)).toBe(false)
    // And it walks.
    const places = new Set<number>()
    for (let i = 0; i < 60 && places.size < 2; i++) {
      await w.clock.advance(500)
      places.add(leftOf(await look(band), VAPOREON))
    }
    expect(places.size).toBeGreaterThan(1)
  },
)

test('the white style shows the off-white stage', SLOW, async ($, on) => {
  const w = await stoneWorld($ as never, on as never)
  const band = await mount($)
  await cmd($, 'pokemon', 'evolution white')
  await cmd($, 'pokemon', 'give water stone eevee')
  await w.clock.advance(800)
  const l = await look(band)
  expect(l.kind).toBe('screen')
  expect(l.colors.has(OFF_WHITE)).toBe(true)
  expect(RAYS.slice(0, 4).some(c => l.colors.has(c))).toBe(false)
})

test('/pokemon-play evolve gradient previews that style once, saving nothing', SLOW, async ($, on) => {
  const w = await stoneWorld($ as never, on as never)
  const band = await mount($)
  await w.clock.advance(500)
  const before = JSON.stringify(w.saveNow())
  expect(await cmd($, 'pokemon-play', 'evolve gradient')).toMatch(/^Previewing Eevee evolving into \w+; /)
  await w.clock.advance(800)
  const l = await look(band)
  expect(l.kind).toBe('screen')
  expect(l.colors.has(GRADIENT_TOP)).toBe(true)
  await watch(w.clock, band, SCREEN_MS, 500)
  const after = await look(band)
  expect(after.kind).toBe('band')
  expect(after.colors.has(EEVEE)).toBe(true)
  expect(JSON.stringify(w.saveNow())).toBe(before)
  // The next preview is in the saved style again.
  await cmd($, 'pokemon-play', 'evolve')
  await w.clock.advance(800)
  const next = await look(band)
  expect(next.kind).toBe('screen')
  expect(next.colors.has(GRADIENT_TOP)).toBe(false)
  expect(next.colors.has(0x0d0e1c)).toBe(true)
})

test(
  'with a wild Pokémon out, the evolution is saved at once and its screen waits until the visitor leaves',
  SLOW,
  async ($, on) => {
    const w = await stoneWorld($ as never, on as never)
    const band = await mount($)
    await w.clock.advance(500)
    expect(await cmd($, 'pokemon-play', 'wild caterpie')).toBe('A wild Caterpie wanders by.')
    expect(await cmd($, 'pokemon', 'give water stone eevee')).toBe('Eevee evolved into Vaporeon!')
    expect(w.saveNow().party[0]?.species).toBe('vaporeon')
    const seen: Look[] = []
    for (let i = 0; i < 1200 && !seen.some(l => l.kind === 'screen'); i++) {
      await w.clock.advance(100)
      seen.push(await look(band))
    }
    const first = seen.findIndex(l => l.kind === 'screen')
    expect(first).toBeGreaterThan(20)
    // The visitor was out (in the grass, aimable, or walking) up to the screen, and gone when it began.
    const out = seen.map(l => l.kind === 'aim' || l.colors.has(CATERPIE))
    expect(out.some(Boolean)).toBe(true)
    expect(out.lastIndexOf(true)).toBeLessThan(first)
    expect(seen[first]?.text.startsWith('What?') || seen[first]?.text === '').toBe(true)
  },
)

test("the timer's visitor due while a screen plays comes as soon as it has ended", SLOW, async ($, on) => {
  const w = await stoneWorld($ as never, on as never)
  const band = await mount($)
  // The first visitor is due ten minutes after the band is first drawn: here, four seconds into the screen.
  for (let i = 0; i < 9; i++) await w.clock.advance(60_000)
  await w.clock.advance(60_000 - 4000)
  const appeared = () => w.toasts.some(t => /A wild .+ appeared!$/.test(t))
  expect(appeared()).toBe(false)
  await cmd($, 'pokemon', 'give water stone eevee')
  const seen: { kind: string; isOut: boolean }[] = []
  for (let t = 0; t < SCREEN_MS + 3000; t += 100) {
    await w.clock.advance(100)
    seen.push({ kind: (await look(band)).kind, isOut: appeared() })
  }
  const end = seen.map(l => l.kind).lastIndexOf('screen')
  expect(end).toBeGreaterThan(SCREEN_MS / 100 - 6)
  expect(seen.slice(0, end + 1).some(l => l.isOut)).toBe(false)
  expect(seen[end + 10]?.isOut).toBe(true)
})

test('the Mart closes when a screen starts, and opens again only once it ends', SLOW, async ($, on) => {
  const w = await stoneWorld($ as never, on as never)
  const band = await mount($)
  await w.clock.advance(500)
  expect(await cmd($, 'pokemon', 'mart')).toContain('The PokéMart is open')
  expect((await look(band)).kind).toBe('mart')
  await cmd($, 'pokemon', 'give water stone eevee')
  await w.clock.advance(300)
  expect((await look(band)).kind).toBe('screen')
  expect(await cmd($, 'pokemon', 'mart')).toContain('An evolution is on screen')
  await watch(w.clock, band, SCREEN_MS + 500, 500)
  expect((await look(band)).kind).toBe('band')
  expect(await cmd($, 'pokemon', 'mart')).toContain('The PokéMart is open')
})

test('twins due at once evolve one screen after the other, never two at once', SLOW, async ($, on) => {
  answerTools(on)
  const ready = { xp: xpForLevel(16) - 5, next: [lv('charmeleon', 16)], gender: 'male' as const }
  const w = await begin(
    $,
    on,
    {
      ...emptySave(),
      party: [member('charmander', { id: 'a', ...ready }), member('charmander', { id: 'b', ...ready })],
    },
    undefined,
    undefined,
    net(),
  )
  await cmd($, 'pokemon', 'party')
  const band = await mount($)
  await w.clock.advance(500)
  await $.tool.call(bash('git commit -m x') as never)
  const seen = await watch(w.clock, band, 2 * SCREEN_MS + 4000)
  expect(w.saveNow().party.map(m => m.species)).toEqual(['charmeleon', 'charmeleon'])
  const at = starts(seen)
  expect(at.length).toBe(2)
  // The second starts once the first has played whole.
  expect((at[1] ?? 0) - (at[0] ?? 0)).toBeGreaterThanOrEqual(SCREEN_MS / 100 - 2)
  expect(seen.filter(l => l.text === 'What? CHARMANDER is evolving!').length).toBeGreaterThan(10)
})

test('a band of 7 rows plays the evolution in place', SLOW, async ($, on) => {
  // 8 rows of pixels: a band of 7 rows.
  const w = await stoneWorld($ as never, on as never, withEevee(), 4)
  const band = await mount($)
  await w.clock.advance(500)
  expect((await look(band)).rows).toBe(7)
  await cmd($, 'pokemon', 'give water stone eevee')
  const seen = await watch(w.clock, band, 6000)
  expect(seen.some(l => l.kind === 'screen')).toBe(false)
  expect(seen.some(l => l.colors.has(WHITE))).toBe(true)
  expect(seen[seen.length - 1]?.colors.has(VAPOREON)).toBe(true)
})

test('with the party off, an evolution shows no screen, then or later', SLOW, async ($, on) => {
  const w = await stoneWorld($ as never, on as never)
  const band = await mount($)
  await w.clock.advance(500)
  await cmd($, 'pokemon', 'off')
  expect(await cmd($, 'pokemon', 'give water stone eevee')).toBe('Eevee evolved into Vaporeon!')
  await cmd($, 'pokemon', 'on')
  const seen = await watch(w.clock, band, SCREEN_MS, 250)
  expect(seen.some(l => l.kind === 'screen')).toBe(false)
  expect(seen[seen.length - 1]?.colors.has(VAPOREON)).toBe(true)
})

test(
  'released mid-screen, the evolving one still has its screen to the end, and nothing is written back',
  SLOW,
  async ($, on) => {
    const w = await stoneWorld(
      $ as never,
      on as never,
      withEevee({ party: [member('eevee', { id: 'e' }), member('pikachu')] }),
    )
    const band = await mount($)
    await w.clock.advance(500)
    await cmd($, 'pokemon', 'give water stone eevee')
    await w.clock.advance(2000)
    expect(await cmd($, 'pokemon', 'release vaporeon')).toContain('Vaporeon')
    const released = JSON.stringify(w.saveNow())
    const seen = await watch(w.clock, band, SCREEN_MS)
    const screens = seen.map(l => l.kind === 'screen')
    // The screen ran on from where it was to its end.
    expect(screens.lastIndexOf(true)).toBeGreaterThan(SCREEN_MS / 100 - 30)
    expect(screens.indexOf(false)).toBe(screens.lastIndexOf(true) + 1)
    expect(seen[seen.length - 1]?.colors.has(VAPOREON)).toBe(false)
    expect(JSON.stringify(w.saveNow())).toBe(released)
    expect(w.saveNow().party.map(m => m.species)).toEqual(['pikachu'])
  },
)

// Another session evolves Charmander `ago` ms before this one's next sync notices.
async function evolvedElsewhere($: never, on: never, ago: number) {
  const w = await begin(
    $,
    on,
    { ...emptySave(), party: [member('charmander', { id: 'a', gender: 'male', next: [lv('charmeleon', 16)] })] },
    undefined,
    undefined,
    net(),
  )
  await cmd($, 'pokemon', 'party')
  const band = await mount($)
  await w.clock.advance(500)
  const [was] = w.saveNow().party
  w.store.set('save', {
    ...w.saveNow(),
    party: [
      { ...was!, species: 'charmeleon', evolutions: 1, next: [lv('charizard', 36)], evolvedAt: w.clock.now() - ago },
    ],
  })
  return { w, seen: await watch(w.clock, band, 12_000, 200) }
}

test("another session's evolution plays its screen here too when sync notices it within 30 s", SLOW, async ($, on) => {
  const { seen } = await evolvedElsewhere($ as never, on as never, 5000)
  expect(seen.some(l => l.text === 'What? CHARMANDER is evolving!')).toBe(true)
})

test("another session's evolution older than 30 s is just drawn", SLOW, async ($, on) => {
  const { seen } = await evolvedElsewhere($ as never, on as never, 60_000)
  expect(seen.some(l => l.kind === 'screen')).toBe(false)
  expect(seen[seen.length - 1]?.colors.has(VAPOREON)).toBe(true)
})
