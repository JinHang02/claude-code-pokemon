import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Mon } from '../types'
import { ballOverlays, clickPixels, DEFAULT_RATE, readClick, restSpot, startThrow, stepThrow, wildLook } from './catch'
import type { Click, Throw, ThrowEvent } from './catch'
import { drawWild } from './encounter'
import { chooseStage, dueStages, evolvedForm, genderOf, nextStages, pokeapiForm, timeMatches } from './evolution'
import type { ChainLink, Gender, Stage } from './evolution'
import { ALL_HELP, COMMANDS, POKEMON_HELP, suggest } from './commands'
import { formatDexEntry, readDexQuery } from './dex-entry'
import type { DexEvolutions } from './dex-entry'
import { formatFind } from './find'
import { ICONS } from './item-icons'
import { forSale, isForSale, itemById, itemName, MAX_BAG, splitGive, TABS, withArticle } from './items'
import type { Item } from './items'
import { act, isAct, START } from './mart'
import type { Act, MartProps, MartState } from './mart'
import { didYouMean, findMembers, formatChoices, inBox, isList, readLevel } from './members'
import type { Found, Place, Spot } from './members'
import { distance, guessItem, lookup, randomPick, readName, slug, spell, typedRest } from './lookup'
import type { Pick, Species } from './lookup'
import { classify } from './reactions'
import {
  addTogether,
  bagFull,
  balanceOf,
  BOX_FULL,
  boxPages,
  buy,
  CAUGHT_GREEN,
  DEX_CELL,
  displayName,
  emptySave,
  formatBag,
  formatBox,
  formatDex,
  formatMoney,
  formatParty,
  earnInto,
  evolvesText,
  extraMoney,
  extraXp,
  foldLedger,
  isBoxFull,
  isName,
  level,
  LEDGER,
  loadLedger,
  loadSave,
  loadTogether,
  MAKE_ROOM,
  MAX_LEVEL,
  MAX_PARTY,
  MONEY_PER_XP,
  nameOf,
  newId,
  putInBag,
  recordCaught,
  recordSeen,
  releaseMember,
  SAVE_VERSION,
  speciesName,
  spriteBudget,
  storeCaught,
  tabLines,
  takeFromBag,
  TIME_TEXT,
  TOGETHER,
  togetherOf,
  TOO_NEW,
  versionOf,
  withExtra,
  withTime,
  withTogether,
  styleOf,
  XP,
  xpForLevel,
} from './save'
import type { Evolution, Ledger, Member, Save, Size } from './save'
import { EVOLUTION_STYLES, isEvolutionStyle } from './evolution-style'
import type { EvolutionStyle } from './evolution-style'
import { BOX, evolutionFrame, SCREEN_MIN_ROWS, SCREEN_MS, TEXT_COLUMN } from './evolution-screen'
import {
  CALM_EVERY,
  carryActors,
  EVOLVE,
  EVOLVE_SCREEN,
  evolve,
  fleeWild,
  frame,
  HEADROOM,
  holdWild,
  hopWild,
  initialStatus,
  isAsleep,
  isCalm,
  keepRustleAtEdge,
  newScene,
  phaseAt,
  react,
  startWild,
  step,
  TICK_MS,
  paintedBy,
  ticks,
  wildPlacement,
} from './scene'
import type { Happening, Look, Phase, Status } from './scene'
import { SPECIES } from './species-data'
import { landscapeAt, LANDSCAPES, localHourOf } from './backdrop'
import type { Landscape } from './backdrop'
import { FULL_MOON, isFullMoonAt, MOON_PHASES, MOON_WORDS, moonAge, moonPhaseAt, SYNODIC_DAYS } from './moon'
import { BALL, COLORS, DONE, formatDuration, pickFor, WORKING } from './spinner'
import { fit, parseAnsi, textRows, toCells } from './sprite'
import type { Pixels } from './sprite'
import { shopSize } from './shop'
import type { ShopProps } from './shop'
import { stir, weatherAt, WEATHERS } from './weather'
import type { Weather } from './weather'

const BASE = 'https://gitlab.com/phoneybadger/pokemon-colorscripts/-/raw/main'
const POKEAPI = 'https://pokeapi.co/api/v2'
const SHINY_ODDS = 1 / 32
// The species list is refreshed this often; sprites and evolution data never change.
const LIST_MAX_AGE_MS = 30 * 24 * 60 * 60_000
// How often a session picks up what other sessions saved (and retries a party it couldn't draw).
const SYNC_MS = 10_000
// How often time together is added, in every session; the shared stamp in its store key keeps two sessions from
// counting it twice.
const TOGETHER_EVERY_MS = 60_000
// A download taking longer than this has failed.
const FETCH_TIMEOUT_MS = 20_000
const WILD_EVERY = [ticks(10 * 60_000), ticks(20 * 60_000)] as const
const ANIMATIONS = ['hop', 'cheer', 'faint', 'sleep', 'squash', 'work', 'clones', 'evolve', 'wild'] as const
const PHASES: Phase[] = ['day', 'dusk', 'night', 'dawn']

const party = atom({ plugin: 'pokemon', key: 'party' } as const, [])
const error = atom({ plugin: 'pokemon', key: 'error' } as const, null)
const ledger = atom({ plugin: 'pokemon', key: 'ledger' } as const, null)

let species: Species[] | null = null
let save: Save = emptySave()
// This session's XP ledger key, and the ledgers' XP not yet folded into the save, by member id.
let ledgerKey = ''
let extra: Record<string, number> = {}
// The ledgers' ₽ not yet folded into the save.
let cash = 0
// ₽ just earned, shown under the button for a moment; each earning's number, so only the latest clears it.
let plus = 0
let earnings = 0
// Time together by member id, from its own store key.
let times = loadTogether(undefined).ms
// A save as the party stands: XP from every session's ledger and time together included. For showing and deciding
// only.
const viewOf = (s: Save) => withTogether(withExtra(s, extra), times)
const view = () => viewOf(save)
// How wide the terminal is for the command running now, so a party or a box fits it; unknown in a test.
let replyColumns = Infinity
// A terminal width as the engine reports it; anything but a positive number is unknown (no wrapping).
const columnsOf = (columns: number | undefined) =>
  columns !== undefined && Number.isFinite(columns) && columns > 0 ? columns : Infinity
// The ledgers' XP and ₽ not yet folded into the save, counted against the save's own marks.
function countLedgers(ledgers: Record<string, Ledger>) {
  extra = extraXp(ledgers, save.folded, save.foldedXp)
  cash = extraMoney(ledgers, save.folded, save.foldedMoney)
}
// Why an item can't be given: the Bag has none.
const noItem = (name: string) => `You don't have ${withArticle(name)}. Buy one at the PokéMart: /pokemon mart`
// A ledger nobody has written to for this long belongs to a session that has ended: it's folded into the save.
const LEDGER_STALE_MS = 24 * 60 * 60_000
// How many syncs apart stale ledgers are folded, and folded ones removed.
const FOLD_EVERY = 30
let syncs = 0
// Sprite art by file and shininess, for this session.
const arts = new Map<string, string>()
// Downloads are kept here between sessions; null where there is no home directory.
let cacheDir: string | null = null

// `columns`: where the party may go; `total`: the band's picture, the button's corner beyond `columns` included,
// where only a wild visitor may go.
let band: { requestId: string; columns: number; rows: number; total: number } | null = null
// `keys` carry each walker over a party change; `looks` also changes when one evolves (same key, new sprite).
let fitted: { budget: number; keys: string[]; looks: string; lefts: Pixels[] } | null = null
let status: Status = initialStatus()
let streak = 0
let tickNo = 0
let lastCells = ''
// The band refused the last frame (hidden or collapsed): frames are offered again once in a while.
let isHidden = false
const RETRY_TICKS = ticks(1000)
let wild: { mon: Mon; left: Pixels; pick: Pick } | null = null
// The visitor's capture rate, once PokeAPI has said (null until then: no throws yet).
let wildRate: number | null = DEFAULT_RATE
// A Poké Ball in flight or playing out, at most one.
let pitch: Throw | null = null
// The ₽ button's corner: the band's right this many columns, landscape only, the button's label laid over its top.
const BUTTON_COLUMNS = 13
// The PokéMart: open in the band, the last thing it said, and what is selected in it. `isBought`: the last thing done
// in it was a buy, so Enter asks before buying again (`isAsked` once it has). `typed`: how much of what the person typed
// into it has gone to the prompt.
type MartOpen = {
  isOpen: boolean
  message: string
  isError: boolean
  view: MartState
  isBought: boolean
  isAsked: boolean
  typed: number
}
const shut = (): MartOpen => ({
  isOpen: false,
  message: '',
  isError: false,
  view: START,
  isBought: false,
  isAsked: false,
  typed: 0,
})
let mart = shut()
// While a wild Pokémon can be aimed at, the band is drawn as text by a click layer (a full-band click layer over
// pixel art stalls the terminal), redrawn every AIM_EVERY ticks: text costs more to draw than pixel art.
const AIM_EVERY = 2
let isAiming = false
// A wild Pokémon is out (rustling, aimable or in a ball): no ₽ button and no Mart then, as the Mart would cover it.
const isVisited = () => Boolean(status.wild || pitch)
// The band was last drawn without its button for a visitor; it is drawn again when the visitor comes or goes.
let isButtonHidden = false
const canAim = () =>
  Boolean(wild && wildRate !== null && status.wild && status.wild.rustle === 0 && !status.wild.isFleeing && !pitch)
let wildDue = WILD_EVERY[0]
// The timer's visitor whose downloads ended under an evolution's screen: it comes as soon as the screen is over.
let wildHeld: { pick: Pick; isShiny: boolean } | null = null
let evolveFrom: Pixels | null = null
// An evolution shown on its own screen over the whole band, `from` and `to` at their downloaded size. `said`: the
// toast telling what it became, held back until the screen has shown it (or plays none after all). `rows`: the
// band's height when it started, kept while it plays.
type Screen = { key: string; from: Mon; to: Mon; style: EvolutionStyle; isPreview: boolean; said?: string }
let screen: (Screen & { rows: number }) | null = null
// Screens waiting their turn: one at a time, and none while a wild Pokémon is out.
let screensDue: Screen[] = []
// Evolutions this session made itself, by look: another session's are shown when the party is drawn with them.
const evolvedHere = new Set<string>()
// Another session's evolution older than this when this one first draws it is not played again.
const NOTICE_MS = 30_000
// The member the evolution animation plays on: it follows it when the party changes under it.
let evolving = ''
// Party members waiting for /pokemon evolve, as the last evolution check found them (manual evolution only): by id and
// form, so one that has evolved since, here or in another session, isn't ready in its new form.
let readyKeys = new Set<string>()
const readyKey = (m: Member) => `${m.id}|${m.species}|${m.form}`
// Their ids. Nobody is ready while the party rests or evolves by itself, here or so set in another session.
const readyNow = () =>
  save.isOff || save.evolution === 'auto' ? [] : save.party.filter(m => readyKeys.has(readyKey(m))).map(m => m.id)
// What the last evolution check saw of what makes a Pokémon ready (but the time of day, which the minute beat
// checks): when it changes, here or synced from another session, the party is checked again.
let checkedInputs = ''
const inputsOf = (s: Save) =>
  JSON.stringify([
    s.evolution,
    s.isOff,
    viewOf(s).party.map(m => [m.id, m.species, m.form, level(m.xp), m.heldItem ?? '']),
  ])
function recheck($: EngineInterface) {
  const inputs = inputsOf(save)
  if (inputs === checkedInputs) return
  checkedInputs = inputs
  background($, learnEvolutions($))
}
let shown: { phase?: Phase; landscape?: Landscape; weather?: Weather; moon?: number; until: number } | null = null
let tzOffsetMin: number | null = null
// Settles once the session's save has loaded (or failed to); commands wait for it, never for a download.
let ready: Promise<void> = Promise.resolve()
// Settles once start-up (sprites, a first Pokémon, evolutions) has run, however it went.
let started: Promise<void> = Promise.resolve()
// The party couldn't be drawn (offline, a missing sprite): the next sync after start-up tries again.
let isPartyStale = false
// Each party refresh's number: only the latest one publishes.
let refreshes = 0
// The last error shown, so a failure repeating every sync is shown once.
let lastError: string | null = null
// Subagents running now, by agentId (or tool_use_id while a foreground one runs).
const agents = new Set<string>()
let demoAgents = 0

// Shows a failure once, as a toast, until something succeeds again.
async function report($: EngineInterface, err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  await update($, error, () => message)
  if (message === lastError) return
  lastError = message
  $.ui.toast(`Pokémon: ${message}`, { timeoutMs: 6000 })
}

async function clearError($: EngineInterface) {
  lastError = null
  await update($, error, () => null)
}

// Runs work no one awaits (a frame, xp, a visitor); a failure is reported.
function background($: EngineInterface, work: Promise<unknown>) {
  work.catch(err =>
    report($, err).catch(() => {
      // Nowhere left to report it: the session is closing.
    }),
  )
}

const feel = (what: Happening) => {
  status = react(status, what)
  wake()
}
const countAgents = () => {
  status = { ...status, agents: agents.size + demoAgents }
  wake()
}
const between = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1))
const fileOf = (m: { species: string; form: string }) => (m.form === 'regular' ? m.species : `${m.species}-${m.form}`)
// A walker's key: its member's id, so twins walk apart and an evolved one keeps its place.
const keyOf = (m: Member) => m.id
// What a member looks like on screen: the party is drawn again when any of these change.
const lookOf = (m: Member) => `${m.id}|${m.species}|${m.form}|${m.isShiny}`
// The party as drawn: it is laid out again when this changes.
const looksOf = (mons: Mon[]) => mons.map(m => `${m.key}|${m.name}|${m.isShiny}`).join()
// Whether a save about to be adopted shows another party than `was` (another session evolved, added or moved one).
// Every place that adopts a save checks, or the band keeps drawing the old one.
const isOtherParty = (next: Save, was: Save) => next.party.map(lookOf).join() !== was.party.map(lookOf).join()

// The engine's clock as last read (each tick and each band drawn): the band reads the hour while it draws, which
// can't wait on the clock, and the engine's clock is the one a test sets.
let clockMs: number | null = null
const readClock = async ($: EngineInterface) => (clockMs = await $.clock.now())

// Hours since the epoch in local time.
const localHour = (ms = clockMs ?? Date.now()) => localHourOf(ms, -new Date().getTimezoneOffset(), tzOffsetMin)

const isShowing = () => shown !== null && tickNo < shown.until

function phaseNow(): Phase {
  if (isShowing() && shown?.phase) return shown.phase
  return phaseAt(((localHour() % 24) + 24) % 24)
}

// The moon's shape tonight (moon.ts), from the same clock as the hour, or the one /pokemon-play shows.
function moonNow(): number {
  if (isShowing() && shown?.moon !== undefined) return shown.moon
  return moonPhaseAt(clockMs ?? Date.now())
}

// A different landscape every hour, the same in every session.
function landscapeNow(): Landscape {
  if (isShowing() && shown?.landscape) return shown.landscape
  return landscapeAt(localHour())
}

// Rain, snow or fog some hours, the same in every session.
function weatherNow(): Weather {
  if (isShowing() && shown?.weather) return shown.weather
  return weatherAt(localHour(), landscapeNow())
}

// Who each actor of the band is, for the weather's fans.
const actorsNow = () => (fitted?.keys ?? []).map(id => save.party.find(m => m.id === id))

// A download, failing after FETCH_TIMEOUT_MS.
async function fetchText($: EngineInterface, url: string) {
  const timeout = $.clock.sleep(FETCH_TIMEOUT_MS).then(() => {
    throw new Error(`no answer from ${new URL(url).host}`)
  })
  return Promise.race([$.http.fetch(url), timeout])
}

const isJson = (text: string) => {
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}
// Sprite art ends with a colour reset: a file cut short (a crash mid-write) doesn't, and is fetched again.
const isArt = (text: string) => text.includes('\x1b[') && text.trimEnd().endsWith('\x1b[0m')

