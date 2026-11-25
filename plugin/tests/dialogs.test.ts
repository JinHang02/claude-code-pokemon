import { expect, test } from 'claude-code/testing'

import {
  dialogAct,
  dialogView,
  isDialogAct,
  STARTER_MIN_ROWS,
  STARTER_ROWS,
  STARTER_SCENE_ROWS,
  starterLayout,
  starterPicture,
  wipeWarning,
} from '../hooks/dialogs'
import type { Dialog, DialogAct, DialogData, DialogHit, DialogProps, StarterCard } from '../hooks/dialogs'
import { TRAVEL_REGIONS } from '../hooks/travel-regions'
import type { TravelRegion } from '../hooks/travel-regions'
import { CLEAR } from '../hooks/sprite'
import type { Pixels, TextRun } from '../hooks/sprite'

const KANTO = TRAVEL_REGIONS[0] as TravelRegion
const KANTO_STARTERS = KANTO.starters
const BALL_RED = '#e3350d'
const BALL_WHITE = '#f6f8fb'
const BLUE = '#3a6ea5'
const PAPER = '#f4f1e6'
const PANEL_BG = '#f8f8f0'
const RED_BG = '#b3261e'

const sprite = (color: number, width = 20, height = 20): Pixels => ({
  pixels: Array<number>(width * height).fill(color),
  width,
  height,
})
const CARDS: StarterCard[] = [
  { species: 'bulbasaur', name: 'Bulbasaur', types: ['grass', 'poison'], sprite: sprite(0x00aa00) },
  { species: 'charmander', name: 'Charmander', types: ['fire'], sprite: sprite(0xff6600) },
  { species: 'squirtle', name: 'Squirtle', types: ['water'], sprite: sprite(0x3399ff) },
]
const data = (extra: Partial<DialogData> = {}): DialogData => ({
  columns: 80,
  rows: STARTER_ROWS,
  region: KANTO,
  cards: CARDS,
  ...extra,
})
const starter = (extra: Partial<Extract<Dialog, { kind: 'starter' }>> = {}): Dialog => ({
  kind: 'starter',
  region: 'kanto',
  sel: 0,
  isAsking: false,
  ...extra,
})
const fresh = (extra: Partial<Extract<Dialog, { kind: 'fresh' }>> = {}): Dialog => ({
  kind: 'fresh',
  isConfirming: false,
  isRestart: false,
  ...extra,
})
// The dialog after `acts`, one after another; the posts they made.
const run = (d: Dialog, ...acts: DialogAct[]) =>
  acts.reduce<{ dialog: Dialog | null; posts: unknown[] }>(
    (s, a) => {
      if (!s.dialog) return s
      const next = dialogAct(s.dialog, a, KANTO_STARTERS)
      return { dialog: next.dialog, posts: next.post ? [...s.posts, next.post] : s.posts }
    },
    { dialog: d, posts: [] },
  )
const text = (runs: TextRun[]) => runs.map(r => r[0]).join('')
const all = (p: DialogProps) => p.lines.map(text).join('\n')
const width = (s: string) => [...s].length
// One [char, fg, bg] per column of a line.
const cells = (runs: TextRun[]): TextRun[] => runs.flatMap(([t, fg, bg]) => [...t].map((c): TextRun => [c, fg, bg]))
const shown = (p: DialogProps, h: DialogHit) => [...text(p.lines[h.y] ?? [])].slice(h.x0, h.x1).join('')
const hitFor = (p: DialogProps, a: DialogAct) => p.hits.filter(h => JSON.stringify(h.act) === JSON.stringify(a))
const everyState: Dialog[] = [
  starter(),
  starter({ sel: 2, isAsking: true }),
  fresh(),
  fresh({ isConfirming: true }),
  fresh({ isConfirming: true, isRestart: true }),
]

// ── Starter reducer ──

test('right moves the highlight 0→1→2 and stays at 2; left stays at 0', () => {
  expect(run(starter(), 'right').dialog).toEqual(starter({ sel: 1 }))
  expect(run(starter(), 'right', 'right').dialog).toEqual(starter({ sel: 2 }))
  expect(run(starter(), 'right', 'right', 'right').dialog).toEqual(starter({ sel: 2 }))
  expect(run(starter(), 'left').dialog).toEqual(starter({ sel: 0 }))
  expect(run(starter({ sel: 2 }), 'left').dialog).toEqual(starter({ sel: 1 }))
})

