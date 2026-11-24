// The band dialogs: Dialog, DialogAct, DialogPost, DialogHit, DialogProps, StarterCard, DialogData; STARTER_ROWS,
// STARTER_MIN_ROWS, WIPED; isDialogAct, dialogAct (the reducer), dialogView (the lines and hits), wipeWarning and
// starterPicture.
import type { TravelRegion, RegionId } from './travel-regions'
import { CLEAR, resample, textRows } from './sprite'
import type { Pixels, TextRun } from './sprite'

export type Dialog =
  | { kind: 'starter'; region: RegionId; sel: 0 | 1 | 2; isAsking: boolean }
  | { kind: 'fresh'; isConfirming: boolean; isRestart: boolean; sel?: 0 | 1 }
export type DialogAct = 'left' | 'right' | 'enter' | 'yes' | 'no' | 'close' | { pick: number } | { hover: number }
export type DialogPost = { choose: string } | { keep: true } | { fresh: true }
// A control: row `y`, columns `x0` to `x1` (exclusive).
export type DialogHit = { y: number; x0: number; x1: number; act: DialogAct }
export type DialogProps = { lines: TextRun[][]; hits: DialogHit[] }
// `types` as in SPECIES (lower case); `sprite` absent while or when it can't be downloaded.
export type StarterCard = { species: string; name: string; types: string[]; sprite?: Pixels }
// `columns` and `rows`: the band's size in cells. `summary`: the pre-feature save, for the fresh-or-keep screen.
export type DialogData = {
  columns: number
  rows: number
  region: TravelRegion
  cards: StarterCard[]
  summary?: { owned: number; seen: number; balance: number }
}

export const STARTER_ROWS = 14
export const STARTER_MIN_ROWS = 8

const NAMES: readonly string[] = ['left', 'right', 'enter', 'yes', 'no', 'close']
const PAPER = '#f4f1e6'
const INK = '#222222'
const BLUE = '#3a6ea5'
const GREY = '#888888'
const WHITE = '#ffffff'
const BUTTON = '#d8d4c8'
const RED = '#b3261e'
const PINK = '#ffd0c8'

const SKY = 0x9ad0f5
const GRASS = 0x5cb85c
const BLADE = 0x3f8f3f
const BALL_RED = 0xe3350d
const BALL_WHITE = 0xf4f4f4
const BALL_LINE = 0x222222
const GLOW = 0xfff27a
const ARROW = 0x20232f
const PANEL = 0xf8f8f0
const PANEL_EDGE = 0x3a4a78

const BALL = ['.RRRR.', 'RRRRRR', 'KKWWKK', 'WWWWWW', 'WWWWWW', '.WWWW.']
const BALL_SIZE = 6
const ARROW_ROWS = ['.XXXX.', '..XX..']
const ARROW_CELL_ROWS = 1
const BALL_CELL_ROWS = 4
const BALL_ZONE_ROWS = ARROW_CELL_ROWS + BALL_CELL_ROWS
const SPRITE_COLUMN = 3

const CHOOSE_HINT = 'click, or /pokemon choose <name>'
const KEEP_HINT = 'click, or /pokemon keep or fresh'
const ANSWER_HINT = 'y Yes · n No'

const width = (text: string) => [...text].length
const fmt = (n: number) => n.toLocaleString('en-US')
const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1)

// ── Posted data ──

export function isDialogAct(a: unknown): a is DialogAct {
  if (typeof a === 'string') return NAMES.includes(a)
  if (typeof a !== 'object' || a === null || Array.isArray(a)) return false
  const entries = Object.entries(a)
  const [key, n] = entries[0] ?? []
  return entries.length === 1 && (key === 'pick' || key === 'hover') && Number.isInteger(n) && (n as number) >= 0
}

// ── Reducer ──

const isBall = (n: number): n is 0 | 1 | 2 => n === 0 || n === 1 || n === 2
const isOption = (n: number): n is 0 | 1 => n === 0 || n === 1

/**
 * The dialog after `a`, and what the hooks module is to do.
 * @param starters the region's starter species, in ball order.
 * @returns `dialog: null` to close; `post` only on a choice. Close never posts.
 */
