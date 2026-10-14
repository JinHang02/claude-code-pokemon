import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Mon } from '../types'
import { ballOverlays, clickPixels, DEFAULT_RATE, readClick, startThrow, stepThrow, wildLook } from './catch'
import type { Click, Throw, ThrowEvent } from './catch'
import { chooseStage, dueStages, evolvedForm, genderOf, nextStages, pokeapiForm, timeMatches } from './evolution'
import type { ChainLink, Gender, Stage } from './evolution'
import { ICONS } from './item-icons'
import { forSale, isForSale, itemById, itemName, MAX_BAG, splitGive, TABS, withArticle } from './items'
import type { Item } from './items'
import { act, isAct, START } from './mart'
import type { Act, MartProps } from './mart'
import { guessItem, lookup, randomPick, slug, spell } from './lookup'
import type { Pick, Species } from './lookup'
import { classify } from './reactions'
import {
  addTogether,
  balanceOf,
  buy,
  displayName,
  emptySave,
  formatBag,
  formatBox,
  formatDex,
  formatParty,
  earnInto,
  evolvesText,
  extraMoney,
  extraXp,
  foldLedger,
  isName,
  level,
  LEDGER,
  loadLedger,
  loadSave,
  loadTogether,
  MAX_LEVEL,
  MAX_PARTY,
  MONEY_PER_XP,
  newId,
  putInBag,
  recordCaught,
  recordSeen,
  spriteBudget,
  storeCaught,
  takeFromBag,
  TIME_TEXT,
  titleCase,
  TOGETHER,
  togetherOf,
  withExtra,
  withTime,
  withTogether,
  XP,
  xpForLevel,
} from './save'
import type { Ledger, Member, Save, Size } from './save'
import {
  CALM_EVERY,
  carryActors,
  EVOLVE,
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
  scenery,
  slice,
  startWild,
  step,
  TICK_MS,
  paintedBy,
  ticks,
  wildPlacement,
} from './scene'
import type { Happening, Look, Phase, Status } from './scene'
import { landscapeAt, LANDSCAPES } from './backdrop'
import type { Landscape } from './backdrop'
import { BALL, COLORS, DONE, formatDuration, pickFor, WORKING } from './spinner'
import { fit, parseAnsi, textRows, toCells } from './sprite'
import type { Pixels, TextRun } from './sprite'
import type { ShopProps } from './shop'

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

// `columns`: the scene's width; `total`: the band's, the button beside the scene included.
let band: { requestId: string; columns: number; rows: number; total: number } | null = null
let fitted: { budget: number; keys: string[]; lefts: Pixels[] } | null = null
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
// The band's corner button takes this many columns beside the scene.
const BUTTON_COLUMNS = 13
// The button's landscape keeps to whole seconds, so it changes (a redraw of the band) at most once a second.
const BUTTON_EVERY = ticks(1000)
// The button's landscape as last drawn, to redraw it only when the sky behind it changed.
let buttonDrawn = ''
// The PokéMart: open in the band, the last thing it said, and what is selected in it.
let mart = { isOpen: false, message: '', isError: false, view: START }
// While a wild Pokémon can be aimed at, the band is drawn as text by a click layer (a click layer over pixel art
// stalls the terminal), redrawn every AIM_EVERY ticks: text costs more to draw than pixel art.
const AIM_EVERY = 2
let isAiming = false
// A wild Pokémon is out (rustling, aimable or in a ball): no ₽ button and no Mart then, as the Mart would cover it.
const isVisited = () => Boolean(status.wild || pitch)
// The band was last drawn without its button for a visitor; it is drawn again when the visitor comes or goes.
let isButtonHidden = false
const canAim = () =>
  Boolean(wild && wildRate !== null && status.wild && status.wild.rustle === 0 && !status.wild.isFleeing && !pitch)
let wildDue = WILD_EVERY[0]
let evolveFrom: Pixels | null = null
let shown: { phase?: Phase; landscape?: Landscape; until: number } | null = null
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
}
const countAgents = () => {
  status = { ...status, agents: agents.size + demoAgents }
}
const between = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1))
const fileOf = (m: { species: string; form: string }) => (m.form === 'regular' ? m.species : `${m.species}-${m.form}`)
const keyOf = (m: Member) => `${m.species}|${m.form}|${m.isShiny}`

// Hours since the epoch in local time. The plugin's own clock knows the offset (and follows daylight saving);
// when it claims UTC, the host's answer from session start is used.
const localHour = (ms = Date.now()) => {
  const own = -new Date().getTimezoneOffset()
  return Math.floor((ms / 60_000 + (own !== 0 ? own : (tzOffsetMin ?? 0))) / 60)
}

const isShowing = () => shown !== null && tickNo < shown.until

function phaseNow(): Phase {
  if (isShowing() && shown?.phase) return shown.phase
  return phaseAt(((localHour() % 24) + 24) % 24)
}

// A different landscape every hour, the same in every session.
function landscapeNow(): Landscape {
  if (isShowing() && shown?.landscape) return shown.landscape
  return landscapeAt(localHour())
}

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
const isArt = (text: string) => text.includes('\x1b[')

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

// Applies `change` to the latest save (another Claude Code session may have written since), then stores
// and adopts the result, so sessions running side by side never undo each other.
function mutate($: EngineInterface, change: (s: Save) => Save) {
  return queued(async () => {
    const raw = await $.store.get('save')
    await seedTogether($, raw)
    save = change(loadSave(raw))
    await $.store.set('save', save)
    // A fold may have landed with it: ledger XP is counted against the save's own marks.
    countLedgers(await readLedgers($))
  })
}

