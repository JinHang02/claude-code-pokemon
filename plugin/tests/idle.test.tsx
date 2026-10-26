// An idle terminal: the band falls asleep and draws at its calm rate, whatever ran before, and each frame costs little.
import { expect, test } from 'claude-code/testing'

import { initialStatus, isAsleep, isCalm, newScene, SLEEP_TICKS, step } from '../hooks/scene'
import type { Status } from '../hooks/scene'
import { toCells } from '../hooks/sprite'
import type { Pixels } from '../hooks/sprite'
import { emptySave } from '../hooks/save'
import { begin, cmd, KIT, member, mountBand } from './world'

const BUBBLE = 0xf4f4f4
const decode = (cells: string) => [...new Uint32Array(Uint8Array.from(atob(cells), c => c.charCodeAt(0)).buffer)]

// The cells as they were packed before packing was made faster: the new packing must match them word for word.
function slowCells({ pixels, width, height }: Pixels): number[] {
  const CLEAR = -1
  const DEFAULT = 0x01000000
  const out: number[] = []
  for (let r = 0; r < Math.ceil(height / 2); r++)
    for (let x = 0; x < width; x++) {
      const top = pixels[2 * r * width + x] ?? CLEAR
      const bottom = 2 * r + 1 < height ? (pixels[(2 * r + 1) * width + x] ?? CLEAR) : CLEAR
      out.push(
        ...(top === CLEAR && bottom === CLEAR
          ? [0x20, DEFAULT, DEFAULT]
          : top === bottom
            ? [0x20, DEFAULT, top]
            : top === CLEAR
              ? [0x2584, bottom, DEFAULT]
              : [0x2580, top, bottom === CLEAR ? DEFAULT : bottom]),
      )
    }
  return out
}

test('cells are packed exactly as before, odd heights and clear pixels included', () => {
  for (const [width, height] of [
    [1, 1],
    [3, 5],
    [40, 18],
    [512, 19],
  ] as const) {
    const pick = [-1, 0x000000, 0x123456, 0xffffff]
    const pixels = Array.from({ length: width * height }, (_, i) => pick[(i * 7 + (i >> 3)) % pick.length] ?? -1)
    const img = { pixels, width, height }
    expect([width, height, decode(toCells(img).cells)]).toEqual([width, height, slowCells(img)])
  }
})

test('a Pokémon that fell asleep mid-skip lets the band draw at its calm rate', () => {
  const skipping = { ...newScene(10), roam: { kind: 'skip' as const, left: 5, age: 2 } }
  let s: Status = { ...initialStatus(), actors: [skipping], idleTicks: SLEEP_TICKS }
  for (let i = 0; i < 100; i++) s = step(s, 80, [8])
  expect([isAsleep(s), isCalm(s)]).toEqual([true, true])
})

test('a background subagent leaves the party free to fall asleep once everything is quiet', KIT, async ($, on) => {
  on('turn.start', async (_$, e) => ({ turnId: (e as { turnId: string }).turnId }))
  on('turn.complete', async () => ({ text: '' }))
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu', { next: [] })] })
  await cmd($, 'pokemon', 'party')
  const band = (await mountBand($)) as { drawn: () => Promise<unknown> }
  await band.drawn()
  await $.turn.start({ text: 'hi', turnId: 'm1' } as never)
  await $.turn.complete({ reason: 'answer', answer: 'ok', durationMs: 1, turnId: 'm1' } as never)
  await $.turn.start({ text: 'bg', turnId: 'a1', agentId: 'bg1' } as never)
  await $.turn.complete({ reason: 'answer', answer: 'ok', durationMs: 1, turnId: 'a1', agentId: 'bg1' } as never)
  for (let i = 0; i < 360; i++) await w.clock.advance(1000)
  const before = w.band.frames
  for (let i = 0; i < 60; i++) await w.clock.advance(1000)
  // No thought bubble, and at most the calm rate: 20 ticks a second, one in four drawn.
  expect(decode(w.band.cells).some((v, i) => i % 3 !== 0 && v === BUBBLE)).toBe(false)
  expect((w.band.frames - before) / 60).toBeLessThanOrEqual(5)
})

test('asleep, the band still draws its Zs at the calm rate and wakes for a turn within a tick', KIT, async ($, on) => {
  on('turn.start', async (_$, e) => ({ turnId: (e as { turnId: string }).turnId }))
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu', { next: [] })] })
  await cmd($, 'pokemon', 'party')
  const band = (await mountBand($)) as { drawn: () => Promise<unknown> }
  await band.drawn()
  for (let i = 0; i < 360; i++) await w.clock.advance(1000)
  const before = w.band.frames
  for (let i = 0; i < 20; i++) await w.clock.advance(1000)
  // Asleep: the Zs and the sky still move, at the calm rate.
  const asleep = (w.band.frames - before) / 20
  expect(asleep > 2 && asleep <= 5).toBe(true)
  await $.turn.start({ text: 'hi', turnId: 't1' } as never)
  await w.clock.advance(100)
  expect(decode(w.band.cells).some((v, i) => i % 3 !== 0 && v === BUBBLE)).toBe(true)
})