export function dialogAct(
  d: Dialog,
  a: DialogAct,
  starters: readonly string[],
): { dialog: Dialog | null; post?: DialogPost } {
  if (a === 'close') return { dialog: null }
  const same = { dialog: d }
  const sel = d.kind === 'starter' ? d.sel : (d.sel ?? 0)
  if (typeof a === 'object' && 'hover' in a && a.hover === sel) return same
  if (d.kind === 'starter') {
    if (d.isAsking) {
      if (a === 'no') return { dialog: { ...d, isAsking: false } }
      const species = starters[d.sel]
      return a === 'yes' && species ? { dialog: d, post: { choose: species } } : same
    }
    if (a === 'left' || a === 'right') {
      const sel = Math.max(0, Math.min(2, d.sel + (a === 'left' ? -1 : 1)))
      return isBall(sel) ? { dialog: { ...d, sel } } : same
    }
    if (a === 'enter') return { dialog: { ...d, isAsking: true } }
    if (typeof a === 'object' && 'hover' in a) return isBall(a.hover) ? { dialog: { ...d, sel: a.hover } } : same
    if (typeof a === 'object' && 'pick' in a)
      return isBall(a.pick) ? { dialog: { ...d, sel: a.pick, isAsking: true } } : same
    return same
  }
  if (d.isConfirming) {
    if (a === 'yes') return { dialog: d, post: { fresh: true } }
    if (a === 'no') return { dialog: d.isRestart ? null : { kind: 'fresh', isConfirming: false, isRestart: false } }
    return same
  }
  const take = (option: 0 | 1): { dialog: Dialog; post?: DialogPost } =>
    option === 0
      ? { dialog: { kind: 'fresh', isConfirming: true, isRestart: d.isRestart } }
      : { dialog: d, post: { keep: true } }
  if (a === 'left' || a === 'right') return { dialog: { ...d, sel: a === 'left' ? 0 : 1 } }
  if (a === 'enter') return take(d.sel ?? 0)
  if (typeof a === 'object' && 'hover' in a) return isOption(a.hover) ? { dialog: { ...d, sel: a.hover } } : same
  if (typeof a === 'object' && 'pick' in a) return isOption(a.pick) ? take(a.pick) : same
  return same
}

// ── Lines ──

// A piece of a line; with `act`, a control.
type Seg = { text: string; fg: string; bg: string; act?: DialogAct }
type Line = Seg[]
const lineWidth = (line: Line): number => line.reduce((n, seg) => n + width(seg.text), 0)

/**
 * `lines` as exactly `rows` lines of exactly `columns` cells, cut at the edge and padded with `fill`.
 * @param extra controls that aren't text (the balls), kept when inside the band.
 */
function render(lines: Line[], columns: number, rows: number, fill: string, extra: DialogHit[] = []): DialogProps {
  const hits: DialogHit[] = extra.filter(h => h.y < rows && h.x1 <= columns)
  const out: TextRun[][] = []
  for (let y = 0; y < rows; y++) {
    const runs: TextRun[] = []
    let x = 0
    for (const { text, fg, bg, act } of lines[y] ?? []) {
      const room = columns - x
      if (!text || room <= 0) continue
      const drawn = width(text) > room ? [...text].slice(0, room).join('') : text
      if (act && drawn === text) hits.push({ y, x0: x, x1: x + width(text), act })
      runs.push([drawn, fg, bg])
      x += width(drawn)
    }
    if (x < columns) runs.push([' '.repeat(columns - x), INK, fill])
    out.push(runs)
  }
  return { lines: out, hits }
}

// Words of `text` in lines at most `w` wide; a word longer than `w` is cut.
function wrap(text: string, w: number): string[] {
  const out: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const piece = width(word) > w ? [...word].slice(0, Math.max(1, w)).join('') : word
    if (line && width(line) + 1 + width(piece) > w) {
      out.push(line)
      line = piece
    } else line = line ? `${line} ${piece}` : piece
  }
  if (line) out.push(line)
  return out
}

// `full` cut to `n` lines, the last ending in … when some were left out.
const cutTo = (full: string[], n: number): string[] =>
  full.length <= n ? full : full.slice(0, n).map((l, i) => (i === n - 1 ? `${l}…` : l))

// Lines shown together: `first`, then `rest` as rows allow; `isPinned`: on the last rows.
type Block = { first: Line; rest: Line[]; isPinned?: true }