// `url` from the download cache under `name`, fetched (and cached) when missing, unreadable, not `isValid` (a
// truncated file, a Wi-Fi login page) or older than `maxAgeMs`. When a refresh fails, an older copy still serves.
async function cachedFetch(
  $: EngineInterface,
  url: string,
  name: string,
  isValid: (text: string) => boolean,
  maxAgeMs = Infinity,
) {
  const path = cacheDir && `${cacheDir}/${name}`
  const cached = path ? await readCache($, path) : null
  const hit = cached && isValid(cached.text) ? cached : null
  if (hit && Date.now() - hit.mtimeMs < maxAgeMs) return { ok: true, status: 200, text: hit.text }
  try {
    const res = await fetchText($, url)
    if (res.ok && !isValid(res.text)) throw new Error(`a broken download from ${new URL(url).host}`)
    if (res.ok && path)
      await $.fs.write(path, res.text).catch(() => {
        // The cache is a courtesy to the hosts: an unwritable one just means downloading again.
      })
    if (!res.ok && hit) return { ok: true, status: 200, text: hit.text }
    return res
  } catch (err) {
    if (hit) return { ok: true, status: 200, text: hit.text }
    throw err
  }
}

// Callers at the same moment share one download.
let speciesLoading: Promise<Species[]> | null = null

function loadSpecies($: EngineInterface): Promise<Species[]> {
  speciesLoading ??= downloadSpecies($).catch(err => {
    speciesLoading = null
    throw err
  })
  return speciesLoading
}

async function downloadSpecies($: EngineInterface): Promise<Species[]> {
  const res = await cachedFetch($, `${BASE}/pokemon.json`, 'pokemon.json', isJson, LIST_MAX_AGE_MS)
  if (!res.ok) throw new Error(`pokemon list: HTTP ${res.status}`)
  // Names become file paths and URLs: only plain lowercase names and forms are kept.
  const raw = JSON.parse(res.text) as unknown
  const list = (Array.isArray(raw) ? raw : []).flatMap((p: { name?: unknown; forms?: unknown }) =>
    isName(p.name) && Array.isArray(p.forms) ? [{ name: p.name, forms: p.forms.filter(isName) }] : [],
  )
  if (!list.length) throw new Error('pokemon list: empty')
  species = list
  return species
}

// A sprite's art, the shiny one when asked and it exists; resolves whether it is shiny.
async function fetchArt(
  $: EngineInterface,
  file: string,
  isShiny: boolean,
): Promise<{ art: string; isShiny: boolean }> {
  for (const shiny of isShiny ? [true, false] : [false]) {
    const key = `${file}|${shiny}`
    const cached = arts.get(key)
    if (cached) return { art: cached, isShiny: shiny }
    const kind = shiny ? 'shiny' : 'regular'
    const res = await cachedFetch($, `${BASE}/colorscripts/small/${kind}/${file}`, `sprites/${kind}/${file}`, isArt)
    if (res.ok) {
      arts.set(key, res.text)
      return { art: res.text, isShiny: shiny }
    }
  }
  throw new Error(`no sprite for ${file}`)
}

// Save reads and writes run one at a time, so two changes in this session never overwrite each other.
let saving: Promise<unknown> = Promise.resolve()
function queued<T>(work: () => Promise<T>): Promise<T> {
  // A failed change was reported to its caller; it doesn't hold up the next.
  const run = saving.catch(() => {}).then(work)
  saving = run
  return run
}

// Inside the queue: `change` made on the store's latest save and stored. The store has no compare-and-set, so the save
// is read again just before the write: when another window wrote meanwhile, `change` is made again on what it wrote
// (twice more at most). Two windows writing within one store round trip can still lose one of the changes; none is
// ever made twice. Nothing is written when nothing changes. Resolves the save read and the save as it now stands.
async function writeSave($: EngineInterface, change: (s: Save) => Save) {
  for (let tries = 1; ; tries++) {
    const raw = await $.store.get('save')
    if (versionOf(raw) > SAVE_VERSION) throw new Error(TOO_NEW)
    await seedTogether($, raw)
    const latest = loadSave(raw)
    const next = change(latest)
    if (next === latest || JSON.stringify(next) === JSON.stringify(latest)) return { latest, next: latest }
    if (tries < 3 && JSON.stringify(await $.store.get('save')) !== JSON.stringify(raw)) continue
    await $.store.set('save', { ...next, version: SAVE_VERSION })
    return { latest, next }
  }
}

// Applies `change` to the latest save (another Claude Code session may have written since), then stores
// and adopts the result, so sessions running side by side don't undo each other. A write the store refuses (another
// window holding its lock) changes nothing here: the save and the party drawn are read again from the store.
// `withLedgers`: `change` also gets the session ledgers, read in the queue just before the write, so a fold landing
// first can't have its ₽ counted twice (as when a purchase checks the wallet).
function mutate($: EngineInterface, change: (s: Save, ledgers: Record<string, Ledger>) => Save, withLedgers = false) {
  let isRedrawn = false
  const run = queued(async () => {
    const ledgers = withLedgers ? await readLedgers($) : {}
    const { latest, next } = await writeSave($, s => change(s, ledgers))
    isRedrawn = isOtherParty(latest, save)
    save = next
    // A fold may have landed with it: ledger XP is counted against the save's own marks.
    countLedgers(await readLedgers($))
  })
  run.catch(() =>
    background(
      $,
      sync($).then(() => refreshParty($)),
    ),
  )
  // In the background: a stalled download never holds up the command.
  return run.then(() => {
    if (isRedrawn) background($, refreshParty($))
    // The open Mart shows the Bag, the wallet and the party's evolutions: any change to the save may move them.
    if (mart.isOpen) $.ui.invalidate('ui.render')
    // A held item taken, a partner deposited or released: who is ready may have changed.
    recheck($)
  })
}

// Picks up what other sessions changed: party, levels, Pokédex, size, on/off.
async function sync($: EngineInterface) {
  let isNewParty = false
  let isNewLook = false
  // Adopted inside the queue, so no change made meanwhile is undone.
  await queued(async () => {
    const latest = loadSave(await $.store.get('save'))
    isNewParty = isOtherParty(latest, save)
    const was = JSON.stringify([save.bag, balanceOf(save, cash)])
    const [wasSize, wasOff] = [save.size, save.isOff]
    save = latest
    countLedgers(await readLedgers($))
    // The wallet is judged after the ledgers are counted: another window's earnings change only those.
    isNewLook =
      latest.size !== wasSize ||
      latest.isOff !== wasOff ||
      (mart.isOpen && JSON.stringify([latest.bag, balanceOf(latest, cash)]) !== was)
    times = loadTogether(await $.store.get(TOGETHER)).ms
  })
  if (isNewParty) await refreshParty($)
  if (isNewLook) $.ui.invalidate('ui.render')
  recheck($)
}

// Every session's XP ledger in the store, by key.
async function readLedgers($: EngineInterface): Promise<Record<string, Ledger>> {
  const ledgers: Record<string, Ledger> = {}
  for (const key of await $.store.keys()) if (key.startsWith(LEDGER)) ledgers[key] = loadLedger(await $.store.get(key))
  return ledgers
}

// Folds the ledgers of sessions that have ended into the save, so the store doesn't grow with every session. A
// ledger is removed only on a later round, once its fold has been in the save for a whole sync: no write that
// read the save before the fold can still land and undo it. One written to meanwhile is left for the next round.
async function foldLedgers($: EngineInterface) {
  const ledgers = await readLedgers($)
  const now = Date.now()
  const stale = Object.entries(ledgers).filter(([key, l]) => key !== ledgerKey && now - l.at >= LEDGER_STALE_MS)
  // XP a ledger gained after an earlier fold is folded too, before it can go.
  const toFold = stale.filter(([key, l]) => foldLedger(save, key, l) !== save)
  // Marks of ledgers gone from the store are dropped.
  const gone = (save.folded ?? []).filter(k => !(k in ledgers))
  // One write for the whole round, however many sessions ended: each window runs it on its own timer.
  if (toFold.length || gone.length)
    await mutate($, s => {
      const folded = toFold.reduce((acc, [key, l]) => foldLedger(acc, key, l), s)
      if (!gone.length) return folded
      const keep = <T,>(o: Record<string, T> | undefined) =>
        Object.fromEntries(Object.entries(o ?? {}).filter(([k]) => !gone.includes(k)))
      const marks = (folded.folded ?? []).filter(k => !gone.includes(k))
      const foldedXp = keep(folded.foldedXp)
      const foldedMoney = keep(folded.foldedMoney)
      const { folded: _, foldedXp: __, foldedMoney: ___, ...rest } = folded
      return {
        ...rest,
        ...(marks.length ? { folded: marks } : {}),
        ...(Object.keys(foldedXp).length ? { foldedXp } : {}),
        ...(Object.keys(foldedMoney).length ? { foldedMoney } : {}),
      }
    })
  // Folded on an earlier round and unchanged since: removed.
  for (const [key, l] of stale) {
    if (toFold.some(([k]) => k === key)) continue
    const latest = loadLedger(await $.store.get(key))
    if (latest.at === l.at) await $.store.delete(key)
  }
}

// The periodic sync, which also retries what start-up couldn't do: a first Pokémon, the party's sprites. That retry
// runs one at a time: one still waiting on a slow download isn't started again (two at once would catch two first
// Pokémon, the first going to the PC box), while the syncs go on.
let retrying: Promise<unknown> | null = null
async function retry($: EngineInterface) {
  await sync($)
  if (++syncs % FOLD_EVERY === 0) await foldLedgers($)
  if (save.isOff || retrying) return
  if (!save.party.length) retrying = setLead($, '', true)
  else if (isPartyStale) retrying = refreshParty($)
  if (retrying) await retrying.finally(() => (retrying = null))
}

// A save from before the `together` key kept time together in itself (`raw`, read just before): it seeds the key
// once, before this session writes the save (which drops it) or adds time. A key already there was seeded (or
// beaten into) by another session: it is left alone.
let isSeeded = false
async function seedTogether($: EngineInterface, raw: unknown) {
  if (isSeeded) return
  if ((await $.store.get(TOGETHER)) === undefined) await $.store.set(TOGETHER, togetherOf(raw))
  isSeeded = true
}

// Time together for the party, then any evolution it (or the hour) has brought. Only the `together` key is written,
// never the save: a purchase, catch or evolution another session saves meanwhile can't be undone by it. Two sessions
// beating at the same moment may lose a minute between them, nothing more.
async function together($: EngineInterface) {
  if (save.isOff || !save.party.length) return
  const now = await $.clock.now()
  let isBeat = false
  await queued(async () => {
    const raw = await $.store.get('save')
    await seedTogether($, raw)
    const latest = loadSave(raw)
    if (latest.isOff || !latest.party.length) return
    const added = addTogether(loadTogether(await $.store.get(TOGETHER)), latest, now)
    await $.store.set(TOGETHER, added)
    times = added.ms
    isBeat = true
  })
  if (isBeat) await learnEvolutions($)
}

// Fetches every party member's sprite and publishes the party for drawing. A refresh overtaken by a newer
// one publishes nothing; one that fails is tried again at the next sync.
async function refreshParty($: EngineInterface) {
  const mine = ++refreshes
  try {
    const mons: Mon[] = []
    for (const m of save.party) {
      const { art } = await fetchArt($, fileOf(m), m.isShiny)
      mons.push({ key: keyOf(m), name: displayName(m.species, m.form), isShiny: m.isShiny, ...parseAnsi(art) })
    }
    if (mine !== refreshes) return
    const was = await read($, party)
    noticeEvolutions($, was, mons, await $.clock.now())
    // One whose screen hasn't played yet keeps its old form until then.
    await update($, party, () => mons.map(heldBack))
    isPartyStale = false
    await clearError($)
  } catch (err) {
    if (mine !== refreshes) return
    isPartyStale = true
    await report($, err)
  }
}

// What a new party member from `query` would be (a random one when it names none), spelled exactly, with `shiny`
// anywhere forcing a shiny; or the answer instead: a suggestion naming `command` ('' or 'add '), or that no Pokémon is
// called that. Downloads no sprite.
async function newPick($: EngineInterface, query: string, command = ''): Promise<Wanted | string> {
  const list = await loadSpecies($)
  const named = readName(list, query)
  if ('error' in named) return named.error
  if ('guess' in named) return didYouMean(named.guess, `${command}${named.wantsShiny ? 'shiny ' : ''}`)
  return { pick: named.pick ?? randomPick(list), wantsShiny: named.wantsShiny }
}
type Wanted = { pick: Pick; wantsShiny: boolean }

// The new member `wanted` names, its sprite downloaded.
async function catchPick($: EngineInterface, { pick, wantsShiny }: Wanted): Promise<Member> {
  const { isShiny } = await fetchArt($, fileOf(pick), wantsShiny || Math.random() < SHINY_ODDS)
  return { id: newId(), species: pick.species, form: pick.form, isShiny, xp: 0, evolutions: 0 }
}

async function catchOne($: EngineInterface, query: string, command = ''): Promise<Member | string> {
  const wanted = await newPick($, query, command)
  return typeof wanted === 'string' ? wanted : catchPick($, wanted)
}

const levelNow = (m: Member) => level(m.xp)
// A stored member's level with the XP the ledgers hold for it.
const levelWithLedger = (m: Member) => level(m.xp + (extra[m.id] ?? 0))
// The members `query` names in `places` of `s`, with their levels as the party stands. A spot's `at` is its place in
// `s` too.
const find = (s: Save, query: string, places: Place[], command: string) =>
  findMembers(viewOf(s), query, places, command, levelNow, species ?? [], replyColumns)
// The one member found, or the answer instead: which one (numbered), a suggestion, or who is there.
function spotOf(found: Found, query: string, command: string): Spot | string {
  if ('spot' in found) return found.spot
  return 'choices' in found ? formatChoices(found.choices, query, command, levelNow) : found.error
}
const pickIn = (s: Save, query: string, places: Place[], command: string) =>
  spotOf(find(s, query, places, command), query, command)
// A query that names none of `places`: a number past the end of the list still names some.
const isNoneIn = (found: Found) => 'error' in found && !isList(found.error)
// A query naming a level (`eevee lv 30`) is about one you have: it never catches a new one.
const isLevelled = (query: string) => readLevel(query).level !== undefined

// `/pokemon [name]`: makes that Pokémon the lead. One already in the party moves up with its level, one in the PC
// box comes out; a new one leads, and the old lead goes into the PC box with its level and what it holds. `shiny`
// names a shiny one: with none of it shiny owned, a new shiny one is caught, however many plain ones there are.
// `isFirst`: a session's first Pokémon, caught because its save looked empty. A save that only looked empty (a read the
// store refused) has its party when written: then nothing is caught, and the lead stays.
async function setLead($: EngineInterface, query: string, isFirst = false): Promise<string> {
  const owned = query.trim() ? await leadOwned($, query) : null
  if (owned) return owned
  // A misspelt name gets its suggestion first, a full box its refusal before the sprite's download; the save write
  // checks again.
  const wanted = await newPick($, query)
  if (typeof wanted === 'string') return wanted
  const lead = save.party[0]
  if (lead && isBoxFull(save)) return noRoomForLead(lead)
  const caught = await catchPick($, wanted)
  let text = ''
  let isCaught = false
  await mutate($, latest => {
    isCaught = false
    const gone = latest.party[0]
    if (isFirst && gone) {
      text = ''
      return latest
    }
    if (gone && isBoxFull(latest)) {
      text = noRoomForLead(gone)
      return latest
    }
    const s = recordSeen(latest, caught.species, caught.isShiny, Date.now())
    isCaught = true
    text = `${caught.isShiny ? '✨ ' : ''}A wild ${displayName(caught.species, caught.form)} appeared! It's your new lead.`
    if (gone) text += ` ${nameOf(gone)} (Lv ${levelWithLedger(gone)}) went into the PC box.`
    return {
      ...s,
      party: [caught, ...s.party.slice(1)],
      ...(gone ? { box: [...(s.box ?? []), gone] } : {}),
    }
  })
  if (!isCaught) return text
  await refreshParty($)
  background($, learnEvolutions($))
  return text
}

// A new lead needs the old one to go into the PC box: refused when it's full, and nothing changes.
const noRoomForLead = (lead: Member) =>
  `${BOX_FULL} ${nameOf(lead)} can't go there to make way for a new lead. ${MAKE_ROOM}`

async function addMember($: EngineInterface, query: string): Promise<string> {
  // Another session may have made room since the last sync.
  await sync($)
  if (save.party.length >= MAX_PARTY)
    return `Your party is full (${MAX_PARTY}). Make room with /pokemon deposit <name> or remove <name>.`
  const fromBox = query.trim() ? await addFromBox($, query) : null
  if (fromBox) return fromBox
  const caught = await catchOne($, query, 'add ')
  if (typeof caught === 'string') return caught
  const name = displayName(caught.species, caught.form)
  let text = ''
  await mutate($, s => {
    text = `${caught.isShiny ? '✨ ' : ''}${name} joined your party!`
    if (s.party.length >= MAX_PARTY)
      text = `Your party is full (${MAX_PARTY}). Make room with /pokemon deposit <name> or remove <name>.`
    else return { ...recordSeen(s, caught.species, caught.isShiny, Date.now()), party: [...s.party, caught] }
    return s
  })
  await refreshParty($)
  background($, learnEvolutions($))
  return text
}

