// While a wild Pokémon can be aimed at, the band is coloured text in a click layer, and Claude Code unmounts a surface
// module whose tree passes 100,000 characters. A band too wide and busy for one (fog or rain across a wide terminal) is
// drawn by several stacked strips instead, every cell as it is, each click counted in the band's own rows.
import { expect, test } from 'claude-code/testing'

import Aim from '../hooks/aim'
import { LANDSCAPES } from '../hooks/backdrop'
import type { Phase } from '../hooks/backdrop'
import { frame, initialStatus, newScene } from '../hooks/scene'
import type { Status } from '../hooks/scene'
import { runCost, strips, textRows } from '../hooks/sprite'
import type { TextRun } from '../hooks/sprite'
import { WEATHERS } from '../hooks/weather'
import { emptySave } from '../hooks/save'
import { begin, cmd, KIT, LIST, member } from './world'

const LIMIT = 100_000
type Post = { x: number; y: number; fine?: { x: number; y: number } }
// A surface for the module alone: what it posts, and a way to click it.
function surface() {
  const posted: Post[] = []
  let listener: ((e: unknown) => void) | null = null
  const s = {
    state: undefined as unknown,
    elements: { Box: 'Box', Text: 'Text' },
    onPointer: (fn: (e: unknown) => void) => {
      listener = fn
      return () => {}
    },
    post: (data: Post) => posted.push(data),
    setState: (next: unknown) => {
      s.state = next
    },
  }
  return { s, posted, click: (e: object) => listener?.({ type: 'down', button: 'left', ...e }) }
}
const tree = (lines: TextRun[][]) => JSON.stringify(Aim({ lines }, surface().s as never)).length
const sprite = { pixels: Array<number>(64).fill(0xabcdef), width: 8, height: 8 }
const scene = (columns: number, rows: number, phase: Phase, landscape: string, weather: string) => {
  const s: Status = {
    ...initialStatus(),
    t: 7,
    actors: [{ ...newScene(30), roam: { kind: 'idle', left: 1e9, age: 0 } }],
  }
  return frame(s, [sprite], columns - 13, rows, { phase, landscape, weather, moon: 4 } as never, columns)
}

test(
  'every time, place and weather in a wide terminal fits, in strips that hold every cell of the band as it was',
  { timeoutMs: 60_000 },
  () => {
    for (const [columns, rows] of [
      [170, 12],
      [250, 15],
      [300, 24],
    ] as const)
      for (const phase of ['day', 'dusk', 'night', 'dawn'] as Phase[])
        for (const landscape of LANDSCAPES)
          for (const weather of WEATHERS) {
            const lines = textRows(scene(columns, rows, phase, landscape, weather))
            const cut = strips(lines)
            const what = `${columns}x${rows} ${phase} ${landscape} ${weather}`
            expect([what, cut.every(s => tree(s.lines) < LIMIT && JSON.stringify(s).length < LIMIT)]).toEqual([
              what,
              true,
            ])
            // Nothing merged, dropped or moved: the strips are the band's lines, in order, each at its own row.
            expect(cut.flatMap(s => s.lines)).toEqual(lines)
            expect(cut.map(s => s.top)).toEqual(
              cut.map((_, i) => cut.slice(0, i).reduce((n, s) => n + s.lines.length, 0)),
            )
          }
  },
)

test('a band that fits is one strip, as before; the fog that broke a wide one takes several', () => {
  expect(strips(textRows(scene(80, 12, 'day', 'meadow', 'clear')))).toHaveLength(1)
  expect(strips(textRows(scene(120, 12, 'dawn', 'forest', 'fog'))).length).toBeGreaterThan(1)
})

test('the cost of a run never comes in under what the tree holds', () => {
  const lines = textRows(scene(120, 12, 'dawn', 'forest', 'fog'))
  const estimate = lines.length * 34 + lines.flat().reduce((n, r) => n + runCost(r), 0)
  expect(estimate).toBeGreaterThanOrEqual(tree(lines))
})

test("a strip's clicks are counted in the band's rows, fine positions too, and follow the strip when it moves", () => {
  const { s, posted, click } = surface()
  Aim({ lines: [], top: 5 }, s as never)
  click({ x: 3, y: 1 })
  click({ x: 3, y: 1, fine: { x: 3.5, y: 1.25 } })
  Aim({ lines: [], top: 9 }, s as never)
  click({ x: 0, y: 0 })
  click({ type: 'up', x: 0, y: 0 })
  expect(posted).toEqual([
    { x: 3, y: 6 },
    { x: 3, y: 6, fine: { x: 3.5, y: 6.25 } },
    { x: 0, y: 9 },
  ])
})

test('in a wide foggy band a click on a lower strip throws at that row of the band', KIT, async ($, on) => {
  const solid = (rgb: string, size: number) =>
    Array.from({ length: size }, () => `\x1b[38;2;${rgb}m\x1b[48;2;${rgb}m▀\x1b[0m`.repeat(size)).join('\n')
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu')] }, solid('9;9;9', 12), undefined, {
    isOnline: true,
    list: JSON.stringify(LIST),
    sprites: { caterpie: solid('0;255;255', 8) },
  })
  await cmd($, 'pokemon', 'party')
  type Node = { type?: string; props?: { key?: string; props?: { lines?: TextRun[][]; top?: number } } }
  const band = (await $.ui.mount({
    plugin: 'pokemon',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 30, bodyColumns: 300 },
  } as never)) as unknown as {
    drawn: () => Promise<unknown>
    redraw: () => Promise<void>
    pointer: (e: object) => Promise<void>
  }
  await cmd($, 'pokemon-play', 'dawn fog forest')
  await cmd($, 'pokemon-play', 'wild caterpie')
  const layers = (node: unknown, out: Node[] = []): Node[] => {
    if (typeof node !== 'object' || node === null) return out
    const n = node as Node
    if (n.type === 'Client' && /^aim\d*$/.test(n.props?.key ?? '')) out.push(n)
    else for (const child of Object.values(node)) layers(child, out)
    return out
  }
  // Waits for Caterpie (solid cyan) to show in a strip below the first.
  let hit: { key: string; x: number; y: number } | null = null
  for (let i = 0; i < 300 && !hit; i++) {
    await w.clock.advance(50)
    await band.redraw()
    for (const layer of layers(await band.drawn()).slice(1))
      for (const [y, runs] of (layer.props?.props?.lines ?? []).entries()) {
        let x = 0
        for (const [text, , bg] of runs) {
          if (!hit && text.startsWith(' ') && bg === '#00ffff') hit = { key: layer.props?.key ?? '', x, y }
          x += text.length
        }
      }
  }
  expect(hit).not.toBeNull()
  const { key, x, y } = hit as { key: string; x: number; y: number }
  await band.pointer({ type: 'down', x, y, button: 'left', in: key })
  for (let i = 0; i < 400 && !w.toasts.some(t => t.startsWith('Gotcha')); i++) await w.clock.advance(50)
  expect(w.toasts.some(t => t.startsWith('Gotcha'))).toBe(true)
})
