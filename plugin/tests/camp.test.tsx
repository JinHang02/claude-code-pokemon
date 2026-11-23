// The campfire of a long turn, in a file of its own: a fresh session's first wild visitor comes 10 minutes in and is
// long gone by the 19 minutes this needs, and the next can't come before 20. While a visitor can be aimed at, the
// band draws through its click layer and the cells read here wait, so a shared session's visitor could hide the fire.
import { expect, test } from 'claude-code/testing'

import { emptySave } from '../hooks/save'
import { begin, cmd, hourAt, LIST, member, mountBand } from './world'

const party = { ...emptySave(), party: [member('pikachu', { id: 'p', next: [] })] }
const noon = { isOnline: true, list: JSON.stringify(LIST), now: hourAt(12) }
// The flames' orange: their red is also the "!" a wild visitor brings.
const FLAME = 0xff8c1a
const decode = (cells: string) => [...new Uint32Array(Uint8Array.from(atob(cells), c => c.charCodeAt(0)).buffer)]

// Twenty minutes of ticks: longer than a usual session test.
test(
  'a turn past 10 minutes sets up camp until it ends; a shorter one does not',
  { timeoutMs: 90_000 },
  async ($, on) => {
    on('turn.start', async (_$, e) => ({ turnId: (e as { turnId: string }).turnId }))
    on('turn.complete', async () => ({ text: '' }))
    const w = await begin($, on, party, undefined, undefined, noon)
    await cmd($, 'pokemon', 'party')
    const band = (await mountBand($)) as { drawn: () => Promise<unknown> }
    await band.drawn()
    // Whether the fire is on the band, and frames still arriving: a failure says which one stopped.
    const seen = async (ms: number) => {
      const frames = w.band.frames
      await w.clock.advance(ms)
      return { lit: decode(w.band.cells).includes(FLAME), drawing: w.band.frames > frames }
    }
    await $.turn.start({ text: 'hi', turnId: 'm1' } as never)
    for (let i = 0; i < 8; i++) await w.clock.advance(60_000)
    expect(await seen(60_000)).toEqual({ lit: false, drawing: true })
    await $.turn.complete({ reason: 'answer', answer: 'ok', durationMs: 1, turnId: 'm1' } as never)
    await $.turn.start({ text: 'again', turnId: 'm2' } as never)
    for (let i = 0; i < 8; i++) await w.clock.advance(60_000)
    expect(await seen(60_000)).toEqual({ lit: false, drawing: true })
    expect(await seen(61_000)).toEqual({ lit: true, drawing: true })
    await $.turn.complete({ reason: 'answer', answer: 'ok', durationMs: 1, turnId: 'm2' } as never)
    expect(await seen(200)).toEqual({ lit: false, drawing: true })
  },
)