test('hover selects a ball without asking (A85); out of range is ignored', () => {
  expect(run(starter(), { hover: 1 })).toEqual({ dialog: starter({ sel: 1 }), posts: [] })
  expect(run(starter({ sel: 1 }), { hover: 5 }).dialog).toEqual(starter({ sel: 1 }))
  expect(run(starter({ sel: 1 }), { hover: -1 }).dialog).toEqual(starter({ sel: 1 }))
  expect(run(starter({ sel: 1 }), { hover: 3 }).dialog).toEqual(starter({ sel: 1 }))
})

test('a hover on the ball or option already selected returns the very same dialog', () => {
  for (const d of [starter({ sel: 1 }), fresh({ sel: 1 }), fresh()]) {
    const sel = d.kind === 'starter' ? d.sel : (d.sel ?? 0)
    expect(dialogAct(d, { hover: sel }, KANTO_STARTERS).dialog).toBe(d)
    expect(dialogAct(d, { hover: sel }, KANTO_STARTERS).post).toBeUndefined()
  }
  expect(dialogAct(starter({ sel: 1 }), { hover: 2 }, KANTO_STARTERS).dialog).toEqual(starter({ sel: 2 }))
})

test('enter and a pick ask before anything is chosen (A86)', () => {
  expect(run(starter({ sel: 1 }), 'enter')).toEqual({ dialog: starter({ sel: 1, isAsking: true }), posts: [] })
  expect(run(starter(), { pick: 2 })).toEqual({ dialog: starter({ sel: 2, isAsking: true }), posts: [] })
  expect(run(starter(), { pick: 3 }).dialog).toEqual(starter())
  expect(run(starter(), { pick: -1 }).dialog).toEqual(starter())
})

test('yes posts the asked starter; no goes back with its ball still highlighted (A86, A87)', () => {
  expect(run(starter(), { pick: 2 }, 'yes').posts).toEqual([{ choose: 'squirtle' }])
  expect(run(starter(), { pick: 2 }, 'no')).toEqual({ dialog: starter({ sel: 2 }), posts: [] })
})

test('enter while asking takes the asked starter, as yes does', () => {
  expect(run(starter(), { pick: 2 }, 'enter').posts).toEqual([{ choose: 'squirtle' }])
  expect(run(starter({ sel: 1 }), 'enter', 'enter').posts).toEqual([{ choose: 'charmander' }])
})

test('while asking, moves and picks change nothing; yes and no before asking do nothing', () => {
  const asking = starter({ sel: 2, isAsking: true })
  for (const a of ['left', 'right', { hover: 0 }, { pick: 0 }] as DialogAct[])
    expect(run(asking, a)).toEqual({ dialog: asking, posts: [] })
  expect(run(starter(), 'yes')).toEqual({ dialog: starter(), posts: [] })
  expect(run(starter(), 'no')).toEqual({ dialog: starter(), posts: [] })
})

test('yes with no starter at the highlight posts nothing', () => {
  const d = starter({ sel: 2, isAsking: true })
  expect(dialogAct(d, 'yes', ['bulbasaur'])).toEqual({ dialog: d })
})

// ── Fresh-or-keep reducer ──

test('fresh: pick 0 asks for confirmation; pick 1 posts keep', () => {
  expect(run(fresh(), { pick: 0 })).toEqual({ dialog: fresh({ isConfirming: true }), posts: [] })
  expect(run(fresh(), { pick: 1 }).posts).toEqual([{ keep: true }])
  expect(run(fresh(), { pick: 2 })).toEqual({ dialog: fresh(), posts: [] })
})

