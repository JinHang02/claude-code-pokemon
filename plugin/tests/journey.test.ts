import { expect, test } from 'claude-code/testing'

import { buyTicket, chooseStarter, keepSave, startFresh, travelTo } from '../hooks/journey'
import { keptJourney, newJourney, TRAVEL_REGIONS, speciesIn, unlockedOf } from '../hooks/travel-regions'
import type { Journey, TravelRegion, RegionId } from '../hooks/travel-regions'
import { balanceOf, emptySave, extraMoney, extraXp, loadSave, MAX_BOX, MAX_PARTY, STARTING_MONEY } from '../hooks/save'
import type { DexEntry, Ledger, Member, Save } from '../hooks/save'

const region = (id: RegionId): TravelRegion => {
  const r = TRAVEL_REGIONS.find(x => x.id === id)
  if (!r) throw new Error(`no region ${id}`)
  return r
}
const KANTO = region('kanto')
const JOHTO = region('johto')
const HOENN = region('hoenn')

const dexOf = (species: string[]): Record<string, DexEntry> =>
  Object.fromEntries(species.map(s => [s, { seen: 1, shiny: 0, first: 0 }]))
const member = (id: string, species: string): Member => ({
  id,
  species,
  form: 'regular',
  isShiny: false,
  xp: 0,
  evolutions: 0,
})
const withJourney = (save: Save, j: Partial<Journey>): Save => ({ ...save, journey: { ...keptJourney(), ...j } })
const KANTO_SEEN_PAST_GATE = 95
const ready = (money: number): Save => ({
  ...emptySave(),
  dex: dexOf(speciesIn(KANTO).slice(0, KANTO_SEEN_PAST_GATE)),
  earned: money - STARTING_MONEY,
})
const withJohto = (j: Partial<Journey> = {}): Save => withJourney(emptySave(), { tickets: ['johto'], ...j })

// ── buyTicket ──

test('buying the Johto ticket spends ₽150,000 and owns it (A32)', () => {
  const r = buyTicket(ready(160_000), 0, JOHTO)
  expect(r).toEqual({
    save: { ...ready(160_000), spent: 150_000, journey: { ...keptJourney(), tickets: ['johto'] } },
    text: 'Bought the Johto ferry ticket. Sail with /pokemon travel johto',
    isError: false,
  })
  expect(balanceOf(r.save, 0)).toBe(10_000)
})

test('too little ₽ is refused with how much more, the save unchanged (A33, A38)', () => {
  const save = ready(100_000)
  expect(buyTicket(save, 0, JOHTO)).toEqual({ save, text: 'Not enough ₽: ₽50,000 more to go.', isError: true })
  const short = ready(149_999)
  expect(buyTicket(short, 0, JOHTO)).toEqual({ save: short, text: 'Not enough ₽: ₽1 more to go.', isError: true })
})

test('exactly ₽150,000 buys it, leaving ₽0 (A36)', () => {
  const r = buyTicket(ready(150_000), 0, JOHTO)
  expect(r.isError).toBe(false)
  expect(balanceOf(r.save, 0)).toBe(0)
})

test('the ledgers’ unfolded ₽ counts toward the price', () => {
  const save = ready(100_000)
  const r = buyTicket(save, 50_000, JOHTO)
  expect(r.isError).toBe(false)
  expect(r.save.journey.tickets).toEqual(['johto'])
  expect(balanceOf(r.save, 50_000)).toBe(0)
  expect(buyTicket(save, 49_999, JOHTO).text).toBe('Not enough ₽: ₽1 more to go.')
})

test('an unavailable ticket is refused before the wallet is checked (A34, A37)', () => {
  const rich = { ...emptySave(), earned: 1_000_000 - STARTING_MONEY }
  const want = { text: 'Looks like you need more experience to access this.', isError: true }
  expect(buyTicket(rich, 0, JOHTO)).toEqual({ save: rich, ...want })
  expect(buyTicket({ ...rich, dex: ready(0).dex }, 0, HOENN)).toEqual({ save: { ...rich, dex: ready(0).dex }, ...want })
  expect(buyTicket(emptySave(), 0, JOHTO)).toEqual({ save: emptySave(), ...want })
  expect(buyTicket(rich, 0, KANTO)).toEqual({ save: rich, ...want })
})

