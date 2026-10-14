#!/usr/bin/env node
// Writes plugin/hooks/item-icons.ts: a picture of every item in plugin/hooks/items.ts, at most 14×14 pixels, from
// PokeAPI's item sprites, else the sprite named in OTHER, else a plain Bag (which a test then refuses). Run when
// items.ts changes:
//   node scripts/item-icons.mjs
import { readFile, writeFile } from 'node:fs/promises'
import { inflateSync } from 'node:zlib'

const POKEAPI = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items'
// Items PokeAPI has no sprite for. PokéSprite (MIT; https://github.com/msikma/pokesprite) draws the Galar ones;
// PokeRogue's assets (https://github.com/pagefaultgames/pokerogue-assets) the rest, which no other pixel-art set has:
// Bulbapedia's and Serebii's are scaled 3D renders. Both pinned to a commit.
const POKESPRITE = 'https://raw.githubusercontent.com/msikma/pokesprite/c5aaa610ff2acdf7fd8e2dccd181bca8be9fcb3e/items'
const POKEROGUE =
  'https://raw.githubusercontent.com/pagefaultgames/pokerogue-assets/325c7de68e6c323e12243271ea510c6b0e1b992e/images/items'
const OTHER = {
  'strawberry-sweet': `${POKESPRITE}/evo-item/strawberry-sweet.png`,
  'tart-apple': `${POKESPRITE}/evo-item/tart-apple.png`,
  'sweet-apple': `${POKESPRITE}/evo-item/sweet-apple.png`,
  'cracked-pot': `${POKESPRITE}/evo-item/cracked-pot.png`,
  'chipped-pot': `${POKESPRITE}/evo-item/chipped-pot.png`,
  'galarica-cuff': `${POKESPRITE}/evo-item/galarica-cuff.png`,
  'galarica-wreath': `${POKESPRITE}/evo-item/galarica-wreath.png`,
  'linking-cord': `${POKEROGUE}/linking_cord.png`,
  'black-augurite': `${POKEROGUE}/black_augurite.png`,
  'peat-block': `${POKEROGUE}/peat_block.png`,
  'scroll-of-darkness': `${POKEROGUE}/scroll_of_darkness.png`,
  'scroll-of-waters': `${POKEROGUE}/scroll_of_waters.png`,
}
const SIZE = 14
const CLEAR = -1
const deadline = Date.now() + 5 * 60_000

async function get(url) {
  if (Date.now() > deadline) throw new Error('took longer than 5 minutes')
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  return res.ok ? Buffer.from(await res.arrayBuffer()) : null
}