/**
 * Blocks stacked top to bottom in `rows`, a pinned block on the last row.
 * @param order block indexes in first-line priority order.
 */
function stack(blocks: Block[], order: number[], rows: number): Line[] {
  const counts = blocks.map(() => 0)
  let left = rows
  for (const i of order)
    if (left > 0) {
      counts[i] = 1
      left--
    }
  for (let grew = true; grew && left > 0;) {
    grew = false
    blocks.forEach((b, i) => {
      if (left > 0 && (counts[i] ?? 0) > 0 && !b.isPinned && (counts[i] ?? 0) <= b.rest.length) {
        counts[i] = (counts[i] ?? 0) + 1
        left--
        grew = true
      }
    })
  }
  const shown = (b: Block, i: number) => [b.first, ...b.rest].slice(0, counts[i] ?? 0)
  const body = blocks.flatMap((b, i) => (b.isPinned ? [] : shown(b, i)))
  const pinned = blocks.flatMap((b, i) => (b.isPinned ? shown(b, i) : []))
  const gap = Math.max(0, rows - body.length - pinned.length)
  return [...body, ...Array.from({ length: gap }, (): Line => []), ...pinned]
}

// A paragraph as a block: its wrapped lines, the last of those shown ending in … when it is cut.
function paragraph(text: string, columns: number, fg: string, bg: string, rows: number): Block {
  const full = wrap(text, Math.max(1, columns - 2))
  const lines = cutTo(full, Math.max(1, rows)).map((l): Line => [{ text: ` ${l}`, fg, bg }])
  return { first: lines[0] ?? [], rest: lines.slice(1) }
}

// ── Starter screen ──

const cardAt = (data: DialogData, n: number): StarterCard => {
  const species = data.region.starters[n] ?? ''
  const card = data.cards[n] ?? { species, name: capital(species), types: [] }
  return { ...card, name: card.name.normalize('NFC') }
}
const typesOf = (card: StarterCard) => card.types.map(capital).join('/')
const regionLine = (r: TravelRegion) => `${r.name} · choose your partner`

// The panel's sprite: fitted to the panel's height and a third of the band's width; null with no sprite.
function panelSprite(card: StarterCard | undefined, panelRows: number, columns: number): Pixels | null {
  const img = card?.sprite
  if (!img || panelRows <= 0 || img.width <= 0 || img.height <= 0) return null
  return resample(img, Math.min(1, (panelRows * 2) / img.height, Math.max(1, Math.floor(columns / 3)) / img.width))
}

// Left column of ball `n` (0 to 2).
const ballLeft = (columns: number, n: number) => Math.round((columns * (n + 1)) / 4) - BALL_SIZE / 2

/**
 * The starter picture: a panel with the highlighted starter's sprite, three Poké Balls on grass, the arrow and glow
 * on ball `sel`.
 * @param columns, rows the picture's size in cells; it is `rows * 2` pixels high.
 * @returns every pixel set.
 */
export function starterPicture(cards: readonly StarterCard[], sel: 0 | 1 | 2, columns: number, rows: number): Pixels {
  const w = Math.max(0, Math.floor(columns))
  const h = Math.max(0, Math.floor(rows)) * 2
  const pixels = Array<number>(w * h).fill(SKY)
  const set = (x: number, y: number, c: number) => {
    if (x >= 0 && x < w && y >= 0 && y < h) pixels[y * w + x] = c
  }
  for (let y = Math.max(0, h - 6); y < h; y++)
    for (let x = 0; x < w; x++) set(x, y, (x * 7 + y * 3) % 5 ? GRASS : BLADE)

  const panelRows = Math.max(0, rows - BALL_ZONE_ROWS)
  for (let y = 0; y < panelRows * 2; y++)
    for (let x = 1; x < w - 1; x++) set(x, y, x === 1 || x === w - 2 ? PANEL_EDGE : PANEL)
  const img = panelSprite(cards[sel], panelRows, w)
  if (img) {
    const top = Math.floor((panelRows * 2 - img.height) / 2)
    for (let y = 0; y < img.height; y++)
      for (let x = 0; x < img.width; x++) {
        const c = img.pixels[y * img.width + x] ?? CLEAR
        if (c !== CLEAR && SPRITE_COLUMN + x < w - 2) set(SPRITE_COLUMN + x, top + y, c)
      }
  }

  const ballTop = h - 7
  for (let n = 0; n < 3; n++) {
    const left = ballLeft(w, n)
    if (n === sel) {
      for (let y = -1; y <= BALL_SIZE; y++)
        for (let x = -1; x <= BALL_SIZE; x++) {
          const isCorner = (x === -1 || x === BALL_SIZE) && (y === -1 || y === BALL_SIZE)
          if (!isCorner) set(left + x, ballTop + y, GLOW)
        }
      ARROW_ROWS.forEach((row, y) => [...row].forEach((ch, x) => ch === 'X' && set(left + x, ballTop - 3 + y, ARROW)))
    }
    BALL.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (ch !== '.') set(left + x, ballTop + y, ch === 'R' ? BALL_RED : ch === 'W' ? BALL_WHITE : BALL_LINE)
      }),
    )
  }
  return { pixels, width: w, height: h }
}

