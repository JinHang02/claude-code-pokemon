// The test world: a fake engine, network and store around the plugin, with made-up PokeAPI data, for any test file.
import type { On } from 'claude-code'
import { expect, mock } from 'claude-code/testing'

import type { Stage } from '../hooks/evolution'
import type { Member, Save, Together } from '../hooks/save'

// A test that starts a session: its first in a file pays for the bundle and the session's start, and on a busy machine
// any of them can take seconds, past the default 5.
export const KIT = { timeoutMs: 30_000 }
export const ART = '\x1b[38;2;255;0;0m\x1b[48;2;0;0;255m▀\x1b[0m\x1b[38;2;0;255;0m▄\n\x1b[38;2;255;0;0m█\x1b[0m '
export const LIST = [
  { name: 'pikachu', forms: ['regular'] },
  { name: 'raichu', forms: ['regular'] },
  { name: 'eevee', forms: ['regular'] },
  { name: 'vaporeon', forms: ['regular'] },
  { name: 'mr-mime', forms: ['regular', 'galar'] },
  { name: 'charizard', forms: ['regular', 'mega-x'] },
  { name: 'charmander', forms: ['regular'] },
  { name: 'charmeleon', forms: ['regular'] },
  { name: 'combee', forms: ['regular'] },
  { name: 'vespiquen', forms: ['regular'] },
  { name: 'burmy', forms: ['regular', 'sandy'] },
  { name: 'wormadam', forms: ['regular', 'sandy'] },
  { name: 'mothim', forms: ['regular'] },
  { name: 'caterpie', forms: ['regular'] },
  { name: 'pichu', forms: ['regular'] },
  { name: 'espeon', forms: ['regular'] },
  { name: 'umbreon', forms: ['regular'] },
  { name: 'rockruff', forms: ['regular'] },
  { name: 'lycanroc', forms: ['regular', 'dusk', 'midnight'] },
  { name: 'pancham', forms: ['regular'] },
  { name: 'pangoro', forms: ['regular'] },
  { name: 'nincada', forms: ['regular'] },
  { name: 'ninjask', forms: ['regular'] },
  { name: 'shedinja', forms: ['regular'] },
  { name: 'duskull', forms: ['regular'] },
  { name: 'dusclops', forms: ['regular'] },
  { name: 'dusknoir', forms: ['regular'] },
  { name: 'mantyke', forms: ['regular'] },
  { name: 'mantine', forms: ['regular'] },
  { name: 'remoraid', forms: ['regular'] },
  { name: 'rattata', forms: ['regular', 'alola'] },
  { name: 'mewtwo', forms: ['regular'] },
]
export const fire = {
  species: { name: 'charmander' },
  evolves_to: [
    {
      species: { name: 'charmeleon' },
      evolution_details: [{ min_level: 16 }],
      evolves_to: [{ species: { name: 'charizard' }, evolution_details: [{ min_level: 36 }], evolves_to: [] }],
    },
  ],
}
// Made up for plumbing: here Pikachu evolves by level, so a second species can evolve beside Charmander.
export const electric = {
  species: { name: 'pikachu' },
  evolves_to: [{ species: { name: 'raichu' }, evolution_details: [{ min_level: 30 }], evolves_to: [] }],
}
export const bees = {
  species: { name: 'combee' },
  evolves_to: [{ species: { name: 'vespiquen' }, evolution_details: [{ min_level: 21, gender: 1 }], evolves_to: [] }],
}
export const cloaks = {
  species: { name: 'burmy' },
  evolves_to: [
    {
      species: { name: 'wormadam' },
      evolution_details: [
        {
          min_level: 20,
          gender: 1,
          required_pokemon_form: { name: 'burmy-plant' },
          evolved_pokemon_form: { name: 'wormadam-plant' },
        },
        {
          min_level: 20,
          gender: 1,
          required_pokemon_form: { name: 'burmy-sandy' },
          evolved_pokemon_form: { name: 'wormadam-sandy' },
        },
      ],
      evolves_to: [],
    },
    { species: { name: 'mothim' }, evolution_details: [{ min_level: 20, gender: 2 }], evolves_to: [] },
  ],
}
export const named = (name: string) => ({ name })
export const end = (species: string, details: object[]) => ({
  species: named(species),
  evolution_details: details,
  evolves_to: [],
})
export const babies = {
  species: named('pichu'),
  evolves_to: [end('pikachu', [{ trigger: named('level-up'), min_happiness: 220 }])],
}
export const fox = {
  species: named('eevee'),
  evolves_to: [
    end('vaporeon', [{ trigger: named('use-item'), item: named('water-stone') }]),
    end('espeon', [{ trigger: named('level-up'), min_happiness: 160, time_of_day: 'day' }]),
    end('umbreon', [{ trigger: named('level-up'), min_happiness: 160, time_of_day: 'night' }]),
  ],
}
export const dog = {
  species: named('rockruff'),
  evolves_to: [
    end('lycanroc', [
      { trigger: named('level-up'), min_level: 25, time_of_day: 'day', required_pokemon_form: named('rockruff') },
      { trigger: named('level-up'), min_level: 25, time_of_day: 'night', required_pokemon_form: named('rockruff') },
    ]),
  ],
}
export const panda = {
  species: named('pancham'),
  evolves_to: [end('pangoro', [{ trigger: named('level-up'), min_level: 32, party_type: named('dark') }])],
}
export const bug = {
  species: named('nincada'),
  evolves_to: [
    end('ninjask', [{ trigger: named('level-up'), min_level: 20 }]),
    end('shedinja', [{ trigger: named('shed') }]),
  ],
}
export const ghost = {
  species: named('duskull'),
  evolves_to: [
    {
      species: named('dusclops'),
      evolution_details: [{ trigger: named('level-up'), min_level: 37 }],
      evolves_to: [end('dusknoir', [{ trigger: named('trade'), held_item: named('reaper-cloth') }])],
    },
  ],
}
export const kite = {
  species: named('mantyke'),
  evolves_to: [end('mantine', [{ trigger: named('level-up'), party_species: named('remoraid') }])],
}
// Each species' gender ratio in eighths female, where a test fixes it: these always come out one way.
export const GENDER_RATES: Record<string, number> = { combee: 8, vespiquen: 8, burmy: 0, mothim: 0 }
// Capture rates PokeAPI answers, where a test fixes them. A species in the table goes by the table's rate instead.
export const CAPTURE_RATES: Record<string, number> = { caterpie: 255, mewtwo: 0 }
// Each species' types where a test needs one: Pancham evolves only with a Dark type in the party.
// By PokeAPI form name: Alolan Rattata is Dark, plain Rattata isn't.
export const TYPES: Record<string, string[]> = {
  umbreon: ['dark'],
  rattata: ['normal'],
  'rattata-alola': ['dark', 'normal'],
}
// Each species' evolution chain, as PokeAPI links it.
export const CHAINS: Record<string, unknown> = {
  charmander: fire,
  charmeleon: fire,
  charizard: fire,
  pikachu: electric,
  raichu: electric,
  pichu: babies,
  eevee: fox,
  vaporeon: fox,
  espeon: fox,
  umbreon: fox,
  rockruff: dog,
  lycanroc: dog,
  pancham: panda,
  pangoro: panda,
  nincada: bug,
  ninjask: bug,
  shedinja: bug,
  duskull: ghost,
  dusclops: ghost,
  dusknoir: ghost,
  mantyke: kite,
  mantine: kite,
  combee: bees,
  vespiquen: bees,
  burmy: cloaks,
  mothim: cloaks,
}
export const ok = (text: string) => ({ value: { status: 200, ok: true, headers: {}, text } })
let ids = 0
export const member = (species: string, extra: Partial<Member> = {}): Member => ({
  id: `m${++ids}`,
  species,
  form: 'regular',
  isShiny: false,
  xp: 0,
  evolutions: 0,
  ...extra,
})
export const lv = (species: string, level: number): Stage => ({ species, way: { kind: 'level', level } })
// The plugin's hour at clock 0 is its own UTC offset, or the +0800 the fake `date` answers when it claims UTC.
const offsetHours = (-new Date().getTimezoneOffset() || 480) / 60
// The clock time (from 0) at which the plugin's local hour is `hour`.
export const hourAt = (hour: number) => ((((hour - offsetHours) % 24) + 24) % 24) * 3_600_000