// Picks up what other sessions changed: party, levels, Pokédex, size, on/off.
async function sync($: EngineInterface) {
  let isNewParty = false
  let isNewLook = false
  // Adopted inside the queue, so no change made meanwhile is undone.
  await queued(async () => {
    const latest = loadSave(await $.store.get('save'))
    isNewParty = latest.party.map(keyOf).join() !== save.party.map(keyOf).join()
    isNewLook = latest.size !== save.size || latest.isOff !== save.isOff
    save = latest
    countLedgers(await readLedgers($))
    times = loadTogether(await $.store.get(TOGETHER)).ms
  })
  if (isNewParty) await refreshParty($)
  if (isNewLook) $.ui.invalidate('ui.render')
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
  for (const [key, l] of Object.entries(ledgers)) {
    if (key === ledgerKey || now - l.at < LEDGER_STALE_MS) continue
    // XP it gained after an earlier fold is folded too, before it can go.
    if (foldLedger(save, key, l) !== save) await mutate($, s => foldLedger(s, key, l))
    else {
      const latest = loadLedger(await $.store.get(key))
      if (latest.at === l.at) await $.store.delete(key)
    }
  }
  // Marks of ledgers gone from the store are dropped.
  const gone = (save.folded ?? []).filter(k => !(k in ledgers))
  if (gone.length)
    await mutate($, s => {
      const folded = (s.folded ?? []).filter(k => !gone.includes(k))
      const foldedXp = Object.fromEntries(Object.entries(s.foldedXp ?? {}).filter(([k]) => !gone.includes(k)))
      const foldedMoney = Object.fromEntries(Object.entries(s.foldedMoney ?? {}).filter(([k]) => !gone.includes(k)))
      const { folded: _, foldedXp: __, foldedMoney: ___, ...rest } = s
      return {
        ...rest,
        ...(folded.length ? { folded } : {}),
        ...(Object.keys(foldedXp).length ? { foldedXp } : {}),
        ...(Object.keys(foldedMoney).length ? { foldedMoney } : {}),
      }
    })
}

// The periodic sync, which also retries what start-up couldn't do: a first Pokémon, the party's sprites.
async function retry($: EngineInterface) {
  await sync($)
  if (++syncs % FOLD_EVERY === 0) await foldLedgers($)
  if (save.isOff) return
  if (!save.party.length) await setLead($, '')
  else if (isPartyStale) await refreshParty($)
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
    await update($, party, () => mons)
    isPartyStale = false
    await clearError($)
  } catch (err) {
    if (mine !== refreshes) return
    isPartyStale = true
    await report($, err)
  }
}

// "Did you mean Charizard? Run /pokemon charizard" for a guess at what someone meant.
const didYouMean = (guess: Pick, command: string) =>
  `Did you mean ${displayName(guess.species, guess.form)}? Run /pokemon ${command}${spell(guess)}`

// A new party member from a query (a random one when empty), spelled exactly; `shiny` anywhere forces a
// shiny. A near miss resolves a suggestion naming `command` ('' or 'add ').
async function catchOne($: EngineInterface, query: string, command = ''): Promise<Member | string> {
  const list = await loadSpecies($)
  const words = slug(query).split('-').filter(Boolean)
  const wantsShiny = words.includes('shiny')
  const named = words.filter(w => w !== 'shiny')
  if (!words.length && query.trim()) return `No Pokémon called "${query.trim()}".`
  const found = named.length ? lookup(list, named) : { pick: randomPick(list) }
  if ('error' in found) return found.error
  if ('guess' in found) return didYouMean(found.guess, `${command}${wantsShiny ? 'shiny ' : ''}`)
  const pick = found.pick
  const { isShiny } = await fetchArt($, fileOf(pick), wantsShiny || Math.random() < SHINY_ODDS)
  return { id: newId(), species: pick.species, form: pick.form, isShiny, xp: 0, evolutions: 0 }
}

const same = (a: Member, b: Member) => a.species === b.species && a.form === b.form

// `/pokemon [name]`: makes that Pokémon the lead. One already in the party moves up with its level;
// a new one replaces the lead.
async function setLead($: EngineInterface, query: string): Promise<string> {
  const fromBox = query.trim() ? await leadFromBox($, query) : null
  if (fromBox) return fromBox
  const caught = await catchOne($, query)
  if (typeof caught === 'string') return caught
  let text = ''
  await mutate($, latest => {
    const at = latest.party.findIndex(m => same(m, caught))
    const member = latest.party[at]
    if (member) {
      text = `${displayName(caught.species, caught.form)} leads the party again (Lv ${level(member.xp + (extra[member.id] ?? 0))}).`
      return { ...latest, party: [member, ...latest.party.filter((_, i) => i !== at)] }
    }
    const s = recordSeen(latest, caught.species, caught.isShiny, Date.now())
    const gone = s.party[0]
    text = `${caught.isShiny ? '✨ ' : ''}A wild ${displayName(caught.species, caught.form)} appeared! It's your new lead.`
    if (gone)
      text += ` ${displayName(gone.species, gone.form)} (Lv ${level(gone.xp + (extra[gone.id] ?? 0))}) went back to the wild.`
    return { ...s, party: [caught, ...s.party.slice(1)] }
  })
  await refreshParty($)
  background($, learnEvolutions($))
  return text
}

