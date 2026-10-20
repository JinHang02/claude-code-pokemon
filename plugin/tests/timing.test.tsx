// Timing: commands answer at once however many evolutions wait, screens chain and end cleanly, and periodic work
// never overlaps itself.
import { expect, test } from 'claude-code/testing'

import { BOX, TEXT_COLUMN } from '../hooks/evolution-screen'
import { emptySave, xpForLevel } from '../hooks/save'
import type { Save } from '../hooks/save'
import { ART, begin, cmd, hourAt, LIST, lv, member, until } from './world'
import type { Net } from './world'

const SLOW = { timeoutMs: 120_000 }
const STILL_WORKING = "Still working on it… What comes of it is told in a notification when it's done."
const CHARMANDER = 0x010203
const CHARMELEON = 0x070809
const EEVEE = 0x0a0b0c
const VAPOREON = 0x0d0e0f
const rgb = (c: number) => `${(c >> 16) & 255};${(c >> 8) & 255};${c & 255}`
// A sprite of one colour, tall enough for the evolution screen.
const solid = (c: number, size = 6) =>
  Array.from({ length: size }, () => `\x1b[38;2;${rgb(c)}m\x1b[48;2;${rgb(c)}m▀\x1b[0m`.repeat(size)).join('\n')
const netWith = (extra: Partial<Net> = {}): Net => ({
  isOnline: true,
  list: JSON.stringify(LIST),
  now: hourAt(12),
  sprites: {
    caterpie: solid(0x00ffff, 4),
    charmander: solid(CHARMANDER),
    charmeleon: solid(CHARMELEON),
    eevee: solid(EEVEE),
    vaporeon: solid(VAPOREON),
  },
  ...extra,
})

type Band = { drawn: () => Promise<unknown>; redraw: () => Promise<void> }
const mount = ($: { ui: { mount: (t: never) => Promise<unknown> } }, maxRows = 30) =>
  $.ui.mount({
    plugin: 'pokemon',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows, bodyColumns: 80 },
  } as never) as Promise<Band>
type Node = { type?: string; props?: Record<string, unknown> }
const findNode = (node: unknown, is: (n: Node) => boolean): Node | null => {
  if (typeof node !== 'object' || node === null) return null
  if (is(node as Node)) return node as Node
  for (const child of Object.values(node)) {
    const found = findNode(child, is)
    if (found) return found
  }
  return null
}
// The band as drawn afresh: an evolution screen (with its message) or the band, its height and colours.
type Look = { isScreen: boolean; rows: number; text: string; colors: Set<number> }
async function look(band: Band): Promise<Look> {
  await band.redraw()
  const raster = findNode(await band.drawn(), n => n.type === 'Raster' && n.props?.key === 'scene')
  const columns = Number(raster?.props?.columns ?? 80)
  const words = [
    ...new Uint32Array(Uint8Array.from(atob(String(raster?.props?.cells ?? '')), c => c.charCodeAt(0)).buffer),
  ]
  const rows = words.length / 3 / columns
  const colors = new Set<number>()
  for (let i = 0; i < words.length; i += 3) colors.add(words[i + 1] ?? 0).add(words[i + 2] ?? 0)
  const cell = (x: number, y: number) => words.slice((y * columns + x) * 3, (y * columns + x) * 3 + 3)
  const isScreen = rows >= 2 && cell(0, rows - 2)[2] === BOX.margin && cell(TEXT_COLUMN - 1, rows - 2)[2] === BOX.fill
  const text = isScreen
    ? String.fromCodePoint(...Array.from({ length: columns }, (_, x) => cell(x, rows - 2)[0] ?? 0x20)).trim()
    : ''
  return { isScreen, rows, text, colors }
}
async function watch(w: { clock: { advance: (ms: number) => Promise<void> } }, band: Band, ms: number, step = 100) {
  const seen: Look[] = []
  for (let t = 0; t < ms; t += step) {
    await w.clock.advance(step)
    seen.push(await look(band))
  }
  return seen
}
// The screens' messages in order, each typed-out message once, whole.
function messages(seen: Look[]): string[] {
  const out: string[] = []
  for (const l of seen) {
    if (!l.isScreen || !l.text) continue
    const last = out[out.length - 1]
    if (last !== undefined && (last.startsWith(l.text) || l.text.startsWith(last))) {
      if (l.text.length > last.length) out[out.length - 1] = l.text
    } else out.push(l.text)
  }
  return out
}
const evolvedToasts = (toasts: string[]) => toasts.filter(t => t.includes(' evolved into '))

