import type { ClientModule } from 'claude-code'

import type { TextRun } from './sprite'

// The PokéMart, drawn in the band while it's open. The hooks module keeps what is selected (`state`) and does the
// buying; this draws the props it gets and posts `{ act }` for a click or a key.
export type MartItem = {
  id: string
  name: string
  tab: string
  price: number
  color: string
  text: string
  party?: string
}
// `top`: the first list row shown.
export type MartState = { tab: number; sel: number; top: number; qty: number }
export type MartProps = {
  items: MartItem[]
  tabs: string[]
  balance: number
  bag: Record<string, number>
  message: string
  isError: boolean
  columns: number
  rows: number
  state: MartState
  // The selected item's picture, as `textRows` draws it.
  icon?: TextRun[][]
}
export type Act =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'less'
  | 'more'
  | 'max'
  | 'buy'
  | 'close'
  | { tab: number }
  | { pick: number }
  | { wheel: number }
export type MartPost = { buy: { id: string; qty: number } } | { close: true }
// A control: row `y`, columns `x0` to `x1` (exclusive).
export type Hit = { y: number; x0: number; x1: number; act: Act }

export const START: MartState = { tab: 0, sel: 0, top: 0, qty: 1 }
// Keys while the Mart has the focus. Escape never arrives: it gives the focus back to the prompt.
export const KEYS: Record<string, Act> = {
  up: 'up',
  down: 'down',
  left: 'left',
  right: 'right',
  '-': 'less',
  '+': 'more',
  '=': 'more',
  return: 'buy',
  x: 'close',
}
// Bands this tall show the item's picture; shorter ones a ◆.
export const ICON_ROWS = 8
const ICON_COLUMNS = 12

const MAX_BAG = 999
const BLUE = '#3a6ea5'
const PAPER = '#f4f1e6'
const INK = '#222222'
const PICKED = '#ffe28a'
const RED = '#e3350d'
const GREY = '#888888'
const WHITE = '#ffffff'
const NAMES = ['up', 'down', 'left', 'right', 'less', 'more', 'max', 'buy', 'close']

const fmt = (n: number) => n.toLocaleString('en-US')
const width = (text: string) => [...text].length
// Padded to `w`, or cut with … when longer.
const fit = (text: string, w: number) =>
  width(text) > w
    ? [...text].slice(0, Math.max(0, w - 1)).join('') + (w > 0 ? '…' : '')
    : text + ' '.repeat(w - width(text))

export function isAct(a: unknown): a is Act {
  if (typeof a === 'string') return NAMES.includes(a)
  if (typeof a !== 'object' || a === null) return false
  const [key, n] = Object.entries(a)[0] ?? []
  return (
    Object.keys(a).length === 1 &&
    ['tab', 'pick', 'wheel'].includes(key ?? '') &&
    Number.isInteger(n) &&
    (key === 'wheel' || (n as number) >= 0)
  )
}

const inTab = (p: MartProps, s: MartState) => p.items.filter(i => i.tab === p.tabs[s.tab])
const picked = (p: MartProps, s: MartState) => inTab(p, s)[s.sel]
// List rows that fit: the band less the title, the tabs and the ▲ ▼ row.
export const listRows = (p: MartProps) => Math.max(1, p.rows - 3)

// The most one buy can take: what the Bag has room for and the wallet pays for, at least 1.
export function most(p: MartProps, s: MartState): number {
  const item = picked(p, s)
  if (!item) return 1
  return Math.max(1, Math.min(MAX_BAG - (p.bag[item.id] ?? 0), Math.floor(p.balance / item.price)))
}

const room = (p: MartProps, s: MartState) => {
  const item = picked(p, s)
  return Math.max(1, MAX_BAG - (item ? (p.bag[item.id] ?? 0) : 0))
}

