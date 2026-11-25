// Ferry tickets in the band's PokéMart and by `/pokemon buy <region> ticket`: what the Tickets tab shows, what a buy
// spends and refuses, offline, and two windows buying or watching.
import { expect, test } from 'claude-code/testing'

import { martRows } from '../hooks/mart'
import type { MartItem, MartProps } from '../hooks/mart'
import { buyTicket } from '../hooks/journey'
import { TRAVEL_REGIONS, speciesIn } from '../hooks/travel-regions'
import type { Journey, TravelRegion } from '../hooks/travel-regions'
import { emptySave, loadSave, STARTING_MONEY } from '../hooks/save'
import type { DexEntry, Save } from '../hooks/save'
import { ART, begin, cmd, KIT, LIST, member, mountBand } from './world'
import type { Net } from './world'

type Band = {
  pointer: (e: { type: 'down'; x: number; y: number; button: 'left'; in?: string }) => Promise<void>
  key: (e: { key: string; in?: string }) => Promise<void>
  post: (data: unknown, scope?: { in?: string }) => Promise<void>
  drawn: () => Promise<unknown>
  redraw: () => Promise<void>
}

const TICKETS_TAB = 4
const JOHTO_TICKET_INDEX = 1
const GALAR_TICKET_INDEX = TRAVEL_REGIONS.length - 1
const KANTO = TRAVEL_REGIONS[0]!
const JOHTO: TravelRegion = TRAVEL_REGIONS[1]!
const JOHTO_OWNED: Journey = { current: 'kanto', tickets: ['johto'], starters: {} }

// The first `n` Kanto species seen once.
const kantoSeen = (n: number): Record<string, DexEntry> =>
  Object.fromEntries(
    speciesIn(KANTO)
      .slice(0, n)
      .map(s => [s, { seen: 1, shiny: 0, first: 0 }]),
  )
// A player with `money` in the wallet and `seen` Kanto species in the Pokédex.
const player = (money: number, seen = 95, extra: Partial<Save> = {}): Save => ({
  ...emptySave(),
  party: [member('pikachu', { next: [] })],
  dex: kantoSeen(seen),
  earned: money - STARTING_MONEY,
  ...extra,
})

// The node tree's first `Client` keyed `key`, or null.
function findClient(node: unknown, key: string): { props?: unknown } | null {
  if (typeof node !== 'object' || node === null) return null
  const n = node as { type?: string; props?: { key?: string; props?: unknown } }
  if (n.type === 'Client' && n.props?.key === key) return n.props
  for (const child of Object.values(node)) {
    const found = findClient(child, key)
    if (found) return found
  }
  return null
}
async function martOf(band: Band): Promise<MartProps | null> {
  await band.redraw()
  return (findClient(await band.drawn(), 'mart')?.props as MartProps | undefined) ?? null
}
async function clickMart(band: Band, act: unknown) {
  const p = await martOf(band)
  const hit = p && martRows(p).hits.find(h => JSON.stringify(h.act) === JSON.stringify(act))
  if (!hit) throw new Error(`no ${JSON.stringify(act)} in the Mart`)
  await band.pointer({ type: 'down', x: hit.x0, y: hit.y, button: 'left', in: 'mart' })
}
// The band with the Mart open on its Tickets tab, the Johto ticket selected.
async function ticketsTab($: Parameters<typeof cmd>[0] & Parameters<typeof mountBand>[0]): Promise<Band> {
  await cmd($, 'pokemon', 'party')
  const band = (await mountBand($)) as Band
  expect(await cmd($, 'pokemon', 'mart')).toContain('The PokéMart is open')
  await clickMart(band, { tab: TICKETS_TAB })
  await clickMart(band, { pick: JOHTO_TICKET_INDEX })
  return band
}
const tickets = (p: MartProps | null): MartItem[] => (p?.items ?? []).filter(i => i.tab === 'Tickets')
const stateOf = (p: MartProps | null, id: string) => tickets(p).find(i => i.id === `ticket-${id}`)?.ticket?.state
const purchaseState = (s: Save) => ({ spent: s.spent, earned: s.earned, bag: s.bag, journey: s.journey })