// A command started now, and when it answered: its text, the clock time it took and the real time.
function asked(w: { clock: { now: () => number } }, run: Promise<string>) {
  const from = { clock: w.clock.now(), real: Date.now() }
  const reply: { text?: string; ms?: number; realMs?: number } = {}
  void run.then(text => {
    reply.text = text
    reply.ms = w.clock.now() - from.clock
    reply.realMs = Date.now() - from.real
  })
  return reply
}

test(
  '/pokemon-play evolve four times half a second apart: each answers within a second, the screens play one by one',
  SLOW,
  async ($, on) => {
    const w = await begin(
      $,
      on,
      { ...emptySave(), party: [member('charmander', { id: 'a', gender: 'male' })] },
      ART,
      undefined,
      netWith(),
    )
    await cmd($, 'pokemon', 'party')
    const band = await mount($)
    await w.clock.advance(500)
    const replies = []
    for (let i = 0; i < 4; i++) {
      replies.push(asked(w, cmd($, 'pokemon-play', 'evolve')))
      for (let t = 0; t < 5; t++) await w.clock.advance(100)
    }
    for (let t = 0; t < 10; t++) await w.clock.advance(100)
    for (const r of replies) {
      expect(r.ms).toBeLessThanOrEqual(1000)
      // Far inside Claude Code's ten seconds for a command.
      expect(r.realMs).toBeLessThan(5000)
    }
    expect(replies[0]?.text).toBe('Previewing Charmander evolving into Charmeleon in the rays style.')
    for (const r of replies.slice(1))
      expect(r.text).toBe('Previewing Charmander evolving into Charmeleon in the rays style, after the one on screen.')
    const seen = await watch(w, band, 50_000, 250)
    expect(messages(seen)).toEqual(
      Array.from({ length: 4 }, () => [
        'What? CHARMANDER is evolving!',
        'Congratulations! Your CHARMANDER evolved into CHARMELEON!',
      ]).flat(),
    )
    expect(seen.at(-1)?.isScreen).toBe(false)
    expect(w.saveNow().party[0]?.species).toBe('charmander')
    expect(evolvedToasts(w.toasts)).toEqual([])
  },
)