// The state after `a`, and what the hooks module is to do: buy, or close.
export function act(p: MartProps, s: MartState, a: Act): { state: MartState; post?: MartPost } {
  const count = inTab(p, s).length
  const select = (sel: number) => {
    const at = Math.max(0, Math.min(count - 1, sel))
    const rows = listRows(p)
    const top = at < s.top ? at : at >= s.top + rows ? at - rows + 1 : s.top
    return { state: { ...s, sel: at, top, qty: at === s.sel ? s.qty : 1 } }
  }
  const tab = (t: number) => ({ state: { tab: (t + p.tabs.length) % p.tabs.length, sel: 0, top: 0, qty: 1 } })
  if (typeof a === 'object') {
    if ('tab' in a) return tab(a.tab)
    if ('pick' in a) return select(a.pick)
    // A wheel tick is a row; a page at most a screenful.
    return select(s.sel + Math.max(-listRows(p), Math.min(listRows(p), a.wheel)))
  }
  if (a === 'up' || a === 'down') return select(s.sel + (a === 'up' ? -1 : 1))
  if (a === 'left' || a === 'right') return tab(s.tab + (a === 'left' ? -1 : 1))
  if (a === 'less') return { state: { ...s, qty: Math.max(1, s.qty - 1) } }
  if (a === 'more') return { state: { ...s, qty: Math.min(room(p, s), s.qty + 1) } }
  if (a === 'max') return { state: { ...s, qty: most(p, s) } }
  if (a === 'close') return { state: s, post: { close: true } }
  const item = picked(p, s)
  return item ? { state: { ...s, qty: 1 }, post: { buy: { id: item.id, qty: s.qty } } } : { state: s }
}

// Words of `text` in lines at most `w` wide.
function wrap(text: string, w: number): string[] {
  const out: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && width(line) + 1 + width(word) > w) {
      out.push(line)
      line = word
    } else line = line ? `${line} ${word}` : word
  }
  if (line) out.push(line)
  return out
}

