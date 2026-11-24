// One change function per player action (buyTicket, travelTo, chooseStarter, keepSave, startFresh) and their result,
// Change.
import { newJourney, TICKET_PRICE, ticketState } from './travel-regions'
import type { TravelRegion } from './travel-regions'
import {
  balanceOf,
  BOX_FULL,
  formatMoney,
  MAKE_ROOM,
  recordCaught,
  recordSeen,
  speciesName,
  STARTING_MONEY,
  storeCaught,
} from './save'
import type { Ledger, Member, Save } from './save'

export type Change = { save: Save; text: string; isError: boolean }

const refuse = (save: Save, text: string): Change => ({ save, text, isError: true })

/**
 * `r`'s ferry ticket bought with what the wallet holds.
 * @param cash the ledgers' unfolded ₽ (extraMoney).
 * @returns the save with the ticket owned and TICKET_PRICE spent; or, unchanged, why not: an undecided pre-region save,
 *   owned, unavailable, short.
 */
export function buyTicket(save: Save, cash: number, r: TravelRegion): Change {
  if (save.journey.isUndecided)
    return refuse(save, 'Choose to keep your save or start fresh first: /pokemon keep or /pokemon fresh.')
  const state = ticketState(save.journey, save.dex, r)
  if (state === 'owned') return refuse(save, `You already own the ${r.name} ferry ticket.`)
  if (state === 'unavailable') return refuse(save, 'Looks like you need more experience to access this.')
  const left = balanceOf(save, cash)
  if (left < TICKET_PRICE) return refuse(save, `Not enough ₽: ${formatMoney(TICKET_PRICE - left)} more to go.`)
  return {
    save: {
      ...save,
      spent: (save.spent ?? 0) + TICKET_PRICE,
      journey: { ...save.journey, tickets: [...save.journey.tickets, r.id] },
    },
    text: `Bought the ${r.name} ferry ticket. Sail with /pokemon travel ${r.id}`,
    isError: false,
  }
}

/**
 * The player sailed to `r`.
 * @returns the save with `r` current and, on a first arrival by ticket, its starter due; or, unchanged, why not: no
 *   ticket, already there.
 */
export function travelTo(save: Save, r: TravelRegion): Change {
  const j = save.journey
  const isTicketed = j.tickets.includes(r.id)
  if (r.id !== 'kanto' && !isTicketed) return refuse(save, `You have no ${r.name} ferry ticket.`)
  if (j.current === r.id) return refuse(save, `You're already in ${r.name}.`)
  const isFirstArrival = isTicketed && !(r.id in j.starters)
  return {
    save: {
      ...save,
      journey: { ...j, current: r.id, starters: isFirstArrival ? { ...j.starters, [r.id]: 'due' } : j.starters },
    },
    text: `Sailing to ${r.name}…`,
    isError: false,
  }
}

/**
 * `m` chosen as `r`'s starter: seen, caught, and kept in the party, else the PC box.
 * @param now when it was caught, for a first dex entry.
 * @returns the save with the choice made; or, unchanged and still due, why not: no choice due (naming the one made),
 *   not one of `r`'s starters, no room.
 */
export function chooseStarter(save: Save, r: TravelRegion, m: Member, now: number = Date.now()): Change {
  const choice = save.journey.starters[r.id]
  if (choice === undefined) return refuse(save, `There is no ${r.name} starter to choose.`)
  if (choice !== 'due')
    return refuse(save, `You already chose ${speciesName(choice.species)} as your ${r.name} starter.`)
  if (!r.starters.includes(m.species))
    return refuse(save, `${speciesName(m.species)} isn't one of ${r.name}'s starters.`)
  const counted = recordCaught(recordSeen(save, m.species, m.isShiny, now), m.species, now)
  const kept = storeCaught(counted, { ...m, isCaught: true })
  if (!kept.isStored) return refuse(save, `${BOX_FULL} Your party is full too. ${MAKE_ROOM}`)
  const name = speciesName(m.species)
  return {
    save: {
      ...kept.save,
      journey: { ...kept.save.journey, starters: { ...kept.save.journey.starters, [r.id]: { species: m.species } } },
    },
    text: kept.isInParty ? `${name} joined your party!` : `${name} was sent to the PC box.`,
    isError: false,
  }
}

/** The undecided save kept as it is; unchanged when already decided. */
export function keepSave(save: Save): Change {
  const { isUndecided, ...journey } = save.journey
  if (!isUndecided) return refuse(save, 'Your save was already chosen.')
  return { save: { ...save, journey }, text: 'Kept your save.', isError: false }
}

/**
 * The game wiped to a new player's, settings kept.
 * @param ledgers session ledgers by store key.
 * @returns the new player's save, every ledger in `ledgers` marked folded, so its wallet is exactly STARTING_MONEY.
 */
export function startFresh(save: Save, ledgers: Record<string, Ledger>): Change {
  const keys = Object.keys(ledgers)
  const foldedXp: Record<string, Record<string, number>> = {}
  const foldedMoney: Record<string, number> = {}
  for (const [key, l] of Object.entries(ledgers)) {
    foldedXp[key] = { ...l.xp }
    if (l.money) foldedMoney[key] = l.money
  }
  return {
    save: {
      party: [],
      size: save.size,
      evolution: save.evolution,
      dex: {},
      recent: [],
      journey: newJourney(),
      ...(save.evolutionStyle ? { evolutionStyle: save.evolutionStyle } : {}),
      ...(save.isOff ? { isOff: save.isOff } : {}),
      ...(keys.length ? { folded: keys, foldedXp } : {}),
      ...(Object.keys(foldedMoney).length ? { foldedMoney } : {}),
    },
    text: `Started fresh with ${formatMoney(STARTING_MONEY)}.`,
    isError: false,
  }
}