// One [char, fg, bg] per cell; `segsOf`: cells back into runs.
const cellsOf = (runs: TextRun[]): TextRun[] => runs.flatMap(([t, fg, bg]) => [...t].map((c): TextRun => [c, fg, bg]))
function segsOf(cells: TextRun[]): Line {
  const out: Line = []
  for (const [text, fg, bg] of cells) {
    const last = out[out.length - 1]
    if (last && last.fg === fg && last.bg === bg) last.text += text
    else out.push({ text, fg, bg })
  }
  return out
}
// `text` at most `w` cells, ending in … when cut.
const clip = (text: string, w: number) =>
  width(text) <= w ? text : [...text].slice(0, Math.max(0, w - 1)).join('') + (w > 0 ? '…' : '')

function overlay(cells: TextRun[], x: number, text: string, fg: string, limit: number): void {
  ;[...text].forEach((ch, i) => {
    const at = x + i
    const under = cells[at]
    if (under && at < limit) cells[at] = [ch, fg, under[2]]
  })
}

// The question or the keys, on the last row.
function starterFooter(d: Extract<Dialog, { kind: 'starter' }>, data: DialogData): Line {
  if (!d.isAsking) return [{ text: clip(` ${CHOOSE_HINT} · x later`, data.columns), fg: GREY, bg: PAPER }]
  const answers: Line = [
    { text: ' Yes ', fg: WHITE, bg: RED, act: 'yes' },
    { text: ' ', fg: INK, bg: PAPER },
    { text: ' No ', fg: WHITE, bg: BLUE, act: 'no' },
  ]
  return [
    { text: clip(` Take ${cardAt(data, d.sel).name}? `, data.columns - lineWidth(answers)), fg: INK, bg: PAPER },
    ...answers,
    { text: `  ${ANSWER_HINT}`, fg: GREY, bg: PAPER },
  ]
}

function starterList(d: Extract<Dialog, { kind: 'starter' }>, data: DialogData, columns: number, rows: number) {
  const card = (n: 0 | 1 | 2, room: number, withTypes: boolean): Seg => {
    const c = cardAt(data, n)
    const isSel = n === d.sel
    const mark = isSel ? '▶' : ' '
    const full = `${mark} ${c.name}  ${typesOf(c)}`
    return {
      text: withTypes && width(full) <= room ? full : `${mark} ${clip(c.name, Math.max(1, room - 2))}`,
      fg: isSel ? INK : BLUE,
      bg: isSel ? '#ffe28a' : PAPER,
      ...(d.isAsking ? {} : { act: { pick: n } }),
    }
  }
  const balls: (0 | 1 | 2)[] = [0, 1, 2]
  const title: Block = { first: [{ text: ` ${regionLine(data.region)}`, fg: BLUE, bg: PAPER }], rest: [] }
  const footer: Block = { first: starterFooter(d, data), rest: [], isPinned: true }
  const pad: Seg = { text: ' ', fg: INK, bg: PAPER }
  const lines =
    rows >= 4
      ? stack(
          [title, ...balls.map((n): Block => ({ first: [pad, card(n, columns - 1, true)], rest: [] })), footer],
          d.isAsking ? [4, 1, 2, 3, 0] : [1, 2, 3, 4, 0],
          rows,
        )
      : stack(
          [{ first: balls.flatMap(n => [pad, card(n, Math.floor((columns - 3) / 3), false)]), rest: [] }, footer],
          d.isAsking ? [1, 0] : [0, 1],
          rows,
        )
  return render(lines, columns, rows, PAPER)
}