// The Mart as coloured text, a row per band row, each exactly `columns` wide, and where its controls are.
export function martRows(p: MartProps, s: MartState = p.state): { lines: TextRun[][]; hits: Hit[] } {
  const hits: Hit[] = []
  const lines: TextRun[][] = []
  // One row: `put` adds a run, cut at the band's edge, and a control where it lands whole; `pad` fills to a column.
  const row = (y: number) => {
    const runs: TextRun[] = []
    let x = 0
    const put = (text: string, fg: string, bg: string, a?: Act) => {
      const room = p.columns - x
      if (!text || room <= 0) return
      const shown = width(text) > room ? [...text].slice(0, room).join('') : text
      if (a && shown === text) hits.push({ y, x0: x, x1: x + width(text), act: a })
      runs.push([shown, fg, bg])
      x += width(shown)
    }
    const pad = (to: number, bg: string) => put(' '.repeat(Math.max(0, to - x)), INK, bg)
    return { runs, put, pad, at: () => x }
  }

  // Title: the name, the last message, the wallet and ✕.
  const title = row(0)
  const wallet = ` ₽ ${fmt(p.balance)} `
  title.put(' POKé MART ', WHITE, BLUE)
  title.put(
    fit(` ${p.message}`, Math.max(0, p.columns - width(' POKé MART ') - width(wallet) - 2)),
    p.isError ? '#ffd0c8' : '#d8ffd8',
    BLUE,
  )
  title.put(wallet, WHITE, BLUE)
  title.put('✕', WHITE, BLUE, 'close')
  title.put(' ', WHITE, BLUE)
  lines.push(title.runs)

  // Tabs, each with how many it sells.
  const tabs = row(1)
  tabs.put(' ', BLUE, PAPER)
  p.tabs.forEach((name, t) => {
    const label = ` ${name} ${p.items.filter(i => i.tab === name).length} `
    tabs.put(label, t === s.tab ? WHITE : BLUE, t === s.tab ? BLUE : PAPER, { tab: t })
  })
  tabs.pad(p.columns, PAPER)
  lines.push(tabs.runs)

  const items = inTab(p, s)
  const item = items[s.sel]
  const left = Math.floor(p.columns * 0.44)
  const body = p.rows - 2
  const list = listRows(p)
  // The details column: the picture (tall bands) or a ◆, then name, description, party line; actions last.
  const icon = p.rows >= ICON_ROWS && p.icon ? p.icon : null
  const textWidth = Math.max(1, p.columns - left - 1 - (icon ? ICON_COLUMNS + 2 : 0) - 2)
  const have = item ? (p.bag[item.id] ?? 0) : 0
  const party = item?.party ? fit(`Your party: ${item.party}`, textWidth) : null
  const textRows = Math.max(1, Math.min(3, body - 2 - (party ? 1 : 0)))
  const details: TextRun[][] = item
    ? [
        icon
          ? [[`  ${fit(`${item.name} · in bag: ${have}`, textWidth)}`, INK, PAPER]]
          : [
              [' ◆ ', item.color, PAPER],
              [fit(`${item.name} · in bag: ${have}`, textWidth - 1), INK, PAPER],
            ],
        ...wrap(item.text, textWidth)
          .slice(0, textRows)
          .map((l): TextRun[] => [[`  ${fit(l, textWidth)}`, INK, PAPER]]),
        ...(party ? [[[`  ${party}`, BLUE, PAPER]] as TextRun[]] : []),
      ]
    : []

  for (let i = 0; i < body; i++) {
    const r = row(2 + i)
    const isLast = i === body - 1
    if (!isLast) {
      // A list row: ▶ on the selection, how many you have, the price on the right.
      const at = s.top + i
      const it = i < list ? items[at] : undefined
      if (it) {
        const bg = at === s.sel ? PICKED : PAPER
        const price = `₽${fmt(it.price)} `
        const owned = p.bag[it.id] ? ` ×${p.bag[it.id]}` : ''
        r.put(fit(`${at === s.sel ? '▶' : ' '} ${it.name}${owned}`, left - width(price)), INK, bg, { pick: at })
        r.put(price, INK, bg)
      } else r.pad(left, PAPER)
    } else {
      // The ▲ ▼ row under the list.
      const below = Math.max(0, items.length - s.top - list)
      if (s.top) r.put(`▲ ${s.top} above`, GREY, PAPER, 'up')
      const more = below ? `▼ ${below} more ` : ''
      r.pad(left - width(more), PAPER)
      if (more) r.put(more, GREY, PAPER, 'down')
    }
    r.put('│', BLUE, PAPER)
    if (icon) {
      r.put(' ', INK, PAPER)
      for (const [t, fg, bg] of icon[i] ?? []) r.put(t, fg || PAPER, bg || PAPER)
      r.pad(left + 2 + ICON_COLUMNS, PAPER)
    }
    if (isLast && item) {
      r.put('  ', INK, PAPER)
      r.put('◀', BLUE, PAPER, 'less')
      r.put(` ×${s.qty} `, INK, PAPER)
      r.put('▶', BLUE, PAPER, 'more')
      r.put(' ', INK, PAPER)
      r.put('Max', BLUE, PAPER, 'max')
      r.put('  ', INK, PAPER)
      const canBuy = p.balance >= item.price * s.qty && have + s.qty <= MAX_BAG
      r.put(`Buy ₽${fmt(item.price * s.qty)}`, WHITE, canBuy ? RED : GREY, 'buy')
    } else for (const [t, fg, bg] of details[i] ?? []) r.put(t, fg, bg)
    r.pad(p.columns, PAPER)
    lines.push(r.runs)
  }
  return { lines, hits }
}

const Mart: ClientModule<MartProps> = (p, s) => {
  // Set on every draw, so a click is judged on the props drawn now.
  s.onPointer(e => {
    if (e.type !== 'down' || e.button !== 'left') return
    const hit = martRows(p).hits.find(h => h.y === e.y && e.x >= h.x0 && e.x < h.x1)
    if (hit) s.post({ act: hit.act })
  })
  s.onKey(e => {
    const a = KEYS[e.key]
    if (a) s.post({ act: a })
  })
  const { Box, Text } = s.elements
  return (
    <Box flexDirection="column">
      {martRows(p).lines.map((runs, y) => (
        <Text key={`r${y}`}>
          {runs.map(([text, fg, bg], i) => (
            <Text key={`c${i}`} color={fg || undefined} backgroundColor={bg || undefined}>
              {text}
            </Text>
          ))}
        </Text>
      ))}
    </Box>
  )
}

export default Mart