test('an undecided pre-region save is refused a ticket until it is kept or started fresh (R37)', () => {
  const undecided = withJourney(ready(1_000_000), { isUndecided: true })
  const r = buyTicket(undecided, 0, JOHTO)
  expect(r.isError).toBe(true)
  expect(r.save).toBe(undecided)
  expect(r.text).toMatch(/keep your save or start fresh first/i)
  expect(buyTicket(keepSave(undecided).save, 0, JOHTO).isError).toBe(false)
})

test('an owned ticket is refused, the save unchanged (A39)', () => {
  const save = withJourney(ready(1_000_000), { tickets: ['johto'], starters: { johto: 'due' } })
  expect(buyTicket(save, 0, JOHTO)).toEqual({ save, text: 'You already own the Johto ferry ticket.', isError: true })
  const broke = withJourney(emptySave(), { tickets: ['johto'] })
  expect(buyTicket(broke, 0, JOHTO).text).toBe('You already own the Johto ferry ticket.')
})

test('buying again on its own result spends nothing more (A40)', () => {
  const once = buyTicket(ready(400_000), 0, JOHTO).save
  const twice = buyTicket(once, 0, JOHTO)
  expect(twice.save).toEqual(once)
  expect(twice.isError).toBe(true)
  expect(twice.save.spent).toBe(150_000)
})

test('buying never travels or sets a starter due (A35)', () => {
  const save = withJourney(ready(160_000), { starters: { kanto: { species: 'squirtle' } } })
  const after = buyTicket(save, 0, JOHTO).save.journey
  expect(after.current).toBe('kanto')
  expect(after.starters).toEqual({ kanto: { species: 'squirtle' } })
})

test('the Hoenn ticket opens on 60 of Johto’s 100 seen, and is added after Johto', () => {
  const save = withJourney(
    { ...emptySave(), dex: dexOf(speciesIn(JOHTO).slice(0, 60)), earned: 1_000_000 },
    { tickets: ['johto'], current: 'johto', starters: { johto: 'due' } },
  )
  const r = buyTicket(save, 0, HOENN)
  expect(r.text).toBe('Bought the Hoenn ferry ticket. Sail with /pokemon travel hoenn')
  expect(r.save.journey).toEqual({ ...save.journey, tickets: ['johto', 'hoenn'] })
})

// ── travelTo ──

test('the first sail to Johto makes it current and its starter due, spending nothing (A42, A80)', () => {
  const save = { ...withJohto({ starters: { kanto: { species: 'bulbasaur' } } }), spent: 150_000 }
  expect(travelTo(save, JOHTO)).toEqual({
    save: {
      ...save,
      journey: { ...save.journey, current: 'johto', starters: { kanto: { species: 'bulbasaur' }, johto: 'due' } },
    },
    text: 'Sailing to Johto…',
    isError: false,
  })
})

test('sailing back to Kanto never sets Kanto due (A43)', () => {
  const save = withJohto({ current: 'johto', starters: { johto: { species: 'totodile' } } })
  const r = travelTo(save, KANTO)
  expect(r.isError).toBe(false)
  expect(r.text).toBe('Sailing to Kanto…')
  expect(r.save.journey).toEqual({ ...save.journey, current: 'kanto' })
})

test('without a ticket, or already there, travel is refused and the save unchanged (A45, A47)', () => {
  const save = withJohto()
  expect(travelTo(save, HOENN)).toEqual({ save, text: 'You have no Hoenn ferry ticket.', isError: true })
  expect(travelTo(save, KANTO)).toEqual({ save, text: "You're already in Kanto.", isError: true })
  const there = withJohto({ current: 'johto', starters: { johto: 'due' } })
  expect(travelTo(there, JOHTO)).toEqual({ save: there, text: "You're already in Johto.", isError: true })
})

test('a later arrival leaves the starters as they are, chosen or still due (A83, A95)', () => {
  const chosen = withJohto({ starters: { johto: { species: 'cyndaquil' } } })
  expect(travelTo(chosen, JOHTO).save.journey.starters).toEqual({ johto: { species: 'cyndaquil' } })
  const due = withJohto({ starters: { johto: 'due' } })
  expect(travelTo(due, JOHTO).save.journey.starters).toEqual({ johto: 'due' })
})

