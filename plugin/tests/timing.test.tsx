// Timing: commands answer at once however many evolutions wait, and periodic work never overlaps itself.
import { expect, test } from 'claude-code/testing'

import { ART, begin, LIST } from './world'

test(
  'two retries on a slow network after an offline start catch one first Pokémon only',
  { timeoutMs: 60_000 },
  async ($, on) => {
    const w = await begin($, on, undefined, ART, undefined, { isOnline: false, list: JSON.stringify(LIST) })
    await w.clock.advance(30_000)
    let release = () => {}
    w.net.stall = new Promise<void>(resolve => (release = resolve))
    w.net.isOnline = true
    // One retry starts a first catch, which waits on the stalled download; the next comes while it still waits.
    await w.clock.advance(10_000)
    await w.clock.advance(10_000)
    release()
    w.net.stall = undefined
    await w.clock.advance(2_000)
    expect(w.saveNow().party).toHaveLength(1)
    expect(w.saveNow().box ?? []).toEqual([])
    expect(Object.keys(w.saveNow().dex)).toHaveLength(1)
  },
)
