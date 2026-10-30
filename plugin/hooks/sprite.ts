export const CLEAR = -1
const DEFAULT = 0x01000000
const UPPER = 0x2580
const LOWER = 0x2584
const FULL = 0x2588

export type Pixels = { pixels: number[]; width: number; height: number }

// Truecolor ANSI half-block art (38;2 / 48;2 / 0) into a pixel grid, two pixels per cell.
const CSI = /\x1b\[([0-9;:?]*)([@-~])/y

// A 256-colour code as RGB: the 16 system colours, the 6×6×6 cube, then the greys.
const SYSTEM = [
  0x000000, 0x800000, 0x008000, 0x808000, 0x000080, 0x800080, 0x008080, 0xc0c0c0, 0x808080, 0xff0000, 0x00ff00,
  0xffff00, 0x0000ff, 0xff00ff, 0x00ffff, 0xffffff,
]
function xterm(n: number): number {
  if (n < 16) return SYSTEM[n] ?? 0
  if (n < 232) {
    const level = (v: number) => (v ? 55 + v * 40 : 0)
    const c = n - 16
    return (level(Math.floor(c / 36)) << 16) | (level(Math.floor(c / 6) % 6) << 8) | level(c % 6)
  }
  const g = 8 + (n - 232) * 10
  return (g << 16) | (g << 8) | g
}

export function parseAnsi(art: string): Pixels {
  const lines = art.replace(/\s+$/, '').split(/\r?\n/)
  const rows: number[][] = []
  for (const line of lines) {
    const top: number[] = []
    const bottom: number[] = []
    let fg = CLEAR
    let bg = CLEAR
    for (let i = 0; i < line.length;) {
      if (line[i] === '\x1b') {
        // A CSI sequence runs to its final byte (`@` to `~`); only an `m` one sets colours. Cut off before its end (a
        // truncated file), it ends the line.
        CSI.lastIndex = i
        const csi = CSI.exec(line)
        if (!csi) {
          if (line[i + 1] === '[') break
          i += 2
          continue
        }
        i = CSI.lastIndex
        if (csi[2] !== 'm') continue
        const codes = (csi[1] ?? '').split(/[;:]/).map(Number)
        const at = (k: number) => codes[k] ?? 0
        for (let k = 0; k < codes.length; k++) {
          if (at(k) === 0) fg = bg = CLEAR
          else if (at(k) === 39) fg = CLEAR
          else if (at(k) === 49) bg = CLEAR
          else if ((at(k) === 38 || at(k) === 48) && (at(k + 1) === 2 || at(k + 1) === 5)) {
            const rgb = at(k + 1) === 2 ? (at(k + 2) << 16) | (at(k + 3) << 8) | at(k + 4) : xterm(at(k + 2))
            if (at(k) === 38) fg = rgb
            else bg = rgb
            k += at(k + 1) === 2 ? 4 : 2
          }
        }
        continue
      }
      const cp = line.codePointAt(i) ?? 0x20
      i += cp > 0xffff ? 2 : 1
      if (cp === UPPER) (top.push(fg), bottom.push(bg))
      else if (cp === LOWER) (top.push(bg), bottom.push(fg))
      else if (cp === FULL) (top.push(fg), bottom.push(fg))
      else (top.push(bg), bottom.push(bg))
    }
    rows.push(top, bottom)
  }
  const width = Math.max(1, ...rows.map(r => r.length))
  const pixels = rows.flatMap(r => [...r, ...Array<number>(width - r.length).fill(CLEAR)])
  return trim({ pixels, width, height: rows.length })
}

export function trim({ pixels, width, height }: Pixels): Pixels {
  const at = (x: number, y: number) => pixels[y * width + x] ?? CLEAR
  let [x0, y0, x1, y1] = [width, height, -1, -1]
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (at(x, y) !== CLEAR) [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)]
  if (x1 < 0) return { pixels: [CLEAR], width: 1, height: 1 }
  const out: number[] = []
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push(at(x, y))
  return { pixels: out, width: x1 - x0 + 1, height: y1 - y0 + 1 }
}

// Scales by `f` (at most 1): each output pixel takes the most common opaque color of the block it
// covers, or stays clear when that block is mostly empty.
export function resample(img: Pixels, f: number): Pixels {
  if (f >= 1) return img
  const width = Math.max(1, Math.round(img.width * f))
  const height = Math.max(1, Math.round(img.height * f))
  const span = (i: number, size: number, total: number) => {
    const from = Math.floor((i * total) / size)
    return [from, Math.max(from + 1, Math.floor(((i + 1) * total) / size))] as const
  }
  const pixels: number[] = []
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const [x0, x1] = span(x, width, img.width)
      const [y0, y1] = span(y, height, img.height)
      const seen = new Map<number, number>()
      for (let py = y0; py < y1; py++)
        for (let px = x0; px < x1; px++) {
          const c = img.pixels[py * img.width + px] ?? CLEAR
          if (c !== CLEAR) seen.set(c, (seen.get(c) ?? 0) + 1)
        }
      const opaque = [...seen.values()].reduce((a, b) => a + b, 0)
      const best = [...seen].sort((a, b) => b[1] - a[1])[0]
      pixels.push(best && opaque * 2 >= (x1 - x0) * (y1 - y0) ? best[0] : CLEAR)
    }
  return trim({ pixels, width, height })
}

export const shrink = (img: Pixels, s: number): Pixels => resample(img, 1 / s)

// Text laid over a picture's cells as real characters, from column `x` of cell row `y`.
export type Label = { x: number; y: number; text: string; fg: number; bg: number }