function starterView(d: Extract<Dialog, { kind: 'starter' }>, data: DialogData, columns: number, rows: number) {
  if (rows < STARTER_MIN_ROWS) return starterList(d, data, columns, rows)
  const picRows = rows - 1
  const cards = [0, 1, 2].map(n => cardAt(data, n))
  const pic = textRows(starterPicture(cards, d.sel, columns, picRows)).map(cellsOf)

  const panelRows = picRows - BALL_ZONE_ROWS
  const card = cardAt(data, d.sel)
  const img = panelSprite(card, panelRows, columns)
  const x = SPRITE_COLUMN + (img ? img.width + 2 : 0)
  const name = card.name
  const texts: [string, string][] =
    panelRows >= 3
      ? [
          [regionLine(data.region), BLUE],
          [name, INK],
          [typesOf(card), GREY],
        ]
      : [
          [regionLine(data.region), BLUE],
          [`${name} · ${typesOf(card)}`, INK],
        ]
  const top = Math.floor((panelRows - texts.length) / 2)
  texts.forEach(([text, fg], i) => {
    const row = pic[top + i]
    if (row) overlay(row, x, text, fg, columns - 2)
  })

  const lines: Line[] = [...pic.map(segsOf), []]
  lines[rows - 1] = starterFooter(d, data)
  const ballHits: DialogHit[] = d.isAsking
    ? []
    : [0, 1, 2].flatMap(n =>
        Array.from({ length: BALL_CELL_ROWS }, (_, i) => picRows - BALL_CELL_ROWS + i).map((y): DialogHit => ({
          y,
          x0: Math.max(0, ballLeft(columns, n) - 1),
          x1: Math.min(columns, ballLeft(columns, n) + BALL_SIZE + 1),
          act: { pick: n },
        })),
      )
  return render(lines, columns, rows, PAPER, ballHits)
}

// ── Fresh-or-keep and restart screens ──

const OPTIONS: [string, string][] = [
  ['Start fresh', 'Wipes your progress and gives you a Kanto starter.'],
  ['Keep my save', 'Keeps everything, but you start in Kanto with later regions locked.'],
]
const SHORT_LABELS = ['Fresh', 'Keep'] as const
export const WIPED = 'This wipes your party, box, Pokédex, ₽, items, XP, stats and ferry tickets.'
const AFTER = 'You start again in Kanto with ₽3,000 and a new starter.'
const COMPACT_WIPED = 'Wipes party, box, Pokédex, ₽, items, XP, stats, ferry tickets.'
const TOO_SMALL = 'Too small to show what this wipes'

/**
 * The wipe warning a confirmation `columns` by `rows` draws: in full, else compact.
 * @returns its lines, each at most `columns - 2` wide; null when neither fits complete beside the buttons' row.
 */
export function wipeWarning(columns: number, rows: number): string[] | null {
  if (columns <= 2) return null
  for (const said of [`${WIPED} ${AFTER}`, COMPACT_WIPED]) {
    const lines = wrap(said, columns - 2)
    if (lines.length <= rows - 1 && lines.join(' ') === said) return lines
  }
  return null
}