test(
  'the band Mart has a Tickets tab of Kanto to Galar, Kanto owned, with their states and the ticket picture',
  KIT,
  async ($, on) => {
    await begin($, on, player(160_000))
    const band = await ticketsTab($)
    const p = await martOf(band)
    expect(p?.tabs[TICKETS_TAB]).toBe('Tickets')
    expect(p?.state.tab).toBe(TICKETS_TAB)
    expect(tickets(p).map(i => i.name)).toEqual(TRAVEL_REGIONS.map(r => `${r.name} ferry ticket`))
    expect(tickets(p).map(i => i.ticket?.state)).toEqual(['owned', 'buyable', ...Array(6).fill('unavailable')])
    expect(tickets(p).map(i => i.ticket?.hint)).toEqual(TRAVEL_REGIONS.map(r => `/pokemon travel ${r.id}`))
    expect(p?.region).toEqual({ text: 'KANTO', color: KANTO.color })
    expect(p?.icon?.length).toBeGreaterThan(0)
  },
)

test(
  "the pill's tickets act opens the Mart on the Tickets tab; any other open act opens nothing",
  KIT,
  async ($, on) => {
    await begin($, on, player(160_000))
    await cmd($, 'pokemon', 'party')
    const band = (await mountBand($)) as Band
    for (const open of ['Tickets', 'stones', 4, null]) {
      await band.post({ open }, { in: 'shop' })
      expect(await martOf(band)).toBeNull()
    }
    await band.post({ open: 'tickets' }, { in: 'shop' })
    expect((await martOf(band))?.state).toEqual({ tab: TICKETS_TAB, sel: 0, top: 0, qty: 1 })
  },
)

test(
  'offline, with no species list, 95 Kanto species seen: the Johto ticket is buyable and sells',
  KIT,
  async ($, on) => {
    const files = new Map([['/home/ash/.cache/claude-code-pokemon/sprites/regular/pikachu', ART]])
    const net: Net = { isOnline: false, list: JSON.stringify(LIST) }
    const w = await begin($, on, player(160_000), ART, files, net)
    const band = await ticketsTab($)
    expect(stateOf(await martOf(band), 'johto')).toBe('buyable')
    await clickMart(band, 'buy')
    expect(w.saveNow().journey.tickets).toEqual(['johto'])
  },
)

test('₽160,000 and one click on Buy: owned, ₽10,000 left, and the title says how to sail', KIT, async ($, on) => {
  const w = await begin($, on, player(160_000))
  const band = await ticketsTab($)
  await clickMart(band, 'buy')
  const p = await martOf(band)
  expect(stateOf(p, 'johto')).toBe('owned')
  expect(p).toMatchObject({
    balance: 10_000,
    message: 'Bought the Johto ferry ticket. Sail with /pokemon travel johto',
    isError: false,
  })
  expect(w.saveNow().journey.tickets).toEqual(['johto'])
  expect(w.saveNow().spent).toBe(150_000)
  expect(martRows(p!).hits.some(h => h.act === 'buy')).toBe(false)
  await band.key({ key: 'return', in: 'mart' })
  await band.key({ key: 'return', in: 'mart' })
  expect((await martOf(band))?.message).toBe('Bought the Johto ferry ticket. Sail with /pokemon travel johto')
  expect(w.saveNow().spent).toBe(150_000)
})

test('buying does not travel: Kanto stays current, the Mart stays open, no ferry or dialog', KIT, async ($, on) => {
  const w = await begin($, on, player(160_000))
  const band = await ticketsTab($)
  await clickMart(band, 'buy')
  expect(w.saveNow().journey.current).toBe('kanto')
  expect(w.saveNow().journey.starters).toEqual({})
  await band.redraw()
  const drawn = await band.drawn()
  expect(findClient(drawn, 'mart')).not.toBeNull()
  expect(findClient(drawn, 'dialog')).toBeNull()
  expect((await martOf(band))?.region.text).toBe('KANTO')
})

test('₽100,000: the click is refused in the error colour, and nothing changes', KIT, async ($, on) => {
  const w = await begin($, on, player(100_000))
  const band = await ticketsTab($)
  const before = purchaseState(w.saveNow())
  await clickMart(band, 'buy')
  const p = await martOf(band)
  expect(p).toMatchObject({ message: 'Not enough ₽: ₽50,000 more to go.', isError: true, balance: 100_000 })
  expect(stateOf(p, 'johto')).toBe('buyable')
  expect(martRows(p!).lines[0]?.find(r => r[0].includes('Not enough'))?.[1]).toBe('#ffd0c8')
  expect(purchaseState(w.saveNow())).toEqual(before)
})