test('fresh: the keys move between the options and enter takes the highlighted one', () => {
  expect(run(fresh(), 'enter')).toEqual({ dialog: fresh({ isConfirming: true }), posts: [] })
  expect(run(fresh(), 'right', 'enter').posts).toEqual([{ keep: true }])
  expect(run(fresh(), 'right', 'right', 'enter').posts).toEqual([{ keep: true }])
  expect(run(fresh(), 'right', 'left', 'left', 'enter').dialog).toEqual(fresh({ isConfirming: true }))
  expect(run(fresh(), { hover: 1 }, 'enter').posts).toEqual([{ keep: true }])
  expect(run(fresh(), 'yes', 'no').posts).toEqual([])
})

test('fresh confirming: no goes back to the choice (A105); yes posts fresh (A104)', () => {
  expect(run(fresh(), { pick: 0 }, 'no')).toEqual({ dialog: fresh(), posts: [] })
  expect(run(fresh(), { pick: 0 }, 'yes').posts).toEqual([{ fresh: true }])
})

test('fresh confirming: enter, moves and picks change nothing', () => {
  const d = fresh({ isConfirming: true })
  for (const a of ['enter', 'left', 'right', { pick: 1 }, { hover: 1 }] as DialogAct[])
    expect(run(d, a)).toEqual({ dialog: d, posts: [] })
})

test('restart: no closes with nothing changed (A112); yes posts fresh', () => {
  const d = fresh({ isConfirming: true, isRestart: true })
  expect(run(d, 'no')).toEqual({ dialog: null, posts: [] })
  expect(run(d, 'yes').posts).toEqual([{ fresh: true }])
})

test('close gives no dialog and no post in every state, so a pending choice stays', () => {
  for (const d of everyState) expect(dialogAct(d, 'close', KANTO_STARTERS)).toEqual({ dialog: null })
})

// ── Posted data ──

test('isDialogAct takes every act and rejects junk', () => {
  for (const a of ['left', 'right', 'enter', 'yes', 'no', 'close', { pick: 0 }, { pick: 2 }, { hover: 1 }])
    expect(isDialogAct(a)).toBe(true)
  const junk: unknown[] = [
    { pick: 'a' },
    { pick: 1, x: 1 },
    { pick: 1.5 },
    { pick: -1 },
    { hover: null },
    { buy: 1 },
    {},
    'buy',
    '',
    null,
    undefined,
    3,
    [],
    ['left'],
    [{ pick: 1 }],
  ]
  for (const a of junk) expect(isDialogAct(a)).toBe(false)
})

// ── Starter view ──

test('the starter screen shows the region, three balls, the arrow on ball 1 and Bulbasaur (A84)', () => {
  const p = dialogView(starter(), data())
  expect(p.lines).toHaveLength(STARTER_ROWS)
  expect(all(p)).toContain('KANTO · NEW PARTNER')
  expect(all(p)).toContain('BULBASAUR')
  expect(all(p)).toMatch(/ Grass +Poison /)
  expect(all(p)).not.toContain('CHARMANDER')
  const balls = [0, 1, 2].map(n => hitFor(p, { pick: n }))
  for (const hits of balls) expect(hits.length).toBeGreaterThan(0)
  const ballXs = balls.map(hits => hits[0]!)
  expect(ballXs[0]!.x1).toBeLessThanOrEqual(ballXs[1]!.x0)
  expect(ballXs[1]!.x1).toBeLessThanOrEqual(ballXs[2]!.x0)
})

test('the scene is the mockup: title bar, sky over grass, a centred panel, a paper strip', () => {
  const columns = 197
  const p = dialogView(starter(), data({ columns, rows: STARTER_SCENE_ROWS }))
  const bgs = p.lines.map(line => cells(line).map(([, , bg]) => bg))
  expect(new Set(bgs[0])).toEqual(new Set([BLUE]))
  expect(text(p.lines[0]!)).toMatch(/^ KANTO · NEW PARTNER  Three Poké Balls! .* ✕ $/)
  expect(hitFor(p, 'close')).toEqual([{ y: 0, x0: columns - 3, x1: columns, act: 'close' }])
  expect(new Set(bgs[STARTER_SCENE_ROWS - 1]!.slice(8))).toEqual(new Set([PAPER]))
  expect(bgs[1]![0]).toBe('#1f4f80')
  expect(bgs[STARTER_SCENE_ROWS - 2]![0]).toBe('#35703f')
  const nameRow = p.lines.findIndex(l => text(l).includes('BULBASAUR'))
  const panel = bgs[nameRow]!.flatMap((bg, x) => (bg === PANEL_BG ? [x] : []))
  const [left, right] = [panel[0]!, panel[panel.length - 1]!]
  expect(Math.abs(left - (columns - 1 - right))).toBeLessThanOrEqual(1)
  expect(right - left).toBeGreaterThan(70)
})