async function addMember($: EngineInterface, query: string): Promise<string> {
  if (save.party.length >= MAX_PARTY)
    return `Your party is full (${MAX_PARTY}). Make room with /pokemon deposit <name> or remove <name>.`
  const fromBox = query.trim() ? await addFromBox($, query) : null
  if (fromBox) return fromBox
  const caught = await catchOne($, query, 'add ')
  if (typeof caught === 'string') return caught
  const name = displayName(caught.species, caught.form)
  let text = `${caught.isShiny ? '✨ ' : ''}${name} joined your party!`
  await mutate($, s => {
    if (s.party.some(m => same(m, caught))) text = `${name} is already in your party.`
    else if (s.party.length >= MAX_PARTY)
      text = `Your party is full (${MAX_PARTY}). Make room with /pokemon deposit <name> or remove <name>.`
    else return { ...recordSeen(s, caught.species, caught.isShiny, Date.now()), party: [...s.party, caught] }
    return s
  })
  await refreshParty($)
  background($, learnEvolutions($))
  return text
}

// The species and forms among `members`, for looking a name up among them.
function namesOf(members: Member[]): Species[] {
  const names: Species[] = []
  for (const m of members) {
    const known = names.find(n => n.name === m.species)
    if (known) known.forms.push(m.form)
    else names.push({ name: m.species, forms: [m.form] })
  }
  return names
}

// Where among `members` a query names exactly (`vulpix` is the plain one, `alolan vulpix` the other): the form
// named, or else the first of that species; -1 when none.
function indexIn(members: Member[], query: string): number {
  const words = slug(query).split('-').filter(Boolean)
  const found = words.length && members.length ? lookup(namesOf(members), words) : null
  if (!found || !('pick' in found)) return -1
  const { species, form } = found.pick
  const at = members.findIndex(m => m.species === species && m.form === form)
  return at >= 0 ? at : members.findIndex(m => m.species === species)
}

// Where in the PC box a query names exactly, species and form; `shiny` in it asks for a shiny one. Of several, the
// first that is `preferred`, if any. -1 when none.
function boxIndex(box: Member[], query: string, preferred?: (m: Member) => boolean): number {
  const words = slug(query).split('-').filter(Boolean)
  const wantsShiny = words.includes('shiny')
  const named = words.filter(w => w !== 'shiny')
  const found = named.length && box.length ? lookup(namesOf(box), named) : null
  if (!found || !('pick' in found)) return -1
  const { species, form } = found.pick
  const isNamed = (m: Member) => m.species === species && m.form === form && (!wantsShiny || m.isShiny)
  const first = preferred ? box.findIndex(m => isNamed(m) && preferred(m)) : -1
  return first >= 0 ? first : box.findIndex(isNamed)
}

// The party member a query names exactly; otherwise a suggestion naming `command`, or what's in the party.
function findMember(s: Save, query: string, command: string): number | string {
  const at = indexIn(s.party, query)
  if (at >= 0) return at
  const words = slug(query).split('-').filter(Boolean)
  const found = words.length ? lookup(namesOf(s.party), words) : { error: '' }
  if ('guess' in found) return didYouMean(found.guess, command)
  return `No ${query.trim()} in your party. ${formatParty(viewOf(s))}`
}

// `/pokemon <name>` for a Pokémon in the PC box and not the party: it leads, and the old lead goes into the box.
async function leadFromBox($: EngineInterface, query: string): Promise<string | null> {
  let text = ''
  await mutate($, s => {
    const box = s.box ?? []
    const at = boxIndex(box, query)
    const m = box[at]
    if (!m || s.party.some(p => same(p, m))) return s
    const old = s.party[0]
    const lv = (p: Member) => level(p.xp + (extra[p.id] ?? 0))
    text = `${displayName(m.species, m.form)} (Lv ${lv(m)}) came out of the PC box to lead your party.`
    if (old) text += ` ${displayName(old.species, old.form)} (Lv ${lv(old)}) went into the PC box.`
    return { ...s, party: [m, ...s.party.slice(1)], box: [...box.filter((_, i) => i !== at), ...(old ? [old] : [])] }
  })
  if (!text) return null
  await refreshParty($)
  background($, learnEvolutions($))
  return text
}

// `/pokemon add <name>` for a Pokémon in the PC box: it comes out and joins the party.
async function addFromBox($: EngineInterface, query: string): Promise<string | null> {
  let text = ''
  await mutate($, s => {
    const box = s.box ?? []
    const at = boxIndex(box, query)
    const m = box[at]
    if (!m || s.party.some(p => same(p, m)) || s.party.length >= MAX_PARTY) return s
    text = `${displayName(m.species, m.form)} came out of the PC box and joined your party!`
    return { ...s, party: [...s.party, m], box: box.filter((_, i) => i !== at) }
  })
  if (!text) return null
  await refreshParty($)
  background($, learnEvolutions($))
  return text
}

async function removeMember($: EngineInterface, query: string): Promise<string> {
  let text = ''
  await mutate($, s => {
    if (!s.party.length) {
      text = 'Your party is empty. /pokemon <name> picks a lead.'
      return s
    }
    // No name: any member but the lead, so a bare `remove` never takes the Pokémon you chose.
    const at = query.trim() ? findMember(s, query, 'remove ') : 1 + Math.floor(Math.random() * (s.party.length - 1))
    const gone = typeof at === 'number' ? s.party[at] : undefined
    if (typeof at === 'string') text = at
    else if (s.party.length === 1)
      text = 'That would leave your party empty. Pick a new lead with /pokemon <name> instead.'
    else if (gone) {
      text = `${displayName(gone.species, gone.form)} went back to the wild.`
      return { ...s, party: s.party.filter((_, i) => i !== at) }
    }
    return s
  })
  await refreshParty($)
  return text
}