test(
  'three Water Stones given while the sprite download stalls: each command answers within a second, each toast once as its screen ends',
  SLOW,
  async ($, on) => {
    let release = () => {}
    const stall = new Promise<void>(resolve => (release = resolve))
    const net = netWith()
    const saved: Save = {
      ...emptySave(),
      party: [
        member('eevee', { id: 'e1', gender: 'male' }),
        member('eevee', { id: 'e2', gender: 'female' }),
        member('eevee', { id: 'e3', gender: 'male' }),
      ],
      bag: { 'water-stone': 3, 'fire-stone': 1 },
    }
    const w = await begin($, on, saved, ART, undefined, net)
    await until($, () => w.saveNow().party.every(m => m.next !== undefined))
    const band = await mount($)
    await w.clock.advance(500)
    net.artStall = file => (file === 'vaporeon' ? stall : undefined)
    const replies = []
    for (const n of [1, 2, 3]) {
      replies.push(asked(w, cmd($, 'pokemon', `give water stone eevee ${n}`)))
      for (let t = 0; t < 5; t++) await w.clock.advance(100)
    }
    // A stone it can't use, waiting behind them: told in a toast when its turn comes.
    replies.push(asked(w, cmd($, 'pokemon', 'give fire stone eevee 3')))
    for (let t = 0; t < 10; t++) await w.clock.advance(100)
    for (const r of replies) {
      expect(r.ms).toBeLessThanOrEqual(1000)
      expect(r.realMs).toBeLessThan(5000)
    }
    expect(replies.slice(0, 3).map(r => r.text)).toEqual(
      Array(3).fill('Giving the Water Stone to Eevee: what it does shows in a moment.'),
    )
    expect(replies[3]?.text).toBe('Giving the Fire Stone to Eevee: what it does shows in a moment.')
    expect(w.toasts).toEqual([])
    release()
    // No toast before its screen has ended: each comes as one ends, about ten seconds apart.
    const toastsAt: number[] = []
    const seen: Look[] = []
    for (let t = 0; t < 400; t++) {
      await w.clock.advance(100)
      seen.push(await look(band))
      while (toastsAt.length < evolvedToasts(w.toasts).length) toastsAt.push(t)
    }
    expect(evolvedToasts(w.toasts)).toEqual(Array(3).fill('What? Eevee evolved into Vaporeon!'))
    expect(toastsAt[0]).toBeGreaterThan(90)
    expect((toastsAt[1] ?? 0) - (toastsAt[0] ?? 0)).toBeGreaterThan(90)
    expect((toastsAt[2] ?? 0) - (toastsAt[1] ?? 0)).toBeGreaterThan(90)
    expect(messages(seen).filter(m => m.startsWith('What?'))).toHaveLength(3)
    expect(w.toasts.filter(t => t === "Vaporeon can't use a Fire Stone.")).toHaveLength(1)
    expect(w.toasts.filter(t => t.startsWith('Giving'))).toEqual([])
    expect(w.saveNow().party.map(m => m.species)).toEqual(['vaporeon', 'vaporeon', 'vaporeon'])
    expect(w.saveNow().bag).toEqual({ 'fire-stone': 1 })
  },
)

test(
  'a preview waiting behind a visitor, then a Rare Candy evolution of the same lead: the old form walks, and each screen starts from it',
  SLOW,
  async ($, on) => {
    const w = await begin(
      $,
      on,
      {
        ...emptySave(),
        evolution: 'auto',
        party: [
          member('charmander', { id: 'a', xp: xpForLevel(16) - 1, gender: 'male', next: [lv('charmeleon', 16)] }),
        ],
        bag: { 'rare-candy': 1 },
      },
      ART,
      undefined,
      netWith(),
    )
    await cmd($, 'pokemon', 'party')
    const band = await mount($)
    await w.clock.advance(500)
    expect(await cmd($, 'pokemon-play', 'wild caterpie')).toBe('A wild Caterpie wanders by.')
    expect(await cmd($, 'pokemon-play', 'evolve')).toMatch(/plays once it has gone\.$/)
    expect(await cmd($, 'pokemon', 'give rare candy charmander')).toBe('Charmander grew to Lv 16!')
    for (let i = 0; i < 30 && w.saveNow().party[0]?.species !== 'charmeleon'; i++) await w.clock.advance(100)
    expect(w.saveNow().party[0]?.species).toBe('charmeleon')
    // Anything that draws the party again while the visitor is out.
    await cmd($, 'pokemon', 'add pikachu')
    const out = await watch(w, band, 3000)
    expect(out.some(l => l.isScreen)).toBe(false)
    expect(out.filter(l => l.colors.has(CHARMELEON))).toHaveLength(0)
    const seen = await watch(w, band, 90_000, 250)
    expect(messages(seen)).toEqual([
      'What? CHARMANDER is evolving!',
      'Congratulations! Your CHARMANDER evolved into CHARMELEON!',
      'What? CHARMANDER is evolving!',
      'Congratulations! Your CHARMANDER evolved into CHARMELEON!',
    ])
    expect(evolvedToasts(w.toasts)).toEqual(['What? Charmander evolved into Charmeleon!'])
  },
)