// A Raster cell takes one printable character a single column wide; anything else (a wide or combining character,
// one outside the BMP) shows as '?' rather than having the whole picture refused.
const isNarrow = (cp: number) =>
  cp >= 0x20 &&
  cp <= 0xffff &&
  !(cp >= 0x7f && cp < 0xa0) &&
  !(cp >= 0x300 && cp < 0x370) &&
  !(cp >= 0x1100 && cp < 0x1160) &&
  !(cp >= 0x2e80 && cp < 0xa4d0) &&
  !(cp >= 0xac00 && cp < 0xd7a4) &&
  !(cp >= 0xd800 && cp < 0xe000) &&
  !(cp >= 0xf900 && cp < 0xfb00) &&
  !(cp >= 0xfe00 && cp < 0xfe70) &&
  !(cp >= 0xff00 && cp < 0xff61) &&
  !(cp >= 0xffe0 && cp < 0xffe7)

// Pixels into Raster cells: two pixels per cell as an upper half block over its background; a
// one-color cell is a bare background, so no glyph edge or terminal contrast fix touches it. `labels` are drawn over
// the picture as text, cut at its right edge.
export function toCells(
  { pixels, width, height }: Pixels,
  labels: Label[] = [],
): { cells: string; columns: number; rows: number } {
  const rows = Math.ceil(height / 2)
  const words = new Uint32Array(width * rows * 3)
  // Written in place, three words a cell: this runs for every frame drawn, up to 20 a second.
  let at = 0
  for (let r = 0; r < rows; r++) {
    const topRow = 2 * r * width
    const hasBottom = 2 * r + 1 < height
    for (let x = 0; x < width; x++, at += 3) {
      const top = pixels[topRow + x] ?? CLEAR
      const bottom = hasBottom ? (pixels[topRow + width + x] ?? CLEAR) : CLEAR
      if (top === bottom) {
        words[at] = 0x20
        words[at + 1] = DEFAULT
        words[at + 2] = top === CLEAR ? DEFAULT : top
      } else if (top === CLEAR) {
        words[at] = LOWER
        words[at + 1] = bottom
        words[at + 2] = DEFAULT
      } else {
        words[at] = UPPER
        words[at + 1] = top
        words[at + 2] = bottom === CLEAR ? DEFAULT : bottom
      }
    }
  }
  for (const { x, y, text, fg, bg } of labels) {
    if (y < 0 || y >= rows) continue
    let at = x
    for (const ch of text) {
      if (at >= width) break
      const cp = ch.codePointAt(0) ?? 0x3f
      if (at >= 0) words.set([isNarrow(cp) ? cp : 0x3f, fg, bg], (y * width + at) * 3)
      at++
    }
  }
  return { cells: toBase64(new Uint8Array(words.buffer)), columns: width, rows }
}

// Pixels as coloured text, one line per two pixel rows: runs of [text, fg, bg], '' for the terminal's own colour.
export type TextRun = [string, string, string]

export function textRows({ pixels, width, height }: Pixels): TextRun[][] {
  const hex = (c: number) => (c === CLEAR ? '' : `#${c.toString(16).padStart(6, '0')}`)
  const lines: TextRun[][] = []
  for (let r = 0; r < Math.ceil(height / 2); r++) {
    const runs: TextRun[] = []
    for (let x = 0; x < width; x++) {
      const top = pixels[2 * r * width + x] ?? CLEAR
      const bottom = 2 * r + 1 < height ? (pixels[(2 * r + 1) * width + x] ?? CLEAR) : CLEAR
      const cell: TextRun =
        top === bottom ? [' ', '', hex(top)] : top === CLEAR ? ['▄', hex(bottom), ''] : ['▀', hex(top), hex(bottom)]
      const last = runs[runs.length - 1]
      if (last && last[0].endsWith(cell[0]) && last[1] === cell[1] && last[2] === cell[2]) last[0] += cell[0]
      else runs.push(cell)
    }
    lines.push(runs)
  }
  return lines
}

// What one run adds to a click layer's tree once serialized, and one line around its runs: Claude Code unmounts a
// surface module whose tree passes 100,000 characters.
export const runCost = ([text, fg, bg]: TextRun) =>
  34 + text.length + (fg || bg ? 11 : 0) + (fg ? 17 : 0) + (bg ? 27 : 0) + (fg && bg ? 1 : 0)
const LINE_COST = 34
// What one click layer is given at most, well under that limit.
export const STRIP_BUDGET = 80_000

// The lines cut into strips of whole lines, each within `budget`, top to bottom: a band too wide and busy for one
// click layer (fog or rain across a wide terminal) is drawn by several stacked, every cell as it is.
export function strips(lines: TextRun[][], budget = STRIP_BUDGET): { top: number; lines: TextRun[][] }[] {
  const out: { top: number; lines: TextRun[][] }[] = []
  let cost = 0
  lines.forEach((runs, y) => {
    const line = LINE_COST + runs.reduce((n, r) => n + runCost(r), 0)
    const last = out[out.length - 1]
    if (last && cost + line <= budget) last.lines.push(runs)
    else {
      out.push({ top: y, lines: [runs] })
      cost = 0
    }
    cost += line
  })
  return out
}

// The platform's own encoder where there is one (about thirty times faster on a band's 60 KB), else by hand.
function toBase64(bytes: Uint8Array): string {
  const native = (bytes as Uint8Array & { toBase64?: () => string }).toBase64
  if (typeof native === 'function') return native.call(bytes)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

// The sprite scaled down just enough for its height to fit in `maxRows`.
export function fit(img: Pixels, maxRows: number): Pixels {
  return resample(img, (maxRows * 2) / img.height)
}

export function mirror({ pixels, width, height }: Pixels): Pixels {
  const out: number[] = []
  for (let y = 0; y < height; y++) out.push(...pixels.slice(y * width, (y + 1) * width).reverse())
  return { pixels: out, width, height }
}
