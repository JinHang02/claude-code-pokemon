import { expect, test } from 'claude-code/testing'

import { act, ICON_ROWS, isAct, KEYS, listRows, martRows, most, START } from '../hooks/mart'
import type { Act, MartProps, MartState } from '../hooks/mart'
import { ICONS } from '../hooks/item-icons'
import { forSale, ITEMS, TABS } from '../hooks/items'
import { CLEAR, textRows } from '../hooks/sprite'

const props = (extra: Partial<MartProps> = {}): MartProps => ({
  items: forSale().map(({ id, name, tab, price, color, text }) => ({ id, name, tab, price, color, text })),
  tabs: TABS,
  balance: 12400,
  bag: {},
  message: '',
  isError: false,
  columns: 80,
  rows: 7,
  state: START,
  ...extra,
})
const text = (runs: [string, string, string][]) => runs.map(r => r[0]).join('')
const lines = (p: MartProps, s: MartState = p.state) => martRows(p, s).lines.map(text)
const hitAt = (p: MartProps, s: MartState, a: unknown) =>
  martRows(p, s).hits.find(h => JSON.stringify(h.act) === JSON.stringify(a))
// The state after acting on `acts` one after another.
const after = (p: MartProps, ...acts: Act[]) => acts.reduce<MartState>((s, a) => act(p, s, a).state, START)
const left = Math.floor(80 * 0.44)

test('every item has a picture of at most 12×12 pixels', () => {
  for (const { id } of ITEMS) {
    const icon = ICONS[id]
    expect(icon).toBeDefined()
    expect(icon!.width).toBeLessThanOrEqual(12)
    expect(icon!.height).toBeLessThanOrEqual(12)
    expect(icon!.pixels).toHaveLength(icon!.width * icon!.height)
    for (const px of icon!.pixels)
      expect(px === CLEAR || (Number.isInteger(px) && px >= 0 && px <= 0xffffff)).toBe(true)
  }
})

test('every line is exactly the band wide, one per row; title, tabs, list, details, actions', () => {
  const p = props()
  const drawn = lines(p)
  expect(drawn).toHaveLength(7)
  for (const line of drawn) expect([...line].length).toBe(80)
  expect(drawn[0]).toMatch(/^ POKé MART .* ₽ 12,400 ✕ $/)
  for (const tab of [' Stones 10 ', ' Hold items 18 ', ' Special 11 ', ' Other 3 ']) expect(drawn[1]).toContain(tab)
  // The list: 44% of the width, the price on the right; the details beside it.
  expect(drawn[2]?.slice(0, left)).toMatch(/^▶ Fire Stone +₽3,000 $/)
  expect(drawn[3]?.slice(0, left)).toMatch(/^  Water Stone +₽3,000 $/)
  expect(drawn[2]?.slice(left)).toMatch(/^│ ◆ Fire Stone · in bag: 0 +$/)
  expect(drawn[3]?.slice(left + 1)).toMatch(/^ {2}A peculiar stone/)
  expect(drawn[6]?.slice(0, left)).toMatch(/^ +▼ 6 more $/)
  expect(drawn[6]?.slice(left)).toMatch(/^│ {2}◀ ×1 ▶ Max {2}Buy ₽3,000 +$/)
})

test("a band of 8 rows or more shows the item's picture left of the details; a shorter one the ◆", () => {
  const icon = textRows(ICONS['fire-stone']!)
  const tall = props({ rows: ICON_ROWS + 1, icon })
  const drawn = martRows(tall, START).lines
  expect(drawn).toHaveLength(9)
  for (const line of drawn) expect([...text(line)].length).toBe(80)
  // The picture's own colours, in the 12 columns after `│ `.
  const pictured = drawn.slice(2, 2 + icon.length).map(runs => text(runs).slice(left + 2, left + 14))
  expect(pictured.some(row => /[▀▄]/.test(row))).toBe(true)
  expect(text(drawn[2]!).slice(left + 14)).toMatch(/^ {2}Fire Stone · in bag: 0/)
  expect(text(drawn[8]!).slice(left + 14)).toMatch(/^ {2}◀ ×1 ▶ Max {2}Buy ₽3,000/)
  expect(lines(props({ rows: ICON_ROWS - 1, icon }))[2]).toContain('◆ Fire Stone')
})

test('the description wraps to at most 3 lines, and a party line shows when an item would evolve one', () => {
  const p = props({
    rows: 9,
    items: props().items.map(i => (i.id === 'fire-stone' ? { ...i, party: 'Eevee → Flareon' } : i)),
  })
  const drawn = lines(p).map(l => l.slice(left + 2).trim())
  expect(drawn.slice(3, 7).filter(l => l && !l.startsWith('Your party')).length).toBeLessThanOrEqual(3)
  expect(drawn).toContain('Your party: Eevee → Flareon')
  expect(lines(props()).join('\n')).not.toContain('Your party')
})