test('the panel holds a sprite as tall as the panel allows, at most its own size', () => {
  const at = starterLayout(197, STARTER_SCENE_ROWS - 2)
  const inner = at.panel.end - at.panel.top - 2
  expect(inner).toBe(18)
  const tallness = (height: number) => {
    const card = { ...CARDS[0]!, sprite: sprite(0x00aa00, 15, height) }
    const img = starterPicture([card, ...CARDS.slice(1)], 0, 197, STARTER_SCENE_ROWS - 2)
    return Array.from({ length: img.height }, (_, y) => img.pixels.slice(y * img.width, (y + 1) * img.width)).filter(
      r => r.includes(0x00aa00),
    ).length
  }
  expect(tallness(19)).toBe(inner)
  expect(tallness(12)).toBe(12)
})

test('the balls sit at a quarter, a half and three quarters of the band, 10 pixels wide', () => {
  const columns = 197
  const p = dialogView(starter(), data({ columns, rows: STARTER_SCENE_ROWS }))
  for (const n of [0, 1, 2]) {
    const h = hitFor(p, { pick: n })[0]!
    expect(h.x1 - h.x0).toBe(12)
    expect((h.x0 + h.x1) / 2).toBe(Math.round((columns * (n + 1)) / 4))
  }
})

test('a click in the middle of each ball picks that ball', () => {
  for (const columns of [80, 197])
    for (const rows of [STARTER_ROWS, STARTER_SCENE_ROWS]) {
      const p = dialogView(starter(), data({ columns, rows }))
      for (const n of [0, 1, 2] as const) {
        const hits = hitFor(p, { pick: n })
        const mid = hits[Math.floor(hits.length / 2)]!
        const x = Math.floor((mid.x0 + mid.x1) / 2)
        const clicked = p.hits.find(c => c.y === mid.y && c.x0 <= x && x < c.x1)
        expect(clicked?.act).toEqual({ pick: n })
        expect(run(starter(), clicked!.act).dialog).toEqual(starter({ sel: n, isAsking: true }))
      }
    }
})

test('◀ and ▶ on the paper strip move the highlight', () => {
  const p = dialogView(starter({ sel: 1 }), data({ columns: 197, rows: STARTER_SCENE_ROWS }))
  expect(shown(p, hitFor(p, 'left')[0]!)).toBe(' ◀ ')
  expect(shown(p, hitFor(p, 'right')[0]!)).toBe(' ▶ ')
})

test('the arrow and the glow sit over the highlighted ball only', () => {
  const columns = 80
  const rows = STARTER_SCENE_ROWS - 2
  const at = starterLayout(columns, rows)
  const pic = (sel: 0 | 1 | 2) => starterPicture(CARDS, sel, columns, rows)
  // The pixels of rows y0 to y1 (exclusive) around ball `n`.
  const area = (img: Pixels, n: number, y0: number, y1: number) => {
    const x0 = at.ballLefts[n]! - 3
    return Array.from({ length: y1 - y0 }, (_, i) =>
      img.pixels.slice((y0 + i) * columns + x0, (y0 + i) * columns + x0 + 16),
    )
  }
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
  const arrow = (img: Pixels, n: number) => area(img, n, at.arrowTop, at.ballTop)
  const ball = (img: Pixels, n: number) => area(img, n, at.ballTop, at.ballTop + 10)
  expect(same(arrow(pic(0), 0), arrow(pic(2), 0))).toBe(false)
  expect(same(arrow(pic(0), 1), arrow(pic(2), 1))).toBe(true)
  expect(same(ball(pic(0), 0), ball(pic(2), 0))).toBe(false)
  expect(same(ball(pic(0), 1), ball(pic(2), 1))).toBe(true)
})

