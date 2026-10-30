// The click layer draws the band as coloured text, and Claude Code unmounts a surface module whose tree passes 100,000
// characters: a busy sky (fog, rain) in a wide terminal must still fit, with every cell where a click expects it.
import { expect, test } from 'claude-code/testing'

import Aim from '../hooks/aim'
import { LANDSCAPES } from '../hooks/backdrop'
import type { Phase } from '../hooks/backdrop'
import { frame, initialStatus, newScene } from '../hooks/scene'
import type { Status } from '../hooks/scene'
import { runCost, TEXT_BUDGET, textRows } from '../hooks/sprite'
import type { Pixels, TextRun } from '../hooks/sprite'
import { WEATHERS } from '../hooks/weather'

const LIMIT = 100_000
const surface = { state: true, elements: { Box: 'Box', Text: 'Text' }, onPointer() {}, post() {}, setState() {} }
const tree = (lines: TextRun[][]) => JSON.stringify(Aim({ lines }, surface as never)).length
const widths = (lines: TextRun[][]) => lines.map(runs => runs.reduce((n, [text]) => n + text.length, 0))
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
  'every time, place and weather fits the click layer in a wide terminal, each line as wide as the band',
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
            const what = `${columns}x${rows} ${phase} ${landscape} ${weather}`
            expect([what, tree(lines) < LIMIT, JSON.stringify({ lines }).length < LIMIT]).toEqual([what, true, true])
            expect(widths(lines)).toEqual(Array(rows).fill(columns))
          }
  },
)

test('even pixels that all differ fit, the line widths kept', () => {
  let seed = 1
  const noise: Pixels = {
    width: 400,
    height: 60,
    pixels: Array.from({ length: 400 * 60 }, () => (seed = (seed * 1103515245 + 12345) & 0xffffff)),
  }
  const lines = textRows(noise)
  expect(tree(lines)).toBeLessThan(LIMIT)
  expect(widths(lines)).toEqual(Array(30).fill(400))
})

test('the estimate of a run never comes in under what the tree holds', () => {
  const lines = textRows(scene(120, 12, 'dawn', 'forest', 'fog'), Infinity)
  const runs = lines.flat()
  expect(runs.length).toBeGreaterThan(500)
  const estimate = lines.length * 34 + runs.reduce((n, r) => n + runCost(r), 0)
  expect(estimate).toBeGreaterThanOrEqual(tree(lines))
  expect(estimate).toBeGreaterThan(TEXT_BUDGET)
})

test('a scene that fits keeps its exact colours', () => {
  const img = scene(80, 8, 'day', 'meadow', 'clear')
  expect(textRows(img)).toEqual(textRows(img, Infinity))
})
