// The PokéMart's keyboard once a click has given it the keys, and what it shows while commands change the Bag.
import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { martRows } from '../hooks/mart'
import type { MartProps } from '../hooks/mart'
import { emptySave } from '../hooks/save'
import { begin, cmd, member, mountBand } from './world'

type Band = {
  pointer: (e: { type: 'down'; x: number; y: number; button: 'left'; in?: string }) => Promise<void>
  key: (e: { key: string; in?: string; shift?: true; ctrl?: true; meta?: true }) => Promise<void>
  drawn: () => Promise<unknown>
  redraw: () => Promise<void>
}
// The Mart's props in the band as last drawn (no redraw forced), or null when it isn't there.
async function martNow(band: Band, isRedrawn = false): Promise<MartProps | null> {
  if (isRedrawn) await band.redraw()
  const find = (node: unknown): MartProps | null => {
    if (typeof node !== 'object' || node === null) return null
    const n = node as { type?: string; props?: { key?: string; props?: MartProps } }
    if (n.type === 'Client' && n.props?.key === 'mart') return n.props.props ?? null
    for (const child of Object.values(node)) {
      const found = find(child)
      if (found) return found
    }
    return null
  }
  return find(await band.drawn())
}
// What the plugin put in the prompt box, as Claude Code's own fill would take it; `isFilled` false: a dialog holds
// the box, and it takes nothing.
function promptBox(on: On, isFilled = true) {
  const box = { text: '' }
  on('prompt.fill', async (_$, e) => {
    if (!isFilled) return { isFilled: false, refusal: 'dialog' }
    box.text = e.mode === 'replace' ? e.text : box.text + e.text
    return { isFilled: true }
  })
  return box
}

test('an open Mart follows the ₽ another window earns, with no other change to the save', async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu', { id: 'p' })] })
  await cmd($, 'pokemon', 'party')
  const band = (await mountBand($)) as Band
  await cmd($, 'pokemon', 'mart')
  expect((await martNow(band, true))?.balance).toBe(3000)
  const before = w.band.invalidated
  w.store.set('xp:other', { at: Date.now(), xp: { p: 10 }, money: 500 })
  await w.clock.advance(10_500)
  expect(w.band.invalidated).toBeGreaterThan(before)
  expect((await martNow(band, true))?.balance).toBe(3500)
})

test('typing a command into the Mart closes it and puts what was typed in the prompt; nothing is bought', async ($, on) => {
  const box = promptBox(on)
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu')], earned: 30_000 })
  await cmd($, 'pokemon', 'party')
  const band = (await mountBand($)) as Band
  await cmd($, 'pokemon', 'mart')
  await band.redraw()
  // A buy by click, then the person goes back to typing a command, the way the live session did.
  await band.key({ key: 'return', in: 'mart' })
  expect(w.saveNow().bag).toEqual({ 'fire-stone': 1 })
  for (const key of [...'/pokemon party']) await band.key({ key, in: 'mart' })
  await band.key({ key: 'return', in: 'mart' })
  expect(await martNow(band, true)).toBeNull()
  expect(box.text).toBe('/pokemon party')
  expect(w.saveNow().bag).toEqual({ 'fire-stone': 1 })
  expect(w.saveNow().spent).toBe(3000)
})

// Live, a line typed in one go reached the Mart as one key holding all of it.
test('a line that arrives as one key, the way a fast typist or a paste sends it, goes to the prompt whole', async ($, on) => {
  const box = promptBox(on)
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu')], earned: 30_000 })
  await cmd($, 'pokemon', 'party')
  const band = (await mountBand($)) as Band
  await cmd($, 'pokemon', 'mart')
  await band.redraw()
  await band.key({ key: 'return', in: 'mart' })
  await band.key({ key: '/pokemon deposit eevee', in: 'mart' })
  await band.key({ key: 'return', in: 'mart' })
  expect(await martNow(band, true)).toBeNull()
  expect(box.text).toBe('/pokemon deposit eevee')
  expect(w.saveNow().bag).toEqual({ 'fire-stone': 1 })
})

test("a letter that isn't one of the Mart's keys closes it too, and goes to the prompt; its own keys stay its own", async ($, on) => {
  const box = promptBox(on)
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu')], earned: 30_000 })
  await cmd($, 'pokemon', 'party')
  const band = (await mountBand($)) as Band
  await cmd($, 'pokemon', 'mart')
  await band.redraw()
  await band.key({ key: 'down', in: 'mart' })
  await band.key({ key: '+', in: 'mart' })
  expect((await martNow(band, true))?.state).toEqual({ tab: 0, sel: 1, top: 0, qty: 2 })
  expect(box.text).toBe('')
  // A ctrl chord is no typing: it leaves the Mart open.
  await band.key({ key: 'a', ctrl: true, in: 'mart' })
  expect(await martNow(band, true)).not.toBeNull()
  await band.key({ key: 'F', shift: true, in: 'mart' })
  await band.key({ key: 'x', in: 'mart' })
  expect(await martNow(band, true)).toBeNull()
  // Once typing has begun, x is a letter of what is typed.
  expect(box.text).toBe('Fx')
  expect(w.saveNow().bag).toBeUndefined()
})

