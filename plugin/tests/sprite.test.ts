import { expect, test } from 'claude-code/testing'

import { fit, mirror, parseAnsi, textRows, toCells } from '../hooks/sprite'

const ART = '  \x1b[38;2;255;0;0m\x1b[48;2;0;0;255m▀\x1b[0m\x1b[38;2;0;255;0m▄\n  \x1b[38;2;255;0;0m█\x1b[0m '
const decode = (cells: string) => [...new Uint32Array(Uint8Array.from(atob(cells), c => c.charCodeAt(0)).buffer)]

test('parses half blocks into trimmed pixels', () => {
  const img = parseAnsi(ART)
  expect(img.width).toBe(2)
  expect(img.height).toBe(4)
  expect(img.pixels).toEqual([0xff0000, -1, 0x0000ff, 0x00ff00, 0xff0000, -1, 0xff0000, -1])
})

test('encodes pixels back into raster cells', () => {
  const { cells, columns, rows } = toCells(parseAnsi(ART))
  expect([columns, rows]).toEqual([2, 2])
  expect(decode(cells).slice(0, 6)).toEqual([0x2580, 0xff0000, 0x0000ff, 0x2584, 0x00ff00, 0x01000000])
})

test('scales a sprite down just enough to fit, never up', () => {
  const sprite = { pixels: Array<number>(22 * 26).fill(0x123456), width: 22, height: 26 }
  expect(fit(sprite, 10)).toMatchObject({ width: 17, height: 20 })
  expect(fit(sprite, 13)).toBe(sprite)
  const outlined = { pixels: Array.from({ length: 64 }, (_, i) => (i % 8 === 0 ? 0 : 0xffffff)), width: 8, height: 8 }
  expect(fit(outlined, 3).pixels).toContain(0xffffff)
})

test('shrinks a sprite until it fits the row budget', () => {
  const tall = { pixels: Array<number>(40 * 40).fill(0x123456), width: 40, height: 40 }
  expect(fit(tall, 10)).toMatchObject({ width: 20, height: 20 })
  expect(fit(tall, 20).height).toBe(40)
})

test('draws a one-color cell as a bare background', () => {
  const { cells } = toCells({ pixels: [0x123456, 0x123456], width: 1, height: 2 })
  expect(decode(cells)).toEqual([0x20, 0x01000000, 0x123456])
})

test('mirrors a sprite left to right', () => {
  expect(mirror({ pixels: [1, 2, 3, 4], width: 2, height: 2 }).pixels).toEqual([2, 1, 4, 3])
})

test('a sprite cut off inside an escape code is drawn as far as it goes', () => {
  expect(parseAnsi('\x1b[38;2;255;0;0m▀▀\x1b[38;2;12;3').width).toBe(2)
})

test('draws pixels as coloured text: half blocks, a bare background for one colour, runs of the same look merged', () => {
  const img = {
    width: 4,
    height: 2,
    pixels: [0xff0000, 0xff0000, -1, 0x00ff00, 0xff0000, 0xff0000, 0x0000ff, 0x0000ff],
  }
  expect(textRows(img)).toEqual([
    [
      ['  ', '', '#ff0000'],
      ['▄', '#0000ff', ''],
      ['▀', '#00ff00', '#0000ff'],
    ],
  ])
  expect(textRows({ width: 2, height: 2, pixels: [-1, -1, -1, -1] })).toEqual([[['  ', '', '']]])
})