// `/pokemon <name>` for a Pokémon in the party or the PC box: one in the party moves up with its level; one in the box
// leads, and the old lead goes into the box. Of several, which one. Null when it names none of them.
async function leadOwned($: EngineInterface, query: string): Promise<string | null> {
  let text = ''
  let isMoved = false
  await mutate($, s => {
    text = ''
    isMoved = false
    const found = find(s, query, ['party', 'box'], '')
    if (isNoneIn(found) && !isLevelled(query)) return s
    const spot = spotOf(found, query, '')
    if (typeof spot === 'string') {
      text = spot
      return s
    }
    const lv = levelWithLedger
    const box = s.box ?? []
    const m = spot.place === 'party' ? s.party[spot.at] : box[spot.at]
    if (!m) return s
    isMoved = true
    if (spot.place === 'party') {
      text = `${nameOf(m)} leads the party again (Lv ${lv(m)}).`
      return { ...s, party: [m, ...s.party.filter((_, i) => i !== spot.at)] }
    }
    const old = s.party[0]
    text = `${nameOf(m)} (Lv ${lv(m)}) came out of the PC box to lead your party.`
    if (old) text += ` ${nameOf(old)} (Lv ${lv(old)}) went into the PC box.`
    return {
      ...s,
      party: [m, ...s.party.slice(1)],
      box: [...box.filter((_, i) => i !== spot.at), ...(old ? [old] : [])],
    }
  })
  if (isMoved) {
    await refreshParty($)
    background($, learnEvolutions($))
  }
  return text || null
}

// `/pokemon add <name>` for a Pokémon in the PC box: it comes out and joins the party. Of several there, which one.
// Null when it names none of them.
async function addFromBox($: EngineInterface, query: string): Promise<string | null> {
  let text = ''
  let isMoved = false
  await mutate($, s => {
    text = ''
    isMoved = false
    const found = find(s, query, ['box'], 'add ')
    if (s.party.length >= MAX_PARTY || (isNoneIn(found) && !isLevelled(query))) return s
    const spot = spotOf(found, query, 'add ')
    if (typeof spot === 'string') {
      text = spot
      return s
    }
    const box = s.box ?? []
    const m = box[spot.at]
    if (!m) return s
    isMoved = true
    text = `${nameOf(m)} came out of the PC box and joined your party!`
    return { ...s, party: [...s.party, m], box: box.filter((_, i) => i !== spot.at) }
  })
  if (isMoved) {
    await refreshParty($)
    background($, learnEvolutions($))
  }
  return text || null
}

// `/pokemon release <name> [n]` (or `remove`): that one, from the party or the PC box, goes back to the wild, with no
// confirmation; what it held goes back to the Bag. Looked up in the save as it is now, so a member another session
// released is simply not found.
async function releaseOne($: EngineInterface, query: string, command: string): Promise<string> {
  if (!query.trim()) return 'Which one? /pokemon release <name>'
  let text = ''
  let isPartyChanged = false
  await mutate($, s => {
    isPartyChanged = false
    const spot = pickIn(s, query, ['party', 'box'], `${command} `)
    const done = typeof spot === 'string' ? spot : releaseMember(s, spot, query, levelWithLedger)
    if (typeof done === 'string') {
      text = done
      return s
    }
    text = done.text
    isPartyChanged = typeof spot !== 'string' && spot.place === 'party'
    return done.save
  })
  if (isPartyChanged) await refreshParty($)
  return text
}

// `/pokemon deposit <name>`: that member goes into the PC box with its level; the next one leads if it was the lead.
async function depositMember($: EngineInterface, query: string): Promise<string> {
  if (!query.trim()) return 'Which one? /pokemon deposit <name>'
  let text = ''
  await mutate($, s => {
    const spot = pickIn(s, query, ['party'], 'deposit ')
    const at = typeof spot === 'string' ? -1 : spot.at
    const m = s.party[at]
    if (typeof spot === 'string') text = spot
    else if (s.party.length === 1)
      text = 'That would leave your party empty. Pick a new lead with /pokemon <name> instead.'
    else if (m && isBoxFull(s)) text = `${BOX_FULL} ${nameOf(m)} stays in your party. ${MAKE_ROOM}`
    else if (m) {
      text = `${nameOf(m)} (Lv ${levelWithLedger(m)}) went into the PC box.`
      return { ...s, party: s.party.filter((_, i) => i !== at), box: [...(s.box ?? []), m] }
    }
    return s
  })
  await refreshParty($)
  return text
}

// `/pokemon give <item> <name>`: a stone or trade item evolves it now; a hold item is held; a Rare Candy is a level.
async function giveItem($: EngineInterface, args: string): Promise<string> {
  const words = slug(args).split('-').filter(Boolean)
  const found = splitGive(words)
  if (!found) {
    const guess = guessItem(words)
    return guess
      ? `Did you mean ${guess.item.name}? Run /pokemon give ${guess.item.id} ${typedRest(args, guess.rest) || '<pokemon>'}`
      : 'Give what to whom? /pokemon give <item> <pokemon> · /pokemon bag lists your items.'
  }
  const { item, rest } = found
  // As typed, so a number in it is read as typed (`eevee -1` lists).
  const who = typedRest(args, rest)
  if (!who) return `Give ${withArticle(item.name)} to whom? /pokemon give ${item.id} <pokemon>`
  await sync($)
  if (item.kind === 'candy') return feedCandy($, who, item)
  if (item.kind === 'hold') return holdItem($, who, item, `give ${item.id} `)
  // The longest start of the words that names one of the party is who; the rest, if any, the branch it takes
  // (`give thunder-stone pikachu alolan raichu`), as `/pokemon evolve` reads them.
  const typed = who.trim().split(/\s+/)
  let answer = ''
  for (let n = typed.length; n >= 1; n--) {
    const as = typed.slice(0, n).join(' ')
    const spot = pickIn(save, as, ['party'], `give ${item.id} `)
    if (typeof spot === 'string') {
      answer ||= spot
      continue
    }
    const rest = typed.slice(n)
    // A number left over is a twin's that isn't there (`eevee 2` with one): the longer name's answer says so.
    if (answer && rest.length === 1 && /^\d+$/.test(rest[0] ?? '')) return answer
    const into = slug(rest.filter(w => !/^(into|to)$/i.test(w)).join(' '))
    // It checks the Bag before anything plays, and takes the item in the same write as the evolution.
    const name = displayName(spot.member.species, spot.member.form)
    return answerSoon(
      $,
      evolveMember($, spot.member.id, false, item.id, undefined, into ? { into, as } : undefined),
      `Giving the ${item.name} to ${name}: what it does shows ${whenShown()}.`,
    )
  }
  return answer
}

// The member `query` names holds `item` from the Bag (an Everstone is free); what it held goes back to the Bag.
async function holdItem($: EngineInterface, query: string, item: Item, command: string): Promise<string> {
  let text = ''
  await mutate($, s => {
    const spot = pickIn(s, query, ['party'], command)
    if (typeof spot === 'string') {
      text = spot
      return s
    }
    const at = spot.at
    const m = s.party[at]
    if (!m) return s
    const name = displayName(m.species, m.form)
    const isFree = item.id === 'everstone'
    if (!isFree && !s.bag?.[item.id]) {
      text = noItem(item.name)
      return s
    }
    if (m.heldItem === item.id) {
      text = `${name} is already holding ${withArticle(item.name)}.`
      return s
    }
    let after = isFree ? s : takeFromBag(s, item.id)
    const old = m.heldItem
    if (old && old !== 'everstone') {
      const back = putInBag(after, old)
      if (!back) {
        text = bagFull(itemName(old))
        return s
      }
      after = back
    }
    text = isFree ? `${name} holds an everstone: it won't evolve.` : `${name} is now holding ${withArticle(item.name)}.`
    if (old)
      text +=
        old === 'everstone'
          ? ' It dropped its everstone and can evolve again.'
          : ` Its ${itemName(old)} went back to your Bag.`
    return { ...after, party: after.party.map((p, i) => (i === at ? { ...p, heldItem: item.id } : p)) }
  })
  // A held item may be what it was waiting for.
  background($, learnEvolutions($))
  return text
}

// `/pokemon take <name>`: its held item back to the Bag; an Everstone is just dropped. Looks in `places` (the party,
// then the PC box) with one numbering; of several named without a number, the only one holding an item, if just one
// is, else which one.
async function takeItem($: EngineInterface, query: string, places: Place[] = ['party', 'box']): Promise<string> {
  if (!query.trim()) return 'Which one? /pokemon take <name>'
  let text = ''
  let isDropped = false
  await mutate($, s => {
    isDropped = false
    const found = find(s, query, places, 'take ')
    const holders = 'choices' in found ? found.choices.filter(c => c.member.heldItem) : []
    const spot = holders[0] && holders.length === 1 ? holders[0] : spotOf(found, query, 'take ')
    if (typeof spot === 'string') {
      text = spot
      return s
    }
    const { at } = spot
    const isInBox = spot.place === 'box'
    const m = isInBox ? s.box?.[at] : s.party[at]
    if (!m) return s
    const name = displayName(m.species, m.form)
    const { heldItem, ...rest } = m
    if (!heldItem) {
      text = `${name} isn't holding anything.`
      return s
    }
    let after = s
    if (heldItem === 'everstone') {
      text = `${name} dropped its everstone and can evolve again.`
      isDropped = true
    } else {
      const back = putInBag(s, heldItem)
      if (!back) {
        text = bagFull(itemName(heldItem))
        return s
      }
      after = back
      text = `${name}'s ${itemName(heldItem)} went back to your Bag.`
    }
    const without = (list: Member[]) => list.map((p, i) => (i === at ? rest : p))
    return isInBox ? { ...after, box: without(after.box ?? []) } : { ...after, party: without(after.party) }
  })
  // Already past its level: it evolves now.
  if (isDropped) background($, learnEvolutions($))
  return text
}

// `/pokemon everstone <name>`: gives it the free Everstone, or takes it back.
async function toggleEverstone($: EngineInterface, query: string): Promise<string> {
  if (!query.trim()) return 'Which one? /pokemon everstone <name>'
  await sync($)
  const spot = pickIn(save, query, ['party'], 'everstone ')
  if (typeof spot === 'object' && save.party[spot.at]?.heldItem === 'everstone') return takeItem($, query, ['party'])
  const everstone = itemById('everstone')
  return everstone ? holdItem($, query, everstone, 'everstone ') : 'Your party is empty.'
}

// A Rare Candy: one level, up to MAX_LEVEL; the level may bring an evolution.
async function feedCandy($: EngineInterface, query: string, item: Item): Promise<string> {
  let text = ''
  let grew = false
  await mutate($, s => {
    grew = false
    const spot = pickIn(s, query, ['party'], `give ${item.id} `)
    if (typeof spot === 'string') {
      text = spot
      return s
    }
    const at = spot.at
    const m = s.party[at]
    if (!m) return s
    const name = displayName(m.species, m.form)
    if (!s.bag?.[item.id]) {
      text = noItem(item.name)
      return s
    }
    const xp = m.xp + (extra[m.id] ?? 0)
    const lv = level(xp)
    if (lv >= MAX_LEVEL) {
      text = `${name} is already Lv ${MAX_LEVEL}.`
      return s
    }
    text = `${name} grew to Lv ${lv + 1}!`
    grew = true
    const after = takeFromBag(s, item.id)
    return { ...after, party: after.party.map((p, i) => (i === at ? { ...p, xp: p.xp + xpForLevel(lv + 1) - xp } : p)) }
  })
  if (grew) background($, learnEvolutions($))
  return text
}

// `qty` of the item `id`, as the Mart posts it: anything but an item for sale and a whole 1..MAX_BAG changes nothing.
export async function buyItem(
  $: EngineInterface,
  id: unknown,
  qty: unknown,
): Promise<{ text: string; isError: boolean }> {
  const item = typeof id === 'string' ? itemById(id) : undefined
  if (!item || !isForSale(item)) return { text: "That isn't for sale.", isError: true }
  if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1 || qty > MAX_BAG)
    return { text: "That isn't a quantity you can buy.", isError: true }
  let result = { text: '', isError: true }
  await mutate(
    $,
    (s, ledgers) => {
      const bought = buy(s, extraMoney(ledgers, s.folded, s.foldedMoney), item, qty)
      result = { text: bought.text, isError: bought.isError }
      return bought.save
    },
    true,
  )
  return result
}

// The Mart by tab with prices, for a bare `/pokemon buy`.
function formatMart(balance: number, columns = Infinity): string {
  const lines = [`PokéMart · ${formatMoney(balance)}`]
  for (const tab of TABS) {
    const items = forSale().filter(i => i.tab === tab)
    if (items.length)
      lines.push(
        ...tabLines(
          tab,
          items.map(i => `${i.name} ${formatMoney(i.price)}`),
          columns,
        ),
      )
  }
  lines.push('  /pokemon buy <item> [count], e.g. buy fire stone 3')
  return lines.join('\n')
}

// `/pokemon buy <item> [count]`: the Mart's buy by typing, for a terminal that passes no clicks. The item and the count
// come first or last, as `give` takes an item.
async function buyCommand($: EngineInterface, args: string): Promise<string> {
  await sync($)
  if (!args.trim()) return formatMart(balanceOf(save, cash), replyColumns)
  const tokens = args.trim().split(/\s+/)
  const isCount = (t: string | undefined) => t !== undefined && /^[-+]?\d+(\.\d+)?$/.test(t)
  const countAt = isCount(tokens[0]) ? 0 : isCount(tokens[tokens.length - 1]) ? tokens.length - 1 : -1
  const count = countAt < 0 ? 1 : Number(tokens[countAt])
  const words = slug(tokens.filter((_, i) => i !== countAt).join(' '))
    .split('-')
    .filter(Boolean)
  const found = splitGive(words)
  if (!found || found.rest.length) {
    const guess = found ? null : guessItem(words, isForSale)
    return guess && !guess.rest.length
      ? `Did you mean ${guess.item.name}? Run /pokemon buy ${guess.item.id}${countAt < 0 ? '' : ` ${tokens[countAt]}`}`
      : 'Buy what? /pokemon buy <item> [count] · /pokemon buy lists the Mart.'
  }
  const { text, isError } = await buyItem($, found.item.id, count)
  if (isError) return text
  await sync($)
  return `${text} ${formatMoney(balanceOf(save, cash))} left.`
}

async function setOff($: EngineInterface, isOff: boolean): Promise<string> {
  if (isOff) {
    closeMart($)
    dropScreens($)
  }
  let was = false
  await mutate($, s => {
    was = Boolean(s.isOff)
    const { isOff: _, ...rest } = s
    return isOff ? { ...rest, isOff: true } : rest
  })
  $.ui.invalidate('ui.render')
  // Evolutions held back while they rested.
  if (!isOff) background($, learnEvolutions($))
  if (isOff)
    return was
      ? 'Your Pokémon are already resting.'
      : 'Your Pokémon are resting in their Poké Balls. /pokemon on brings them back.'
  return was ? 'Your Pokémon are back in the meadow!' : 'Your Pokémon are already out.'
}

async function setSize($: EngineInterface, size: string): Promise<string> {
  if (size !== 'auto' && size !== 'normal' && size !== 'small')
    return 'Sizes: small, normal, auto (small on short terminals).'
  await mutate($, s => ({ ...s, size: size as Size }))
  $.ui.invalidate('ui.render')
  return `Pokémon size: ${size}.`
}

const STYLE_TEXT: Record<EvolutionStyle, string> = {
  rays: 'a dark stage with light rays turning behind (Gen 4–5)',
  white: 'a plain white screen, like the Game Boy games (Gen 1–2)',
  gradient: 'a blue-to-purple glow with rising sparkles (Gen 3)',
}

// The evolution screen styles, one line each, with the one in use marked.
function styleChoices(current: EvolutionStyle): string {
  return EVOLUTION_STYLES.map(s => `  ${s}: ${STYLE_TEXT[s]}${s === current ? ' (current)' : ''}`).join('\n')
}

