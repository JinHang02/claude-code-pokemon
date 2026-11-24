// The region pill: its label and size, the pill client's clicks, and the band's two pills (region top left, wallet
// top right) across widths, a wild visitor, another window's travel and malformed open payloads.
import type { ClientElements, ClientPointerEvent, ClientSurface, JsonValue } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import type { MartProps } from '../hooks/mart'
import Pill, { regionLabelText, shopRows, shopSize, walletPill } from '../hooks/shop'
import type { PillProps } from '../hooks/shop'
import { TRAVEL_REGIONS } from '../hooks/travel-regions'
import type { Journey } from '../hooks/travel-regions'
import { emptySave } from '../hooks/save'
import type { Save } from '../hooks/save'
import { begin, cmd, KIT, member } from './world'

type Band = {
  pointer: (e: { type: 'down'; x: number; y: number; button: 'left'; in?: string }) => Promise<void>
  post: (data: unknown, scope?: { in?: string }) => Promise<void>
  drawn: () => Promise<unknown>
  redraw: () => Promise<void>
}
type Node = { type?: string; props?: Record<string, unknown> }

const KANTO = TRAVEL_REGIONS[0]!
const JOHTO = TRAVEL_REGIONS[1]!
const TICKETS_TAB = 4
const JOHTO_OWNED: Journey = { current: 'kanto', tickets: ['johto'], starters: { kanto: { species: 'pikachu' } } }
const player = (extra: Partial<Save> = {}): Save => ({ ...emptySave(), party: [member('pikachu')], ...extra })

// ── regionLabelText and the pill's size ──

test('the label is the whole name from 48 band columns, its first three letters below', () => {
  expect(regionLabelText(KANTO, 48)).toBe('KANTO')
  expect(regionLabelText(KANTO, 47)).toBe('KAN')
  expect(regionLabelText(KANTO, 49)).toBe('KANTO')
  expect(regionLabelText(JOHTO, 512)).toBe('JOHTO')
  expect(regionLabelText(JOHTO, 0)).toBe('JOH')
})

test('a wider threshold keeps the first three letters below it', () => {
  expect(regionLabelText(KANTO, 59, 60)).toBe('KAN')
  expect(regionLabelText(KANTO, 60, 60)).toBe('KANTO')
})

for (const [columns, text] of [
  [59, 'KAN'],
  [60, 'KANTO'],
] as const)
  test(`the Mart's title at ${columns} columns reads ${text}`, KIT, async ($, on) => {
    await begin($, on, player())
    await cmd($, 'pokemon', 'party')
    const band = await mountAt($, columns)
    await band.pointer({ type: 'down', x: 1, y: 0, button: 'left', in: 'region' })
    expect((await martOf(band))?.region).toEqual({ text, color: KANTO.color })
  })

test("Kanto's dot is red", () => {
  expect(KANTO.color).toBe('#e3350d')
})

test('a dotted row takes its text plus a space, the dot, a space and a space after', () => {
  expect(shopSize({ rows: [{ text: 'KANTO', dot: KANTO.color }], act: 'tickets' })).toEqual({ columns: 9, rows: 1 })
  expect(shopSize({ rows: [{ text: 'KAN', dot: KANTO.color }], act: 'tickets' })).toEqual({ columns: 7, rows: 1 })
})

test("the wallet's pill is its rows, undotted, and opens the Mart", () => {
  expect(walletPill({ balance: 3020, plus: 20 })).toEqual({
    rows: shopRows({ balance: 3020, plus: 20 }).map(text => ({ text })),
    act: 'mart',
  })
})

// ── The pill client ──

type Drawn = { type: string; props: { color?: string; backgroundColor?: string; children?: unknown } }
const ELEMENTS = {
  Box: (props: Drawn['props']): Drawn => ({ type: 'Box', props }),
  Text: (props: Drawn['props']): Drawn => ({ type: 'Text', props }),
} as unknown as ClientElements

/**
 * The pill drawn once on a fake surface.
 * @returns `posts`: everything posted, in order; `pointer`: send one event; `tree`: what the draw returned.
 */
function mountPill(p: PillProps) {
  const posts: JsonValue[] = []
  let onPointer: ((e: ClientPointerEvent) => void) | null = null
  const s: { -readonly [K in keyof ClientSurface<true>]: ClientSurface<true>[K] } = {
    elements: ELEMENTS,
    state: undefined,
    setState: next => void (s.state = next),
    columns: 9,
    rows: 1,
    every: () => () => {},
    onPointer: fn => {
      onPointer = fn
      return () => (onPointer = null)
    },
    onKey: () => () => {},
    post: data => void posts.push(data),
  }
  const tree = Pill(p, s)
  return { posts, tree, pointer: (e: ClientPointerEvent) => onPointer?.(e) }
}

