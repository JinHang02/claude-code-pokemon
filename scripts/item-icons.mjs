#!/usr/bin/env node
// Writes plugin/hooks/item-icons.ts: a picture of every item in plugin/hooks/items.ts, at most 12×12 pixels, from
// PokeAPI's item sprites, else Pokémon Showdown's item sheet, else a plain Bag. Run when items.ts changes:
//   node scripts/item-icons.mjs
import { readFile, writeFile } from 'node:fs/promises'
import { inflateSync } from 'node:zlib'

const POKEAPI = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items'
const SHOWDOWN = 'https://play.pokemonshowdown.com'
const SIZE = 12
const CELL = 24
const PER_ROW = 16
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

const crop = (img, x0, y0, w, h) => {
  const rgba = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++)
    rgba.set(img.rgba.subarray(((y0 + y) * img.width + x0) * 4, ((y0 + y) * img.width + x0 + w) * 4), y * w * 4)
  return { width: w, height: h, rgba }
}

const isSolid = (img, x, y) => img.rgba[(y * img.width + x) * 4 + 3] >= 128

// The image cut to its opaque pixels, or null when it has none.
function trim(img) {
  let [x0, y0, x1, y1] = [img.width, img.height, -1, -1]
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++)
      if (isSolid(img, x, y)) [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)]
  return x1 < 0 ? null : crop(img, x0, y0, x1 - x0 + 1, y1 - y0 + 1)
}

// Pixels (0xRRGGBB, CLEAR) scaled down to fit SIZE×SIZE: each one the average of the opaque pixels it covers, clear
// when fewer than half are opaque.
function toPixels(img) {
  const f = Math.min(1, SIZE / Math.max(img.width, img.height))
  const width = Math.max(1, Math.round(img.width * f))
  const height = Math.max(1, Math.round(img.height * f))
  const pixels = []
  for (let ty = 0; ty < height; ty++)
    for (let tx = 0; tx < width; tx++) {
      const [sx0, sx1] = [Math.floor((tx * img.width) / width), Math.ceil(((tx + 1) * img.width) / width)]
      const [sy0, sy1] = [Math.floor((ty * img.height) / height), Math.ceil(((ty + 1) * img.height) / height)]
      let [r, g, b, n, all] = [0, 0, 0, 0, 0]
      for (let y = sy0; y < sy1; y++)
        for (let x = sx0; x < sx1; x++) {
          all++
          if (!isSolid(img, x, y)) continue
          const i = (y * img.width + x) * 4
          ;[r, g, b, n] = [r + img.rgba[i], g + img.rgba[i + 1], b + img.rgba[i + 2], n + 1]
        }
      pixels.push(n * 2 < all ? CLEAR : (Math.round(r / n) << 16) | (Math.round(g / n) << 8) | Math.round(b / n))
    }
  return { width, height, pixels }
}

// The plain Bag for items neither source draws.
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
const items = (await get(`${SHOWDOWN}/data/items.js`))?.toString('utf8') ?? ''
const sheetPng = await get(`${SHOWDOWN}/sprites/itemicons-sheet.png`)
const sheet = sheetPng && decodePng(sheetPng)
const icons = {}
const from = { pokeapi: [], showdown: [], bag: [] }
for (const id of ids) {
  const png = await get(`${POKEAPI}/${id}.png`)
  let img = png && trim(decodePng(png))
  let source = 'pokeapi'
  if (!img && sheet) {
    const num = new RegExp(`[{,]${id.replace(/-/g, '')}:\\{name:"[^"]*",spritenum:(\\d+)`).exec(items)?.[1]
    if (num !== undefined) {
      const n = Number(num)
      img = trim(crop(sheet, (n % PER_ROW) * CELL, Math.floor(n / PER_ROW) * CELL, CELL, CELL))
      source = 'showdown'
    }
  }
  icons[id] = img ? toPixels(img) : BAG
  from[img ? source : 'bag'].push(id)
}
const body = Object.entries(icons)
  .map(([id, p]) => `  '${id}': { width: ${p.width}, height: ${p.height}, pixels: [${p.pixels.join(',')}] },`)
  .join('\n')
await writeFile(
  new URL('../plugin/hooks/item-icons.ts', import.meta.url),
  `// Generated by scripts/item-icons.mjs: don't edit by hand.\nimport type { Pixels } from './sprite'\n\n` +
    `export const ICONS: Record<string, Pixels> = {\n${body}\n}\n`,
)
for (const [source, list] of Object.entries(from)) console.log(`${source}: ${list.length} ${list.join(' ')}`)
