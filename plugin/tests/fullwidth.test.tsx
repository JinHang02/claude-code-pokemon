import { expect, test } from 'claude-code/testing'

import { emptySave } from '../hooks/save'
import { begin, cmd, LIST, lv, member, mountBand } from './world'
import type { Net } from './world'

const solid = (rgb: string, size: number, width = size) =>
  Array.from({ length: size }, () => `\x1b[38;2;${rgb}m\x1b[48;2;${rgb}m▀\x1b[0m`.repeat(width)).join('\n')
const TALL = solid('9;9;9', 12)
const BLOCK = solid('0;255;255', 8)
const net = (): Net => ({ isOnline: true, list: JSON.stringify(LIST), sprites: { caterpie: BLOCK } })

// An 80-column band: the party keeps to the left 67 columns, the ₽ label takes the last 13 while nobody is out.
const CORNER = 67
const PARTY = '#090909'
const WILD = '#00ffff'
const BALL = '#e3350d'

type Line = [string, string, string][]
type Aim = {
  pointer: (e: { type: 'down'; x: number; y: number; button: 'left' }) => Promise<void>
  drawn: () => Promise<unknown>
  redraw: () => Promise<void>
}
// The first Client with `key` in a render.
function find(node: unknown, key: string): { props: { props?: { lines?: Line[] } } } | null {
  if (typeof node !== 'object' || node === null) return null
  const n = node as { type?: string; props?: { key?: string } }
  if (n.type === 'Client' && n.props?.key === key) return node as never
  for (const child of Object.values(node)) {
    const found = find(child, key)
    if (found) return found
  }
  return null
}
// Every cell the click layer paints with `hex`, and whether the render shows the label.
async function look(aim: Aim, hex: string) {
  await aim.redraw()
  const drawn = await aim.drawn()
  const cells: { x: number; y: number }[] = []
  for (const [y, runs] of (find(drawn, 'aim')?.props.props?.lines ?? []).entries()) {
    let x = 0
    for (const [text, fg, bg] of runs) {
      for (let i = 0; i < text.length; i++) if (fg === hex || bg === hex) cells.push({ x: x + i, y })
      x += text.length
    }
  }
  return { cells, hasShop: JSON.stringify(drawn).includes('"shop"') }
}

test(
  'a wild Pokémon may walk into the ₽ label corner, the party never does, and the label is back only once it is gone',
  { timeoutMs: 120_000 },
  async ($, on) => {
    const w = await begin(
      $,
      on,
      { ...emptySave(), party: [member('pikachu', { next: [lv('raichu', 30)] })] },
      TALL,
      undefined,
      net(),
    )
    await cmd($, 'pokemon', 'party')
    const aim = (await mountBand($ as never)) as Aim
    await cmd($, 'pokemon-play', 'day')
    await cmd($, 'pokemon-play', 'wild caterpie')
    let reached: { x: number; y: number } | null = null
    let partyInCorner = false
    let shopWhileOut = false
    for (let i = 0; i < 1500 && !reached; i++) {
      await w.clock.advance(50)
      const wild = await look(aim, WILD)
      if (wild.cells.length) shopWhileOut ||= wild.hasShop
      partyInCorner ||= (await look(aim, PARTY)).cells.some(c => c.x >= CORNER)
      reached = wild.cells.find(c => c.x >= CORNER + 2) ?? null
    }
    expect(reached).not.toBeNull()
    expect(partyInCorner).toBe(false)
    expect(shopWhileOut).toBe(false)
    // A click on it there is a hit: the ball catches it (Caterpie's rate is 255).
    await aim.pointer({ type: 'down', ...(reached as { x: number; y: number }), button: 'left' })
    for (let i = 0; i < 400 && !w.toasts.some(t => t.startsWith('Gotcha')); i++) await w.clock.advance(50)
    expect(w.toasts.some(t => t.startsWith('Gotcha'))).toBe(true)
    // The label returns only once nothing of the visitor or the ball is drawn.
    let back = false
    for (let i = 0; i < 200 && !back; i++) {
      await w.clock.advance(50)
      const wild = await look(aim, WILD)
      const ball = await look(aim, BALL)
      if (wild.hasShop) {
        back = true
        expect(wild.cells).toEqual([])
        expect(ball.cells).toEqual([])
      }
    }
    expect(back).toBe(true)
  },
)
