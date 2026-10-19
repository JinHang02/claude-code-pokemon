import { expect, test } from 'claude-code/testing'

import { act, ICON_ROWS, isAct, KEYS, listRows, martRows, most, START, typedBy } from '../hooks/mart'
import type { Act, MartProps, MartState } from '../hooks/mart'
import { BAG, ICONS } from '../hooks/item-icons'
import { forSale, ITEMS, TABS } from '../hooks/items'
import { shopRows, shopSize, walletLabel } from '../hooks/shop'
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

test('every item has a picture of at most 14×14 pixels', () => {
  for (const { id } of ITEMS) {
    const icon = ICONS[id]
    expect(icon).toBeDefined()
    expect(icon!.width).toBeLessThanOrEqual(14)
    expect(icon!.height).toBeLessThanOrEqual(14)
    expect(icon!.pixels).toHaveLength(icon!.width * icon!.height)
    for (const px of icon!.pixels)
      expect(px === CLEAR || (Number.isInteger(px) && px >= 0 && px <= 0xffffff)).toBe(true)
  }
})

// Items no sprite set draws, shown as the plain Bag: none today.
const BAGGED: string[] = []

test("every item's picture is its own sprite, not the plain Bag", () => {
  const bagged = ITEMS.filter(({ id }) => JSON.stringify(ICONS[id]) === JSON.stringify(BAG)).map(i => i.id)
  expect(bagged).toEqual(BAGGED)
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

test("a band of 9 rows or more shows the item's picture left of the details; a shorter one the ◆", () => {
  const icon = textRows(ICONS['fire-stone']!)
  expect(icon).toHaveLength(7)
  const drawn = martRows(props({ rows: ICON_ROWS, icon }), START).lines
  expect(drawn).toHaveLength(9)
  for (const line of drawn) expect([...text(line)].length).toBe(80)
  // The picture's own colours, in the 14 columns after `│ `, on every row under the tabs.
  const pictured = drawn.slice(2).map(runs => text(runs).slice(left + 2, left + 16))
  expect(pictured.filter(row => /[▀▄]/.test(row))).toHaveLength(7)
  expect(text(drawn[2]!).slice(left + 16)).toMatch(/^ {2}Fire Stone · in bag: 0/)
  expect(text(drawn[8]!).slice(left + 16)).toMatch(/^ {2}◀ ×1 ▶ Max {2}Buy ₽3,000/)
  expect(lines(props({ rows: ICON_ROWS - 1, icon }))[2]).toContain('◆ Fire Stone')
  // A shorter picture fits a shorter band.
  const flat = textRows(ICONS['dragon-scale']!)
  expect(flat.length).toBeLessThanOrEqual(6)
  expect(lines(props({ rows: ICON_ROWS - 1, icon: flat }))[2]).not.toContain('◆')
})

test('a band too narrow for the picture and the actions side by side shows the ◆, and Buy whole', () => {
  const icon = textRows(ICONS['fire-stone']!)
  const p = props({ rows: ICON_ROWS, columns: 60, icon })
  const drawn = lines(p)
  for (const line of drawn) expect([...line].length).toBe(60)
  expect(drawn[2]).toContain('◆ Fire Stone')
  expect(drawn.join('\n')).not.toMatch(/[▀▄]/)
  expect(drawn[8]).toContain('Buy ₽3,000')
  expect(hitAt(p, p.state, 'buy')).toBeDefined()
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

test('a description that runs past its lines ends the last one with …, inside the column', () => {
  // As in the band at 100 columns less Claude Code's [-]: "It is the blue of a pool of clear" with no mark.
  const water = { ...START, sel: 1 }
  const at96 = Math.floor(96 * 0.44)
  const cut = lines(props({ columns: 96, rows: 11, icon: textRows(ICONS['water-stone']!), state: water }))
  for (const line of cut) expect([...line].length).toBe(96)
  expect(cut.slice(3, 6).map(l => l.slice(at96 + 16).trim())).toEqual([
    'A peculiar stone that can make',
    'certain species of Pokémon evolve.',
    'It is the blue of a pool of clear…',
  ])
  // One that fits has no mark.
  const whole = lines(props({ columns: 100, rows: 11, icon: textRows(ICONS['water-stone']!), state: water }))
  expect(whole[5]?.slice(Math.floor(100 * 0.44) + 16).trim()).toBe('is the blue of a pool of clear water.')
  // A last line already as wide as the column gives up its last letter for the mark.
  const full = 80 - left - 3
  const words = ['a', 'b', 'c', 'd'].map(c => c.repeat(full))
  const long = props({ items: props().items.map((i, n) => (n === 0 ? { ...i, text: words.join(' ') } : i)) })
  expect(lines(long)[5]?.slice(left + 1)).toBe(`  ${'c'.repeat(full - 1)}…`)
  // Every item at every width: the whole description, or its start and a … that stays in the band.
  for (const columns of [60, 72, 80, 96, 100]) {
    const at = Math.floor(columns * 0.44)
    TABS.forEach((tab, t) =>
      props()
        .items.filter(i => i.tab === tab)
        .forEach((item, sel) => {
          const drawn = lines(props({ columns, state: { ...START, tab: t, sel } }))
          for (const line of drawn) expect([...line].length).toBe(columns)
          const said = drawn
            .slice(3, 6)
            .map(l => l.slice(at + 1).trim())
            .filter(Boolean)
            .join(' ')
          if (said.endsWith('…')) expect(item.text.startsWith(said.slice(0, -1))).toBe(true)
          else expect(said).toBe(item.text)
        }),
    )
  }
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

test('scrolling: the list follows the selection, the edges say what is past them', () => {
  const p = props()
  expect(listRows(p)).toBe(4)
  const s = after(p, 'down', 'down', 'down', 'down')
  expect(s).toEqual({ tab: 0, sel: 4, top: 1, qty: 1 })
  expect(lines(p, s)[6]).toMatch(/^▲ 1 above +▼ 5 more │/)
  expect(after(p, 'up')).toEqual(START)
  expect(after(p, ...Array<Act>(20).fill('down')).sel).toBe(9)
  // ▲ and ▼ scroll as ↑ and ↓ do.
  expect(hitAt(p, s, 'up')).toMatchObject({ y: 6, act: 'up' })
  expect(hitAt(p, s, 'down')).toMatchObject({ y: 6, act: 'down' })
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

test('Max with not even one affordable says how much more is needed, and stays at ×1', () => {
  const poor = props({ balance: 1200 })
  expect(act(poor, after(poor, 'more', 'more'), 'max')).toEqual({
    state: START,
    refusal: 'Not enough ₽ for one Fire Stone: 1,800 more to go.',
  })
  expect(act(poor, after(poor, 'right'), 'max').refusal).toBe('Not enough ₽ for one Metal Coat: 3,800 more to go.')
  // One is affordable: no refusal.
  expect(act(props({ balance: 3000 }), START, 'max')).toEqual({ state: START })
  expect(act(props(), START, 'max')).toEqual({ state: { ...START, qty: 4 } })
})

test('acting: Buy and ✕ say what to do; every control is a hit at its place; only real acts are acts', () => {
  const p = props()
  const s = after(p, 'more')
  // The quantity stays until the hooks module says the buy went through.
  expect(act(p, s, 'buy')).toEqual({ state: s, post: { buy: { id: 'fire-stone', qty: 2 } } })
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
    return: 'enter',
    x: 'close',
  })
  // Enter buys as the button does; the hooks module decides when it asks first.
  expect(act(p, s, 'enter')).toEqual(act(p, s, 'buy'))
  for (const good of ['buy', 'enter', 'close', { tab: 1 }, { pick: 0 }]) expect(isAct(good)).toBe(true)
  for (const bad of ['teleport', { pick: -1 }, { pick: 1.5 }, { tab: '2' }, { wheel: 1 }, { buy: 'x' }, null, 7])
    expect(isAct(bad)).toBe(false)
})

test('typing: a character, a space or a run of them is typed; special keys and chords are not', () => {
  expect(typedBy({ key: '/' })).toBe('/')
  expect(typedBy({ key: 'P' })).toBe('P')
  expect(typedBy({ key: 'é' })).toBe('é')
  expect(typedBy({ key: 'space' })).toBe(' ')
  expect(typedBy({ key: '/pokemon bag' })).toBe('/pokemon bag')
  expect(typedBy({ key: '/pokemon bag\r' })).toBe('/pokemon bag')
  for (const key of ['up', 'return', 'tab', 'backspace', 'delete', 'pageup', 'home', 'end', 'f5', '\r'])
    expect(typedBy({ key })).toBeNull()
  expect(typedBy({ key: 'a', ctrl: true })).toBeNull()
  expect(typedBy({ key: 'v', meta: true })).toBeNull()
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

test('the button fits its 13 columns: the full wallet up to ₽99,999, a short one past it', () => {
  // 🛒 takes two columns.
  const columns = (label: string) => [...label].length + 1
  expect(walletLabel(99_999)).toBe(' 🛒 ₽ 99,999 ')
  expect(walletLabel(100_000)).toBe(' 🛒 ₽ 100k ')
  expect(walletLabel(1_234_567)).toBe(' 🛒 ₽ 1.2M ')
  for (const n of [0, 99_999, 100_000, 999_999, 1_000_000, 999_999_999, 123_456_789_012])
    expect(columns(walletLabel(n))).toBeLessThanOrEqual(13)
})

test('the button is just its pill: the wallet, and +₽ right-aligned under it while it shows', () => {
  expect(shopRows({ balance: 3020, plus: 0 })).toEqual([' 🛒 ₽ 3,020 '])
  expect(shopSize({ balance: 3020, plus: 0 })).toEqual({ columns: 12, rows: 1 })
  // 🛒 takes two columns: both rows are the wallet's 12 wide.
  expect(shopRows({ balance: 3020, plus: 20 })).toEqual([' 🛒 ₽ 3,020 ', '       +₽20 '])
  expect(shopSize({ balance: 3020, plus: 20 })).toEqual({ columns: 12, rows: 2 })
  // Never past the 13 columns kept clear for it.
  expect(shopSize({ balance: 99_999, plus: 99_999 }).columns).toBe(13)
})