test('travelling again on its own result is refused and changes nothing', () => {
  const once = travelTo(withJohto(), JOHTO).save
  expect(travelTo(once, JOHTO)).toEqual({ save: once, text: "You're already in Johto.", isError: true })
})

// ── chooseStarter ──

test('a due starter joins the party as caught, counted seen and caught (A89, A11)', () => {
  const save = withJohto({ current: 'johto', starters: { johto: 'due' } })
  const r = chooseStarter(save, JOHTO, member('c1', 'cyndaquil'), 42)
  expect(r.isError).toBe(false)
  expect(r.text).toBe('Cyndaquil joined your party!')
  expect(r.save.party).toEqual([{ ...member('c1', 'cyndaquil'), isCaught: true }])
  expect(r.save.dex.cyndaquil).toEqual({ seen: 1, shiny: 0, first: 42, caught: 1 })
  expect(r.save.journey.starters).toEqual({ johto: { species: 'cyndaquil' } })
  expect(r.save.journey.current).toBe('johto')
})

test('a seen-before starter adds one more seen and caught to its entry', () => {
  const save = { ...withJohto({ starters: { johto: 'due' } }), dex: { totodile: { seen: 3, shiny: 1, first: 7 } } }
  const r = chooseStarter(save, JOHTO, member('t1', 'totodile'), 99)
  expect(r.save.dex.totodile).toEqual({ seen: 4, shiny: 1, first: 7, caught: 1 })
})

test('with a full party the starter goes to the PC box, and the reply says so (A90)', () => {
  const party = Array.from({ length: MAX_PARTY }, (_, i) => member(`p${i}`, 'pikachu'))
  const save = { ...withJohto({ starters: { johto: 'due' } }), party }
  const r = chooseStarter(save, JOHTO, member('t1', 'totodile'), 1)
  expect(r.isError).toBe(false)
  expect(r.text).toBe('Totodile was sent to the PC box.')
  expect(r.save.party).toEqual(party)
  expect(r.save.box).toEqual([{ ...member('t1', 'totodile'), isCaught: true }])
  expect(r.save.journey.starters.johto).toEqual({ species: 'totodile' })
})

test('with no room in the party or the PC box the choice is refused and stays due', () => {
  const party = Array.from({ length: MAX_PARTY }, (_, i) => member(`p${i}`, 'pikachu'))
  const box = Array.from({ length: MAX_BOX }, (_, i) => member(`b${i}`, 'pikachu'))
  const save = { ...withJohto({ starters: { johto: 'due' } }), party, box }
  const r = chooseStarter(save, JOHTO, member('t1', 'totodile'), 1)
  expect(r.isError).toBe(true)
  expect(r.save).toBe(save)
  expect(r.text).toContain("There's no more room in your PC box!")
})

test('a choice already made is refused, naming the starter chosen (A91, A98)', () => {
  const save = { ...withJohto({ starters: { johto: { species: 'chikorita' } } }), party: [member('k', 'chikorita')] }
  const r = chooseStarter(save, JOHTO, member('t1', 'totodile'), 1)
  expect(r).toEqual({ save, text: 'You already chose Chikorita as your Johto starter.', isError: true })
})

test('two picks in a row add one starter: the first (A98)', () => {
  const save = withJohto({ starters: { johto: 'due' } })
  const first = chooseStarter(save, JOHTO, member('c1', 'chikorita'), 1).save
  const second = chooseStarter(first, JOHTO, member('t1', 'totodile'), 2)
  expect(second.isError).toBe(true)
  expect(second.save).toBe(first)
  expect(second.save.party.map(m => m.species)).toEqual(['chikorita'])
  expect(second.text).toContain('Chikorita')
})

test('a region not arrived at has no starter to choose', () => {
  const save = withJohto()
  const r = chooseStarter(save, JOHTO, member('c1', 'cyndaquil'), 1)
  expect(r).toEqual({ save, text: 'There is no Johto starter to choose.', isError: true })
})

test("a species that isn't one of the region's starters is refused", () => {
  const save = withJohto({ starters: { johto: 'due' } })
  const r = chooseStarter(save, JOHTO, member('b1', 'bulbasaur'), 1)
  expect(r).toEqual({ save, text: "Bulbasaur isn't one of Johto's starters.", isError: true })
})

// ── keepSave ──