test(
  'a Mart buy waiting behind another save write is refused when, meanwhile, a folded ledger goes and its marks are dropped',
  KIT,
  async ($, on) => {
    const GONE = 'xp:gone'
    const folded = 60_000
    const saved = player(100_000, 95, { folded: [GONE], foldedXp: { [GONE]: {} }, foldedMoney: { [GONE]: folded } })
    const w = await begin($, on, saved, ART, undefined, {
      isOnline: true,
      list: JSON.stringify(LIST),
      keys: { [GONE]: { at: 0, xp: {}, money: folded } },
    })
    const band = await ticketsTab($)
    const before = { spent: w.saveNow().spent, earned: w.saveNow().earned, tickets: w.saveNow().journey.tickets }
    let release = () => {}
    const held = new Promise<void>(resolve => (release = resolve))
    let isHolding = true
    w.net.getStall = key => (key === 'save' && isHolding ? held : undefined)
    const sizing = cmd($, 'pokemon', 'size small')
    let ledgerReads = 0
    w.net.beforeGet = key => void (key === GONE && ledgerReads++)
    const p = await martOf(band)
    const hit = p && martRows(p).hits.find(h => h.act === 'buy')
    if (!hit) throw new Error('no Buy in the Mart')
    const clicking = band.pointer({ type: 'down', x: hit.x0, y: hit.y, button: 'left', in: 'mart' })
    for (let i = 0; i < 20 && !ledgerReads; i++) await band.redraw()
    w.store.delete(GONE)
    const { folded: _, foldedXp: __, foldedMoney: ___, ...cleaned } = w.saveNow()
    w.store.set('save', cleaned)
    isHolding = false
    release()
    await sizing
    await clicking
    for (let i = 0; i < 50 && !(await martOf(band))?.message; i++) await band.redraw()
    expect(await martOf(band)).toMatchObject({ message: 'Not enough ₽: ₽50,000 more to go.', isError: true })
    expect({ spent: w.saveNow().spent, earned: w.saveNow().earned, tickets: w.saveNow().journey.tickets }).toEqual(
      before,
    )
  },
)

for (const money of [10_000_000, 100_000])
  test(`a click on an unavailable ticket is refused with ₽${money.toLocaleString('en-US')}`, KIT, async ($, on) => {
    const w = await begin($, on, player(money, 90))
    const band = await ticketsTab($)
    expect(stateOf(await martOf(band), 'johto')).toBe('unavailable')
    const before = purchaseState(w.saveNow())
    await clickMart(band, 'buy')
    expect(await martOf(band)).toMatchObject({
      message: 'Looks like you need more experience to access this.',
      isError: true,
    })
    for (let i = JOHTO_TICKET_INDEX; i < GALAR_TICKET_INDEX; i++) await band.key({ key: 'down', in: 'mart' })
    expect((await martOf(band))?.state.sel).toBe(GALAR_TICKET_INDEX)
    await clickMart(band, 'buy')
    expect((await martOf(band))?.message).toBe('Looks like you need more experience to access this.')
    expect(purchaseState(w.saveNow())).toEqual(before)
  })

test('/pokemon buy johto ticket with exactly ₽150,000: owned, ₽0, Kanto still current', KIT, async ($, on) => {
  const w = await begin($, on, player(150_000))
  expect(await cmd($, 'pokemon', 'buy johto ticket')).toBe(
    'Bought the Johto ferry ticket. Sail with /pokemon travel johto\n₽0 left.',
  )
  expect(w.saveNow().journey).toMatchObject({ current: 'kanto', tickets: ['johto'] })
  expect(w.saveNow().spent).toBe(150_000)
  expect(await cmd($, 'pokemon', 'bag')).toContain('₽0')
})

for (const args of ['Johto Ticket 1', '1 johto TICKET', 'johto ferry ticket'])
  test(`typed buys any case and with the count 1 first or last: buy ${args}`, KIT, async ($, on) => {
    const w = await begin($, on, player(400_000))
    expect(await cmd($, 'pokemon', `buy ${args}`)).toContain('Bought the Johto ferry ticket.')
    expect(w.saveNow().journey.tickets).toEqual(['johto'])
    expect(w.saveNow().spent).toBe(150_000)
  })

const REFUSALS: [string, Save, string, string][] = [
  ['the gate not met', player(10_000_000, 90), 'johto ticket', 'Looks like you need more experience to access this.'],
  [
    'the gate not met on a short wallet',
    player(100_000, 90),
    'johto ticket',
    'Looks like you need more experience to access this.',
  ],
  ['a later region', player(10_000_000), 'hoenn ticket', 'Looks like you need more experience to access this.'],
  ['too little ₽', player(100_000), 'johto ticket', 'Not enough ₽: ₽50,000 more to go.'],
  [
    'owned',
    player(10_000_000, 95, { journey: JOHTO_OWNED }),
    'johto ticket',
    'You already own the Johto ferry ticket.',
  ],
]
for (const [why, saved, args, reply] of REFUSALS)
  test(`a typed buy refused for ${why} says so and leaves the store as it was`, KIT, async ($, on) => {
    const w = await begin($, on, saved)
    const before = purchaseState(w.saveNow())
    expect(await cmd($, 'pokemon', `buy ${args}`)).toBe(reply)
    expect(purchaseState(w.saveNow())).toEqual(before)
  })