test('asking turns the panel border red', () => {
  const colors = (isAsking: boolean) => new Set(starterPicture(CARDS, 0, 197, STARTER_SCENE_ROWS - 2, isAsking).pixels)
  expect(colors(false).has(0x3a4a78)).toBe(true)
  expect(colors(true).has(0x3a4a78)).toBe(false)
})

test('the picture is grass under the balls and leaves no pixel clear', () => {
  const img = starterPicture(CARDS, 0, 40, 9)
  expect(img.pixels.filter(c => c === CLEAR)).toHaveLength(0)
  expect(img.pixels).toHaveLength(40 * 18)
})

test('right moves the panel to Charmander and Fire (A85)', () => {
  const p = dialogView(run(starter(), 'right').dialog!, data())
  expect(all(p)).toContain('CHARMANDER')
  expect(all(p)).toContain('Fire')
  expect(all(p)).not.toContain('BULBASAUR')
})

test('a card without a sprite still shows its name and types, and can be chosen (A88)', () => {
  const cards = CARDS.map(({ species, name, types }) => ({ species, name, types }))
  const p = dialogView(starter(), data({ cards }))
  expect(all(p)).toContain('BULBASAUR')
  expect(all(p)).toContain('Grass')
  expect(hitFor(p, { pick: 0 }).length).toBeGreaterThan(0)
  const img = starterPicture(cards, 0, 80, STARTER_ROWS - 2)
  expect(img.pixels).not.toContain(0x00aa00)
  expect(starterPicture(CARDS, 0, 80, STARTER_ROWS - 2).pixels).toContain(0x00aa00)
})

test('missing cards fall back to the species name, so the screen still draws', () => {
  const p = dialogView(starter({ sel: 2 }), data({ cards: [] }))
  expect(all(p)).toContain('SQUIRTLE')
  expect(hitFor(p, { pick: 2 }).length).toBeGreaterThan(0)
})

test('every line is exactly the band wide, one per row, at 40, 80 and 200 columns', () => {
  for (const columns of [40, 80, 200])
    for (const rows of [STARTER_MIN_ROWS - 1, STARTER_MIN_ROWS, STARTER_ROWS])
      for (const d of everyState) {
        const p = dialogView(d, data({ columns, rows, summary: { owned: 40, seen: 300, balance: 80_000 } }))
        expect(p.lines).toHaveLength(rows)
        for (const line of p.lines) expect(width(text(line))).toBe(columns)
      }
})

test('below STARTER_MIN_ROWS the starters are a text list that still has 3 pick hits', () => {
  for (const rows of [STARTER_MIN_ROWS - 1, 5, 4, 3, 2, 1]) {
    const p = dialogView(starter(), data({ rows }))
    expect(p.lines).toHaveLength(rows)
    for (const n of [0, 1, 2]) {
      const hits = hitFor(p, { pick: n })
      expect(hits).toHaveLength(1)
      expect(shown(p, hits[0]!)).toContain(CARDS[n]!.name)
    }
  }
  const p = dialogView(starter(), data({ rows: STARTER_MIN_ROWS - 1 }))
  expect(all(p)).toContain('Kanto')
  expect(all(p)).toContain('Grass/Poison')
  expect(p.lines.map(text).find(l => l.includes('Bulbasaur'))).toContain('▶')
})

test('a Unicode name keeps the lines their width, composed or not', () => {
  for (const name of ['Flabébé', 'Flabébé', 'Nidoran♀'])
    for (const rows of [STARTER_ROWS, STARTER_MIN_ROWS - 1]) {
      const cards = [{ species: 'flabebe', name, types: ['fairy'] }, ...CARDS.slice(1)]
      const p = dialogView(starter({ isAsking: true }), data({ cards, rows, columns: 40 }))
      for (const line of p.lines) expect(width(text(line))).toBe(40)
      expect(all(p).normalize('NFC').toUpperCase()).toContain(name.normalize('NFC').toUpperCase())
    }
})