// Every string drawn, in order, with the colour it is drawn in.
function texts(node: unknown, color?: string): [string, string | undefined][] {
  if (typeof node === 'string') return [[node, color]]
  if (Array.isArray(node)) return node.flatMap(n => texts(n, color))
  if (typeof node !== 'object' || node === null) return []
  const { props } = node as Drawn
  return texts(props.children, props.color ?? color)
}

test('a left click on the region pill posts its act; on the wallet pill, its act', () => {
  const region = mountPill({ rows: [{ text: 'KANTO', dot: KANTO.color }], act: 'tickets' })
  region.pointer({ type: 'down', x: 1, y: 0, button: 'left' })
  expect(region.posts).toEqual([{ open: 'tickets' }])
  const wallet = mountPill({ rows: [{ text: ' 🛒 ₽ 3,000 ' }], act: 'mart' })
  wallet.pointer({ type: 'down', x: 1, y: 0, button: 'left' })
  expect(wallet.posts).toEqual([{ open: 'mart' }])
})

test('a right click, a move or an up on a pill posts nothing', () => {
  const pill = mountPill({ rows: [{ text: 'KANTO', dot: KANTO.color }], act: 'tickets' })
  pill.pointer({ type: 'down', x: 1, y: 0, button: 'right' })
  pill.pointer({ type: 'move', x: 1, y: 0 })
  pill.pointer({ type: 'up', x: 1, y: 0, button: 'left' })
  expect(pill.posts).toEqual([])
})

test("the region pill draws ' ● KANTO ', the dot in the region's colour", () => {
  const drawn = texts(mountPill({ rows: [{ text: 'KANTO', dot: KANTO.color }], act: 'tickets' }).tree)
  expect(drawn.map(([t]) => t).join('')).toBe(' ● KANTO ')
  expect(drawn.find(([t]) => t === '●')?.[1]).toBe(KANTO.color)
})

test("the wallet pill draws its rows as today's button did", () => {
  const drawn = texts(mountPill({ rows: [{ text: ' 🛒 ₽ 3,020 ' }, { text: '       +₽20 ' }], act: 'mart' }).tree)
  expect(drawn.map(([t]) => t)).toEqual([' 🛒 ₽ 3,020 ', '       +₽20 '])
})

// ── The band ──

const mountAt = ($: { ui: { mount: (t: never) => Promise<unknown> } }, bodyColumns: number) =>
  $.ui.mount({
    plugin: 'pokemon',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 30, bodyColumns },
  } as never) as Promise<Band>

// The first node of the band as drawn afresh that `is` picks, or null.
async function nodeIn(band: Band, is: (n: Node) => boolean): Promise<Node | null> {
  await band.redraw()
  const find = (node: unknown): Node | null => {
    if (typeof node !== 'object' || node === null) return null
    if (is(node as Node)) return node as Node
    for (const child of Object.values(node)) {
      const found = find(child)
      if (found) return found
    }
    return null
  }
  return find(await band.drawn())
}
const clientOf = async <T,>(band: Band, key: string): Promise<T | null> =>
  ((await nodeIn(band, n => n.type === 'Client' && n.props?.key === key))?.props?.props as T | undefined) ?? null
const martOf = (band: Band) => clientOf<MartProps>(band, 'mart')
// The absolute Box laid over the band that holds the Client keyed `key`.
const holderOf = (band: Band, key: string) =>
  nodeIn(
    band,
    n => n.type === 'Box' && n.props?.position === 'absolute' && JSON.stringify(n).includes(`"key":"${key}"`),
  )

test('Kanto at 80 columns: KANTO at the top left, the wallet at the top right', KIT, async ($, on) => {
  await begin($, on, player())
  await cmd($, 'pokemon', 'party')
  const band = await mountAt($, 80)
  expect(await clientOf<PillProps>(band, 'region')).toEqual({
    rows: [{ text: 'KANTO', dot: KANTO.color }],
    act: 'tickets',
  })
  expect(await clientOf<PillProps>(band, 'shop')).toEqual(walletPill({ balance: 3000, plus: 0 }))
  expect((await holderOf(band, 'region'))?.props).toMatchObject({ top: 0, left: 0 })
  expect((await holderOf(band, 'shop'))?.props).toMatchObject({ top: 0, right: 0 })
  expect((await nodeIn(band, n => n.type === 'Client' && n.props?.key === 'region'))?.props).toMatchObject({
    width: 9,
    height: 1,
  })
})