// Letters to change, add or drop to turn `a` into `b`.
// What to answer a word that isn't a style: the choices, led by a guess when it is a near typo.
function unknownStyle(word: string, current: EvolutionStyle): string {
  const [guess] = EVOLUTION_STYLES.filter(s => distance(word, s, 2) <= 2).sort(
    (a, b) => distance(word, a, 2) - distance(word, b, 2),
  )
  return `${guess ? `Did you mean ${guess}? ` : ''}Evolution screen styles:\n${styleChoices(current)}`
}

async function setEvolutionStyle($: EngineInterface, word: string): Promise<string> {
  if (!word) {
    await sync($)
    return `Evolution screen: ${styleOf(save)}.\n${styleChoices(styleOf(save))}`
  }
  if (!isEvolutionStyle(word)) return unknownStyle(word, styleOf(save))
  await mutate($, s => ({ ...s, evolutionStyle: word }))
  return `Evolution screen: ${word}, ${STYLE_TEXT[word]}.`
}

// What `member` can evolve into and how, as in the games (empty at a final stage), its species' gender ratio, and the
// chain they were read from (for /pokedex <name>).
async function evolutionsOf(
  $: EngineInterface,
  member: Member,
): Promise<{ stages: Stage[]; genderRate: unknown; chain?: ChainLink }> {
  const list = await loadSpecies($)
  const res = await cachedFetch(
    $,
    `${POKEAPI}/pokemon-species/${member.species}`,
    `pokeapi/species-${member.species}.json`,
    isJson,
  )
  // A species PokeAPI doesn't have (the sprite list ahead of it): no evolutions, stored once, never asked every minute.
  if (res.status === 404) return { stages: [], genderRate: undefined }
  if (!res.ok) throw new Error(`evolution data: HTTP ${res.status}`)
  const data = JSON.parse(res.text) as { evolution_chain?: { url?: string }; gender_rate?: unknown }
  const genderRate = data.gender_rate
  const chainUrl = data.evolution_chain?.url
  if (!chainUrl) return { stages: [], genderRate }
  const chainId = /(\d+)\/?$/.exec(chainUrl)?.[1] ?? member.species
  const chainRes = await cachedFetch($, chainUrl, `pokeapi/chain-${chainId}.json`, isJson)
  if (!chainRes.ok) throw new Error(`evolution data: HTTP ${chainRes.status}`)
  const chain = (JSON.parse(chainRes.text) as { chain: ChainLink }).chain
  const forms = (list.find(s => s.name === member.species)?.forms ?? []).filter(f => f !== 'regular')
  const stages = nextStages(chain, member.species, pokeapiForm(member.species, member.form), member.gender, forms)
  return { stages: stages.filter(n => list.some(s => s.name === n.species)), genderRate, chain }
}

// The types of a PokeAPI form (`rattata-alola` is Dark), cached. A form PokeAPI doesn't know has none, and isn't
// asked again; a failed download is reported and gives none: an evolution that needs a type waits.
const types = new Map<string, string[]>()
async function typesOf($: EngineInterface, name: string): Promise<string[]> {
  const known = types.get(name)
  if (known) return known
  try {
    const res = await cachedFetch($, `${POKEAPI}/pokemon/${name}`, `pokeapi/pokemon-${name}.json`, isJson)
    if (!res.ok) {
      types.set(name, [])
      return []
    }
    const raw = (JSON.parse(res.text) as { types?: unknown }).types
    const found = (Array.isArray(raw) ? raw : []).flatMap((t: { type?: { name?: unknown } }) => {
      const type = t.type?.name
      return isName(type) ? [type] : []
    })
    types.set(name, found)
    return found
  } catch (err) {
    await report($, err)
    return []
  }
}

const isEvolutionMode = (word: string): word is Evolution => word === 'manual' || word === 'auto'

// `/pokemon evolve manual|auto`, or the mode in use and how to change it.
async function setEvolution($: EngineInterface, mode: string): Promise<string> {
  if (!isEvolutionMode(mode)) {
    await sync($)
    return `Evolution is ${save.evolution}. /pokemon evolve manual: a Pokémon that can evolve waits for /pokemon evolve <name>. /pokemon evolve auto: it evolves by itself.`
  }
  await mutate($, s => ({ ...s, evolution: mode }))
  // In auto anyone waiting evolves now; in manual they're marked ready.
  background($, learnEvolutions($))
  return mode === 'auto'
    ? 'Evolution: auto. Your Pokémon evolve by themselves as soon as they can.'
    : "Evolution: manual. A Pokémon that can evolve waits for /pokemon evolve <name>; gold motes show it's ready."
}

// `/pokemon evolve <name> [into]`: the longest start of the words that names one party member is the one to evolve
// (`eevee 2` for a twin), and the rest, if any, the species it evolves into. A level anywhere (`lv 30`) narrows the
// name. `manual` or `auto` alone sets the mode, and nothing shows it.
async function evolveByName($: EngineInterface, query: string): Promise<string> {
  const word = query.trim().toLowerCase()
  if (!query.trim() || isEvolutionMode(word)) return setEvolution($, word)
  await sync($)
  if (save.isOff) return RESTING
  const { level: lv, rest: named } = readLevel(query)
  const words = named.trim().split(/\s+/).filter(Boolean)
  const firstWords = (n: number) => [...words.slice(0, n), ...(lv === undefined ? [] : [`lv ${lv}`])].join(' ')
  let answer = ''
  // A level alone (`lv 30`) names whoever is at it: the one, or which one when several are.
  for (let n = words.length; n >= (words.length ? 1 : 0); n--) {
    const found = find(save, firstWords(n), ['party'], 'evolve ')
    const only = !n && 'choices' in found && found.choices.length === 1 ? found.choices[0] : undefined
    const spot = only ?? spotOf(found, firstWords(n), 'evolve ')
    const rest = words.slice(n)
    // A number left over is a twin's that isn't there (`charmander 2` with one): the longer name's answer says so.
    if (typeof spot !== 'string' && answer && rest.length === 1 && /^\d+$/.test(rest[0] ?? '')) return answer
    // `eevee into espeon` reads as `eevee espeon`.
    if (/^(into|to)$/i.test(rest[0] ?? '')) rest.shift()
    if (typeof spot !== 'string')
      return answerSoon(
        $,
        evolveMember($, spot.member.id, false, undefined, undefined, {
          into: slug(rest.join(' ')),
          as: firstWords(n),
        }),
        `Evolving ${displayName(spot.member.species, spot.member.form)}: what it comes to shows ${whenShown()}.`,
      )
    // Words that name one of yours without the level asked: no one of them is at it, which says more than the longer
    // name's answer (`eevee lv 50 espeon`).
    if (lv !== undefined && n && typeof pickIn(save, words.slice(0, n).join(' '), ['party'], 'evolve ') !== 'string')
      return spot
    // A guess at a misspelt name helps more than not finding the longer one (`eeve espeon`).
    if (!answer || (spot.startsWith('Did you mean') && !answer.startsWith('Did you mean'))) answer = spot
  }
  return answer
}

// `moonDays`: days until the next full moon, 0 within a day of one.
type Surroundings = { phase: Phase; isFullMoon: boolean; moonDays: number; party: string[]; partyTypes: string[] }

// The time of day, the moon and the party, as evolutions see them; types are fetched only when a member needs one.
async function evolutionContext($: EngineInterface): Promise<Surroundings> {
  const ms = await $.clock.now()
  const hour = localHour(ms)
  const isFullMoon = isFullMoonAt(ms)
  const moonDays = isFullMoon ? 0 : Math.max(1, Math.round((SYNODIC_DAYS * 1.5 - moonAge(ms)) % SYNODIC_DAYS))
  const party = save.party.map(m => m.species)
  const needsTypes = save.party.some(m => m.next?.some(s => s.way.kind === 'level' && s.way.partyType))
  const partyTypes = needsTypes
    ? (await Promise.all(save.party.map(m => typesOf($, pokeapiForm(m.species, m.form))))).flat()
    : []
  return { phase: phaseAt(((hour % 24) + 24) % 24), isFullMoon, moonDays, party, partyTypes }
}

// When the full moon a full-moon evolution waits for comes: this one, once it's dark, or in so many days.
const untilFullMoon = (c: Surroundings) =>
  c.isFullMoon
    ? ': the moon is full, so after dark'
    : `: the next is in about ${c.moonDays} day${c.moonDays === 1 ? '' : 's'}`

// The stages `m` reaches by itself now.
const dueFor = (m: Member, c: Surroundings): Stage[] =>
  dueStages(m.next ?? [], {
    level: level(m.xp),
    phase: c.phase,
    isFullMoon: c.isFullMoon,
    ...(m.heldItem ? { heldItem: m.heldItem } : {}),
    togetherMs: m.togetherMs ?? 0,
    party: c.party,
    partyTypes: c.partyTypes,
  })

// The stages `m` reaches by itself in save `s`: with that save's party, and the types `c` looked up for it (one that
// joined since, not looked up yet, counts as none).
const dueIn = (s: Save, m: Member, c: Surroundings): Stage[] =>
  dueFor(m, {
    ...c,
    party: s.party.map(p => p.species),
    partyTypes: c.partyTypes.length ? s.party.flatMap(p => types.get(pokeapiForm(p.species, p.form)) ?? []) : [],
  })

// Evolution checks run one at a time, so no Pokémon evolves twice. A failed check was already reported
// by its caller and doesn't hold up the next.
let learning: Promise<void> = Promise.resolve()
const learnEvolutions = ($: EngineInterface) => (learning = learning.catch(() => {}).then(() => checkEvolutions($)))

// Looks up how every party member that doesn't know it yet evolves, then evolves any already due, one animation
// at a time; with manual evolution they're marked ready and announced instead. Nothing evolves while the party is off.
async function checkEvolutions($: EngineInterface) {
  checkedInputs = inputsOf(save)
  // One member's lookup failing (offline, nothing cached) doesn't keep the others from being checked; it is reported
  // after them.
  let failed: unknown
  for (const member of save.party.filter(m => m.next === undefined || m.gender === undefined)) {
    try {
      const gender = await settleGender($, member)
      const { stages } = await evolutionsOf($, { ...member, gender })
      await mutate($, s => ({
        ...s,
        party: s.party.map(m =>
          m.id === member.id && m.species === member.species ? { ...m, next: stages, gender } : m,
        ),
      }))
    } catch (err) {
      failed ??= err
    }
  }
  if (save.evolution !== 'auto') await announceReady($)
  else {
    const context = await evolutionContext($)
    readyKeys = new Set()
    // Asked again after every wait: the party may have been put to rest, or evolution made manual, meanwhile.
    const isDue = (id: string) =>
      !save.isOff && save.evolution === 'auto' && view().party.some(m => m.id === id && dueFor(m, context).length > 0)
    for (const { id } of save.party) {
      if (!isDue(id)) continue
      // The one before finishes its animation first. The party may have changed during the wait: due is asked again.
      await animationDone($)
      if (isDue(id)) await evolveMember($, id)
    }
  }
  if (failed !== undefined) throw failed
}

// Marks the party members that could evolve now as ready (gold motes, "ready to evolve"), and tells the person once
// per Pokémon. Nobody is ready while the party is off. Not while an evolution plays: its new form shows first. One
// whose screen is still to play isn't ready yet either, so the screen keeps the surprise; its end checks again.
async function announceReady($: EngineInterface) {
  await animationDone($)
  // The surroundings after the wait: a partner, a held item or the hour may have gone meanwhile.
  const context = await evolutionContext($)
  const drawn = await read($, party)
  const now = await $.clock.now()
  // Another session's evolution still drawn in its old form here, recent enough for its screen to come
  // (noticeEvolutions queues it once its sprite is in).
  const isComing = (m: Member) => {
    const was = drawn.find(d => d.key === m.id)
    return Boolean(
      was &&
      was.name !== displayName(m.species, m.form) &&
      m.evolvedAt &&
      now - m.evolvedAt <= NOTICE_MS &&
      canScreen() &&
      !evolvedHere.has(lookOf(m)),
    )
  }
  const isHeld = (m: Member) => isComing(m) || [screen, ...screensDue].some(d => d && !d.isPreview && d.key === m.id)
  // A partner not looked up yet waits for the next check.
  const isDueIn = (s: Save, m: Member) => dueIn(s, m, context).length > 0
  readyKeys = new Set(
    save.isOff
      ? []
      : view()
          .party.filter(m => !isHeld(m) && isDueIn(save, m))
          .map(readyKey),
  )
  // In the save as it is now: one that evolved meanwhile, in another session too, is told about in its new form, and
  // one whose partner or item went in another session isn't told about at all.
  const isNew = (s: Save) => viewOf(s).party.filter(m => readyKeys.has(readyKey(m)) && !m.isAnnounced && isDueIn(s, m))
  if (!isNew(save).length) return
  let told: { m: Member; as: string }[] = []
  await mutate($, s => {
    told = s.isOff || s.evolution === 'auto' ? [] : isNew(s).map(m => ({ m, as: nameIn(s, m) }))
    const ids = told.map(t => t.m.id)
    return told.length
      ? { ...s, party: s.party.map(m => (ids.includes(m.id) ? { ...m, isAnnounced: true as const } : m)) }
      : s
  })
  for (const { m, as } of told)
    $.ui.toast(`${displayName(m.species, m.form)} is ready to evolve! /pokemon evolve ${as}`, { timeoutMs: 6000 })
}

// The words that name `m` in the party for /pokemon evolve: its spelling, with its number among twins
// (`charmander 2`).
function nameIn(s: Save, m: Member): string {
  const words = spell(m)
  const spot = pickIn(s, words, ['party'], 'evolve ')
  if (typeof spot !== 'string' && spot.member.id === m.id) return words
  for (let n = 1; n <= s.party.length; n++) {
    const numbered = pickIn(s, `${words} ${n}`, ['party'], 'evolve ')
    if (typeof numbered !== 'string' && numbered.member.id === m.id) return `${words} ${n}`
  }
  return words
}

const RESTING = 'Your Pokémon are resting. /pokemon on brings them back.'
// More forms of one species than this to evolve into are only looks, not a pick (Vivillon's twenty patterns).
const MAX_FORM_PICKS = 3
// An evolution of its own stopped by a switch to manual; nobody reads it, the Pokémon is marked ready instead.
const WAITING = 'Evolution is manual now.'

