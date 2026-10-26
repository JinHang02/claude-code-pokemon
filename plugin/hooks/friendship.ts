import type { Ledger, Member, Together } from './save'

// Friendship from good work: each passing test run and each commit counts as this much time together for every
// party member (a Soothe Bell holder's ×1.5, as with time). A failure takes none away.
export const WORK_MS = 10 * 60_000

// Work credit is written where XP is: in the session's own ledger (`Ledger.friendship`), which only that session
// writes, so two windows crediting at the same moment can't lose one (the `together` key's read-modify-write can:
// a heartbeat in another window landing in between would overwrite a whole test run's credit). When a ledger's
// session has ended, its credit moves under its own store key, marked there with what each ledger added, so it
// counts once whichever windows fold it and however often. The `together` heartbeats never write this key, so they
// can't undo a fold either: one lost to two windows folding at once is simply folded again on the next round.
// `ms`: credit folded from ledgers by member id; `folded`: by ledger key, the credit it had when folded.
export type Work = { ms: Record<string, number>; folded: Record<string, Record<string, number>> }
export const WORK = 'work'

// Counts by id, with no inherited keys, anything malformed dropped.
function countsOf(raw: unknown): Record<string, number> {
  const out = Object.create(null) as Record<string, number>
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out
  for (const [id, n] of Object.entries(raw))
    if (typeof n === 'number' && Number.isFinite(n) && n > 0) out[id] = Math.floor(n)
  return out
}
const at = (o: Record<string, number> | undefined, id: string) => (o && Object.hasOwn(o, id) ? (o[id] ?? 0) : 0)

// A stored ledger's work credit; an older ledger has none.
export const loadFriendship = (raw: unknown) => countsOf(raw)

// The stored work credit, with anything malformed dropped.
export function loadWork(raw: unknown): Work {
  const w = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const folded: Record<string, Record<string, number>> = {}
  const marks = typeof w.folded === 'object' && w.folded !== null && !Array.isArray(w.folded) ? w.folded : {}
  for (const [key, ms] of Object.entries(marks)) folded[key] = countsOf(ms)
  return { ms: countsOf(w.ms), folded }
}

// `ledger` (just written by earnInto, which knows no credit) with `earlier`'s credit kept and `ms` more for every
// party member.
export function befriend(ledger: Ledger, earlier: Record<string, number> = {}, party: Member[], ms: number): Ledger {
  if (!ms && !Object.keys(earlier).length) return ledger
  const friendship = Object.assign(Object.create(null) as Record<string, number>, earlier)
  if (ms)
    for (const m of party) friendship[m.id] = at(friendship, m.id) + (m.heldItem === 'soothe-bell' ? ms * 1.5 : ms)
  return { ...ledger, friendship }
}

// The credit in `friendship` above what was folded (`counted`), by member id.
function above(friendship: Record<string, number> = {}, counted: Record<string, number> = {}) {
  const out = Object.create(null) as Record<string, number>
  for (const [id, n] of Object.entries(friendship)) if (n > at(counted, id)) out[id] = n - at(counted, id)
  return out
}

// `work` with ledger `key`'s credit added (what it gained since an earlier fold too) and marked; `work` itself when
// there's nothing new.
export function foldWork(work: Work, key: string, ledger: Ledger): Work {
  const more = above(ledger.friendship, work.folded[key])
  if (!Object.keys(more).length) return work
  const ms = Object.assign(Object.create(null) as Record<string, number>, work.ms)
  for (const [id, n] of Object.entries(more)) ms[id] = at(ms, id) + n
  return { ms, folded: { ...work.folded, [key]: { ...work.folded[key], ...ledger.friendship } } }
}

// `work` without the marks of ledgers gone from the store, nor the credit of members gone from the party and PC box
// (released). Nothing to drop leaves it as it is.
export function pruneWork(work: Work, ledgerKeys: string[], kept: Set<string>): Work {
  const gone = Object.keys(work.folded).filter(k => !ledgerKeys.includes(k))
  const released = Object.keys(work.ms).filter(id => !kept.has(id))
  if (!gone.length && !released.length) return work
  return {
    ms: Object.fromEntries(Object.entries(work.ms).filter(([id]) => kept.has(id))),
    folded: Object.fromEntries(Object.entries(work.folded).filter(([k]) => !gone.includes(k))),
  }
}

// Time together by member id as the party stands, and how much of it came from good work: the `together` key's time,
// plus the work credit folded under its own key and still in session ledgers.
export function timesOf(together: Together, work: Work, ledgers: Record<string, Ledger>) {
  const works = Object.assign(Object.create(null) as Record<string, number>, work.ms)
  for (const [key, l] of Object.entries(ledgers))
    for (const [id, n] of Object.entries(above(l.friendship, work.folded[key]))) works[id] = at(works, id) + n
  const ms = Object.assign(Object.create(null) as Record<string, number>, together.ms)
  for (const [id, n] of Object.entries(works)) ms[id] = at(ms, id) + n
  return { ms, works }
}