// What the fake network and store do: go offline, stall every download, serve another species list, refuse reads.
// `sprites`: art by sprite file, where a test gives one its own. `chains`, `genderRates`, `captureRates`, `types`:
// PokeAPI as a test wants it, over the made-up defaults. `now`: where the clock starts. `keys`: other store keys, as
// earlier sessions left them (`together`). `beforeSet`: told each key the plugin is about to store, before it lands.
export type Net = {
  isOnline: boolean
  list: string
  stall?: Promise<void>
  // Holds back the PokeAPI species entries alone (where catch rates come from).
  speciesStall?: Promise<void>
  // Holds back a sprite download, by its file, while it returns a promise.
  artStall?: (file: string) => Promise<void> | undefined
  isStoreBroken?: boolean
  cacheAgeMs?: number
  sprites?: Record<string, string>
  chains?: Record<string, unknown>
  genderRates?: Record<string, number>
  captureRates?: Record<string, number>
  types?: Record<string, string[]>
  now?: number
  keys?: Record<string, unknown>
  beforeSet?: (key: string) => void
  // Runs as a store key is read: another window's write landing just before this one reads.
  beforeGet?: (key: string) => void
  // Species PokeAPI answers 404 for: the sprite list ahead of it.
  missing?: string[]
}

// The engine around the plugin: a fake network, store, clock zone and UI calls; resolves the store and toasts.
export function world(
  on: On,
  saved?: Save,
  art = ART,
  files = new Map<string, string>(),
  net: Net = { isOnline: true, list: JSON.stringify(LIST) },
) {
  const clock = mock.clock(on, { now: net.now ?? 0 })
  // The band's state as the terminal reports it: a hidden band refuses frames.
  const band = { isHidden: false, frames: 0, refused: 0, cells: '', invalidated: 0 }
  on('ui.blit', async (_$, e) => {
    if (band.isHidden) {
      band.refused++
      return { value: { deny: 'not mounted' } }
    }
    band.frames++
    band.cells = (e as { cells?: string }).cells ?? ''
    return { value: {} }
  })
  on('env.get', async (_$, e) => ({ value: e.name === 'HOME' ? '/home/ash' : undefined }))
  on('fs.exists', async (_$, e) => ({ value: files.has(e.path) }))
  on('fs.stat', async () => ({
    value: { kind: 'file', size: 1, mtimeMs: Date.now() - (net.cacheAgeMs ?? 0), isLink: false },
  }))
  on('fs.read', async (_$, e) => ({ value: files.get(e.path) ?? '' }))
  on('fs.write', async (_$, e) => {
    files.set(e.path, e.text)
    return { value: undefined }
  })
  const store = new Map<string, unknown>([
    ...(saved ? [['save', saved] as const] : []),
    ...Object.entries(net.keys ?? {}),
  ])
  const toasts: string[] = []
  const fetched: string[] = []
  on('http.fetch', async (_$, e) => {
    fetched.push(e.url)
    if (net.stall) await net.stall
    if (!net.isOnline) throw new Error('getaddrinfo ENOTFOUND gitlab.com')
    if (e.url.endsWith('/pokemon.json')) return ok(net.list)
    const rates = net.genderRates ?? GENDER_RATES
    const captures = net.captureRates ?? CAPTURE_RATES
    const species = /pokemon-species\/([a-z0-9-]+)/.exec(e.url)?.[1]
    if (species && net.speciesStall) await net.speciesStall
    if (species && net.missing?.includes(species))
      return { value: { status: 404, ok: false, headers: {}, text: '{"detail":"Not found."}' } }
    if (species)
      return ok(
        JSON.stringify({
          evolution_chain: { url: `https://pokeapi.co/chain/${species}` },
          ...(species in rates ? { gender_rate: rates[species] } : {}),
          ...(species in captures ? { capture_rate: captures[species] } : {}),
        }),
      )
    const chain = /chain\/([a-z0-9-]+)/.exec(e.url)?.[1]
    if (chain)
      return ok(
        JSON.stringify({ chain: (net.chains ?? CHAINS)[chain] ?? { species: { name: chain }, evolves_to: [] } }),
      )
    const mon = /\/pokemon\/([a-z0-9-]+)$/.exec(e.url)?.[1]
    if (mon)
      return ok(JSON.stringify({ types: ((net.types ?? TYPES)[mon] ?? ['normal']).map(name => ({ type: { name } })) }))
    const file = /\/colorscripts\/small\/(?:regular|shiny)\/([a-z0-9-]+)$/.exec(e.url)?.[1]
    if (file) await net.artStall?.(file)
    return ok((file && net.sprites?.[file]) || art)
  })
  on('store.get', async (_$, e) => {
    net.beforeGet?.(e.key)
    if (net.isStoreBroken) throw new Error('store unreadable')
    return { value: store.get(e.key) }
  })
  on('store.set', async (_$, e) => {
    net.beforeSet?.(e.key)
    store.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined }
  })
  on('store.keys', async () => ({ value: [...store.keys()] }))
  on('store.delete', async (_$, e) => {
    store.delete(e.key)
    return { value: undefined }
  })
  on('process.run', async () => ({
    value: { exitCode: 0, stdout: '+0800\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('command.register', async (_$, e) => ({ value: { command: e.name } }))
  on('ui.close', async () => ({ value: undefined }))
  on('ui.toast', async (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.invalidate', async () => {
    band.invalidated++
    return { value: undefined }
  })
  on('ui.message', async () => ({}))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  const saveNow = () => store.get('save') as Save
  // The party as it stands: each member's saved XP plus every session ledger not yet folded into the save.
  const partyNow = () => {
    const save = saveNow()
    const ledgers = [...store].filter(([k]) => k.startsWith('xp:') && !save.folded?.includes(k))
    return save.party.map(m => ({
      ...m,
      xp: m.xp + ledgers.reduce((sum, [, l]) => sum + ((l as { xp: Record<string, number> }).xp[m.id] ?? 0), 0),
    }))
  }
  // Time together by member id, as stored under its own key.
  const togetherNow = () => (store.get('together') as Together | undefined)?.ms ?? {}
  return { saveNow, partyNow, togetherNow, toasts, fetched, files, clock, band, store, net }
}

// The world, then a session starting in it, as a person opening Claude Code.
export async function begin(
  $: { session: { start: (e: never) => Promise<unknown> } },
  on: On,
  saved?: Save,
  art = ART,
  files?: Map<string, string>,
  net?: Net,
) {
  const w = world(on, saved, art, files, net)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true } as never)
  return w
}

export const cmd = async (
  $: { command: { run: (e: never) => Promise<{ text?: string }> } },
  command: string,
  args = '',
) => (await $.command.run({ command, args } as never)).text ?? ''

export const bash = (command: string, isError = false) => ({
  tool: 'Bash',
  command,
  tool_use_id: `t-${Math.random()}`,
  isError,
})

// Waits, a command at a time, for background work (an evolution's fetches) to land.
export async function until($: Parameters<typeof cmd>[0], done: () => boolean) {
  for (let i = 0; i < 50 && !done(); i++) await cmd($, 'pokemon', 'party')
  expect(done()).toBe(true)
}

export function answerTools(on: On) {
  on('tool.call', async (_$, e) => {
    const failed = (e as unknown as { isError?: boolean }).isError
    return failed ? { isError: true, result: 'exit 1' } : { result: { stdout: '', stderr: '', interrupted: false } }
  })
}

export const mountBand = ($: { ui: { mount: (t: never) => Promise<unknown> } }) =>
  $.ui.mount({
    plugin: 'pokemon',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 30, bodyColumns: 80 },
  } as never)
