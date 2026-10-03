export const CLEAR = -1
const DEFAULT = 0x01000000
const UPPER = 0x2580
const LOWER = 0x2584
const FULL = 0x2588

export type Pixels = { pixels: number[]; width: number; height: number }

// Truecolor ANSI half-block art (38;2 / 48;2 / 0) into a pixel grid, two pixels per cell.
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
        const end = line.indexOf('m', i)
        // An escape cut off before its `m` (a truncated file) ends the line.
        if (end < 0) break
        const codes = line
          .slice(i + 2, end)
          .split(';')
          .map(Number)
        const at = (k: number) => codes[k] ?? 0
        for (let k = 0; k < codes.length; k++) {
          if (at(k) === 0) fg = bg = CLEAR
          else if (at(k) === 39) fg = CLEAR
          else if (at(k) === 49) bg = CLEAR
          else if ((at(k) === 38 || at(k) === 48) && at(k + 1) === 2) {
            const rgb = (at(k + 2) << 16) | (at(k + 3) << 8) | at(k + 4)
            if (at(k) === 38) fg = rgb
            else bg = rgb
            k += 4
          }
        }
        i = end + 1
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

// Pixels into Raster cells: two pixels per cell as an upper half block over its background; a
// one-color cell is a bare background, so no glyph edge or terminal contrast fix touches it.
export function toCells({ pixels, width, height }: Pixels): { cells: string; columns: number; rows: number } {
  const rows = Math.ceil(height / 2)
  const words = new Uint32Array(width * rows * 3)
  for (let r = 0; r < rows; r++)
    for (let x = 0; x < width; x++) {
      const top = pixels[2 * r * width + x] ?? CLEAR
      const bottom = 2 * r + 1 < height ? (pixels[(2 * r + 1) * width + x] ?? CLEAR) : CLEAR
      const cell =
        top === CLEAR && bottom === CLEAR
          ? [0x20, DEFAULT, DEFAULT]
          : top === bottom
            ? [0x20, DEFAULT, top]
            : top === CLEAR
              ? [LOWER, bottom, DEFAULT]
              : [UPPER, top, bottom === CLEAR ? DEFAULT : bottom]
      words.set(cell, (r * width + x) * 3)
    }
  return { cells: toBase64(new Uint8Array(words.buffer)), columns: width, rows }
}

function toBase64(bytes: Uint8Array): string {
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