// `/pokemon deposit <name>`: that member goes into the PC box with its level; the next one leads if it was the lead.
async function depositMember($: EngineInterface, query: string): Promise<string> {
  if (!query.trim()) return 'Which one? /pokemon deposit <name>'
  let text = ''
  await mutate($, s => {
    const at = findMember(s, query, 'deposit ')
    const m = typeof at === 'number' ? s.party[at] : undefined
    if (typeof at === 'string') text = at
    else if (s.party.length === 1)
      text = 'That would leave your party empty. Pick a new lead with /pokemon <name> instead.'
    else if (m) {
      text = `${displayName(m.species, m.form)} (Lv ${level(m.xp + (extra[m.id] ?? 0))}) went into the PC box.`
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
      ? `Did you mean ${guess.item.name}? Run /pokemon give ${guess.item.id} ${guess.rest.join(' ') || '<pokemon>'}`
      : 'Give what to whom? /pokemon give <item> <pokemon> · /pokemon bag lists your items.'
  }
  const { item, rest } = found
  const who = rest.join(' ')
  if (!who) return `Give ${withArticle(item.name)} to whom? /pokemon give ${item.id} <pokemon>`
  await sync($)
  if (item.kind === 'candy') return feedCandy($, who, item)
  if (item.kind === 'hold') return holdItem($, who, item, `give ${item.id} `)
  const at = findMember(save, who, `give ${item.id} `)
  if (typeof at === 'string') return at
  // It checks the Bag before anything plays, and takes the item in the same write as the evolution.
  return evolveMember($, at, false, item.id)
}

// The member `query` names holds `item` from the Bag (an Everstone is free); what it held goes back to the Bag.
async function holdItem($: EngineInterface, query: string, item: Item, command: string): Promise<string> {
  let text = ''
  await mutate($, s => {
    const at = findMember(s, query, command)
    if (typeof at === 'string') {
      text = at
      return s
    }
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
        text = `Your Bag can't hold more ${itemName(old)}: take it back first.`
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

// `/pokemon take <name>`: its held item back to the Bag; an Everstone is just dropped. A name only in the PC box
// reaches the one there (one holding an item, if any).
async function takeItem($: EngineInterface, query: string): Promise<string> {
  if (!query.trim()) return 'Which one? /pokemon take <name>'
  let text = ''
  let isDropped = false
  await mutate($, s => {
    const box = s.box ?? []
    const inBox = indexIn(s.party, query) < 0 ? boxIndex(box, query, b => Boolean(b.heldItem)) : -1
    const at = inBox >= 0 ? inBox : findMember(s, query, 'take ')
    if (typeof at === 'string') {
      text = at
      return s
    }
    const m = inBox >= 0 ? box[inBox] : s.party[at]
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
        text = `Your Bag can't hold more ${itemName(heldItem)}.`
        return s
      }
      after = back
      text = `${name}'s ${itemName(heldItem)} went back to your Bag.`
    }
    const without = (list: Member[]) => list.map((p, i) => (i === at ? rest : p))
    return inBox >= 0 ? { ...after, box: without(after.box ?? []) } : { ...after, party: without(after.party) }
  })
  // Already past its level: it evolves now.
  if (isDropped) background($, learnEvolutions($))
  return text
}

// `/pokemon everstone <name>`: gives it the free Everstone, or takes it back.
async function toggleEverstone($: EngineInterface, query: string): Promise<string> {
  if (!query.trim()) return 'Which one? /pokemon everstone <name>'
  await sync($)
  const at = findMember(save, query, 'everstone ')
  if (typeof at === 'number' && save.party[at]?.heldItem === 'everstone') return takeItem($, query)
  const everstone = itemById('everstone')
  return everstone ? holdItem($, query, everstone, 'everstone ') : 'Your party is empty.'
}

// A Rare Candy: one level, up to MAX_LEVEL; the level may bring an evolution.
async function feedCandy($: EngineInterface, query: string, item: Item): Promise<string> {
  let text = ''
  let grew = false
  await mutate($, s => {
    const at = findMember(s, query, `give ${item.id} `)
    if (typeof at === 'string') {
      text = at
      return s
    }
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
  const ledgers = await readLedgers($)
  await mutate($, s => {
    const bought = buy(s, extraMoney(ledgers, s.folded, s.foldedMoney), item, qty)
    result = { text: bought.text, isError: bought.isError }
    return bought.save
  })
  return result
}

async function setOff($: EngineInterface, isOff: boolean): Promise<string> {
  if (isOff) closeMart($)
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

// What `member` can evolve into and how, as in the games (empty at a final stage), and its species' gender ratio.
async function evolutionsOf($: EngineInterface, member: Member): Promise<{ stages: Stage[]; genderRate: unknown }> {
  const list = await loadSpecies($)
  const res = await cachedFetch(
    $,
    `${POKEAPI}/pokemon-species/${member.species}`,
    `pokeapi/species-${member.species}.json`,
    isJson,
  )
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
  return { stages: stages.filter(n => list.some(s => s.name === n.species)), genderRate }
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

type Surroundings = { phase: Phase; party: string[]; partyTypes: string[] }

// The time of day and the party, as evolutions see them; types are fetched only when a member needs one.
async function evolutionContext($: EngineInterface): Promise<Surroundings> {
  const hour = localHour(await $.clock.now())
  const party = save.party.map(m => m.species)
  const needsTypes = save.party.some(m => m.next?.some(s => s.way.kind === 'level' && s.way.partyType))
  const partyTypes = needsTypes
    ? (await Promise.all(save.party.map(m => typesOf($, pokeapiForm(m.species, m.form))))).flat()
    : []
  return { phase: phaseAt(((hour % 24) + 24) % 24), party, partyTypes }
}

// The stages `m` reaches by itself now.
const dueFor = (m: Member, c: Surroundings): Stage[] =>
  dueStages(m.next ?? [], {
    level: level(m.xp),
    phase: c.phase,
    ...(m.heldItem ? { heldItem: m.heldItem } : {}),
    togetherMs: m.togetherMs ?? 0,
    party: c.party,
    partyTypes: c.partyTypes,
  })

// Evolution checks run one at a time, so no Pokémon evolves twice. A failed check was already reported
// by its caller and doesn't hold up the next.
let learning: Promise<void> = Promise.resolve()
const learnEvolutions = ($: EngineInterface) => (learning = learning.catch(() => {}).then(() => checkEvolutions($)))

// Looks up how every party member that doesn't know it yet evolves, then evolves any already due, one animation
// at a time. Nothing evolves while the party is off.
async function checkEvolutions($: EngineInterface) {
  for (const member of save.party.filter(m => m.next === undefined || m.gender === undefined)) {
    const gender = await settleGender($, member)
    const { stages } = await evolutionsOf($, { ...member, gender })
    await mutate($, s => ({
      ...s,
      party: s.party.map(m =>
        m.id === member.id && m.species === member.species ? { ...m, next: stages, gender } : m,
      ),
    }))
  }
  const context = await evolutionContext($)
  const isDue = (id: string) => view().party.some(m => m.id === id && dueFor(m, context).length > 0)
  for (const { id } of save.party) {
    if (save.isOff || !isDue(id)) continue
    // The one before finishes its animation first; nothing to wait for when no band is drawn.
    for (let wait = 0; band && status.mood?.kind === 'evolve' && wait < EVOLVE + ticks(2000); wait += 5)
      await $.clock.sleep(TICK_MS * 5)
    // The party may have changed during the wait: it is looked up again by id.
    const at = save.party.findIndex(m => m.id === id)
    if (!save.isOff && isDue(id)) await evolveMember($, at)
  }
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

// Evolves party member `at` into a form it can reach now: by itself, or by the item `given` from the Bag (used up
// in the same write). The animation plays from its current sprite. A preview plays it and puts the old form back
// afterwards; a real one saves the new form and tells the person.
async function evolveMember($: EngineInterface, at: number, isPreview = false, given?: string): Promise<string> {
  const member = save.party[at]
  if (!member) return 'Your party is empty.'
  const name = displayName(member.species, member.form)
  // Before any download or animation; the save write checks again.
  if (given && !isPreview && !save.bag?.[given]) return noItem(itemName(given))
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
        ? byItem.filter(s => timeMatches(s.way.kind === 'item' ? s.way.time : undefined, context.phase))
        : dueFor(withTime({ ...member, xp: member.xp + (extra[member.id] ?? 0), next: stages }, times), context)
    // A preview shows any branch; a real evolution takes this Pokémon's own.
    const next = isPreview ? allowed[Math.floor(Math.random() * allowed.length)] : chooseStage(member.id, allowed)
    if (!next) {
      if (!isPreview && !options.length)
        await mutate($, s => ({
          ...s,
          party: s.party.map(m => (m.id === member.id ? { ...m, next: [] } : m)),
        }))
      if (given) {
        const way = byItem[0]?.way
        const time = way?.kind === 'item' ? way.time : undefined
        return time
          ? `${name} can use ${withArticle(itemName(given))} only ${TIME_TEXT[time]}.`
          : `${name} can't use ${withArticle(itemName(given))}.`
      }
      return options.length
        ? `${name} ${evolvesText(withTime({ ...member, next: stages }, times))}.`
        : `${name} doesn't evolve any further.`
    }
    const forms = (await loadSpecies($)).find(s => s.name === next.species)?.forms ?? []
    const form = evolvedForm(next, member.form, forms)
    const { art, isShiny } = await fetchArt($, fileOf({ species: next.species, form }), member.isShiny)
    // It may have moved, left, or been given an everstone during the downloads.
    const slot = isPreview ? at : save.party.findIndex(m => m.id === member.id && m.species === member.species)
    const now = save.party[slot]
    if (!now) return `${name} already evolved.`
    if (!isPreview && !given && now.heldItem === 'everstone') return `${name} holds an everstone: it won't evolve.`
    evolveFrom = fitted?.lefts[slot] ?? null
    const { next: _, ...rest } = member
    const evolved: Member = { ...rest, species: next.species, form, isShiny, evolutions: member.evolutions + 1 }
    const newName = displayName(next.species, form)
    const mon: Mon = { key: keyOf(evolved), name: newName, isShiny, ...parseAnsi(art) }
    await update($, party, list => list.map((m, i) => (i === slot ? mon : m)))
    status = evolve(status, slot)
    if (isPreview) {
      $.clock.after(EVOLVE * TICK_MS + 3000, () => background($, refreshParty($)))
      return `Previewing ${name} evolving into ${newName}; it changes back in a few seconds.`
    }
    // Shedinja comes along when Nincada evolves by level, with Nincada's level and shininess, and counts as caught.
    const shed = next.way.kind === 'level' ? stages.find(s => s.way.kind === 'shed') : undefined
    let shedText = ''
    // Another session may have evolved it first: then that evolution stands.
    let outcome = `${name} already evolved.`
    await mutate($, s => {
      const i = s.party.findIndex(m => m.id === member.id && m.species === member.species)
      const latest = s.party[i]
      if (!latest) return s
      if (!given && latest.heldItem === 'everstone') {
        outcome = `${name} holds an everstone: it won't evolve.`
        return s
      }
      if (given && !s.bag?.[given]) {
        outcome = noItem(itemName(given))
        return s
      }
      outcome = ''
      const { next: __, heldItem, ...kept } = latest
      // A held item that made it evolve is used up; any other stays held.
      const keeps = heldItem && !(next.way.kind === 'hold' && next.way.item === heldItem)
      const grown: Member = {
        ...kept,
        ...(keeps ? { heldItem } : {}),
        species: next.species,
        form,
        isShiny,
        evolutions: latest.evolutions + 1,
      }
      const seen = recordSeen(given ? takeFromBag(s, given) : s, next.species, isShiny, Date.now())
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
      }
      const found = recordCaught(recordSeen(after, shed.species, isShiny, Date.now()), shed.species, Date.now())
      const stored = storeCaught(found, shedinja)
      const shedName = displayName(shed.species)
      shedText = stored.isInParty ? ` ${shedName} joined your party!` : ` ${shedName} went to the PC box.`
      return stored.save
    })
    if (!outcome) $.ui.toast(`What? ${name} evolved into ${newName}!${shedText}`)
    // Also redraws over any refresh that was already under way with the old sprite.
    await refreshParty($)
    if (outcome) return outcome
    background($, learnEvolutions($))
    return `${name} evolved into ${newName}!${shedText}`
  } catch (err) {
    if (!isPreview) await report($, err)
    return `${name} couldn't evolve right now: ${err instanceof Error ? err.message : String(err)}`
  }
}

// XP for the whole party, written to this session's own ledger; anyone due evolves, one after another.
async function earn($: EngineInterface, amount: number) {
  await ready
  let leveledUp = false
  let isPaid = false
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
  try {
    const list = await loadSpecies($)
    const words = slug(query).split('-').filter(Boolean)
    const found = words.length ? lookup(list, words) : { pick: randomPick(list) }
    if ('error' in found) return found.error
    if ('guess' in found)
      return `Did you mean ${displayName(found.guess.species, found.guess.form)}? Run /pokemon-play wild ${spell(found.guess)}`
    const pick = found.pick
    const { art, isShiny } = await fetchArt($, fileOf(pick), Math.random() < SHINY_ODDS)
    // Another visitor may have stepped out during the downloads.
    if (!band || !fitted || status.wild || pitch) return null
    const mon: Mon = { key: 'wild', name: displayName(pick.species, pick.form), isShiny, ...parseAnsi(art) }
    wild = { mon, left: fitWild(mon), pick }
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
    status = startWild(status, band.columns, wild.left.width)
    closeMart($)
    $.ui.toast(`${isShiny ? '✨ ' : ''}A wild ${mon.name} appeared!`, { timeoutMs: 6000 })
    await mutate($, s => recordSeen(s, pick.species, isShiny, Date.now()))
  } catch (err) {
    await report($, err)
  }
  return null
}

// A left click on the band: a Poké Ball at that spot while a wild Pokémon is out of the grass, one at a time.
function throwAt(click: Click) {
  feel('activity')
  const w = status.wild
  if (!band || !wild || !w || !canAim()) return
  const height = band.rows * 2
  const place = wildPlacement(w, wild.left, height)
  const { x, ys } = clickPixels(click)
  // A hit is a pixel the wild Pokémon shows in the last frame: one a party member stands in front of misses.
  const isHit = ys.some(y => paintedBy(x, y) === 'wild')
  const to = { x, y: ys[ys.length - 1] ?? 0 }
  // The ball comes to rest with its bottom on the ground row, in front of the Pokémon's middle.
  const rest = { x: place.left + place.img.width / 2, y: height - 3 }
  pitch = startThrow({ x: -3, y: height - 2 }, to, rest, isHit, wildRate ?? DEFAULT_RATE)
  if (isHit) status = holdWild(status, true)
}

// The Pokémon in the ball is kept: in the party while it has room (and no twin), else the PC box.
async function keepCatch($: EngineInterface) {
  if (!wild) return
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
  await mutate($, s => {
    const kept = storeCaught(recordCaught(s, pick.species, Date.now()), caught)
    isInParty = kept.isInParty
    return kept.save
  })
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
  else if (event === 'fled') status = fleeWild(status, band?.columns ?? 0, wild?.left.width ?? 0)
  else background($, keepCatch($))
}

function openMart($: EngineInterface) {
  mart = { isOpen: true, message: '', isError: false, view: START }
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
    const uses = party.flatMap(m =>
      (m.next ?? [])
        .filter(st => (st.way.kind === 'item' || st.way.kind === 'hold') && st.way.item === i.id)
        .map(st => `${displayName(m.species, m.form)} → ${titleCase(st.species)}`),
    )
    const { id, name, tab, price, color, text } = i
    return { id, name, tab, price, color, text, ...(uses.length ? { party: [...new Set(uses)].join(', ') } : {}) }
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

// The landscape behind the button: the band's own, carried on past the scene's right edge, at the start of this second.
function buttonLines(): TextRun[][] {
  if (!band) return []
  const t = status.t - (status.t % BUTTON_EVERY)
  const look = { phase: phaseNow(), landscape: landscapeNow() }
  return textRows(slice(scenery(band.total, band.rows, look, t), band.columns, band.total - band.columns))
}

function buttonProps(): ShopProps {
  const lines = buttonLines()
  buttonDrawn = JSON.stringify(lines)
  return { balance: balanceOf(save, cash), plus, lines }
}

// A click or key in the Mart: the selection moves, a buy goes through, ✕ closes it. Answers the Mart's
// next props while it stays open.
async function martAct($: EngineInterface, a: Act): Promise<{ props: MartProps } | null> {
  const was = mart.view
  const done = act(martProps(), was, a)
  // Another item, tab or quantity: the last message was about the one before.
  const isMoved = done.state.tab !== was.tab || done.state.sel !== was.sel || done.state.qty !== was.qty
  mart = { ...mart, view: done.state, ...(isMoved ? { message: '', isError: false } : {}) }
  if (done.refusal) mart = { ...mart, message: done.refusal, isError: true }
  if (done.post && 'close' in done.post) {
    closeMart($)
    return null
  }
  if (done.post && 'buy' in done.post) {
    try {
      const { text, isError } = await buyItem($, done.post.buy.id, done.post.buy.qty)
      // Bought: back to one. Refused: the quantity stays, to change and try again.
      mart = { ...mart, message: text, isError, view: isError ? mart.view : { ...mart.view, qty: 1 } }
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

// Why the Mart can't open now, or null when it can.
function martRefusal(): string | null {
  if (!band || save.isOff) return "The PokéMart opens in the Pokémon band above the prompt, and it isn't showing here."
  // The visitor would go on walking under the Mart, out of reach: no Mart while it's out (the button hides then too).
  if (isVisited()) return `A wild ${wild?.mon.name ?? 'Pokémon'} is out: catch it or let it go first.`
  return null
}

// `/pokemon mart`: the Mart opens in the band, when there is one.
function openMartCommand($: EngineInterface): string {
  const refusal = martRefusal()
  if (refusal) return refusal
  openMart($)
  // Claude Code gives the band the keys only on a click: `$.ui.focus` is refused for a site the person hasn't focused.
  return 'The PokéMart is open above the prompt. Click it to use the keys: ↑ ↓ choose, ← → change tabs, - + set how many, Enter buys, x closes.'
}

// The band's look besides the party: time and place, the visitor as a throw shows it, and the ball.
const lookNow = (): Look => ({
  phase: phaseNow(),
  landscape: landscapeNow(),
  wild: (wild && (pitch ? wildLook(pitch, wild.left) : wild.left)) ?? undefined,
  evolveFrom: evolveFrom ?? undefined,
  ...(pitch ? { overlays: ballOverlays(pitch) } : {}),
})

async function tick($: EngineInterface) {
  if (!band || !fitted || save.isOff) return
  tickNo++
  if (--wildDue <= 0 && !status.wild && !isAsleep(status)) {
    wildDue = between(...WILD_EVERY)
    background($, spawnWild($))
  }
  status = step(
    status,
    band.columns,
    fitted.lefts.map(l => l.width),
    wild?.left.width ?? 0,
  )
  if (pitch) {
    const { pitch: next, event } = stepThrow(pitch)
    pitch = next
    if (event) afterThrow($, event)
  }
  if (!status.wild) wild = null
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
  // The button's landscape moves on once a second, drawn again when a cloud, star or glint behind it changed.
  const isButtonShown = band.total > band.columns && !isButtonHidden && !isAiming && !isHidden
  if (isButtonShown && status.t % BUTTON_EVERY === 0 && JSON.stringify(buttonLines()) !== buttonDrawn)
    $.ui.invalidate('ui.render')
  if (!pitch && isCalm(status) && tickNo % CALM_EVERY !== 0) return
  if (isHidden && tickNo % RETRY_TICKS !== 0) return
  // Aiming, frames are only made on redraw ticks: each one rewrites the map clicks are judged on.
  if (isAiming && tickNo % AIM_EVERY !== 0) return
  const { cells } = toCells(frame(status, fitted.lefts, band.columns, band.rows, lookNow(), band.total))
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
    columns: band.columns,
    rows: band.rows,
  })
  isHidden = Boolean(res.deny)
  lastCells = isHidden ? '' : cells
}

// Plays one animation on demand, for trying them out.
async function play($: EngineInterface, args: string): Promise<string> {
  const name = args.trim().toLowerCase()
  const later = (ms: number, fn: () => void) => $.clock.after(ms, fn)
  feel('activity')
  const words = name.split(/\s+/)
  const phase = PHASES.find(p => words.includes(p))
  const landscape = LANDSCAPES.find(l => words.includes(l))
  if (phase || landscape) {
    shown = { phase, landscape, until: tickNo + ticks(15_000) }
    return `Showing ${[phase, landscape].filter(Boolean).join(' ')} for 15 seconds.`
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
  } else if (name === 'evolve') return evolveMember($, 0, true)
  else if (words[0] === 'wild') {
    const said = await spawnWild($, words.slice(1).join(' '))
    if (said) return said
    return wild ? `A wild ${wild.mon.name} wanders by.` : 'No wild Pokémon showed up.'
  } else return `Try one of: ${[...ANIMATIONS, ...PHASES, ...LANDSCAPES].join(', ')}.`
  return `Playing ${name}.`
}

async function pokemon($: EngineInterface, args: string): Promise<string> {
  const [head = '', ...rest] = args.trim().split(/\s+/)
  const tail = rest.join(' ')
  switch (head.toLowerCase()) {
    case 'party':
      await sync($)
      return formatParty(view())
    case 'box':
      await sync($)
      return formatBox(view())
    case 'add':
      return addMember($, tail)
    case 'deposit':
      return depositMember($, tail)
    case 'remove':
    case 'release':
      return removeMember($, tail)
    case 'size':
      return setSize($, tail.toLowerCase())
    case 'everstone':
      return toggleEverstone($, tail)
    case 'bag':
      await sync($)
      return formatBag(save, cash)
    case 'give':
      return giveItem($, tail)
    case 'take':
      return takeItem($, tail)
    case 'mart':
      return openMartCommand($)
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

// The local UTC offset in minutes. The plugin's clock normally knows it; when it claims UTC, the host is
// asked (`date` on macOS and Linux, PowerShell on Windows), since that may just mean it couldn't tell.
async function readTimeZone($: EngineInterface): Promise<number> {
  const own = -new Date().getTimezoneOffset()
  if (own !== 0) return own
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

// Commands wait for start-up, but no longer than this: a stalled download never holds them up.
const START_WAIT_MS = 5000
const settled = ($: EngineInterface) => Promise.race([started, $.clock.sleep(START_WAIT_MS)])

// After the save: the time zone, the party's sprites (or a first Pokémon), then any evolution due.
async function start($: EngineInterface) {
  tzOffsetMin = await readTimeZone($)
  if (save.party.length) await refreshParty($)
  else if (!save.isOff) await setLead($, '')
  await learnEvolutions($)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'pokemon',
      description:
        'Your Pokémon: /pokemon <name> picks a lead · add/remove [name] · deposit <name> · party · box · bag · give <item> <name> · take <name> · mart · size small|normal|auto · everstone · on/off',
    })
    await $.command.register({ name: 'pokedex', description: 'Every Pokémon you have seen, and your party' })
    await $.command.register({
      name: 'pokemon-play',
      description: `Play an animation, or show a time of day and landscape (e.g. dusk lake): ${[...ANIMATIONS, ...PHASES, ...LANDSCAPES].join(', ')}`,
    })
    ready = load($)
    started = ready
      .then(() => start($))
      .catch(err => report($, err))
      .catch(() => {
        // Nowhere left to report it: the session is closing.
      })
    background($, $.ui.close({ id: 'pokemon' }))
    $.clock.every(TICK_MS, () => background($, tick($)))
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

  on('command.run', { command: 'pokemon-play' }, async ($, e) => {
    try {
      await ready
      await settled($)
      return { text: await play($, e.args) }
    } catch (err) {
      return { text: `Couldn't reach the Pokémon: ${err instanceof Error ? err.message : String(err)}` }
    }
  })

  on('command.run', { command: 'pokedex' }, async $ => {
    try {
      await ready
      await settled($)
      await sync($)
      await loadSpecies($)
      return {
        text: `${formatDex(
          save,
          (species ?? []).map(s => s.name),
        )}\n\n${formatParty(view())}`,
      }
    } catch (err) {
      return { text: `Couldn't open the Pokédex: ${err instanceof Error ? err.message : String(err)}` }
    }
  })

  on('command.run', { command: 'pokemon' }, async ($, e) => {
    feel('activity')
    try {
      await ready
      await settled($)
      return { text: await pokemon($, e.args) }
    } catch (err) {
      return { text: `Couldn't reach the Pokémon: ${err instanceof Error ? err.message : String(err)}` }
    }
  })

  on('prompt.submit', async ($, e, next) => {
    feel('activity')
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    feel('turn-start')
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
        | { status?: string; agentId?: string; stdout?: string; stderr?: string; backgroundTaskId?: string }
        | string
        | undefined
      const record = typeof result === 'object' ? result : undefined
      if (token && record?.status === 'async_launched' && record.agentId) agents.add(record.agentId)
      // Still running in the background: how it went isn't known yet.
      if (record?.backgroundTaskId) return ran
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
    if (click) throwAt(click)
    // A click on a button drawn before a visitor came opens nothing.
    if (e.element === 'shop' && (e.data as { open?: unknown } | null)?.open === true && !martRefusal()) openMart($)
    const posted = e.element === 'mart' && mart.isOpen ? (e.data as { act?: unknown } | null)?.act : undefined
    if (isAct(posted)) {
      const answer = await martAct($, posted)
      if (answer) return answer
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const mons = await read($, party)
    // Another surface drawing at the same time leaves the terminal's band alone.
    if (e.surface !== 'terminal') return next(e)
    if (!mons.length || save.isOff || e.props.hasSurvey) {
      band = null
      // Off, maybe from another session: the Mart doesn't come back with the party.
      if (save.isOff) mart = { ...mart, isOpen: false }
      return next(e)
    }
    const { Box, Client, Raster } = $.ui.resolve(e)
    // As wide as a Raster can be, less the button beside the scene (none on a band too narrow for both).
    const total = Math.min(512, e.props.bodyColumns)
    const button = total > 2 * BUTTON_COLUMNS ? BUTTON_COLUMNS : 0
    const columns = total - button
    const budget = spriteBudget(save.size, e.props.maxRows, Math.ceil(HEADROOM / 2))
    const keys = mons.map(m => m.key)
    if (!fitted || fitted.budget !== budget || keys.join() !== fitted.keys.join()) {
      const lefts = mons.map(m => fit(m, budget))
      status = {
        ...status,
        actors: carryActors(fitted?.keys ?? [], keys, status.actors, i =>
          newScene(Math.floor(Math.random() * Math.max(1, columns - (lefts[i]?.width ?? 0)))),
        ),
      }
      fitted = { budget, keys, lefts }
      if (wild) wild = { ...wild, left: fitWild(wild.mon) }
    }
    const rows = Math.ceil((Math.max(...fitted.lefts.map(l => l.height)) + 1 + HEADROOM) / 2)
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
    status = keepRustleAtEdge(status, columns)
    band = { requestId: e.requestId, columns, rows, total }
    isHidden = false
    isAiming = canAim()
    isButtonHidden = isVisited()
    // The Mart covers the band: no scene frame is made under it.
    if (mart.isOpen) {
      lastCells = ''
      return <Client key="mart" module="./mart.tsx" width={total} height={rows} props={martProps()} />
    }
    const img = frame(status, fitted.lefts, columns, rows, lookNow(), total)
    const { cells } = toCells(img)
    lastCells = cells
    if (isAiming)
      return <Client key="aim" module="./aim.tsx" width={columns} height={rows} props={{ lines: textRows(img) }} />
    const scene = <Raster key="scene" columns={columns} rows={rows} cells={cells} />
    // No button while a wild Pokémon is out, aimable or not: the Mart would hold up the catch.
    if (!button || isButtonHidden) return scene
    return (
      <Box flexDirection="row">
        {scene}
        <Client key="shop" module="./shop.tsx" width={button} height={rows} props={buttonProps()} />
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
}