test('a ticket count other than 1 is no quantity to buy, and buys nothing', KIT, async ($, on) => {
  const w = await begin($, on, player(10_000_000))
  const before = purchaseState(w.saveNow())
  for (const args of ['johto ticket 2', 'johto ticket 0', 'johto ticket -1', '3 johto ticket', 'johto ticket 1.5'])
    expect(await cmd($, 'pokemon', `buy ${args}`)).toBe("That isn't a quantity you can buy.")
  expect(purchaseState(w.saveNow())).toEqual(before)
})

test('the Kanto ticket is owned from the start: a click on it and a typed buy change nothing', KIT, async ($, on) => {
  const w = await begin($, on, player(10_000_000))
  const before = purchaseState(w.saveNow())
  const band = await ticketsTab($)
  await clickMart(band, { pick: 0 })
  expect(stateOf(await martOf(band), 'kanto')).toBe('owned')
  expect(martRows((await martOf(band))!).hits.some(h => h.act === 'buy')).toBe(false)
  await clickMart(band, { pick: 0 })
  expect((await martOf(band))?.message).toBe('')
  expect(await cmd($, 'pokemon', 'buy kanto ticket')).toBe('You already own the Kanto ferry ticket.')
  expect(purchaseState(w.saveNow())).toEqual(before)
  expect(w.saveNow().journey.tickets).toEqual([])
})

test('no ticket for words that only look like one', KIT, async ($, on) => {
  const w = await begin($, on, player(10_000_000))
  const before = purchaseState(w.saveNow())
  for (const args of ['ticket', 'johto ferry', 'atlantis ticket'])
    expect(await cmd($, 'pokemon', `buy ${args}`)).not.toContain('Bought')
  expect(purchaseState(w.saveNow())).toEqual(before)
})

for (const at of [1, 2, 3, 4])
  test(
    `two windows buy the Johto ticket at once with ₽200,000, the other landing at read ${at}: owned once, paid once`,
    KIT,
    async ($, on) => {
      const w = await begin($, on, player(200_000))
      await cmd($, 'pokemon', 'party')
      let reads = 0
      w.net.beforeGet = key => {
        if (key !== 'save' || ++reads !== at) return
        w.store.set('save', buyTicket(loadSave(w.store.get('save')), 0, JOHTO).save)
      }
      expect([
        'You already own the Johto ferry ticket.',
        'Bought the Johto ferry ticket. Sail with /pokemon travel johto\n₽50,000 left.',
      ]).toContain(await cmd($, 'pokemon', 'buy johto ticket'))
      expect(reads).toBeGreaterThanOrEqual(at)
      expect(w.saveNow().journey.tickets).toEqual(['johto'])
      expect(w.saveNow().spent).toBe(150_000)
    },
  )

test("another window's buy shows in this window's open Mart: Owned and the new balance", KIT, async ($, on) => {
  const w = await begin($, on, player(160_000))
  const band = await ticketsTab($)
  expect(stateOf(await martOf(band), 'johto')).toBe('buyable')
  const before = w.band.invalidated
  const s = w.saveNow()
  w.store.set('save', { ...s, spent: 150_000, journey: { ...s.journey, tickets: ['johto'] } })
  await w.clock.advance(10_500)
  expect(w.band.invalidated).toBeGreaterThan(before)
  const p = await martOf(band)
  expect(stateOf(p, 'johto')).toBe('owned')
  expect(p?.balance).toBe(10_000)
})

test("another window's sightings open the next ticket in this window's open Mart", KIT, async ($, on) => {
  const w = await begin($, on, player(160_000, 90))
  const band = await ticketsTab($)
  expect(stateOf(await martOf(band), 'johto')).toBe('unavailable')
  const before = w.band.invalidated
  w.store.set('save', { ...w.saveNow(), dex: kantoSeen(91) })
  await w.clock.advance(10_500)
  expect(w.band.invalidated).toBeGreaterThan(before)
  expect(stateOf(await martOf(band), 'johto')).toBe('buyable')
})