test('at 26 columns neither pill shows; at 30 the region pill reads KAN', KIT, async ($, on) => {
  await begin($, on, player())
  await cmd($, 'pokemon', 'party')
  const narrow = await mountAt($, 26)
  expect(await clientOf(narrow, 'region')).toBeNull()
  expect(await clientOf(narrow, 'shop')).toBeNull()
  const wider = await mountAt($, 30)
  expect((await clientOf<PillProps>(wider, 'region'))?.rows).toEqual([{ text: 'KAN', dot: KANTO.color }])
  expect(await clientOf(wider, 'shop')).not.toBeNull()
})

test('a click on the region pill opens the Mart on the Tickets tab', KIT, async ($, on) => {
  await begin($, on, player())
  await cmd($, 'pokemon', 'party')
  const band = await mountAt($, 80)
  await band.pointer({ type: 'down', x: 1, y: 0, button: 'left', in: 'region' })
  expect((await martOf(band))?.state).toEqual({ tab: TICKETS_TAB, sel: 0, top: 0, qty: 1 })
})

test('a click on the wallet opens the Mart on its first tab', KIT, async ($, on) => {
  await begin($, on, player())
  await cmd($, 'pokemon', 'party')
  const band = await mountAt($, 80)
  await band.pointer({ type: 'down', x: 3, y: 0, button: 'left', in: 'shop' })
  expect((await martOf(band))?.state).toEqual({ tab: 0, sel: 0, top: 0, qty: 1 })
})

test('a malformed open payload from either pill opens nothing', KIT, async ($, on) => {
  await begin($, on, player())
  await cmd($, 'pokemon', 'party')
  const band = await mountAt($, 80)
  for (const pill of ['region', 'shop'])
    for (const data of [
      { open: 'x' },
      { open: 1 },
      { open: true },
      { open: 'TICKETS' },
      { open: null },
      {},
      null,
      'tickets',
    ])
      await band.post(data, { in: pill })
  expect(await martOf(band)).toBeNull()
})

test(
  'a wild Pokémon out hides both pills, and a pill click as last drawn opens nothing; both come back once it has gone',
  KIT,
  async ($, on) => {
    const w = await begin($, on, player())
    await cmd($, 'pokemon', 'party')
    const band = await mountAt($, 80)
    expect(await clientOf(band, 'region')).not.toBeNull()
    expect(await cmd($, 'pokemon-play', 'wild caterpie')).toMatch(/wanders by/)
    await band.post({ open: 'tickets' }, { in: 'region' })
    await band.post({ open: 'mart' }, { in: 'shop' })
    expect(await martOf(band)).toBeNull()
    expect(await clientOf(band, 'region')).toBeNull()
    expect(await clientOf(band, 'shop')).toBeNull()
    let isBack = false
    for (let i = 0; i < 600 && !isBack; i++) {
      await w.clock.advance(250)
      isBack = (await clientOf(band, 'region')) !== null
    }
    expect(isBack).toBe(true)
    expect(await clientOf(band, 'shop')).not.toBeNull()
  },
)

test("another window's travel to Johto: the band pill and an open Mart's title both read JOHTO", KIT, async ($, on) => {
  const w = await begin($, on, player({ journey: JOHTO_OWNED }))
  await cmd($, 'pokemon', 'party')
  const band = await mountAt($, 80)
  expect((await clientOf<PillProps>(band, 'region'))?.rows).toEqual([{ text: 'KANTO', dot: KANTO.color }])
  w.store.set('save', { ...w.saveNow(), journey: { ...JOHTO_OWNED, current: 'johto' } })
  await w.clock.advance(10_000)
  expect((await clientOf<PillProps>(band, 'region'))?.rows).toEqual([{ text: 'JOHTO', dot: JOHTO.color }])
  await band.pointer({ type: 'down', x: 1, y: 0, button: 'left', in: 'region' })
  expect((await martOf(band))?.region).toEqual({ text: 'JOHTO', color: JOHTO.color })
  w.store.set('save', { ...w.saveNow(), journey: JOHTO_OWNED })
  await w.clock.advance(10_000)
  expect((await martOf(band))?.region).toEqual({ text: 'KANTO', color: KANTO.color })
})