function choiceView(d: Extract<Dialog, { kind: 'fresh' }>, data: DialogData, columns: number, rows: number) {
  const s = data.summary
  const about = s
    ? `Regions are here. Your save: ${fmt(s.owned)} Pokémon · ${fmt(s.seen)} seen · ₽${fmt(s.balance)}`
    : 'Regions are here. Choose what happens to your save.'
  const labelWidth = Math.max(...OPTIONS.map(([label]) => width(label))) + 2
  const head = (n: 0 | 1, label: string): Line => {
    const isSel = n === (d.sel ?? 0)
    return [
      { text: isSel ? '▶' : ' ', fg: BLUE, bg: PAPER },
      { text: ` ${label} `, fg: isSel ? WHITE : INK, bg: isSel ? BLUE : BUTTON, act: { pick: n } },
    ]
  }
  const option = (n: 0 | 1): Block => {
    const [label, text] = OPTIONS[n] ?? ['', '']
    const indent = 1 + labelWidth + 1
    const said = cutTo(wrap(text, Math.max(1, columns - indent - 1)), rows).map(l => ` ${l}`)
    const fill = ' '.repeat(Math.max(0, labelWidth - width(label) - 2))
    return {
      first: [...head(n, label), { text: fill + (said[0] ?? ''), fg: INK, bg: PAPER }],
      rest: said.slice(1).map((l): Line => [{ text: ' '.repeat(indent) + l.slice(1), fg: INK, bg: PAPER }]),
    }
  }
  const hint: Block = {
    first: [{ text: clip(` ${KEEP_HINT} · x later`, columns), fg: GREY, bg: PAPER }],
    rest: [],
    isPinned: true,
  }
  const bothOf = (labels: readonly [string, string]): Line => [...head(0, labels[0]), ...head(1, labels[1])]
  const fullBoth = bothOf([OPTIONS[0]?.[0] ?? '', OPTIONS[1]?.[0] ?? ''])
  const both: Block = { first: lineWidth(fullBoth) <= columns ? fullBoth : bothOf(SHORT_LABELS), rest: [] }
  const lines =
    rows < 3
      ? stack([both, hint], [0, 1], rows)
      : stack([paragraph(about, columns, BLUE, PAPER, rows), option(0), option(1), hint], [1, 2, 3, 0], rows)
  return render(lines, columns, rows, PAPER)
}

function confirmView(d: Extract<Dialog, { kind: 'fresh' }>, columns: number, rows: number) {
  const title: Block = {
    first: [{ text: d.isRestart ? ' Restart your journey from scratch? ' : ' Start fresh? ', fg: WHITE, bg: RED }],
    rest: [],
  }
  const warning = wipeWarning(columns, rows)
  const yes: Seg = { text: ' Yes, wipe it ', fg: RED, bg: WHITE, act: 'yes' }
  const no: Seg = { text: d.isRestart ? ' No, keep playing ' : ' No, go back ', fg: WHITE, bg: INK, act: 'no' }
  const gap: Seg = { text: '  ', fg: WHITE, bg: RED }
  const edge: Seg = { text: ' ', fg: WHITE, bg: RED }
  const fullButtons: Line = warning ? [edge, yes, gap, no] : [edge, no, gap, { text: TOO_SMALL, fg: PINK, bg: RED }]
  const shortButtons: Line = fullButtons.map(seg =>
    seg.act === 'yes' ? { ...seg, text: ' Yes ' } : seg.act === 'no' ? { ...seg, text: ' No ' } : seg,
  )
  const isFull = lineWidth(warning ? fullButtons : fullButtons.slice(0, 2)) <= columns
  const buttons: Block = { first: isFull ? fullButtons : shortButtons, rest: [] }
  const hint: Block = {
    first: [{ text: ` click, or /pokemon ${d.isRestart ? 'restart' : 'fresh'} yes or no`, fg: PINK, bg: RED }],
    rest: [],
    isPinned: true,
  }
  const said: Block = warning
    ? {
        first: [{ text: ` ${warning[0] ?? ''}`, fg: WHITE, bg: RED }],
        rest: warning.slice(1).map((l): Line => [{ text: ` ${l}`, fg: WHITE, bg: RED }]),
      }
    : { first: [], rest: [] }
  const spare = rows - 1 - (warning?.length ?? 0)
  const order = [2, ...(warning ? [1] : []), ...(spare >= 1 ? [3] : []), ...(spare >= 2 ? [0] : [])]
  return render(stack([title, said, buttons, hint], order, rows), columns, rows, RED)
}

/**
 * The dialog as coloured text and its controls.
 * @returns exactly `data.rows` lines, each exactly `data.columns` cells wide.
 */
export function dialogView(d: Dialog, data: DialogData): DialogProps {
  const columns = Math.max(0, Math.floor(data.columns))
  const rows = Math.max(0, Math.floor(data.rows))
  if (d.kind === 'starter') return starterView(d, data, columns, rows)
  return d.isConfirming ? confirmView(d, columns, rows) : choiceView(d, data, columns, rows)
}