const orList = (names: string[]) =>
  names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}` : (names[0] ?? '')

// Waits out an evolution animation or screen still playing; nothing to wait for when no band is drawn. A screen
// still waiting for a visitor to leave isn't waited for: the evolutions after it go ahead, their screens after it.
async function animationDone($: EngineInterface) {
  const most = Math.max(EVOLVE, EVOLVE_SCREEN) + ticks(2000)
  for (let wait = 0; band && status.mood?.kind === 'evolve' && wait < most; wait += 5) await $.clock.sleep(TICK_MS * 5)
}

// Evolutions run one at a time, by a level, a stone, a dropped everstone or a preview alike: each waits for the one
// before to finish, so no animation is cut short. A screen waits its turn among the screens instead.
let evolutions: Promise<unknown> = Promise.resolve()
// What an evolution answers. `isShown`: its screen, its animation or a toast tells it, so a command that has stopped
// waiting for it doesn't need to.
type Evolved = { text: string; isShown?: boolean }
// `ask`: set when the person asked (/pokemon evolve): the species they named ('' for none), and the words that named
// the Pokémon (`eevee 2`), to suggest again.
type Ask = { into: string; as: string }
// The forms the games give a species in another region.
const isRegional = (form: string) => /^(alola|galar|hisui|paldea)\b/.test(form)
function evolveMember(
  $: EngineInterface,
  id: string,
  isPreview = false,
  given?: string,
  style?: EvolutionStyle,
  ask?: Ask,
): Promise<Evolved> {
  // As it is now, to name it if it has gone by its turn.
  const asked = save.party.find(m => m.id === id)
  const run = evolutions.catch(() => {}).then(() => evolveNow($, id, asked, isPreview, given, style, ask))
  evolutions = run
  return run
}

// How long a command waits for its evolution's answer. Claude Code gives a command ten seconds, and an evolution can
// wait its turn behind others (and their downloads) for longer: past this the command answers that it is on its way,
// and what it comes to is told in a toast unless the screen or the animation shows it.
const ANSWER_MS = 1000
async function answerSoon($: EngineInterface, run: Promise<Evolved>, later: string): Promise<string> {
  const early = await Promise.race([run, $.clock.sleep(ANSWER_MS).then(() => null)])
  if (early?.isShown) shownAnswers.add(early.text)
  if (early) return early.text
  background(
    $,
    run.then(done => {
      if (!done.isShown) $.ui.toast(done.text)
    }),
  )
  return later
}
// Answers their evolution has told already (its screen, its animation or its toast): a command answering late doesn't
// toast them again.
const shownAnswers = new Set<string>()
// When an evolution asked for now will show: after the screen or the animation playing or waiting, else at once.
const isEvolutionAhead = () => Boolean(screen || screensDue.length || status.mood?.kind === 'evolve')
const whenShown = () => (isEvolutionAhead() ? 'after the one on screen' : 'in a moment')

// Why `m` isn't there to evolve: it evolved in another session, or it left the party (released or put in the PC box,
// here while it waited its turn or in another session). An item given for it stays in the Bag.
function goneText(s: Save, m: Member, given?: string) {
  const name = displayName(m.species, m.form)
  return s.party.some(p => p.id === m.id)
    ? `${name} already evolved.`
    : `${name} is no longer in your party.${given ? ` Your ${itemName(given)} is still in your Bag.` : ''}`
}

// A member's gender, rolled from its species' ratio and saved when it has none yet (kept through evolutions when the
// species allows it): some evolutions are for one only. One saved meanwhile, by another check, is the one kept.
async function settleGender($: EngineInterface, member: Member): Promise<Gender> {
  if (member.gender !== undefined) return member.gender
  const { genderRate } = await evolutionsOf($, member)
  let gender = genderOf(genderRate, undefined)
  const isIt = (m: Member) => m.id === member.id && m.species === member.species
  await mutate($, s => {
    const was = s.party.find(isIt)?.gender
    if (was !== undefined) gender = was
    return was !== undefined ? s : { ...s, party: s.party.map(m => (isIt(m) ? { ...m, gender } : m)) }
  })
  return gender
}

// Evolves party member `id` into a form it can reach now: by itself, or by the item `given` from the Bag (used up
// in the same write). The animation plays from its current sprite, once any other has finished: on its own screen
// when the band is tall enough (in `style`, a preview's own, else the saved one), else in place. A preview plays it
// and puts the old form back afterwards; a real one saves the new form and tells the person, its screen to follow.
// `ask` set: the person asked for it (/pokemon evolve), and a branch is theirs to pick; unset, one evolving by itself
// takes its own.
async function evolveNow(
  $: EngineInterface,
  id: string,
  asked: Member | undefined,
  isPreview = false,
  given?: string,
  style?: EvolutionStyle,
  ask?: Ask,
): Promise<Evolved> {
  const member = save.party.find(m => m.id === id)
  if (!member) return { text: asked ? goneText(save, asked, given) : 'Your party is empty.' }
  // Asked for by name and evolved meanwhile, while this waited its turn (in another session too): that evolution
  // stands, and this one doesn't take it a stage further. An item tries the new form, which says if it can't use it.
  if (ask && asked && (member.species !== asked.species || member.form !== asked.form))
    return { text: goneText(save, asked, given) }
  const name = displayName(member.species, member.form)
  const gone = (s: Save) => goneText(s, member, given)
  const isAsked = ask !== undefined
  const into = ask?.into
  // Not by an item or a preview: it stops if the party is put to rest, and, evolving by itself, if evolution is
  // made manual, whenever that happens before the save.
  const stopped = (s: Save) =>
    isPreview || given ? '' : s.isOff ? RESTING : !isAsked && s.evolution !== 'auto' ? WAITING : ''
  if (stopped(save)) return { text: stopped(save) }
  if (isAsked && member.heldItem === 'everstone') return { text: `${name} holds an everstone: it won't evolve.` }
  // Before any download or animation; the save write checks again.
  if (given && !isPreview && !save.bag?.[given]) return { text: noItem(itemName(given)) }
  try {
    // Its gender before its stages, as a check would: a Dawn Stone makes a Gallade only of a male Kirlia.
    const gender = isPreview ? member.gender : await settleGender($, member)
    const { stages } = await evolutionsOf($, { ...member, gender })
    const options = stages.filter(s => s.way.kind !== 'shed')
    const context = await evolutionContext($)
    const byItem = options.filter(s => s.way.kind === 'item' && s.way.item === given)
    const allowed = isPreview
      ? options
      : given
        ? byItem.filter(s =>
            timeMatches(s.way.kind === 'item' ? s.way.time : undefined, context.phase, context.isFullMoon),
          )
        : dueFor(withTime({ ...member, xp: member.xp + (extra[member.id] ?? 0), next: stages }, times), context)
    const list = await loadSpecies($)
    const formOf = (s: Stage) => evolvedForm(s, member.form, list.find(p => p.name === s.species)?.forms ?? [])
    // Asked for, a branch is the person's to pick, by species and form (Weezing or Galarian Weezing); evolving by
    // itself, it takes this Pokémon's own. A species with many forms that are only looks (Vivillon's patterns) is one
    // pick: its form is the Pokémon's own.
    const isLooks = (species: string) =>
      new Set(options.filter(s => s.species === species).map(formOf)).size > MAX_FORM_PICKS
    const pickOf = (s: Stage) => `${s.species}|${isLooks(s.species) ? 'regular' : formOf(s)}`
    const labelOf = (pick: string) => {
      const [species = '', form = 'regular'] = pick.split('|')
      return displayName(species, form)
    }
    const pickOne = (ps: string[]) => ({
      text: `${name} can evolve into ${orList(ps.map(labelOf))}.\nPick one: /pokemon evolve ${ask?.as ?? spell(member)} <name>`,
    })
    const picks = [...new Set(allowed.map(pickOf))]
    let choices = allowed
    if (isAsked && into) {
      // The name read as the species and form words it spells, among those it evolves into in any way.
      const all = [...new Set(options.map(pickOf))]
      const species = [...new Set(all.map(p => p.split('|')[0] ?? ''))]
      // Each look by name too: `vivillon fancy` is that one.
      const names = species.map(name => ({
        name,
        forms: isLooks(name)
          ? ['regular', ...options.filter(s => s.species === name).map(formOf)]
          : all.filter(p => p.startsWith(`${name}|`)).map(p => p.split('|')[1] ?? 'regular'),
      }))
      const found = lookup(names, slug(into).split('-').filter(Boolean))
      const pick = 'pick' in found ? found.pick : null
      // The plain name of a species that has no plain form here is any of its forms.
      const named = all.filter(
        p =>
          pick &&
          (p === `${pick.species}|${pick.form}` ||
            (isLooks(pick.species) && p.startsWith(`${pick.species}|`)) ||
            (pick.form === 'regular' && p.startsWith(`${pick.species}|`) && !all.includes(`${pick.species}|regular`))),
      )
      // A look named by its pattern (`alcremie matcha cream strawberry`) is that one only, never another look of the
      // species; a species named plainly is any of its stages.
      const look = pick && isLooks(pick.species) && pick.form !== 'regular' ? pick : null
      const isNamed = (s: Stage) =>
        look ? s.species === look.species && formOf(s) === look.form : named.includes(pickOf(s))
      const due = allowed.filter(isNamed)
      const duePicks = [...new Set(due.map(pickOf))]
      // Not ready yet, it names every stage it has.
      if ((!named.length || !options.some(isNamed)) && options.length)
        return {
          text: `${name} can't evolve into ${speciesName(slug(into))}. It can evolve into ${orList((allowed.length ? picks : all).map(labelOf))}.`,
        }
      // A branch it has, but not now: how it gets there.
      if (named.length && options.some(isNamed) && !due.length) {
        const ways = evolvesText(withTime({ ...member, next: options.filter(isNamed) }, times))
        const label = look ? displayName(look.species, look.form) : orList(named.map(labelOf))
        return { text: `${name} ${ways.replace(/^evolves/, `evolves into ${label}`)}.` }
      }
      if (duePicks.length > 1) return pickOne(duePicks)
      choices = due
    } else if (isAsked && picks.length > 1) return pickOne(picks)
    // Not asked for by name, a regional form other than the Pokémon's own is left to those who ask for it: a Thunder
    // Stone makes a Kanto Pikachu a Kanto Raichu, as outside Alola in the games (`give thunder-stone pikachu alolan
    // raichu` asks). One is taken only when there is no other (Cubone at night). Looks (Vivillon's patterns) and
    // other forms (Toxtricity's) are rolled by the Pokémon's id, as before.
    const own = choices.filter(s => !isRegional(formOf(s)) || formOf(s) === member.form)
    const pool = into === undefined && own.length ? own : choices
    // A preview shows any branch; a real evolution takes this Pokémon's own.
    const next = isPreview ? choices[Math.floor(Math.random() * choices.length)] : chooseStage(member.id, pool)
    if (!next) {
      if (!isPreview && !options.length)
        await mutate($, s => ({
          ...s,
          party: s.party.map(m => (m.id === member.id ? { ...m, next: [] } : m)),
        }))
      if (given) {
        const way = byItem[0]?.way
        const time = way?.kind === 'item' ? way.time : undefined
        return {
          text: time
            ? `${name} can use ${withArticle(itemName(given))} only ${TIME_TEXT[time]}${time === 'full-moon' ? untilFullMoon(context) : ''}.`
            : `${name} can't use ${withArticle(itemName(given))}.`,
        }
      }
      return {
        text: options.length
          ? `${name} ${evolvesText(withTime({ ...member, next: stages }, times))}.`
          : `${name} doesn't evolve any further.`,
      }
    }
    const form = formOf(next)
    const { art, isShiny } = await fetchArt($, fileOf({ species: next.species, form }), member.isShiny)
    // In place, it waits for the animation playing; a screen waits its turn among the screens.
    if (!canScreen()) await animationDone($)
    // It may have moved, left, or been given an everstone during the downloads and the wait.
    const now = save.party.find(m => m.id === member.id && m.species === member.species)
    if (!now) return { text: gone(save) }
    if (!isPreview && !given && now.heldItem === 'everstone')
      return { text: `${name} holds an everstone: it won't evolve.` }
    if (stopped(save)) return { text: stopped(save) }
    // Or lost what it evolves by: its held item taken, its partner deposited, the hour gone by. Asked again in the
    // save write, of the party as it is then.
    const later = isPreview || given ? null : await evolutionContext($)
    const isStillDue = (s: Save) => {
      const latest = s.party.find(m => m.id === member.id && m.species === member.species)
      if (!later || !latest) return true
      const grown = withTime({ ...latest, xp: latest.xp + (extra[member.id] ?? 0), next: stages }, times)
      return dueIn(s, grown, later).includes(next)
    }
    const notDue = () => `${name} ${evolvesText(withTime({ ...member, next: stages }, times))}.`
    if (!isStillDue(save)) return { text: notDue() }
    const { next: _, ...rest } = member
    const evolved: Member = { ...rest, species: next.species, form, isShiny, evolutions: member.evolutions + 1 }
    const newName = displayName(next.species, form)
    const mon: Mon = { key: keyOf(evolved), name: newName, isShiny, ...parseAnsi(art) }
    // Found by key in the party as drawn, which can lag the save (a download for another session's catch): its own
    // picture to start from, and never a second walker with its key.
    const drawnAt = fitted?.keys.indexOf(member.id) ?? -1
    const drawn = drawnAt >= 0 ? (await read($, party)).find(m => m.key === member.id) : undefined
    // Its screen, played once this evolution is saved; the party keeps the old sprite until then.
    const shows: Screen | null =
      drawn && canScreen() ? { key: member.id, from: drawn, to: mon, style: style ?? styleOf(save), isPreview } : null
    if (!shows) {
      // Another's screen still to finish (its band gone for now): this one simply changes, the screen plays on. With
      // no band drawn (the party off, a survey up) nothing plays, now or later.
      const isInPlace = drawnAt >= 0 && !screen && Boolean(band) && !save.isOff
      evolveFrom = (isInPlace && fitted?.lefts[drawnAt]) || null
      await update($, party, list => list.map(m => (m.key === member.id ? mon : m)))
      evolving = member.id
      // Not drawn yet: it simply comes out in its new form.
      if (isInPlace) status = evolve(status, drawnAt)
    }
    if (isPreview && shows) {
      // A screen leaves the lead as it is; it only waits, like any screen, for a visitor to go.
      const what = `${name} evolving into ${newName} in the ${shows.style} style`
      const isWaiting = isVisited()
      const isBehind = isEvolutionAhead()
      queueScreen($, shows)
      const text = isWaiting
        ? `A wild ${wild?.mon.name ?? 'Pokémon'} is out: ${what} plays once it has gone.`
        : `Previewing ${what}${isBehind ? ', after the one on screen' : ''}.`
      return { text, isShown: true }
    }
    if (isPreview) {
      $.clock.after(EVOLVE * TICK_MS + 3000, () => background($, refreshParty($)))
      const text = `Previewing ${name} evolving into ${newName}; it changes back in a few seconds.`
      // The style asked for needs the screen.
      return { text: style ? `No room for the ${style} screen here. ${text}` : text, isShown: true }
    }
    // Shedinja comes along when Nincada evolves by level, with Nincada's level and shininess, and counts as caught.
    const shed = next.way.kind === 'level' ? stages.find(s => s.way.kind === 'shed') : undefined
    let shedText = ''
    // Another session may have evolved it first: then that evolution stands.
    let outcome = ''
    const evolvedAt = await $.clock.now()
    await mutate($, s => {
      shedText = ''
      const i = s.party.findIndex(m => m.id === member.id && m.species === member.species)
      const latest = s.party[i]
      if (!latest) {
        outcome = gone(s)
        return s
      }
      if (!given && latest.heldItem === 'everstone') {
        outcome = `${name} holds an everstone: it won't evolve.`
        return s
      }
      if (stopped(s)) {
        outcome = stopped(s)
        return s
      }
      if (given && !s.bag?.[given]) {
        outcome = noItem(itemName(given))
        return s
      }
      if (!isStillDue(s)) {
        outcome = notDue()
        return s
      }
      outcome = ''
      const { next: __, heldItem, isAnnounced: ___, ...kept } = latest
      // A held item that made it evolve is used up; any other stays held.
      const keeps = heldItem && !(next.way.kind === 'hold' && next.way.item === heldItem)
      const grown: Member = {
        ...kept,
        ...(keeps ? { heldItem } : {}),
        species: next.species,
        form,
        isShiny,
        evolutions: latest.evolutions + 1,
        evolvedAt,
      }
      evolvedHere.add(lookOf(grown))
      // The species it becomes counts as caught, as one caught with a Poké Ball does.
      const now = Date.now()
      const seen = recordCaught(
        recordSeen(given ? takeFromBag(s, given) : s, next.species, isShiny, now),
        next.species,
        now,
      )
      const after = { ...seen, party: seen.party.map((m, j) => (j === i ? grown : m)) }
      if (!shed) return after
      const shedinja: Member = {
        id: newId(),
        species: shed.species,
        form: 'regular',
        isShiny,
        // Its ledger XP too: the same level as Ninjask.
        xp: latest.xp + (extra[member.id] ?? 0),
        evolutions: 1,
        // From a Poké Ball if Nincada was.
        ...(latest.isCaught ? { isCaught: true as const } : {}),
      }
      const shedName = displayName(shed.species)
      // As in the games, it comes along only where there's room for it.
      if (after.party.length >= MAX_PARTY && isBoxFull(after)) {
        shedText = ` ${shedName} didn't come along: there's no more room in your PC box.`
        return after
      }
      const found = recordCaught(recordSeen(after, shed.species, isShiny, Date.now()), shed.species, Date.now())
      const stored = storeCaught(found, shedinja)
      shedText = stored.isInParty ? ` ${shedName} joined your party!` : ` ${shedName} went to the PC box.`
      return stored.save
    })
    // Its new form is ready only once the next check says so.
    if (!outcome) readyKeys.delete(readyKey(member))
    const said = `What? ${name} evolved into ${newName}!${shedText}`
    // The screen tells what it became, and draws the party again, when it ends.
    if (shows && !outcome) queueScreen($, { ...shows, said })
    else {
      if (!outcome) $.ui.toast(said)
      // Also redraws over any refresh that was already under way with the old sprite.
      await refreshParty($)
    }
    if (outcome) return { text: outcome }
    background($, learnEvolutions($))
    return {
      text: shows ? `What? ${name} is evolving!` : `${name} evolved into ${newName}!${shedText}`,
      isShown: true,
    }
  } catch (err) {
    if (!isPreview) await report($, err)
    return {
      text: `${name} couldn't evolve right now: ${err instanceof Error ? err.message : String(err)}`,
      // The report has told it.
      isShown: !isPreview,
    }
  }
}

