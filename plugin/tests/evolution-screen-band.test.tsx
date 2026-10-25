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
const CHARMANDER = EEVEE
const CHARMELEON = VAPOREON
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
    const aim = findNode(tree, n => n.type === 'Client' && n.props?.key === 'aim')
    if (aim) {
      // The click layer draws the band as coloured text: its colours are the band's.
      const lines = (aim.props?.props as { lines?: [string, string, string][][] } | undefined)?.lines ?? []
      const colors = new Set(
        lines.flat().flatMap(([, fg, bg]) => [fg, bg].filter(Boolean).map(h => parseInt(h.slice(1), 16))),
      )
      return { kind: 'aim', ...none, colors }
    }
    if (findNode(tree, n => n.type === 'Client' && n.props?.key === 'mart')) return { kind: 'mart', ...none }
    return { kind: 'none', ...none }
  }
  return { ...parse(String(raster.props?.cells ?? '')), hasShop }
}
// A picture of the band's cells, as drawn or as blitted.
function parse(cells: string): Omit<Look, 'hasShop'> {
  const words = decode(cells)
  const rows = words.length / 3 / COLUMNS
  const colors = new Set<number>()
  for (let i = 0; i < words.length; i += 3) colors.add(words[i + 1] ?? 0).add(words[i + 2] ?? 0)
  const cell = (x: number, y: number) => words.slice((y * COLUMNS + x) * 3, (y * COLUMNS + x) * 3 + 3)
  // The text box's middle row: the margin, then the box's fill, under the message.
  const isScreen = rows >= 3 && cell(0, rows - 2)[2] === BOX.margin && cell(TEXT_COLUMN - 1, rows - 2)[2] === BOX.fill
  const text = isScreen
    ? String.fromCodePoint(...Array.from({ length: COLUMNS }, (_, x) => cell(x, rows - 2)[0] ?? 0x20)).trim()
    : ''
  return { kind: isScreen ? 'screen' : 'band', words, rows, text, colors }
}
const evolvedToasts = (toasts: string[]) => toasts.filter(t => t.includes(' evolved into '))
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

// Until Eevee is drawn. The band's timer counts only once the party is, and its sprite arrives in real time: on a busy
// machine, after the fake clock has moved on, so a visitor due "in ten minutes" would come later.
async function untilDrawn($: never, band: Band) {
  for (let i = 0; i < 50 && !(await look(band)).colors.has(EEVEE); i++) await cmd($, 'pokemon', 'party')
  expect((await look(band)).colors.has(EEVEE)).toBe(true)
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
    // Saved before the screen plays; what it became is told only once the screen has shown it.
    expect(await cmd($, 'pokemon', 'give water stone eevee')).toBe('What? Eevee is evolving!')
    expect(w.saveNow().party[0]?.species).toBe('vaporeon')
    expect(evolvedToasts(w.toasts)).toEqual([])
    const told: boolean[] = []
    const seen: Look[] = []
    for (let t = 0; t < SCREEN_MS + 1500; t += 100) {
      await w.clock.advance(100)
      seen.push(await look(band))
      told.push(evolvedToasts(w.toasts).length > 0)
    }
    const last = seen.map(l => l.kind).lastIndexOf('screen')
    expect(told.slice(0, last).some(Boolean)).toBe(false)
    expect(evolvedToasts(w.toasts)).toEqual(['What? Eevee evolved into Vaporeon!'])
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
  // The lead doesn't change on the screen: the reply says what plays, nothing about changing back.
  expect(await cmd($, 'pokemon-play', 'evolve gradient')).toMatch(
    /^Previewing Eevee evolving into \w+ in the gradient style\.$/,
  )
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
  expect(await cmd($, 'pokemon-play', 'evolve')).toMatch(/ in the rays style\.$/)
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
    expect(await cmd($, 'pokemon', 'give water stone eevee')).toBe('What? Eevee is evolving!')
    expect(w.saveNow().party[0]?.species).toBe('vaporeon')
    const seen: Look[] = []
    for (let i = 0; i < 1200 && !seen.some(l => l.kind === 'screen'); i++) {
      await w.clock.advance(100)
      seen.push(await look(band))
    }
    const first = seen.findIndex(l => l.kind === 'screen')
    expect(first).toBeGreaterThan(20)
    // The visitor was out (in the grass, aimable, or walking) up to the screen, and gone when it began; Eevee kept
    // its old form all that time.
    const out = seen.map(l => l.kind === 'aim' || l.colors.has(CATERPIE))
    expect(out.some(Boolean)).toBe(true)
    expect(out.lastIndexOf(true)).toBeLessThan(first)
    expect(seen[first]?.text.startsWith('What?') || seen[first]?.text === '').toBe(true)
    expect(seen.slice(0, first).some(l => l.colors.has(VAPOREON))).toBe(false)
    expect(seen.slice(0, first).some(l => l.colors.has(EEVEE))).toBe(true)
    // Told once the screen has shown it.
    expect(evolvedToasts(w.toasts)).toEqual([])
    await watch(w.clock, band, SCREEN_MS + 500, 500)
    expect(evolvedToasts(w.toasts)).toEqual(['What? Eevee evolved into Vaporeon!'])
  },
)