// The Mart open, the keys given to it by a click, and what the prompt receives.
async function martOpen(
  $: Parameters<typeof begin>[0] & Parameters<typeof cmd>[0] & Parameters<typeof mountBand>[0],
  on: On,
  isFilled = true,
) {
  const box = promptBox(on, isFilled)
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu')], earned: 30_000 })
  await cmd($, 'pokemon', 'party')
  const band = (await mountBand($)) as Band
  await cmd($, 'pokemon', 'mart')
  await band.redraw()
  return { w, band, box }
}

for (const line of ['xcode', '-v', '+1 to that', '= 2'])
  test(`a line that arrives as one key and starts with a Mart key goes to the prompt whole: "${line}"`, async ($, on) => {
    const { w, band, box } = await martOpen($, on)
    await band.key({ key: line, in: 'mart' })
    expect(await martNow(band, true)).toBeNull()
    expect(box.text).toBe(line)
    expect(w.saveNow().bag).toBeUndefined()
  })

test('a single x still closes the Mart, and a single - or + still sets how many', async ($, on) => {
  const { band, box } = await martOpen($, on)
  await band.key({ key: '+', in: 'mart' })
  await band.key({ key: '=', in: 'mart' })
  await band.key({ key: '-', in: 'mart' })
  expect((await martNow(band, true))?.state.qty).toBe(2)
  await band.key({ key: 'x', in: 'mart' })
  expect(await martNow(band, true)).toBeNull()
  expect(box.text).toBe('')
})

test('a capital X sent as x with shift held is typing, not a close; shifted letters after it stay capitals', async ($, on) => {
  const { band, box } = await martOpen($, on)
  await band.key({ key: 'x', shift: true, in: 'mart' })
  await band.key({ key: 'm', shift: true, in: 'mart' })
  await band.key({ key: 'l', in: 'mart' })
  expect(await martNow(band, true)).toBeNull()
  expect(box.text).toBe('XMl')
})

test("typing the prompt can't take (a dialog holds it) is not lost silently: a toast says what was typed", async ($, on) => {
  const { w, band, box } = await martOpen($, on, false)
  await band.key({ key: '/pokemon bag', in: 'mart' })
  expect(await martNow(band, true)).toBeNull()
  expect(box.text).toBe('')
  expect(w.toasts).toContain(`Pokémon: the prompt couldn't take what you typed in the Mart: "/pokemon bag"`)
})

test('Enter right after a buy asks before buying again: two Enters buy one; a third buys the next', async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu')], earned: 30_000 })
  await cmd($, 'pokemon', 'party')
  const band = (await mountBand($)) as Band
  await cmd($, 'pokemon', 'mart')
  await band.redraw()
  await band.key({ key: 'return', in: 'mart' })
  await band.key({ key: 'return', in: 'mart' })
  expect(w.saveNow().bag).toEqual({ 'fire-stone': 1 })
  expect(await martNow(band, true)).toMatchObject({
    message: 'Press Enter again to buy another Fire Stone.',
    isError: false,
  })
  await band.key({ key: 'return', in: 'mart' })
  expect(w.saveNow().bag).toEqual({ 'fire-stone': 2 })
  expect((await martNow(band, true))?.message).toBe('Bought a Fire Stone!')
  // Any move in between is deliberate: Enter then buys at once.
  await band.key({ key: 'down', in: 'mart' })
  await band.key({ key: 'return', in: 'mart' })
  expect(w.saveNow().bag).toEqual({ 'fire-stone': 2, 'water-stone': 1 })
  // A click on Buy always buys.
  const p = await martNow(band, true)
  const hit = p && martRows(p).hits.find(h => h.act === 'buy')
  await band.pointer({ type: 'down', x: hit!.x0, y: hit!.y, button: 'left', in: 'mart' })
  expect(w.saveNow().bag).toEqual({ 'fire-stone': 2, 'water-stone': 2 })
})

// Claude Code draws the Mart again only when the plugin says it changed (`ui.invalidate`); the test world counts
// those and draws on request, so each step checks both.
test('the Mart is redrawn with the Bag a release from the PC box, a take or a buy by command leaves', async ($, on) => {
  const w = await begin($, on, {
    ...emptySave(),
    party: [member('pikachu', { id: 'p' })],
    box: [
      member('eevee', { id: 'e', heldItem: 'fire-stone' }),
      member('charmander', { id: 'c', heldItem: 'fire-stone' }),
    ],
    earned: 30_000,
  })
  await cmd($, 'pokemon', 'party')
  const band = (await mountBand($)) as Band
  await cmd($, 'pokemon', 'mart')
  expect((await martNow(band, true))?.bag).toEqual({})
  const redrawn = async (command: string, said: string, bag: Record<string, number>) => {
    const before = w.band.invalidated
    expect(await cmd($, 'pokemon', command)).toContain(said)
    expect(w.band.invalidated).toBeGreaterThan(before)
    expect((await martNow(band, true))?.bag).toEqual(bag)
  }
  await redrawn('release eevee', 'Bye bye, Eevee', { 'fire-stone': 1 })
  await redrawn('take charmander', 'went back to your Bag', { 'fire-stone': 2 })
  await redrawn('buy water stone', 'Bought a Water Stone', { 'fire-stone': 2, 'water-stone': 1 })
  // Another session's change, at the next sync.
  w.store.set('save', { ...w.saveNow(), bag: { 'fire-stone': 2 } })
  const before = w.band.invalidated
  await w.clock.advance(10_500)
  expect(w.band.invalidated).toBeGreaterThan(before)
  expect((await martNow(band, true))?.bag).toEqual({ 'fire-stone': 2 })
})