// XP for the whole party, written to this session's own ledger; anyone due evolves, one after another.
async function earn($: EngineInterface, amount: number) {
  await ready
  let leveledUp = false
  let isPaid = false
  let isRedrawn = false
  await queued(async () => {
    const latest = loadSave(await $.store.get('save'))
    // Off in another session since this one last synced: no XP either.
    if (latest.isOff) return
    const before = withExtra(latest, extra).party.map(m => level(m.xp))
    // This session's ledger was folded while it sat idle a day: its XP goes to a fresh one.
    if (latest.folded?.includes(ledgerKey)) {
      const fresh = `${LEDGER}${newId()}${newId()}`
      await update($, ledger, () => fresh)
      ledgerKey = fresh
    }
    const own = loadLedger(await $.store.get(ledgerKey))
    await $.store.set(ledgerKey, earnInto(own, latest.party, amount, Date.now()))
    isPaid = true
    isRedrawn = isOtherParty(latest, save)
    save = latest
    countLedgers(await readLedgers($))
    leveledUp = view().party.some((m, i) => level(m.xp) > (before[i] ?? 0))
  })
  if (isPaid) {
    const mine = ++earnings
    plus = amount * MONEY_PER_XP
    $.ui.invalidate('ui.render')
    $.clock.after(1200, () => {
      if (mine !== earnings) return
      plus = 0
      $.ui.invalidate('ui.render')
    })
  }
  if (isRedrawn) await refreshParty($)
  if (leveledUp) await learnEvolutions($)
}

// A wild visitor at most as tall as the party's tallest, so the band (sized to the party) never cuts it off.
function fitWild(mon: Mon): Pixels {
  const tallest = Math.max(2, ...(fitted?.lefts ?? []).map(l => l.height))
  return fit(mon, Math.min(fitted?.budget ?? tallest, Math.floor(tallest / 2)))
}

// A species' capture rate, from the PokeAPI entry its evolution data comes from (and is cached with).
async function captureRateOf($: EngineInterface, name: string): Promise<number> {
  const res = await cachedFetch($, `${POKEAPI}/pokemon-species/${name}`, `pokeapi/species-${name}.json`, isJson)
  const rate = res.ok ? (JSON.parse(res.text) as { capture_rate?: unknown }).capture_rate : undefined
  return typeof rate === 'number' && Number.isFinite(rate) ? rate : DEFAULT_RATE
}

// A wild Pokémon comes by: the one `query` names, or a random one. Answers why not when the name isn't one.
async function spawnWild($: EngineInterface, query = ''): Promise<string | null> {
  if (!band || !fitted || status.wild || pitch) return null
  if (screen) return 'No wild Pokémon comes by while an evolution is on screen.'
  try {
    const list = await loadSpecies($)
    const isAsked = Boolean(query.trim())
    const named = readName(list, query)
    if ('error' in named) return named.error
    const shiny = named.wantsShiny ? 'shiny ' : ''
    if ('guess' in named)
      return `Did you mean ${displayName(named.guess.species, named.guess.form)}? Run /pokemon-play wild ${shiny}${spell(named.guess)}`
    const held = isAsked ? null : wildHeld
    wildHeld = null
    const pick =
      named.pick ??
      held?.pick ??
      drawWild(list, { landscape: landscapeNow(), phase: phaseNow(), dex: save.dex, moon: moonNow() })
    const wantsShiny = named.wantsShiny || (held?.isShiny ?? Math.random() < SHINY_ODDS)
    const { art, isShiny } = await fetchArt($, fileOf(pick), wantsShiny)
    // Another visitor may have stepped out, or an evolution's screen begun, during the downloads.
    if (!band || !fitted || status.wild || pitch) return null
    if (screen) {
      if (isAsked) return 'No wild Pokémon comes by while an evolution is on screen.'
      // The timer's visitor isn't lost: the first tick after the screen brings it.
      wildHeld = { pick, isShiny }
      wildDue = 0
      return null
    }
    const mon: Mon = { key: 'wild', name: displayName(pick.species, pick.form), isShiny, ...parseAnsi(art) }
    wild = { mon, left: fitWild(mon), pick }
    // The table has every listed species' rate; only one it doesn't know is downloaded.
    const known = SPECIES[pick.species]?.rate
    if (known === undefined) {
      wildRate = null
      background(
        $,
        captureRateOf($, pick.species)
          .catch((err: unknown) => {
            if (wild?.pick === pick) wildRate = DEFAULT_RATE
            throw err
          })
          .then(rate => {
            if (wild?.pick === pick) wildRate = rate
          }),
      )
    } else wildRate = known
    status = startWild(status, band.total, wild.left.width)
    wake()
    closeMart($)
    $.ui.toast(`${isShiny ? '✨ ' : ''}A wild ${mon.name} appeared!`, { timeoutMs: 6000 })
    await mutate($, s => recordSeen(s, pick.species, isShiny, Date.now()))
  } catch (err) {
    await report($, err)
  }
  return null
}

// A left click on the band: a Poké Ball at that spot while a wild Pokémon is out of the grass, one at a time. With
// nowhere to keep a catch, no ball is thrown, and the visitor stays to aim at once there's room.
function throwAt($: EngineInterface, click: Click) {
  feel('activity')
  const w = status.wild
  if (!band || !wild || !w || !canAim()) return
  if (isNoRoom(save)) {
    $.ui.toast(NO_ROOM_TO_CATCH)
    return
  }
  const height = band.rows * 2
  const place = wildPlacement(w, wild.left, height)
  const { x, ys } = clickPixels(click)
  // A hit is a pixel the wild Pokémon shows in the last frame: one a party member stands in front of misses.
  const isHit = ys.some(y => paintedBy(x, y) === 'wild')
  const to = { x, y: ys[ys.length - 1] ?? 0 }
  // The ball comes to rest with its bottom on the ground row, in front of the Pokémon's middle.
  const rest = restSpot(place.left, place.img.width, band.total, height)
  pitch = startThrow({ x: -3, y: height - 2 }, to, rest, isHit, wildRate ?? DEFAULT_RATE)
  if (isHit) status = holdWild(status, true)
}

// No room for a catch: the party and the PC box are both full.
const isNoRoom = (s: Save) => s.party.length >= MAX_PARTY && isBoxFull(s)
const NO_ROOM_TO_CATCH = `${BOX_FULL} Your party is full too. ${MAKE_ROOM}`

// The Pokémon in the ball is kept: in the party while it has room, else the PC box. When another session has filled
// both since the throw, it breaks free instead, and can be aimed at again.
async function keepCatch($: EngineInterface) {
  if (!wild) return
  const visitor = wild
  const scene = status.wild
  const { pick, mon } = wild
  status = { ...status, wild: null }
  wild = null
  const caught: Member = {
    id: newId(),
    species: pick.species,
    form: pick.form,
    isShiny: mon.isShiny,
    xp: 0,
    evolutions: 0,
    isCaught: true,
  }
  let isInParty = false
  let isStored = true
  await mutate($, s => {
    isStored = !isNoRoom(s)
    if (!isStored) return s
    const kept = storeCaught(recordCaught(s, pick.species, Date.now()), caught)
    isInParty = kept.isInParty
    return kept.save
  })
  if (!isStored) {
    // Back out of the ball, unless another visitor has come meanwhile.
    if (scene && !status.wild && !wild) {
      wild = visitor
      status = hopWild({ ...status, wild: scene })
      if (pitch) pitch = { ...pitch, phase: 'burst', t: 0, isCaught: false, flees: false }
      else status = holdWild(status, false)
    }
    $.ui.toast(NO_ROOM_TO_CATCH)
    return
  }
  const where = isInParty ? 'It joined your party.' : 'It was sent to the PC box.'
  $.ui.toast(`Gotcha! ${mon.isShiny ? '✨ ' : ''}${mon.name} was caught! ${where}`)
  feel('cheer')
  if (!isInParty) return
  await refreshParty($)
  background($, learnEvolutions($))
}

function afterThrow($: EngineInterface, event: ThrowEvent) {
  if (event === 'broke-free') status = hopWild(status)
  else if (event === 'released') status = holdWild(status, false)
  else if (event === 'fled') status = fleeWild(status, band?.total ?? 0, wild?.left.width ?? 0)
  else background($, keepCatch($))
}

function openMart($: EngineInterface) {
  mart = { ...shut(), isOpen: true }
  $.ui.invalidate('ui.render')
}

function closeMart($: EngineInterface) {
  if (!mart.isOpen) return
  mart = { ...mart, isOpen: false }
  $.ui.invalidate('ui.render')
}

// What the Mart shows: what's for sale, which party members each would evolve, and the selected item's picture.
function martProps(): MartProps {
  const party = view().party
  const items = forSale().map(i => {
    // How many members would become each species, by name: twins count as two.
    const uses = new Map<string, { name: string; into: string; n: number }>()
    for (const m of party) {
      const into = (m.next ?? [])
        .filter(st => (st.way.kind === 'item' || st.way.kind === 'hold') && st.way.item === i.id)
        .map(st => speciesName(st.species))
      for (const species of new Set(into)) {
        const name = displayName(m.species, m.form)
        const key = `${name} → ${species}`
        uses.set(key, { name, into: species, n: (uses.get(key)?.n ?? 0) + 1 })
      }
    }
    const lines = [...uses.values()].map(u => `${u.name}${u.n > 1 ? ` ×${u.n}` : ''} → ${u.into}`)
    const { id, name, tab, price, color, text } = i
    return { id, name, tab, price, color, text, ...(lines.length ? { party: lines.join(', ') } : {}) }
  })
  const selected = items.filter(i => i.tab === TABS[mart.view.tab])[mart.view.sel]
  const icon = selected && ICONS[selected.id]
  return {
    items,
    tabs: TABS,
    balance: balanceOf(save, cash),
    bag: save.bag ?? {},
    message: mart.message,
    isError: mart.isError,
    columns: band?.total ?? 80,
    rows: band?.rows ?? 9,
    state: mart.view,
    ...(icon ? { icon: textRows(icon) } : {}),
  }
}

const buttonProps = (): ShopProps => ({ balance: balanceOf(save, cash), plus })