test('the selected tab is drawn in blue; the bag count and the message show', () => {
  const s = after(props(), 'right')
  const runs = martRows(props(), s).lines[1] ?? []
  expect(runs.find(r => r[0].includes('Hold items'))?.[2]).toBe('#3a6ea5')
  expect(runs.find(r => r[0].includes('Stones'))?.[2]).not.toBe('#3a6ea5')
  expect(lines(props(), s)[2]).toContain('▶ Metal Coat')
  const owned = lines(props({ bag: { 'fire-stone': 2 }, message: 'Bought 2 × Fire Stone!' }))
  expect(owned[0]).toContain('Bought 2 × Fire Stone!')
  expect(owned[2]).toContain('▶ Fire Stone ×2')
  expect(owned[2]).toContain('in bag: 2')
})

test('scrolling: the list follows the selection, the edges say what is past them, the wheel moves it too', () => {
  const p = props()
  expect(listRows(p)).toBe(4)
  const s = after(p, 'down', 'down', 'down', 'down')
  expect(s).toEqual({ tab: 0, sel: 4, top: 1, qty: 1 })
  expect(lines(p, s)[6]).toMatch(/^▲ 1 above +▼ 5 more │/)
  expect(after(p, 'up')).toEqual(START)
  expect(after(p, ...Array<Act>(20).fill('down')).sel).toBe(9)
  // ▲ and ▼ scroll as ↑ and ↓ do; a wheel tick is one row, a page at most a screenful, never past the ends.
  expect(hitAt(p, s, 'up')?.y).toBe(6)
  expect(hitAt(p, s, 'down')?.y).toBe(6)
  expect(after(p, { wheel: 1 }, { wheel: 1 })).toEqual(after(p, 'down', 'down'))
  expect(after(p, { wheel: 50 }).sel).toBe(4)
  expect(after(p, { wheel: -3 })).toEqual(START)
})

test('quantity: 1 at least, the room in the Bag at most; Max is what the wallet buys; a new pick starts at 1', () => {
  const p = props()
  expect(after(p, 'less').qty).toBe(1)
  expect(after(p, 'more', 'more').qty).toBe(3)
  expect(most(p, START)).toBe(4)
  expect(after(p, 'max').qty).toBe(4)
  expect(most(props({ bag: { 'fire-stone': 997 } }), START)).toBe(2)
  expect(after(props({ bag: { 'fire-stone': 998 } }), 'more', 'more').qty).toBe(1)
  expect(most(props({ balance: 0 }), START)).toBe(1)
  expect(after(p, 'more', 'down').qty).toBe(1)
  expect(after(p, 'more', 'right')).toEqual({ tab: 1, sel: 0, top: 0, qty: 1 })
  expect(after(p, 'left').tab).toBe(3)
})

test('acting: Buy and ✕ say what to do; every control is a hit at its place; only real acts are acts', () => {
  const p = props()
  const s = after(p, 'more')
  expect(act(p, s, 'buy')).toEqual({ state: { ...s, qty: 1 }, post: { buy: { id: 'fire-stone', qty: 2 } } })
  expect(act(p, s, 'close').post).toEqual({ close: true })
  expect(act(p, s, { pick: 3 }).state).toEqual({ tab: 0, sel: 3, top: 0, qty: 1 })
  expect(act(p, s, { pick: 99 }).state.sel).toBe(9)
  expect(act(p, s, { tab: 2 }).state).toEqual({ tab: 2, sel: 0, top: 0, qty: 1 })
  const drawn = lines(p, s)
  const at = (a: unknown) => {
    const h = hitAt(p, s, a)
    return h ? (drawn[h.y] ?? '').slice(h.x0, h.x1) : null
  }
  expect(at('close')).toBe('✕')
  expect(at({ tab: 2 })).toContain('Special 11')
  expect(at({ pick: 1 })).toContain('Water Stone')
  expect(at('less')).toBe('◀')
  expect(at('more')).toBe('▶')
  expect(at('max')).toBe('Max')
  expect(at('buy')).toBe('Buy ₽6,000')
  expect(KEYS).toEqual({
    up: 'up',
    down: 'down',
    left: 'left',
    right: 'right',
    '-': 'less',
    '+': 'more',
    '=': 'more',
    return: 'buy',
    x: 'close',
  })
  for (const good of ['buy', 'close', { tab: 1 }, { pick: 0 }, { wheel: -2 }]) expect(isAct(good)).toBe(true)
  for (const bad of ['teleport', { pick: -1 }, { pick: 1.5 }, { tab: '2' }, { wheel: 0.5 }, { buy: 'x' }, null, 7])
    expect(isAct(bad)).toBe(false)
})

test('a short band (small sprites) still fits: fewer list rows, the actions on the last row', () => {
  const p = props({ rows: 6, columns: 60 })
  const drawn = lines(p)
  expect(drawn).toHaveLength(6)
  for (const line of drawn) expect([...line].length).toBe(60)
  expect(listRows(p)).toBe(3)
  expect(drawn[5]).toContain('Buy ₽3,000')
  // Too narrow for every control: cut at the edge, never wider than the band.
  for (const line of lines(props({ columns: 40 }))) expect([...line].length).toBe(40)
})