// A PNG as { width, height, rgba }: not interlaced; 8-bit truecolour (2, with or without a clear colour) or truecolour
// + alpha (6), or a palette (3) of 1, 2, 4 or 8 bits a pixel.
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG')
  let width = 0
  let height = 0
  let type = 0
  let depth = 8
  let palette = null
  let alpha = null
  const idat = []
  for (let at = 8; at < buf.length;) {
    const len = buf.readUInt32BE(at)
    const kind = buf.toString('latin1', at + 4, at + 8)
    const data = buf.subarray(at + 8, at + 8 + len)
    if (kind === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      depth = data[8]
      type = data[9]
      const isOk = type === 3 ? [1, 2, 4, 8].includes(depth) : depth === 8 && [2, 6].includes(type)
      if (!isOk || data[12] !== 0)
        throw new Error(`unsupported PNG: depth ${data[8]}, colour type ${type}, interlace ${data[12]}`)
    } else if (kind === 'PLTE') palette = data
    else if (kind === 'tRNS') alpha = data
    else if (kind === 'IDAT') idat.push(data)
    else if (kind === 'IEND') break
    at += 12 + len
  }
  // Bytes a pixel (at least 1, as the filters count them), and bytes a row.
  const bpp = { 2: 3, 3: 1, 6: 4 }[type]
  const raw = inflateSync(Buffer.concat(idat))
  const stride = type === 3 ? Math.ceil((width * depth) / 8) : width * bpp
  const out = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0
      const b = y ? out[(y - 1) * stride + x] : 0
      const c = x >= bpp && y ? out[(y - 1) * stride + x - bpp] : 0
      const p = a + b - c
      const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)]
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      out[y * stride + x] = (line[x] + [0, a, b, (a + b) >> 1, paeth][filter]) & 0xff
    }
  }
  const rgba = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    if (type === 3) {
      // Palette indexes packed several to a byte, the leftmost pixel in the high bits.
      const [y, x] = [Math.floor(i / width), i % width]
      const bit = x * depth
      const k = (out[y * stride + (bit >> 3)] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1)
      rgba.set(
        [palette[k * 3], palette[k * 3 + 1], palette[k * 3 + 2], alpha && k < alpha.length ? alpha[k] : 255],
        i * 4,
      )
    } else if (type === 2) {
      // tRNS here is the one colour that is clear: red, green and blue as 16-bit numbers.
      const [r, g, b] = [out[i * 3], out[i * 3 + 1], out[i * 3 + 2]]
      const isKey = alpha && alpha.readUInt16BE(0) === r && alpha.readUInt16BE(2) === g && alpha.readUInt16BE(4) === b
      rgba.set([r, g, b, isKey ? 0 : 255], i * 4)
    } else rgba.set(out.subarray(i * 4, i * 4 + 4), i * 4)
  }
  return { width, height, rgba }
}

// The opaque part of the image as pixels (0xRRGGBB, CLEAR), or null when it has none.
function trim(img) {
  const isSolid = (x, y) => img.rgba[(y * img.width + x) * 4 + 3] >= 128
  let [x0, y0, x1, y1] = [img.width, img.height, -1, -1]
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++)
      if (isSolid(x, y)) [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)]
  if (x1 < 0) return null
  const pixels = []
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const i = (y * img.width + x) * 4
      pixels.push(isSolid(x, y) ? (img.rgba[i] << 16) | (img.rgba[i + 1] << 8) | img.rgba[i + 2] : CLEAR)
    }
  return { width: x1 - x0 + 1, height: y1 - y0 + 1, pixels }
}

const rgb = c => [(c >> 16) & 255, (c >> 8) & 255, c & 255]
const luma = c => {
  const [r, g, b] = rgb(c)
  return 0.299 * r + 0.587 * g + 0.114 * b
}
const distance = (a, b) => rgb(a).reduce((sum, v, i) => sum + (v - rgb(b)[i]) ** 2, 0)
const SIDES = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