// A click or key in the Mart: the selection moves, a buy goes through, ✕ closes it. Answers the Mart's
// next props while it stays open.
async function martAct($: EngineInterface, a: Act): Promise<{ props: MartProps } | null> {
  const was = mart.view
  const p = martProps()
  // Enter straight after a buy asks first: Enter ends every line typed, and the Mart keeps the keys after a click.
  if (a === 'enter' && mart.isBought && !mart.isAsked) {
    const item = p.items.filter(i => i.tab === p.tabs[was.tab])[was.sel]
    if (item) {
      mart = { ...mart, isAsked: true, message: `Press Enter again to buy another ${item.name}.`, isError: false }
      return { props: martProps() }
    }
  }
  const done = act(p, was, a)
  // Another item, tab or quantity: the last message was about the one before.
  const isMoved = done.state.tab !== was.tab || done.state.sel !== was.sel || done.state.qty !== was.qty
  mart = {
    ...mart,
    view: done.state,
    isBought: false,
    isAsked: false,
    ...(isMoved ? { message: '', isError: false } : {}),
  }
  if (done.refusal) mart = { ...mart, message: done.refusal, isError: true }
  if (done.post && 'close' in done.post) {
    closeMart($)
    return null
  }
  if (done.post && 'buy' in done.post) {
    try {
      const { text, isError } = await buyItem($, done.post.buy.id, done.post.buy.qty)
      // Bought: back to one. Refused: the quantity stays, to change and try again.
      mart = {
        ...mart,
        message: text,
        isError,
        view: isError ? mart.view : { ...mart.view, qty: 1 },
        isBought: !isError,
      }
    } catch (err) {
      // The store refused: said in the Mart's own line, and reported.
      mart = {
        ...mart,
        message: `Couldn't do that: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      }
      await report($, err)
    }
  }
  return { props: martProps() }
}

// The person typed into the Mart (`typed`, all of it since it was drawn): it closes, the keyboard goes back to the
// prompt, and the part not yet sent there follows. Claude Code gives a band the keys back only once what holds them
// is gone, and has no way to hand them back otherwise.
async function typedInMart($: EngineInterface, typed: string) {
  const more = typed.slice(mart.typed)
  if (!more) return
  mart = { ...mart, typed: typed.length }
  closeMart($)
  try {
    const filled = await $.prompt.fill({ text: more, mode: 'insert' })
    // A dialog holds the prompt: the text is shown, so it isn't lost without a word.
    if (!filled.isFilled)
      $.ui.toast(`Pokémon: the prompt couldn't take what you typed in the Mart: "${more}"`, { timeoutMs: 6000 })
  } catch (err) {
    await report($, err)
  }
}

// Why the Mart can't open now, or null when it can.
function martRefusal(): string | null {
  if (!band || save.isOff) return "The PokéMart opens in the Pokémon band above the prompt, and it isn't showing here."
  // The visitor would go on walking under the Mart, out of reach: no Mart while it's out (the button hides then too).
  if (isVisited()) return `A wild ${wild?.mon.name ?? 'Pokémon'} is out: catch it or let it go first.`
  if (screen) return 'An evolution is on screen: the PokéMart opens once it ends.'
  return null
}

// Claude Code passes the band clicks only in its fullscreen mode, and the hook can't tell which mode it is in.
const NO_MOUSE = ' No mouse? /pokemon buy <item> [count] works too.'

// `/pokemon mart`: the Mart opens in the band, when there is one.
function openMartCommand($: EngineInterface): string {
  const refusal = martRefusal()
  if (refusal) return `${refusal}${NO_MOUSE}`
  openMart($)
  // Claude Code gives the band the keys only on a click: `$.ui.focus` is refused for a site the person hasn't focused.
  return (
    'The PokéMart is open above the prompt. Click it to use the keys: ↑ ↓ choose, ← → change tabs, - + set how many, Enter buys, x closes.' +
    NO_MOUSE
  )
}

// The band's look besides the party: time and place, the visitor as a throw shows it, and the ball.
const lookNow = (): Look => ({
  phase: phaseNow(),
  landscape: landscapeNow(),
  weather: weatherNow(),
  moon: moonNow(),
  wild: (wild && (pitch ? wildLook(pitch, wild.left) : wild.left)) ?? undefined,
  evolveFrom: evolveFrom ?? undefined,
  ...(pitch ? { overlays: ballOverlays(pitch) } : {}),
  ready: (fitted?.keys ?? []).map(id => readyNow().includes(id)),
})

// Whether an evolution can have its screen: a band tall enough is drawn.
const canScreen = () => Boolean(band && band.rows >= SCREEN_MIN_ROWS && !save.isOff)

// Another session's evolutions, as the party is drawn with them (`was` before, `drawn` after): each recent one
// plays its screen here too. A window opened later, or after a /clear, has nothing drawn before: it plays none.
function noticeEvolutions($: EngineInterface, was: Mon[], drawn: Mon[], now: number) {
  for (const m of save.party) {
    const before = was.find(p => p.key === m.id)
    const after = drawn.find(p => p.key === m.id)
    if (!before || !after || before.name === after.name || evolvedHere.has(lookOf(m))) continue
    if (!m.evolvedAt || now - m.evolvedAt > NOTICE_MS || !canScreen()) continue
    if (screen?.key === m.id || screensDue.some(d => d.key === m.id)) continue
    queueScreen($, { key: m.id, from: before, to: after, style: styleOf(save), isPreview: false })
  }
}

// An evolution's screen, after any before it. One evolving again before its last screen played starts from there; a
// preview never changes what it starts from, as it saves nothing.
function queueScreen($: EngineInterface, next: Screen) {
  const last = [screen, ...screensDue].filter(d => d && !d.isPreview && d.key === next.key).pop()
  screensDue.push(last ? { ...next, from: last.to } : next)
  startScreen($)
}

// What a member looks like while its screen waits or plays: its old form.
const heldBack = (m: Mon) => [screen, ...screensDue].find(d => d && !d.isPreview && d.key === m.key)?.from ?? m

// The next screen, once nothing else holds the band: no other evolution playing, no wild Pokémon out. The Mart
// closes for it. With no band tall enough by now, or the Pokémon gone from the party, it plays none: the evolution
// is told and the party drawn evolved.
function startScreen($: EngineInterface) {
  while (!screen && screensDue.length) {
    if (band && (isVisited() || status.mood?.kind === 'evolve')) return
    const next = screensDue.shift()
    if (!next) return
    if (!band || !fitted || !canScreen() || !save.party.some(m => m.id === next.key)) {
      skipScreen($, next)
      continue
    }
    closeMart($)
    screen = { ...next, rows: band.rows }
    status = evolve(status, Math.max(0, fitted.keys.indexOf(next.key)), true)
    lastCells = ''
    $.ui.invalidate('ui.render')
  }
}

// The screen has played: the band comes back with the new form where the old one stood (a preview's old form
// stays), and the next screen may start. Nothing is written: the evolution was saved before it began.
async function endScreen($: EngineInterface) {
  const done = screen
  if (!done) return
  screen = null
  lastCells = ''
  if (!done.isPreview) {
    const list = await update($, party, all => all.map(m => (m.key === done.key ? done.to : m)))
    // Drawn in its new form from this very frame, not only once the band is next laid out.
    const at = fitted?.keys.indexOf(done.key) ?? -1
    if (fitted && at >= 0) {
      const { budget, keys } = fitted
      fitted = {
        ...fitted,
        lefts: fitted.lefts.map((l, i) => (i === at ? fit(done.to, budget) : l)),
        ...(list.map(m => m.key).join() === keys.join() ? { looks: looksOf(list) } : {}),
      }
    }
  }
  if (done.said) $.ui.toast(done.said)
  $.ui.invalidate('ui.render')
  background($, refreshParty($))
  if (!done.isPreview) readyAfter($)
  startScreen($)
}

// An evolution's screen is over (played, cut short or not played): its new form may be ready to evolve again.
const readyAfter = ($: EngineInterface) => background($, learnEvolutions($))

// The screen playing stops short (its band too short now, while drawing): the evolution is told now, and drawn evolved
// from the next frame. The party is published again, outside the drawing.
function cutScreen($: EngineInterface) {
  const done = screen
  if (!done) return
  screen = null
  lastCells = ''
  if (status.mood?.isScreen) status = { ...status, mood: null }
  const at = fitted?.keys.indexOf(done.key) ?? -1
  if (fitted && at >= 0 && !done.isPreview) {
    const { budget } = fitted
    fitted = { ...fitted, lefts: fitted.lefts.map((l, i) => (i === at ? fit(done.to, budget) : l)) }
  }
  if (done.said) $.ui.toast(done.said)
  background($, refreshParty($))
  if (!done.isPreview) readyAfter($)
}

// A screen that won't play: the evolution is told now, and the party drawn evolved.
function skipScreen($: EngineInterface, s: Screen) {
  if (s.said) $.ui.toast(s.said)
  background($, refreshParty($))
  if (!s.isPreview) readyAfter($)
}

// The party went off: no screen plays now or later; the evolutions stay saved, and are told now.
function dropScreens($: EngineInterface) {
  if (!screen && !screensDue.length) return
  for (const s of [screen, ...screensDue]) if (s?.said) $.ui.toast(s.said)
  screensDue = []
  screen = null
  if (status.mood?.isScreen) status = { ...status, mood: null }
  background($, refreshParty($))
  readyAfter($)
}

const isScreenPlaying = () => Boolean(screen && status.mood?.kind === 'evolve' && status.mood.isScreen)

// The screen's cells at its moment now: the picture, and the text box's message as real characters.
function screenCells(s: Screen, columns: number, rows: number): string {
  const mood = status.mood
  const ms = mood?.isScreen ? mood.t * TICK_MS : SCREEN_MS
  const { from, to, style } = s
  const { img, text } = evolutionFrame({ style, ms, from, to, fromName: from.name, toName: to.name, columns, rows })
  return toCells(img, [{ x: TEXT_COLUMN, y: rows - 2, text, fg: BOX.text, bg: BOX.fill }]).cells
}

// The frame loop, one tick at a time, so a slow blit holds back the ticks behind it instead of piling frames up.
// Asleep, the band draws one tick in CALM_EVERY: the loop then wakes once per drawn tick and runs the ticks before it
// together, the same frames at the same moments, without waking the plugin 20 times a second for hours. Anything
// that stirs the party (`wake`) brings it back to every tick at once.
// The pending wait for the next tick: `rearm` cuts it short and starts again from now, at the pace the party needs.
let pending: { cancel: () => void; rearm: () => void; isLong: boolean } | null = null
const isBatched = () =>
  Boolean(band && fitted) && !save.isOff && isAsleep(status) && isCalm(status) && !pitch && !screen && !mart.isOpen

function loopTicks($: EngineInterface) {
  const due = isBatched() ? CALM_EVERY - (tickNo % CALM_EVERY) : 1
  const timer = $.clock.after(due * TICK_MS, () => {
    if (pending?.cancel !== cancel) return
    pending = null
    background(
      $,
      (async () => {
        // Stops early if the batch wakes the party: the rest go at the usual pace.
        for (let i = 0; i < due && (i === 0 || isBatched()); i++) await tick($)
      })().finally(() => loopTicks($)),
    )
  })
  const cancel = () => timer.cancel()
  pending = {
    cancel,
    isLong: due > 1,
    rearm: () => {
      cancel()
      loopTicks($)
    },
  }
}

function wake() {
  // Only a batched wait is worth cutting short: an awake loop ticks next anyway.
  if (pending?.isLong) pending.rearm()
}

async function tick($: EngineInterface) {
  if (!band || !fitted || save.isOff) return
  tickNo++
  await readClock($)
  // A visitor due while a screen plays comes once it has ended.
  if (--wildDue <= 0 && !status.wild && !isAsleep(status) && !screen) {
    wildDue = between(...WILD_EVERY)
    background($, spawnWild($))
  }
  status = step(
    status,
    band.columns,
    fitted.lefts.map(l => l.width),
    wild?.left.width ?? 0,
    Math.random,
    band.total,
  )
  status = stir(status, weatherNow(), actorsNow(), isAsleep(status))
  if (pitch) {
    const { pitch: next, event } = stepThrow(pitch)
    pitch = next
    if (event) afterThrow($, event)
  }
  if (!status.wild) wild = null
  if (screen && !isScreenPlaying()) await endScreen($)
  startScreen($)
  if (isVisited() !== isButtonHidden) {
    isButtonHidden = !isButtonHidden
    $.ui.invalidate('ui.render')
  }
  if (canAim() !== isAiming) {
    isAiming = !isAiming
    $.ui.invalidate('ui.render')
    return
  }
  if (status.mood?.kind !== 'evolve') evolveFrom = null
  // The scene keeps moving underneath; nothing is drawn over the Mart.
  if (mart.isOpen) return
  if (!pitch && isCalm(status) && tickNo % CALM_EVERY !== 0) return
  if (isHidden && tickNo % RETRY_TICKS !== 0) return
  // Aiming, frames are only made on redraw ticks: each one rewrites the map clicks are judged on.
  if (isAiming && tickNo % AIM_EVERY !== 0) return
  const cells = screen
    ? screenCells(screen, band.total, band.rows)
    : toCells(frame(status, fitted.lefts, band.columns, band.rows, lookNow(), band.total)).cells
  if (cells === lastCells && !isHidden) return
  if (isAiming) {
    // The redraw makes this frame again and records it as drawn.
    $.ui.invalidate('ui.render')
    return
  }
  const res = await $.ui.blit({
    requestId: band.requestId,
    key: 'scene',
    cells,
    columns: band.total,
    rows: band.rows,
  })
  isHidden = Boolean(res.deny)
  lastCells = isHidden ? '' : cells
}

// Plays one animation on demand, for trying them out.
async function play($: EngineInterface, args: string): Promise<string> {
  const name = args.normalize('NFKC').trim().toLowerCase()
  const later = (ms: number, fn: () => void) => $.clock.after(ms, fn)
  feel('activity')
  const words = name.split(/\s+/)
  const phase = PHASES.find(p => words.includes(p))
  const landscape = LANDSCAPES.find(l => words.includes(l))
  const weather = WEATHERS.find(w => words.includes(w))
  // `full moon`, `new moon lake`, or `moon` for tonight's: the night sky under that moon.
  if (words.includes('moon') && words[0] !== 'wild') {
    const said = words.find(w => Object.hasOwn(MOON_WORDS, w))
    const moon = said ? (MOON_WORDS[said] ?? FULL_MOON) : moonPhaseAt(await $.clock.now())
    shown = { phase: 'night', landscape, weather, moon, until: tickNo + ticks(15_000) }
    return `Showing ${said ? 'a' : "tonight's"} ${MOON_PHASES[moon]}${landscape ? ` over the ${landscape}` : ''} for 15 seconds.`
  }
  // After `wild` every word belongs to the name: `wild lycanroc dusk` is a Pokémon, not a scene.
  if ((phase || landscape || weather) && words[0] !== 'wild') {
    shown = { phase, landscape, weather, until: tickNo + ticks(15_000) }
    // A Water type previewing the rain (an Ice type the snow) hops for it at once.
    if (weather) status = stir(status, weather, actorsNow(), isAsleep(status), () => 0)
    return `Showing ${[phase, weather, landscape].filter(Boolean).join(' ')} for 15 seconds.`
  }
  if (name === 'hop') feel('turn-answer')
  else if (name === 'cheer') feel('cheer')
  else if (name === 'faint') feel('tool-error')
  else if (name === 'sleep') status = { ...status, idleTicks: Number.MAX_SAFE_INTEGER }
  else if (name === 'squash') {
    feel('compact-start')
    later(2500, () => feel('compact-end'))
  } else if (name === 'work') {
    feel('turn-start')
    later(6000, () => feel('turn-end'))
  } else if (name === 'clones') {
    demoAgents = 2
    countAgents()
    later(6000, () => {
      demoAgents = 0
      countAgents()
    })
  } else if (words[0] === 'evolve') {
    const style = words[1]
    if (words.length > 2 || (style && !isEvolutionStyle(style))) return unknownStyle(style ?? '', styleOf(save))
    if (save.isOff)
      return 'Your Pokémon are resting in their Poké Balls: there is nothing to show. /pokemon on brings them back.'
    const lead = save.party[0]
    const asked = style && isEvolutionStyle(style) ? style : undefined
    const name = lead ? `${displayName(lead.species, lead.form)}'s` : 'the'
    return answerSoon(
      $,
      evolveMember($, lead?.id ?? '', true, undefined, asked),
      `Previewing ${name} evolution${asked || canScreen() ? ` in the ${asked ?? styleOf(save)} style` : ''} ${whenShown()}.`,
    )
  } else if (words[0] === 'wild') {
    // One visitor at a time: a second call doesn't bring (or claim) another.
    if (wild && status.wild) return `${wild.mon.name} is still here.`
    const said = await spawnWild($, words.slice(1).join(' '))
    if (said) return said
    return wild ? `A wild ${wild.mon.name} wanders by.` : 'No wild Pokémon showed up.'
  } else return `Try one of: ${[...ANIMATIONS, ...PHASES, ...LANDSCAPES, ...WEATHERS, 'moon', 'full moon'].join(', ')}.`
  return `Playing ${name}.`
}

// `/pokemon box [name] [page]`: a page of the PC box, or of the ones a name picks out of it. A last number is first
// read as part of the name (`zygarde 10`, `porygon 2`: Porygon2) when that names some there, else as the page.
async function showBox($: EngineInterface, args: string): Promise<string> {
  await sync($)
  const s = view()
  if (!s.box?.length) return formatBox(s)
  const tokens = args.trim().split(/\s+/).filter(Boolean)
  const last = tokens[tokens.length - 1] ?? ''
  const isNumber = /\d/.test(last) && /^[-+]?[\d.,]+$/.test(last)
  const name = (isNumber ? tokens.slice(0, -1) : tokens).join(' ')
  const whole = isNumber && name ? inBox(s, tokens.join(' '), 'box ', levelNow) : null
  const picked = name ? inBox(s, name, 'box ', levelNow) : null
  // The number of a level (`eevee lv 30`) is never a page.
  const isLevel = readLevel(tokens.join(' ')).level !== undefined && readLevel(name).level === undefined
  const [found, typed] = whole && (isLevel || !('error' in whole)) ? [whole, ''] : [picked, isNumber ? last : '']
  if (found && 'error' in found) return found.error
  const pages = boxPages(found ? found.at.length : s.box.length)
  const page = typed ? (/^\d+$/.test(typed) ? Number(typed) : 0) : 1
  if (page < 1 || page > pages)
    return `There's no page ${typed}: ${pages === 1 ? 'it all fits on one' : `pages go from 1 to ${pages}`}.`
  return formatBox(s, page, found ?? undefined, replyColumns)
}

// How long a naming command waits for a species list still downloading.
const SPECIES_WAIT_MS = 2000

// How long /pokedex <name> waits for evolutions not downloaded yet; past it the entry says to run it again.
const DEX_EVOLUTION_MS = 4000

// `/pokedex <name>`: one species' entry, its evolutions looked up as a party member's of that species and form would
// be (any gender). Null when the words name no species (`shiny` alone): the whole Pokédex then.
async function dexEntryOf($: EngineInterface, args: string): Promise<string | null> {
  const list = species ?? []
  const pick = readDexQuery(list, args.normalize('NFKC'))
  if (typeof pick === 'string' || !pick) return pick
  const as: Member = { id: '', species: pick.species, form: pick.form, isShiny: false, xp: 0, evolutions: 0 }
  const evolutions = await Promise.race([
    evolutionsOf($, as).then(
      (found): DexEvolutions => found,
      (): DexEvolutions => 'offline',
    ),
    $.clock.sleep(DEX_EVOLUTION_MS).then((): DexEvolutions => 'slow'),
  ])
  return formatDexEntry({ pick, list, save: view(), evolutions, levelOf: levelNow }, replyColumns)
}

// The `/pokemon` words that take no Pokémon's name.
const UNNAMED = new Set(['party', 'box', 'size', 'evolution', 'bag', 'mart', 'buy', 'off', 'on', 'help'])
const HELP_WORDS = new Set(['help', '--help', '-h', '?'])

async function pokemon($: EngineInterface, typed: string): Promise<string> {
  // Full-width letters and digits (a Japanese or Chinese keyboard: `ｅｅｖｅｅ ２`) read as the plain ones, numbers
  // included, wherever a word is read.
  const args = typed.normalize('NFKC')
  const [head = '', ...rest] = args.trim().split(/\s+/)
  const tail = rest.join(' ')
  // A name is looked up among every species and form too (`zygarde 10` is a form, not the 10th Zygarde). A list not
  // there yet is waited for a moment only: a hanging download would hold every naming command up, and without it a
  // name is read the plain way.
  if (!species && !UNNAMED.has(head.toLowerCase()))
    await Promise.race([loadSpecies($).catch(() => null), $.clock.sleep(SPECIES_WAIT_MS)])
  if (HELP_WORDS.has(head.toLowerCase())) return POKEMON_HELP
  switch (head.toLowerCase()) {
    case 'party':
      await sync($)
      return formatParty(view(), replyColumns, readyNow())
    case 'box':
      return showBox($, tail)
    case 'find':
      // Read-only: the party and the box as they stand, nothing written.
      await sync($)
      return formatFind(view(), tail, levelNow, replyColumns)
    case 'add':
      return addMember($, tail)
    case 'deposit':
      return depositMember($, tail)
    case 'remove':
    case 'release':
      return releaseOne($, tail, head.toLowerCase())
    case 'size':
      return setSize($, tail.toLowerCase())
    case 'evolution':
      return setEvolutionStyle($, tail.toLowerCase())
    case 'everstone':
      return toggleEverstone($, tail)
    case 'evolve':
      return evolveByName($, tail)
    case 'bag':
      await sync($)
      return formatBag(save, cash, replyColumns)
    case 'give':
      return giveItem($, tail)
    case 'take':
      return takeItem($, tail)
    case 'mart':
      return openMartCommand($)
    case 'buy':
      return buyCommand($, tail)
    case 'off':
      return setOff($, true)
    case 'on':
      return setOff($, false)
    default:
      return setLead($, args)
  }
}

// The cached text at `path` and when it was written. A cache that can't be read (a network home folder
// refuses it) is treated as empty, so the download goes ahead.
async function readCache($: EngineInterface, path: string): Promise<{ text: string; mtimeMs: number } | null> {
  try {
    if (!(await $.fs.exists(path))) return null
    const { mtimeMs } = await $.fs.stat(path)
    return { text: (await $.fs.read(path)) as string, mtimeMs }
  } catch {
    return null
  }
}

// The host's UTC offset in minutes, asked (`date` on macOS and Linux, PowerShell on Windows) only when the plugin's
// clock claims UTC, since that may just mean it couldn't tell. A clock that knows its offset is read afresh each
// time instead (null here): kept from start-up, a London session open across the clocks going back would run an hour
// fast all winter.
async function readTimeZone($: EngineInterface): Promise<number | null> {
  const own = -new Date().getTimezoneOffset()
  if (own !== 0) return null
  try {
    const { stdout } = await $.process.run(['date', '+%z'], { timeoutMs: 5000 })
    const m = /^([+-])(\d\d)(\d\d)/.exec(stdout.trim())
    if (m) return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]))
  } catch {
    // No `date` here (Windows): PowerShell next.
  }
  try {
    const { stdout } = await $.process.run(
      ['powershell', '-NoProfile', '-Command', '[TimeZoneInfo]::Local.GetUtcOffset([DateTime]::Now).TotalMinutes'],
      { timeoutMs: 5000 },
    )
    const minutes = Number(stdout.trim())
    if (Number.isFinite(minutes)) return minutes
  } catch {
    // No host commands at all (a remote surface): UTC it is.
  }
  return own
}