test('the hint row names the typed answer for a terminal that passes no clicks (D5, R42)', () => {
  const hints: [Dialog, string][] = [
    [starter(), '/pokemon choose <name>'],
    [fresh(), '/pokemon keep or fresh'],
    [fresh({ isConfirming: true }), '/pokemon fresh yes or no'],
    [fresh({ isConfirming: true, isRestart: true }), '/pokemon restart yes or no'],
  ]
  for (const [d, hint] of hints) {
    const shown = all(dialogView(d, data({ columns: 100, summary: { owned: 1, seen: 1, balance: 0 } })))
    expect(shown).toContain(hint)
    expect(shown).not.toContain('ctrl+x')
  }
})

test('asking names the starter and offers Yes and No hits, and no ball hits', () => {
  const p = dialogView(starter({ sel: 2, isAsking: true }), data())
  expect(all(p)).toContain('Take SQUIRTLE as your Kanto partner?')
  expect(hitFor(p, 'yes')).toHaveLength(1)
  expect(hitFor(p, 'no')).toHaveLength(1)
  for (const n of [0, 1, 2]) expect(hitFor(p, { pick: n })).toHaveLength(0)
})

// ── Fresh-or-keep and restart views ──

const SUMMARY = { owned: 40, seen: 300, balance: 80_000 }

test('fresh-or-keep shows the save summary and what each option does (A99)', () => {
  const p = dialogView(fresh(), data({ summary: SUMMARY }))
  const s = all(p).replace(/\s+/g, ' ')
  expect(s).toContain('40 Pokémon')
  expect(s).toContain('300 seen')
  expect(s).toContain('₽80,000')
  expect(s).toContain('Start fresh')
  expect(s).toContain('Keep my save')
  expect(s).toMatch(/wipes .*progress/i)
  expect(s).toContain('Kanto starter')
  expect(s).toMatch(/keeps everything/i)
  expect(s).toMatch(/later regions locked/i)
  expect(shown(p, hitFor(p, { pick: 0 })[0]!)).toContain('Start fresh')
  expect(shown(p, hitFor(p, { pick: 1 })[0]!)).toContain('Keep my save')
})

test('the confirmation names everything wiped (A110) and is drawn in red', () => {
  for (const d of [fresh({ isConfirming: true }), fresh({ isConfirming: true, isRestart: true })]) {
    const p = dialogView(d, data({ summary: SUMMARY }))
    const s = all(p)
    for (const word of ['party', 'box', 'Pokédex', '₽', 'items', 'XP', 'stats', 'ferry tickets'])
      expect(s).toContain(word)
    for (const line of p.lines) expect(line.some(([, , bg]) => bg === RED_BG)).toBe(true)
    expect(shown(p, hitFor(p, 'yes')[0]!)).toContain('Yes')
    expect(shown(p, hitFor(p, 'no')[0]!)).toContain('No')
  }
  expect(all(dialogView(fresh({ isConfirming: true, isRestart: true }), data()))).toContain('Restart')
})

test('the fresh-or-keep screen draws without a summary', () => {
  const p = dialogView(fresh(), data())
  expect(all(p)).toContain('Start fresh')
  expect(all(p)).not.toContain('undefined')
})

test('the option buttons and the confirmation’s No survive the smallest bands', () => {
  for (const rows of [1, 2, 3]) {
    const choice = dialogView(fresh(), data({ rows, columns: 40, summary: SUMMARY }))
    expect(hitFor(choice, { pick: 0 })).toHaveLength(1)
    expect(hitFor(choice, { pick: 1 })).toHaveLength(1)
    for (const isRestart of [false, true]) {
      const confirm = dialogView(fresh({ isConfirming: true, isRestart }), data({ rows, columns: 40 }))
      expect(hitFor(confirm, 'no')).toHaveLength(1)
    }
  }
})

const WIPED_WORDS = ['party', 'box', 'Pokédex', '₽', 'items', 'XP', 'stats', 'ferry tickets']

test('a confirmation offers Yes only with every wiped thing drawn, at any band size (A110)', () => {
  for (const isRestart of [false, true])
    for (const columns of [20, 28, 40, 80])
      for (const rows of [1, 2, 3, 4, 5, 6, STARTER_ROWS]) {
        const d = fresh({ isConfirming: true, isRestart })
        const p = dialogView(d, data({ columns, rows }))
        const s = all(p).replace(/\s*\n\s*/g, ' ')
        const yes = hitFor(p, 'yes')
        expect(yes.length).toBeLessThanOrEqual(1)
        expect(yes.length === 1).toBe(wipeWarning(columns, rows) !== null)
        if (yes.length) {
          for (const word of WIPED_WORDS) expect(s).toContain(word)
          expect(s).not.toContain('…')
        }
        expect(hitFor(p, 'no')).toHaveLength(1)
      }
})