// Pixel art shrunk to fit SIZE×SIZE without blurring it. Each target pixel covers a block of source pixels (2×2 at
// exactly half size, else 1 or 2 a side) and takes the block's most common colour, ties going to the colour nearest
// the block's average, so no new in-between colour appears. A block is clear when less than half of it is opaque.
// Along the picture's edge, a block that holds some of the source's outline takes its darkest outline pixel, so the
// outline stays whole on the Mart's pale paper.
function shrink(img) {
  const f = Math.min(1, SIZE / Math.max(img.width, img.height))
  const width = Math.max(1, Math.round(img.width * f))
  const height = Math.max(1, Math.round(img.height * f))
  const at = (x, y) => (x >= 0 && y >= 0 && x < img.width && y < img.height ? img.pixels[y * img.width + x] : CLEAR)
  const isOutline = (x, y) => at(x, y) !== CLEAR && SIDES.some(([dx, dy]) => at(x + dx, y + dy) === CLEAR)
  // Source columns (or rows) [from, to) for each target one, the shorter side centred in blocks as big as the longer's.
  const k = Math.max(img.width / width, img.height / height)
  const spans = (n, t) => {
    const pad = Math.round(t * k) - n
    const edge = i => Math.round((i * (n + pad)) / t) - Math.floor(pad / 2)
    return Array.from({ length: t }, (_, i) => [edge(i), edge(i + 1)])
  }
  const [xs, ys] = [spans(img.width, width), spans(img.height, height)]
  const blocks = []
  for (const [y0, y1] of ys)
    for (const [x0, x1] of xs) {
      const colors = []
      const outline = []
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          if (at(x, y) === CLEAR) continue
          colors.push(at(x, y))
          if (isOutline(x, y)) outline.push(at(x, y))
        }
      blocks.push({ colors, outline, isSolid: colors.length > 0 && colors.length * 2 >= (x1 - x0) * (y1 - y0) })
    }
  const isSolid = (x, y) => x >= 0 && y >= 0 && x < width && y < height && blocks[y * width + x].isSolid
  const pixels = blocks.map(({ colors, outline, isSolid: solid }, i) => {
    if (!solid) return CLEAR
    const [x, y] = [i % width, Math.floor(i / width)]
    if (outline.length && SIDES.some(([dx, dy]) => !isSolid(x + dx, y + dy)))
      return outline.reduce((a, c) => (luma(c) < luma(a) ? c : a))
    const counts = new Map()
    for (const c of colors) counts.set(c, (counts.get(c) ?? 0) + 1)
    const most = Math.max(...counts.values())
    const sum = colors.map(rgb).reduce((a, c) => a.map((v, j) => v + c[j]), [0, 0, 0])
    const [r, g, b] = sum.map(v => Math.round(v / colors.length))
    const average = (r << 16) | (g << 8) | b
    return [...counts]
      .filter(([, n]) => n === most)
      .map(([c]) => c)
      .reduce((a, c) => (distance(c, average) < distance(a, average) ? c : a))
  })
  return { width, height, pixels }
}

// The plain Bag for an item no source draws (a test fails on it).
const BAG_ART = [
  '...dddd...',
  '..d....d..',
  '.bbbbbbbb.',
  'bbbyyyybbb',
  'bbbbyybbbb',
  'bbbbbbbbbb',
  'bbbbbbbbbb',
  'bbbbbbbbbb',
  '.bbbbbbbb.',
]
const BAG_COLORS = { b: 0x9a6b3f, d: 0x5a3a1f, y: 0xf0c040 }
const BAG = {
  width: BAG_ART[0].length,
  height: BAG_ART.length,
  pixels: BAG_ART.join('')
    .split('')
    .map(c => BAG_COLORS[c] ?? CLEAR),
}

const ids = [
  ...(await readFile(new URL('../plugin/hooks/items.ts', import.meta.url), 'utf8')).matchAll(/id: '([a-z-]+)'/g),
].map(m => m[1])
const icons = []
const bagged = []
for (const id of ids) {
  const url = OTHER[id] ?? `${POKEAPI}/${id}.png`
  const png = await get(url)
  const img = png && trim(decodePng(png))
  if (!img) bagged.push(id)
  icons.push({ id, url: img ? url : 'none: the plain Bag', ...(img ? shrink(img) : BAG) })
}
const line = p => `{ width: ${p.width}, height: ${p.height}, pixels: [${p.pixels.join(',')}] }`
const body = icons.map(({ id, url, ...p }) => `  // ${url}\n  '${id}': ${line(p)},`).join('\n')
await writeFile(
  new URL('../plugin/hooks/item-icons.ts', import.meta.url),
  `// Generated by scripts/item-icons.mjs: don't edit by hand.\nimport type { Pixels } from './sprite'\n\n` +
    `// The picture for an item no source draws.\nexport const BAG: Pixels = ${line(BAG)}\n\n` +
    `export const ICONS: Record<string, Pixels> = {\n${body}\n}\n`,
)
console.log(
  `${ids.length - bagged.length} drawn, ${bagged.length} the plain Bag${bagged.length ? `: ${bagged.join(' ')}` : ''}`,
)
