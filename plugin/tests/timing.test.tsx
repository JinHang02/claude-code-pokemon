// Timing: commands answer at once however many evolutions wait, screens chain and end cleanly, and periodic work
// never overlaps itself.
import { expect, test } from 'claude-code/testing'

import { BOX, TEXT_COLUMN } from '../hooks/evolution-screen'
import { emptySave, xpForLevel } from '../hooks/save'
import type { Save } from '../hooks/save'
import { ART, begin, cmd, hourAt, LIST, lv, member, until } from './world'
import type { Net } from './world'

const SLOW = { timeoutMs: 120_000 }
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
    expect(reply.text).toBe("Still working on it: a download is slow. Anything this changes is told when it's done.")
    net.stall = undefined
    release()
    for (let t = 0; t < 20 && !w.toasts.includes('Eevee joined your party!'); t++) await w.clock.advance(100)
    expect(w.toasts.filter(t => t === 'Eevee joined your party!')).toHaveLength(1)
    expect(w.saveNow().party.map(m => m.species)).toEqual(['pikachu', 'eevee'])
  },
)