test('the full wipe warning shows when it fits; a compact one when only that fits; none below that', () => {
  expect(wipeWarning(80, STARTER_ROWS)?.join(' ')).toContain('₽3,000')
  const compact = wipeWarning(40, 3)
  expect(compact).not.toBeNull()
  for (const word of WIPED_WORDS) expect(compact?.join(' ')).toContain(word)
  expect(wipeWarning(40, 1)).toBeNull()
  expect(wipeWarning(0, STARTER_ROWS)).toBeNull()
})

test('a confirmation shrunk below its warning drops Yes and says why; grown back, Yes returns', () => {
  const d = fresh({ isConfirming: true, isRestart: true })
  const big = dialogView(d, data({ columns: 40, rows: STARTER_ROWS }))
  const small = dialogView(d, data({ columns: 40, rows: 2 }))
  expect(hitFor(big, 'yes')).toHaveLength(1)
  expect(hitFor(small, 'yes')).toHaveLength(0)
  expect(all(small)).toMatch(/too small/i)
  expect(hitFor(dialogView(d, data({ columns: 40, rows: STARTER_ROWS })), 'yes')).toHaveLength(1)
})

test('every control keeps a hit on narrow bands of 20 to 36 columns', () => {
  const acts = (d: Dialog, rows: number): DialogAct[] =>
    d.kind === 'starter'
      ? d.isAsking
        ? ['yes', 'no']
        : [{ pick: 0 }, { pick: 1 }, { pick: 2 }]
      : d.isConfirming
        ? ['no']
        : [{ pick: 0 }, { pick: 1 }]
  for (let columns = 20; columns <= 36; columns++)
    for (const rows of [1, 2, 3, 4, 5, STARTER_MIN_ROWS - 1, STARTER_MIN_ROWS, STARTER_ROWS])
      for (const d of [...everyState, starter({ sel: 1, isAsking: true }), starter({ sel: 1 })]) {
        const p = dialogView(d, data({ columns, rows, summary: SUMMARY }))
        for (const a of acts(d, rows))
          expect([columns, rows, d, a, hitFor(p, a).length > 0]).toEqual([columns, rows, d, a, true])
        for (const line of p.lines) expect(width(text(line))).toBe(columns)
      }
})

test('in the list layout a cut name keeps its card clickable and ends in …', () => {
  const p = dialogView(starter(), data({ columns: 20, rows: 2 }))
  for (const n of [0, 1, 2]) expect(hitFor(p, { pick: n })).toHaveLength(1)
  expect(all(p)).toContain('…')
})

// ── Hits ──

test('hits land on the drawn text, or on the ball they pick, in every view', () => {
  for (const columns of [40, 80, 200])
    for (const rows of [STARTER_MIN_ROWS - 1, STARTER_ROWS])
      for (const d of everyState) {
        const p = dialogView(d, data({ columns, rows, summary: SUMMARY }))
        expect(p.hits.length).toBeGreaterThan(0)
        for (const h of p.hits) {
          expect(h.y).toBeGreaterThanOrEqual(0)
          expect(h.y).toBeLessThan(rows)
          expect(h.x0).toBeGreaterThanOrEqual(0)
          expect(h.x1).toBeLessThanOrEqual(columns)
          expect(h.x1).toBeGreaterThan(h.x0)
          const isBall = typeof h.act === 'object' && d.kind === 'starter' && rows >= STARTER_MIN_ROWS
          if (isBall) {
            const drawn = cells(p.lines[h.y] ?? []).slice(h.x0, h.x1)
            expect(drawn.some(([, fg, bg]) => [fg, bg].some(c => c === BALL_RED || c === BALL_WHITE))).toBe(true)
          } else expect(shown(p, h).trim().length).toBeGreaterThan(0)
        }
      }
})