test(
  'an evolution while the party is off plays nothing after /pokemon on: it comes back evolved',
  SLOW,
  async ($, on) => {
    const w = await begin(
      $,
      on,
      { ...emptySave(), party: [member('eevee', { id: 'e', gender: 'male' })], bag: { 'water-stone': 1 } },
      ART,
      undefined,
      netWith(),
    )
    await until($, () => w.saveNow().party[0]?.next !== undefined)
    const band = await mount($)
    await w.clock.advance(500)
    await cmd($, 'pokemon', 'off')
    expect(await cmd($, 'pokemon', 'give water stone eevee')).toBe('Eevee evolved into Vaporeon!')
    expect(evolvedToasts(w.toasts)).toEqual(['What? Eevee evolved into Vaporeon!'])
    await w.clock.advance(5000)
    await cmd($, 'pokemon', 'on')
    const seen = await watch(w, band, 6000)
    expect(seen.filter(l => l.colors.has(EEVEE))).toHaveLength(0)
    expect(seen.filter(l => l.colors.has(0xffffff))).toHaveLength(0)
    expect(seen.filter(l => l.colors.has(VAPOREON)).length).toBeGreaterThan(0)
    expect(evolvedToasts(w.toasts)).toHaveLength(1)
  },
)

test(
  'a terminal made too short mid-screen ends the screen there, with its toast, and the band goes on',
  SLOW,
  async ($, on) => {
    const w = await begin(
      $,
      on,
      { ...emptySave(), party: [member('eevee', { id: 'e', gender: 'male' })], bag: { 'water-stone': 1 } },
      ART,
      undefined,
      netWith(),
    )
    await until($, () => w.saveNow().party[0]?.next !== undefined)
    let band = await mount($)
    await w.clock.advance(500)
    expect(await cmd($, 'pokemon', 'give water stone eevee')).toBe('What? Eevee is evolving!')
    const tall = await watch(w, band, 1500)
    expect(tall.some(l => l.isScreen)).toBe(true)
    expect(w.toasts).toEqual([])
    band = await mount($, 6)
    const short = await watch(w, band, 1500)
    expect(short.some(l => l.isScreen)).toBe(false)
    expect(short.every(l => l.rows <= 6)).toBe(true)
    // Told at once, and drawn evolved.
    expect(evolvedToasts(w.toasts)).toEqual(['What? Eevee evolved into Vaporeon!'])
    expect(short.at(-1)?.colors.has(VAPOREON)).toBe(true)
    expect(short.at(-1)?.colors.has(EEVEE)).toBe(false)
    band = await mount($)
    const back = await watch(w, band, 12_000, 250)
    expect(back.some(l => l.isScreen)).toBe(false)
    expect(evolvedToasts(w.toasts)).toHaveLength(1)
  },
)

test(
  '/pokemon-play evolve [style] says when nothing can be shown, and when the style needs more room',
  SLOW,
  async ($, on) => {
    await begin(
      $,
      on,
      { ...emptySave(), party: [member('charmander', { id: 'a', gender: 'male' })] },
      ART,
      undefined,
      netWith(),
    )
    await cmd($, 'pokemon', 'party')
    await mount($, 6)
    await cmd($, 'pokemon', 'off')
    expect(await cmd($, 'pokemon-play', 'evolve white')).toBe(
      'Your Pokémon are resting in their Poké Balls: there is nothing to show. /pokemon on brings them back.',
    )
    await cmd($, 'pokemon', 'on')
    expect(await cmd($, 'pokemon-play', 'evolve white')).toBe(
      'No room for the white screen here. Previewing Charmander evolving into Charmeleon; it changes back in a few seconds.',
    )
  },
)

test('two retries on a slow network after an offline start catch one first Pokémon only', SLOW, async ($, on) => {
  const w = await begin($, on, undefined, ART, undefined, { isOnline: false, list: JSON.stringify(LIST) })
  await w.clock.advance(30_000)
  let release = () => {}
  w.net.stall = new Promise<void>(resolve => (release = resolve))
  w.net.isOnline = true
  // One retry starts a first catch, which waits on the stalled download; the next comes while it still waits.
  await w.clock.advance(10_000)
  await w.clock.advance(10_000)
  release()
  w.net.stall = undefined
  await w.clock.advance(2_000)
  expect(w.saveNow().party).toHaveLength(1)
  expect(w.saveNow().box ?? []).toEqual([])
  expect(Object.keys(w.saveNow().dex)).toHaveLength(1)
})

