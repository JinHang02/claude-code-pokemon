// The pictures of the party's smaller moments: a Pidgey flying a push off with a letter, the boulder a long test or
// build is pushed as, the boxes carried after an install and the "?!" of a merge conflict. `scene.ts` places them.
import { CLEAR } from './sprite'
import type { Pixels } from './sprite'

const PALETTE: Record<string, number> = {
  // Pidgey: dark and light brown, its tan breast, eye and beak.
  d: 0x6b4423,
  b: 0xb07a45,
  t: 0xf2dcae,
  k: 0x1a1a1a,
  y: 0xe8a03c,
  // The letter: paper, its fold and a red seal.
  w: 0xfaf6ea,
  e: 0xb9b3a3,
  r: 0xd23c3c,
  // The boulder: highlight, stone and shadow.
  h: 0xc4c4c4,
  m: 0x8f8f8f,
  s: 0x5a5a5a,
  // A cardboard box: its sides, its edges and the tape.
  c: 0xc89a5a,
  C: 0x8f6534,
  T: 0xeedcae,
  // The confused bubble: white, a purple "?" and a red "!".
  o: 0xf4f4f4,
  q: 0x7a4fd6,
  x: 0xe0352b,
}

const art = (rows: string[]): Pixels => ({
  width: rows[0]?.length ?? 0,
  height: rows.length,
  pixels: [...rows.join('')].map(ch => PALETTE[ch] ?? CLEAR),
})

// Flying right, wings up then down; the same height, so the letter it carries hangs still.
export const PIDGEY: [Pixels, Pixels] = [
  art(['...dd......', '...dbd.....', '....dbd.bb.', 'dd.tbbbbkby', '.dttttbbb..', '...........']),
  art(['...........', '........bb.', 'dd..bbbbkby', '.dttdbbbb..', '..ttdbd....', '....dd.....']),
]
export const LETTER = art(['wwwww', 'ewwwe', 'wewew', 'wwrww'])
export const BOULDER = art(['..mmmmm..', '.mhhmmmm.', 'mhhmmmmms', 'mhmmmsmms', 'mmmmmmmms', '.mmsmmms.', '..sssss..'])
export const BOX = art(['CCCCC', 'ccTcc', 'ccTcc', 'CCCCC'])
export const CONFUSED = art(['.ooooo.', 'oqqqoxo', 'oooqoxo', 'ooqqoxo', 'ooooooo', 'ooqooxo', '.ooooo.'])

// Twice the size, each pixel doubled: the boulder a tall Pokémon pushes.
const double = (img: Pixels): Pixels => ({
  width: img.width * 2,
  height: img.height * 2,
  pixels: Array.from({ length: img.width * img.height * 4 }, (_, i) => {
    const [x, y] = [i % (img.width * 2), Math.floor(i / (img.width * 2))]
    return img.pixels[(y >> 1) * img.width + (x >> 1)] ?? CLEAR
  }),
})
export const BIG_BOULDER = double(BOULDER)