test('/pokemon-play evolve with a wild Pokémon out says the preview plays once it has gone', SLOW, async ($, on) => {
  const w = await stoneWorld($ as never, on as never)
  const band = await mount($)
  await w.clock.advance(500)
  expect(await cmd($, 'pokemon-play', 'wild caterpie')).toBe('A wild Caterpie wanders by.')
  expect(await cmd($, 'pokemon-play', 'evolve')).toMatch(
    /^A wild Caterpie is out: Eevee evolving into \w+ in the rays style plays once it has gone\.$/,
  )
  const seen: Look[] = []
  for (let i = 0; i < 1200 && !seen.some(l => l.kind === 'screen'); i++) {
    await w.clock.advance(100)
    seen.push(await look(band))
  }
  const first = seen.findIndex(l => l.kind === 'screen')
  expect(first).toBeGreaterThan(20)
  expect(seen.slice(0, first).some(l => l.kind === 'aim' || l.colors.has(CATERPIE))).toBe(true)
})

test("the timer's visitor due while a screen plays comes as soon as it has ended", SLOW, async ($, on) => {
  const w = await stoneWorld($ as never, on as never)
  const band = await mount($)
  await untilDrawn($ as never, band)
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

test(
  "the timer's visitor still downloading as a screen starts comes, the same one, once it has ended",
  SLOW,
  async ($, on) => {
    const w = await stoneWorld($ as never, on as never)
    const band = await mount($)
    await untilDrawn($ as never, band)
    for (let i = 0; i < 9; i++) await w.clock.advance(60_000)
    await w.clock.advance(60_000 - 2000)
    // Awake, so the timer brings its visitor on time.
    await cmd($, 'pokemon-play', 'hop')
    // The visitor's sprite, the first one asked for from here on, takes until the screen has begun.
    let release = () => {}
    const stall = new Promise<void>(r => (release = r))
    let stalled = ''
    w.net.artStall = file => {
      if (stalled) return undefined
      stalled = file
      return stall
    }
    await watch(w.clock, band, 3000)
    // The visitor's draw runs on real time: a busy machine may ask for its sprite only after the fake clock moved on.
    await until($, () => stalled !== '')
    const appeared = () => w.toasts.filter(t => /A wild .+ appeared!$/.test(t))
    expect(await cmd($, 'pokemon', 'give water stone eevee')).toBe('What? Eevee is evolving!')
    await w.clock.advance(300)
    expect((await look(band)).kind).toBe('screen')
    release()
    const sprites = () => w.fetched.filter(u => u.includes('/colorscripts/')).length
    const before = sprites()
    const seen: { kind: string; isOut: boolean }[] = []
    for (let t = 0; t < SCREEN_MS + 3000; t += 100) {
      await w.clock.advance(100)
      seen.push({ kind: (await look(band)).kind, isOut: appeared().length > 0 })
    }
    const end = seen.map(l => l.kind).lastIndexOf('screen')
    expect(end).toBeGreaterThan(SCREEN_MS / 100 - 10)
    expect(seen.slice(0, end + 1).some(l => l.isOut)).toBe(false)
    expect(seen[end + 10]?.isOut).toBe(true)
    // The one already downloaded, not a new draw.
    expect(appeared().length).toBe(1)
    expect(sprites()).toBe(before)
  },
)

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
      evolution: 'auto',
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

test('the frames sent as a screen ends go straight to the new form, never back to the old one', SLOW, async ($, on) => {
  const w = await stoneWorld($ as never, on as never)
  await mount($)
  await w.clock.advance(500)
  await cmd($, 'pokemon', 'give water stone eevee')
  // Every frame the band is sent, tick by tick, as the terminal gets them.
  const sent: Omit<Look, 'hasShop'>[] = []
  for (let t = 0; t < SCREEN_MS + 1500; t += 50) {
    await w.clock.advance(50)
    if (w.band.cells) sent.push(parse(w.band.cells))
  }
  const last = sent.map(l => l.kind).lastIndexOf('screen')
  expect(last).toBeGreaterThan(SCREEN_MS / 50 - 10)
  const after = sent.slice(last + 1)
  expect(after.length).toBeGreaterThan(5)
  expect(after.filter(l => l.colors.has(EEVEE)).length).toBe(0)
  expect(after.every(l => l.kind === 'band' && l.colors.has(VAPOREON))).toBe(true)
})

test('the party put away mid-screen: the screen stops, and the evolution is told then, once', SLOW, async ($, on) => {
  const w = await stoneWorld($ as never, on as never)
  const band = await mount($)
  await w.clock.advance(500)
  expect(await cmd($, 'pokemon', 'give water stone eevee')).toBe('What? Eevee is evolving!')
  await w.clock.advance(2000)
  expect(evolvedToasts(w.toasts)).toEqual([])
  await cmd($, 'pokemon', 'off')
  expect(evolvedToasts(w.toasts)).toEqual(['What? Eevee evolved into Vaporeon!'])
  await cmd($, 'pokemon', 'on')
  const seen = await watch(w.clock, band, SCREEN_MS, 250)
  expect(seen.some(l => l.kind === 'screen')).toBe(false)
  expect(seen[seen.length - 1]?.colors.has(VAPOREON)).toBe(true)
  expect(evolvedToasts(w.toasts)).toHaveLength(1)
})

test(
  'released while its screen waits for a visitor: no screen, and the evolution is told once',
  SLOW,
  async ($, on) => {
    const w = await stoneWorld(
      $ as never,
      on as never,
      withEevee({ party: [member('eevee', { id: 'e', gender: 'male' }), member('charmander', { next: [] })] }),
    )
    // A band still tall enough for a screen once Vaporeon has gone.
    const band = await mount($)
    await w.clock.advance(500)
    expect(await cmd($, 'pokemon-play', 'wild caterpie')).toBe('A wild Caterpie wanders by.')
    expect(await cmd($, 'pokemon', 'give water stone eevee')).toBe('What? Eevee is evolving!')
    expect(await cmd($, 'pokemon', 'release vaporeon')).toContain('Vaporeon')
    const seen: Look[] = []
    for (let i = 0; i < 600 && !evolvedToasts(w.toasts).length; i++) {
      await w.clock.advance(100)
      seen.push(await look(band))
    }
    seen.push(...(await watch(w.clock, band, SCREEN_MS, 250)))
    expect(seen.some(l => l.kind === 'screen')).toBe(false)
    expect(evolvedToasts(w.toasts)).toEqual(['What? Eevee evolved into Vaporeon!'])
    expect(w.saveNow().party.map(m => m.species)).toEqual(['charmander'])
  },
)

test(
  "another session's evolution noticed while a visitor is out: the old form walks until its screen",
  SLOW,
  async ($, on) => {
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
    expect(await cmd($, 'pokemon-play', 'wild caterpie')).toBe('A wild Caterpie wanders by.')
    const [was] = w.saveNow().party
    w.store.set('save', {
      ...w.saveNow(),
      party: [{ ...was!, species: 'charmeleon', evolutions: 1, next: [lv('charizard', 36)], evolvedAt: w.clock.now() }],
    })
    // Noticed now, by a command's sync.
    await cmd($, 'pokemon', 'party')
    const seen: Look[] = []
    for (let i = 0; i < 1200 && !seen.some(l => l.kind === 'screen'); i++) {
      await w.clock.advance(100)
      seen.push(await look(band))
    }
    const first = seen.findIndex(l => l.kind === 'screen')
    expect(first).toBeGreaterThan(20)
    expect(seen[first]?.text.startsWith('What?') || seen[first]?.text === '').toBe(true)
    expect(seen.slice(0, first).some(l => l.colors.has(CHARMELEON))).toBe(false)
    expect(seen.slice(0, first).some(l => l.colors.has(CHARMANDER))).toBe(true)
  },
)

test(
  'the band gone mid-screen with another evolution due: the screen still plays whole when it is back',
  SLOW,
  async ($, on) => {
    answerTools(on)
    // What Claude Code draws in the band's place while a survey shows.
    on('ui.render', async () => ({ type: 'Text', children: ['survey'] }) as never)
    const ready = { xp: xpForLevel(16) - 5, next: [lv('charmeleon', 16)], gender: 'male' as const }
    const w = await begin(
      $,
      on,
      {
        ...emptySave(),
        evolution: 'auto',
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
    const early = await watch(w.clock, band, 1500)
    expect(early.some(l => l.kind === 'screen')).toBe(true)
    // A survey takes the band's place for a while: the second twin evolves meanwhile, with no band to play on.
    await $.ui.mount({
      plugin: 'pokemon',
      surface: 'terminal',
      component: 'AbovePrompt',
      props: { hasSurvey: true, isWorking: false, maxRows: 30, bodyColumns: COLUMNS },
    } as never)
    for (let i = 0; i < 40 && w.saveNow().party.some(m => m.species === 'charmander'); i++) await w.clock.advance(250)
    expect(w.saveNow().party.map(m => m.species)).toEqual(['charmeleon', 'charmeleon'])
    const back = await mount($)
    const seen = await watch(w.clock, back, SCREEN_MS)
    // The first screen goes on from where it was: through its flash, on to the end.
    const screens = seen.filter(l => l.kind === 'screen')
    expect(screens.length).toBeGreaterThan(SCREEN_MS / 100 - 30)
    expect(screens.some(l => l.text === 'What? CHARMANDER is evolving!')).toBe(true)
    expect(screens.some(l => l.text === 'Congratulations! Your CHARMANDER evolved into CHARMELEON!')).toBe(true)
    // Each twin's evolution told once.
    for (let i = 0; i < 20; i++) await w.clock.advance(500)
    expect(evolvedToasts(w.toasts)).toEqual([
      'What? Charmander evolved into Charmeleon!',
      'What? Charmander evolved into Charmeleon!',
    ])
    void band
  },
)

test(
  "Nincada's screen is Nincada's alone; Shedinja's arrival is told with it, once the screen ends",
  SLOW,
  async ($, on) => {
    answerTools(on)
    const w = await begin(
      $,
      on,
      {
        ...emptySave(),
        evolution: 'auto',
        party: [member('nincada', { id: 'n', xp: xpForLevel(20) - 5, gender: 'male' })],
      },
      undefined,
      undefined,
      net(6, { sprites: { nincada: solid('1;2;3', 6), ninjask: solid('7;8;9', 6), shedinja: solid('9;9;9', 6) } }),
    )
    await until($, () => w.saveNow().party.every(m => m.next !== undefined))
    const band = await mount($)
    await w.clock.advance(500)
    await $.tool.call(bash('git commit -m x') as never)
    const seen: Look[] = []
    const told: boolean[] = []
    for (let t = 0; t < SCREEN_MS + 1500; t += 100) {
      await w.clock.advance(100)
      seen.push(await look(band))
      told.push(evolvedToasts(w.toasts).length > 0)
    }
    expect(starts(seen)).toHaveLength(1)
    expect(seen.some(l => l.text === 'What? NINCADA is evolving!')).toBe(true)
    expect(told.slice(0, seen.map(l => l.kind).lastIndexOf('screen')).some(Boolean)).toBe(false)
    expect(evolvedToasts(w.toasts)).toEqual(['What? Nincada evolved into Ninjask! Shedinja joined your party!'])
    expect(w.saveNow().party.map(m => m.species)).toEqual(['ninjask', 'shedinja'])
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

// The band reads the hour from the engine's clock, not the machine's: these run at any hour of the day.
const BRIGHT = '200;160;120'
async function eeveeAt($: never, on: never, hour: number) {
  const w = await stoneWorld($, on, withEevee(), 6, { now: hourAt(hour), sprites: { eevee: solid(BRIGHT, 6) } })
  const band = await mount($ as never)
  await w.clock.advance(500)
  return (await look(band)).colors
}

test('at noon on the engine clock Eevee is drawn as it is', SLOW, async ($, on) => {
  const colors = await eeveeAt($ as never, on as never, 12)
  expect([colors.has(0xc8a078), colors.has(0xaa8866)]).toEqual([true, false])
})

test('at midnight on the engine clock Eevee is dimmed for the night', SLOW, async ($, on) => {
  const colors = await eeveeAt($ as never, on as never, 0)
  expect([colors.has(0xc8a078), colors.has(0xaa8866)]).toEqual([false, true])
})