test('keeping the save only marks it decided (A102)', () => {
  const save: Save = {
    ...emptySave(),
    party: [{ ...member('p1', 'pikachu'), xp: 400 }],
    box: [member('b1', 'eevee')],
    dex: dexOf([...speciesIn(KANTO).slice(0, 120), ...speciesIn(JOHTO).slice(0, 30)]),
    bag: { 'fire-stone': 5 },
    spent: 1_000,
    earned: 9_000,
    journey: { ...keptJourney(), isUndecided: true },
  }
  const r = keepSave(save)
  expect(r.isError).toBe(false)
  expect(r.save).toEqual({ ...save, journey: keptJourney() })
  expect(Object.hasOwn(r.save.journey, 'isUndecided')).toBe(false)
  expect(unlockedOf(r.save.journey).map(x => x.id)).toEqual(['kanto'])
})

test('keeping twice: the second changes nothing and says so', () => {
  const once = keepSave({ ...emptySave(), journey: { ...keptJourney(), isUndecided: true } }).save
  expect(keepSave(once)).toEqual({ save: once, text: 'Your save was already chosen.', isError: true })
})

test('keeping after a fresh start changes nothing (A109)', () => {
  const undecided = {
    ...emptySave(),
    party: [member('p1', 'pikachu')],
    journey: { ...keptJourney(), isUndecided: true as const },
  }
  const fresh = startFresh(undecided, {}).save
  expect(keepSave(fresh)).toEqual({ save: fresh, text: 'Your save was already chosen.', isError: true })
})

// ── startFresh ──

const played = (): Save => ({
  ...emptySave(),
  party: [{ ...member('p1', 'pikachu'), xp: 900 }],
  box: [member('b1', 'eevee')],
  dex: dexOf(speciesIn(KANTO).slice(0, 100)),
  recent: ['pikachu'],
  bag: { 'fire-stone': 5 },
  spent: 151_000,
  earned: 200_000,
  size: 'small',
  evolution: 'auto',
  evolutionStyle: 'white',
  isOff: true,
  folded: ['xp:old'],
  foldedXp: { 'xp:old': { p1: 50 } },
  foldedMoney: { 'xp:old': 500 },
  journey: { current: 'johto', tickets: ['johto'], starters: { kanto: { species: 'bulbasaur' }, johto: 'due' } },
})

test('starting fresh wipes the game, keeps the settings and opens Kanto’s choice (A104, A111, R39)', () => {
  const r = startFresh(played(), {})
  expect(r.isError).toBe(false)
  expect(r.save).toEqual({
    party: [],
    size: 'small',
    evolution: 'auto',
    evolutionStyle: 'white',
    isOff: true,
    dex: {},
    recent: [],
    journey: newJourney(),
  })
  expect(r.save.spent ?? 0).toBe(0)
  expect(r.save.earned ?? 0).toBe(0)
  expect(r.save.journey.tickets).toEqual([])
  expect(r.save.journey.starters).toEqual({ kanto: 'due' })
  expect(balanceOf(r.save, 0)).toBe(STARTING_MONEY)
})

test('after a fresh start the wallet is exactly ₽3,000 with the same ledgers, folded or not', () => {
  const ledgers: Record<string, Ledger> = {
    'xp:new': { at: 1, xp: { p1: 30 }, money: 12_345 },
    'xp:old': { at: 2, xp: { p1: 80 }, money: 800 },
    'xp:none': { at: 3, xp: {}, money: 0 },
  }
  const save = startFresh(played(), ledgers).save
  expect([...(save.folded ?? [])].sort()).toEqual(['xp:new', 'xp:none', 'xp:old'])
  expect(balanceOf(save, extraMoney(ledgers, save.folded, save.foldedMoney))).toBe(3_000)
  expect(extraXp(ledgers, save.folded, save.foldedXp)).toEqual({})
  const stored = loadSave(JSON.parse(JSON.stringify(save)))
  expect(balanceOf(stored, extraMoney(ledgers, stored.folded, stored.foldedMoney))).toBe(3_000)
})

test('starting fresh on a new save keeps it new, and rerunning it gives the same save', () => {
  const ledgers: Record<string, Ledger> = { 'xp:a': { at: 1, xp: {}, money: 10 } }
  const once = startFresh(played(), ledgers).save
  expect(startFresh(once, ledgers).save).toEqual(once)
  expect(startFresh(emptySave(), {}).save).toEqual({ ...emptySave(), journey: newJourney() })
})