// Where downloads are kept: XDG_CACHE_HOME when set (and absolute, as the spec asks), %LOCALAPPDATA% on Windows,
// ~/.cache otherwise.
async function findCacheDir($: EngineInterface): Promise<string | null> {
  const xdg = await $.env.get('XDG_CACHE_HOME')
  if (xdg?.startsWith('/')) return `${xdg}/claude-code-pokemon`
  const local = await $.env.get('LOCALAPPDATA')
  if (local) return `${local}/claude-code-pokemon`
  const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))
  return home ? `${home}/.cache/claude-code-pokemon` : null
}

// Loads the save; commands can run from then on. A store that can't be read is reported, and every later save
// change reads it again.
async function load($: EngineInterface) {
  try {
    cacheDir = await findCacheDir($)
    const fresh = `${LEDGER}${newId()}${newId()}`
    ledgerKey = (await update($, ledger, key => key ?? fresh)) ?? fresh
    await queued(async () => {
      const raw = await $.store.get('save')
      await seedTogether($, raw)
      save = loadSave(raw)
      countLedgers(await readLedgers($))
      times = loadTogether(await $.store.get(TOGETHER)).ms
    })
  } catch (err) {
    await report($, err)
  }
}

// Claude Code gives a command ten seconds, then drops its answer (and unloads a plugin that keeps overrunning). A
// command not done by this time (a stalled download another one started, a store held up) answers that it is still
// at it. When it's done, what it changed is told in a toast; a list says it's ready to be asked for again. That
// "run it again" is safe only because every multi-line reply is read-only: a command that changes the save must
// answer in time or, late, say in one line what it did, never "run it again".
const COMMAND_MS = 6000
const STILL_WORKING = "Still working on it… What comes of it is told in a notification when it's done."
async function promptly($: EngineInterface, line: string, work: () => Promise<string>): Promise<string> {
  const run = work()
  const answer = await Promise.race([run, $.clock.sleep(COMMAND_MS).then(() => null)])
  if (answer !== null) {
    shownAnswers.delete(answer)
    return answer
  }
  background(
    $,
    run.then(text => {
      if (shownAnswers.delete(text) || !text) return
      $.ui.toast(text.includes('\n') ? `Pokémon: ${line} is ready. Run it again to see it.` : text)
    }),
  )
  return STILL_WORKING
}

// Commands wait for start-up, but no longer than this: a stalled download never holds them up.
const START_WAIT_MS = 5000
const settled = ($: EngineInterface) => Promise.race([started, $.clock.sleep(START_WAIT_MS)])

// After the save: the time zone, the party's sprites (or a first Pokémon), then any evolution due.
async function start($: EngineInterface) {
  tzOffsetMin = await readTimeZone($)
  if (save.party.length) await refreshParty($)
  else if (!save.isOff) await setLead($, '', true)
  await learnEvolutions($)
}

// A /clear goes on in this process as a new session whose state starts empty, with no `session.start`: this
// process's ledger key and the party drawn are written into it again.
async function restore($: EngineInterface) {
  if (ledgerKey) await update($, ledger, () => ledgerKey)
  if (save.party.length) await refreshParty($)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    for (const command of Object.values(COMMANDS)) await $.command.register(command)
    ready = load($)
    started = ready
      .then(() => start($))
      .catch(err => report($, err))
      .catch(() => {
        // Nowhere left to report it: the session is closing.
      })
    background($, $.ui.close({ id: 'pokemon' }))
    loopTicks($)
    $.clock.every(SYNC_MS, () =>
      background(
        $,
        started.then(() => retry($)),
      ),
    )
    $.clock.every(TOGETHER_EVERY_MS, () =>
      background(
        $,
        started.then(() => together($)),
      ),
    )

    return next(e)
  })

  // Fires after a /clear (source `clear`), unlike `session.start`; the first start draws the party itself.
  on('classic.SessionStart', async ($, e, next) => {
    if (e.source !== 'startup')
      background(
        $,
        started.then(() => restore($)),
      )
    return next(e)
  })

  on('command.run', { command: 'pokemon-play' }, async ($, e) => ({
    text: await promptly($, `/pokemon-play ${e.args}`.trim(), async () => {
      try {
        await ready
        await settled($)
        return await play($, e.args)
      } catch (err) {
        return `Couldn't reach the Pokémon: ${err instanceof Error ? err.message : String(err)}`
      }
    }),
  }))

  on('command.run', { command: 'pokedex' }, async ($, e) => ({
    text: await promptly($, `/pokedex ${e.args}`.trim(), async () => {
      replyColumns = columnsOf(e.presentation?.columns)
      try {
        await ready
        await settled($)
        await sync($)
        await loadSpecies($)
        const entry = await dexEntryOf($, e.args)
        if (entry) return entry
        return `${formatDex(
          save,
          (species ?? []).map(s => s.name),
        )}\n\n${formatParty(view(), replyColumns, readyNow())}`
      } catch (err) {
        return `Couldn't open the Pokédex: ${err instanceof Error ? err.message : String(err)}`
      }
    }),
  }))

  on('command.run', { command: 'pokemon-help' }, async () => ({ text: ALL_HELP }))

  // While a Pokémon command is typed, the typeahead previews what each word can be.
  on('prompt.autocomplete', async ($, e, next) => {
    const rows = suggest(e.text, e.cursor, e.token, e.start, { ...view(), levelOf: levelNow })
    if (!rows.length) return next(e)
    return { suggestions: [...(await next(e)).suggestions, ...rows] }
  })

  on('command.run', { command: 'pokemon' }, async ($, e) => {
    feel('activity')
    replyColumns = columnsOf(e.presentation?.columns)
    return {
      text: await promptly($, `/pokemon ${e.args}`.trim(), async () => {
        try {
          await ready
          await settled($)
          return await pokemon($, e.args)
        } catch (err) {
          return `Couldn't reach the Pokémon: ${err instanceof Error ? err.message : String(err)}`
        }
      }),
    }
  })

  on('prompt.submit', async ($, e, next) => {
    feel('activity')
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    // A subagent's turn ends with no main turn.complete of its own: it counts as activity, not as Claude working.
    feel(e.agentId ? 'activity' : 'turn-start')
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (!e.agentId) {
      feel(e.reason === 'answer' ? 'turn-answer' : 'turn-end')
      if (e.reason === 'answer') background($, earn($, XP.reply))
    } else if (agents.delete(e.agentId)) countAgents()
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (e.agentId) return next(e)
    const token = e.tool === 'Agent' ? (e.tool_use_id ?? `agent-${Math.random()}`) : null
    if (token) (agents.add(token), countAgents())
    try {
      const ran = await next(e)
      // Refused by a hook beneath: nothing ran.
      if ('deny' in ran) return ran
      const result = ran.result as
        | {
            status?: string
            agentId?: string
            stdout?: string
            stderr?: string
            backgroundTaskId?: string
            interrupted?: boolean
          }
        | string
        | undefined
      const record = typeof result === 'object' ? result : undefined
      if (token && record?.status === 'async_launched' && record.agentId) agents.add(record.agentId)
      // Still running in the background: how it went isn't known yet. Stopped by the person: it says nothing either.
      if (record?.backgroundTaskId || record?.interrupted) return ran
      // The output as the model read it, and as the tool recorded it.
      const recorded = record ? [record.stdout, record.stderr] : [typeof result === 'string' ? result : '']
      const output = [ran.text, ...recorded].filter(Boolean).join('\n')
      const command = e.tool === 'Bash' ? e.command : undefined
      const outcome = classify(e.tool, command, Boolean(ran.isError), streak, output)
      streak = outcome.streak
      outcome.happenings.forEach(feel)
      if (outcome.xp) background($, earn($, outcome.xp))
      return ran
    } finally {
      if (token) (agents.delete(token), countAgents())
    }
  })

  on('session.compact', async ($, e, next) => {
    if (e.agentId || e.trigger === 'precompute') return next(e)
    feel('compact-start')
    try {
      return await next(e)
    } finally {
      feel('compact-end')
    }
  })

  on('ui.message', async ($, e, next) => {
    const click = e.element === 'aim' ? readClick(e.data) : null
    if (click) throwAt($, click)
    // A click on a button drawn before a visitor came opens nothing.
    if (e.element === 'shop' && (e.data as { open?: unknown } | null)?.open === true && !martRefusal()) openMart($)
    const typed = e.element === 'mart' ? (e.data as { typed?: unknown } | null)?.typed : undefined
    // Typing that went on after the first key closed the Mart still goes to the prompt.
    if (typeof typed === 'string') {
      await typedInMart($, typed)
      return {}
    }
    const posted = e.element === 'mart' && mart.isOpen ? (e.data as { act?: unknown } | null)?.act : undefined
    if (isAct(posted)) {
      const answer = await martAct($, posted)
      if (answer) return answer
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const mons = await read($, party)
    await readClock($)
    // Another surface drawing at the same time leaves the terminal's band alone.
    if (e.surface !== 'terminal') return next(e)
    if (!mons.length || save.isOff || e.props.hasSurvey) {
      band = null
      // Off, maybe from another session: the Mart doesn't come back with the party, nor an evolution's screen.
      if (save.isOff) {
        mart = { ...mart, isOpen: false }
        dropScreens($)
      }
      return next(e)
    }
    const { Box, Client, Raster } = $.ui.resolve(e)
    // As wide as a Raster can be, the party kept out of the button's corner (none on a band too narrow for both).
    const total = Math.min(512, e.props.bodyColumns)
    const button = total > 2 * BUTTON_COLUMNS ? BUTTON_COLUMNS : 0
    const columns = total - button
    const budget = spriteBudget(save.size, e.props.maxRows, Math.ceil(HEADROOM / 2))
    const keys = mons.map(m => m.key)
    const looks = looksOf(mons)
    if (!fitted || fitted.budget !== budget || looks !== fitted.looks) {
      const lefts = mons.map(m => fit(m, budget))
      status = {
        ...status,
        actors: carryActors(fitted?.keys ?? [], keys, status.actors, i =>
          newScene(Math.floor(Math.random() * Math.max(1, columns - (lefts[i]?.width ?? 0)))),
        ),
      }
      fitted = { budget, keys, looks, lefts }
      // An evolution plays on on its own Pokémon wherever the change put it, and stops if it left the party. Its
      // screen plays to the end whatever happens to the party.
      if (status.mood?.kind === 'evolve' && !status.mood.isScreen) {
        const at = keys.indexOf(evolving)
        status = { ...status, mood: at >= 0 ? { ...status.mood, actor: at } : null }
        if (at < 0) evolveFrom = null
      }
      if (wild) wild = { ...wild, left: fitWild(wild.mon) }
    }
    // Too short now for the screen playing (the terminal shrank): it ends here, with its toast, and the band goes on.
    if (screen && e.props.maxRows < SCREEN_MIN_ROWS) cutScreen($)
    const fits = Math.ceil((Math.max(...fitted.lefts.map(l => l.height)) + 1 + HEADROOM) / 2)
    // A screen keeps the band's height while it plays, however the party changes under it.
    const rows = screen ? Math.min(e.props.maxRows, Math.max(fits, screen.rows)) : fits
    // Too short a space for even the smallest band: Claude Code's own row instead of a scrolling one.
    if (rows > e.props.maxRows) {
      band = null
      return next(e)
    }
    status = {
      ...status,
      actors: status.actors.map((a, i) => ({
        ...a,
        x: Math.min(a.x, Math.max(0, columns - (fitted?.lefts[i]?.width ?? 0))),
      })),
    }
    status = keepRustleAtEdge(status, total)
    band = { requestId: e.requestId, columns, rows, total }
    isHidden = false
    isAiming = canAim()
    isButtonHidden = isVisited()
    // The Mart covers the band: no scene frame is made under it.
    if (mart.isOpen) {
      lastCells = ''
      return <Client key="mart" module="./mart.tsx" width={total} height={rows} props={martProps()} />
    }
    // An evolution's screen covers the band: one picture, its text real characters, nothing to click.
    if (screen) {
      lastCells = screenCells(screen, total, rows)
      return <Raster key="scene" columns={total} rows={rows} cells={lastCells} />
    }
    const img = frame(status, fitted.lefts, columns, rows, lookNow(), total)
    const { cells } = toCells(img)
    lastCells = cells
    // The click layer is the whole picture, the button's corner included: anything narrower leaves that corner blank,
    // and a click there is a throw like any other.
    if (isAiming)
      return <Client key="aim" module="./aim.tsx" width={total} height={rows} props={{ lines: textRows(img) }} />
    // The whole band is one picture, the landscape running on under the button; only a wild visitor walks there, and
    // then the button is gone.
    const scene = <Raster key="scene" columns={total} rows={rows} cells={cells} />
    // No button while a wild Pokémon is out, aimable or not: the Mart would hold up the catch.
    if (!button || isButtonHidden) return scene
    const p = buttonProps()
    const size = shopSize(p)
    return (
      <Box>
        {scene}
        <Box position="absolute" top={0} right={0}>
          <Client key="shop" module="./shop.tsx" width={size.columns} height={size.rows} props={p} />
        </Box>
      </Box>
    )
  })

  // Claude Code draws its own spinner (with its tip, task list and token count); only the word turns Pokémon.
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    if (save.isOff || e.surface !== 'terminal') return next(e)
    return next({ ...e, props: { ...e.props, word: pickFor(WORKING, e.props.word) } })
  })

  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    if (save.isOff || e.surface !== 'terminal') return next(e)
    const { Box, Text } = $.ui.resolve(e)
    // The blank line above that Claude Code's own closing line has.
    return (
      <Box marginTop={1}>
        <Text>
          <Text color={COLORS.red}>{BALL}</Text>{' '}
          <Text color={COLORS.yellow} bold>
            {pickFor(DONE, e.props.word)}
          </Text>{' '}
          <Text color={COLORS.blue}>for {formatDuration(e.props.durationMs)}</Text>
        </Text>
      </Box>
    )
  })

  // The Pokédex with each bar's caught cells green over the seen ones. A tree of our own takes the row's whole place,
  // so it draws the gutter as the engine does (the text starts with the plugin's name); the text keeps the cells apart.
  on('ui.render', { component: 'CommandOutput' }, async ($, e, next) => {
    const { command, text, isErrored } = e.props
    const hasBars = Object.values(DEX_CELL).some(cell => text.includes(cell))
    if (e.surface !== 'terminal' || command !== 'pokedex' || isErrored || !hasBars) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    // A line's caught cells green, its seen ones as solid as before.
    const runs = (line: string) =>
      line.split(new RegExp(`(${DEX_CELL.caught}+|${DEX_CELL.seen}+)`)).map((run, i) =>
        run.startsWith(DEX_CELL.caught) ? (
          <Text key={`c${i}`} color={CAUGHT_GREEN}>
            {run}
          </Text>
        ) : run.startsWith(DEX_CELL.seen) ? (
          DEX_CELL.caught.repeat(run.length)
        ) : (
          run
        ),
      )
    return (
      <Box flexDirection="row">
        <Text color="inactive">{'  ⎿  '}</Text>
        <Box flexDirection="column">
          {text.split('\n').map((line, y) => (
            // An empty Text would take no row.
            <Text key={`r${y}`}>{line ? runs(line) : ' '}</Text>
          ))}
        </Box>
      </Box>
    )
  })
}