test(
  'a command held up by a stalled download answers before Claude Code gives up on it, and tells what it did later',
  SLOW,
  async ($, on) => {
    let release = () => {}
    const net = netWith({ stall: new Promise<void>(resolve => (release = resolve)) })
    const w = await begin($, on, { ...emptySave(), party: [member('pikachu', { next: [] })] }, ART, undefined, net)
    // The party's sprites and the species list wait on the network; catching Eevee waits on that list.
    const reply = asked(w, cmd($, 'pokemon', 'add eevee'))
    for (let t = 0; t < 100 && reply.text === undefined; t++) await w.clock.advance(100)
    expect(reply.ms).toBeLessThanOrEqual(7000)
    expect(reply.realMs).toBeLessThan(5000)
    expect(reply.text).toBe(STILL_WORKING)
    net.stall = undefined
    release()
    for (let t = 0; t < 20 && !w.toasts.includes('Eevee joined your party!'); t++) await w.clock.advance(100)
    expect(w.toasts.filter(t => t === 'Eevee joined your party!')).toHaveLength(1)
    expect(w.saveNow().party.map(m => m.species)).toEqual(['pikachu', 'eevee'])
  },
)

test(
  'a list that comes back after the command has answered says it is ready to be asked for again',
  SLOW,
  async ($, on) => {
    let release = () => {}
    const net = netWith({ stall: new Promise<void>(resolve => (release = resolve)) })
    const w = await begin($, on, { ...emptySave(), party: [member('pikachu', { next: [] })] }, ART, undefined, net)
    const reply = asked(w, cmd($, 'pokedex'))
    for (let t = 0; t < 100 && reply.text === undefined; t++) await w.clock.advance(100)
    expect(reply.text).toBe(STILL_WORKING)
    net.stall = undefined
    release()
    const ready = 'Pokémon: /pokedex is ready. Run it again to see it.'
    for (let t = 0; t < 20 && !w.toasts.includes(ready); t++) await w.clock.advance(100)
    expect(w.toasts.filter(t => t === ready)).toHaveLength(1)
  },
)

test('a command answering late whose evolution plays in place is told once, by the evolution', SLOW, async ($, on) => {
  let release = () => {}
  const net = netWith({ stall: new Promise<void>(resolve => (release = resolve)) })
  // The party never gets drawn: start-up waits on Eevee's sprite.
  net.artStall = file => (file === 'eevee' ? new Promise<void>(() => {}) : undefined)
  const w = await begin(
    $,
    on,
    { ...emptySave(), party: [member('eevee', { id: 'e', gender: 'male' })], bag: { 'water-stone': 1 } },
    ART,
    undefined,
    net,
  )
  const reply = asked(w, cmd($, 'pokemon', 'give water stone eevee'))
  for (let t = 0; t < 100 && reply.text === undefined; t++) await w.clock.advance(100)
  expect(reply.text).toBe(STILL_WORKING)
  net.stall = undefined
  release()
  for (let t = 0; t < 30 && w.saveNow().party[0]?.species !== 'vaporeon'; t++) await w.clock.advance(100)
  await w.clock.advance(2000)
  expect(w.saveNow().party[0]?.species).toBe('vaporeon')
  expect(w.toasts).toEqual(['What? Eevee evolved into Vaporeon!'])
})

test(
  "a retry waiting on a slow first catch doesn't hold up the sync: another window's change is picked up",
  SLOW,
  async ($, on) => {
    const w = await begin($, on, undefined, ART, undefined, { isOnline: false, list: JSON.stringify(LIST) })
    await w.clock.advance(30_000)
    let release = () => {}
    w.net.stall = new Promise<void>(resolve => (release = resolve))
    w.net.isOnline = true
    // A retry starts a first catch, which waits on the stalled download.
    await w.clock.advance(10_000)
    w.store.set('save', { ...emptySave(), evolutionStyle: 'white' })
    await w.clock.advance(10_000)
    // Read from what this window holds, with no sync of its own.
    expect(await cmd($, 'pokemon', 'evolution bogus')).toMatch(/white: .* \(current\)/)
    release()
    w.net.stall = undefined
    await w.clock.advance(2_000)
    expect(w.saveNow().party).toHaveLength(1)
    expect(w.saveNow().evolutionStyle).toBe('white')
  },
)
