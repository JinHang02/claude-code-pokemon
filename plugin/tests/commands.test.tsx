import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { FRIENDSHIP_MS } from '../hooks/evolution'
import type { Stage } from '../hooks/evolution'
import type { Member, Save } from '../hooks/save'
import { emptySave, evolveLevel, level, xpForLevel } from '../hooks/save'
import { BALL, COLORS, DONE, pickFor, WORKING } from '../hooks/spinner'

const ART = '\x1b[38;2;255;0;0m\x1b[48;2;0;0;255m▀\x1b[0m\x1b[38;2;0;255;0m▄\n\x1b[38;2;255;0;0m█\x1b[0m '
const LIST = [
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
const fire = {
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
const electric = {
  species: { name: 'pikachu' },
  evolves_to: [{ species: { name: 'raichu' }, evolution_details: [{ min_level: 30 }], evolves_to: [] }],
}
const bees = {
  species: { name: 'combee' },
  evolves_to: [{ species: { name: 'vespiquen' }, evolution_details: [{ min_level: 21, gender: 1 }], evolves_to: [] }],
}
const cloaks = {
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
const named = (name: string) => ({ name })
const end = (species: string, details: object[]) => ({
  species: named(species),
  evolution_details: details,
  evolves_to: [],
})
const babies = {
  species: named('pichu'),
  evolves_to: [end('pikachu', [{ trigger: named('level-up'), min_happiness: 220 }])],
}
const fox = {
  species: named('eevee'),
  evolves_to: [
    end('vaporeon', [{ trigger: named('use-item'), item: named('water-stone') }]),
    end('espeon', [{ trigger: named('level-up'), min_happiness: 160, time_of_day: 'day' }]),
    end('umbreon', [{ trigger: named('level-up'), min_happiness: 160, time_of_day: 'night' }]),
  ],
}
const dog = {
  species: named('rockruff'),
  evolves_to: [
    end('lycanroc', [
      { trigger: named('level-up'), min_level: 25, time_of_day: 'day', required_pokemon_form: named('rockruff') },
      { trigger: named('level-up'), min_level: 25, time_of_day: 'night', required_pokemon_form: named('rockruff') },
    ]),
  ],
}
const panda = {
  species: named('pancham'),
  evolves_to: [end('pangoro', [{ trigger: named('level-up'), min_level: 32, party_type: named('dark') }])],
}
const bug = {
  species: named('nincada'),
  evolves_to: [
    end('ninjask', [{ trigger: named('level-up'), min_level: 20 }]),
    end('shedinja', [{ trigger: named('shed') }]),
  ],
}
const ghost = {
  species: named('duskull'),
  evolves_to: [
    {
      species: named('dusclops'),
      evolution_details: [{ trigger: named('level-up'), min_level: 37 }],
      evolves_to: [end('dusknoir', [{ trigger: named('trade'), held_item: named('reaper-cloth') }])],
    },
  ],
}
const kite = {
  species: named('mantyke'),
  evolves_to: [end('mantine', [{ trigger: named('level-up'), party_species: named('remoraid') }])],
}
// Each species' gender ratio in eighths female, where a test fixes it: these always come out one way.
const GENDER_RATES: Record<string, number> = { combee: 8, vespiquen: 8, burmy: 0, mothim: 0 }
// Capture rates where a test fixes them: Caterpie always caught, Mewtwo never.
const CAPTURE_RATES: Record<string, number> = { caterpie: 255, mewtwo: 0 }
// Each species' types where a test needs one: Pancham evolves only with a Dark type in the party.
// By PokeAPI form name: Alolan Rattata is Dark, plain Rattata isn't.
const TYPES: Record<string, string[]> = { umbreon: ['dark'], rattata: ['normal'], 'rattata-alola': ['dark', 'normal'] }
// Each species' evolution chain, as PokeAPI links it.
const CHAINS: Record<string, unknown> = {
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
const ok = (text: string) => ({ value: { status: 200, ok: true, headers: {}, text } })
let ids = 0
const member = (species: string, extra: Partial<Member> = {}): Member => ({
  id: `m${++ids}`,
  species,
  form: 'regular',
  isShiny: false,
  xp: 0,
  evolutions: 0,
  ...extra,
})
const lv = (species: string, level: number): Stage => ({ species, way: { kind: 'level', level } })
// The plugin's hour at clock 0 is its own UTC offset, or the +0800 the fake `date` answers when it claims UTC.
const offsetHours = (-new Date().getTimezoneOffset() || 480) / 60
// The clock time (from 0) at which the plugin's local hour is `hour`.
const hourAt = (hour: number) => ((((hour - offsetHours) % 24) + 24) % 24) * 3_600_000

// What the fake network and store do: go offline, stall every download, serve another species list, refuse reads.
// `sprites`: art by sprite file, where a test gives one its own.
type Net = {
  isOnline: boolean
  list: string
  stall?: Promise<void>
  // Holds back the PokeAPI species entries alone (where catch rates come from).
  speciesStall?: Promise<void>
  isStoreBroken?: boolean
  cacheAgeMs?: number
  sprites?: Record<string, string>
  // Where the fake clock starts.
  now?: number
}

// The engine around the plugin: a fake network, store, clock zone and UI calls; resolves the store and toasts.
function world(
  on: On,
  saved?: Save,
  art = ART,
  files = new Map<string, string>(),
  net: Net = { isOnline: true, list: JSON.stringify(LIST) },
) {
  const clock = mock.clock(on, net.now === undefined ? undefined : { now: net.now })
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
  const store = new Map<string, unknown>(saved ? [['save', saved]] : [])
  const toasts: string[] = []
  const fetched: string[] = []
  on('http.fetch', async (_$, e) => {
    fetched.push(e.url)
    if (net.stall) await net.stall
    if (!net.isOnline) throw new Error('getaddrinfo ENOTFOUND gitlab.com')
    if (e.url.endsWith('/pokemon.json')) return ok(net.list)
    const species = /pokemon-species\/([a-z-]+)/.exec(e.url)?.[1]
    if (species && net.speciesStall) await net.speciesStall
    if (species)
      return ok(
        JSON.stringify({
          evolution_chain: { url: `https://pokeapi.co/chain/${species}` },
          ...(species in GENDER_RATES ? { gender_rate: GENDER_RATES[species] } : {}),
          ...(species in CAPTURE_RATES ? { capture_rate: CAPTURE_RATES[species] } : {}),
        }),
      )
    const mon = /\/pokemon\/([a-z0-9-]+)$/.exec(e.url)?.[1]
    if (mon) return ok(JSON.stringify({ types: (TYPES[mon] ?? ['normal']).map(name => ({ type: { name } })) }))
    const chain = /chain\/([a-z-]+)/.exec(e.url)?.[1]
    if (chain) return ok(JSON.stringify({ chain: CHAINS[chain] ?? { species: { name: chain }, evolves_to: [] } }))
    const file = /\/colorscripts\/small\/(?:regular|shiny)\/([a-z0-9-]+)$/.exec(e.url)?.[1]
    return ok((file && net.sprites?.[file]) || art)
  })
  on('store.get', async (_$, e) => {
    if (net.isStoreBroken) throw new Error('store unreadable')
    return { value: store.get(e.key) }
  })
  on('store.set', async (_$, e) => {
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
  return { saveNow, partyNow, toasts, fetched, files, clock, band, store, net }
}

// The world, then a session starting in it, as a person opening Claude Code.
async function begin(
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

const cmd = async ($: { command: { run: (e: never) => Promise<{ text?: string }> } }, command: string, args = '') =>
  (await $.command.run({ command, args } as never)).text ?? ''

const bash = (command: string, isError = false) => ({
  tool: 'Bash',
  command,
  tool_use_id: `t-${Math.random()}`,
  isError,
})

// Waits, a command at a time, for background work (an evolution's fetches) to land.
async function until($: Parameters<typeof cmd>[0], done: () => boolean) {
  for (let i = 0; i < 50 && !done(); i++) await cmd($, 'pokemon', 'party')
  expect(done()).toBe(true)
}

function answerTools(on: On) {
  on('tool.call', async (_$, e) => {
    const failed = (e as unknown as { isError?: boolean }).isError
    return failed ? { isError: true, result: 'exit 1' } : { result: { stdout: '', stderr: '', interrupted: false } }
  })
}

test('a first session gets a random lead, saved for next time', async ($, on) => {
  const w = await begin($, on)
  expect(await cmd($, 'pokemon', 'party')).toContain('Your party:\n  Lead ')
  expect(w.saveNow().party.length).toBe(1)
  expect(Object.keys(w.saveNow().dex).length).toBe(1)
})

test('a saved party comes back next session, levels intact', async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('eevee', { xp: xpForLevel(5) })] })
  expect(await cmd($, 'pokemon', 'party')).toContain('Lead  Eevee  Lv 5')
  expect(w.saveNow().party[0]?.species).toBe('eevee')
})

test('party: add up to three, no duplicates, remove any but the last', async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu')] })
  expect(await cmd($, 'pokemon', 'add eevee')).toContain('Eevee joined your party!')
  expect(await cmd($, 'pokemon', 'add eevee')).toBe('Eevee is already in your party.')
  expect(await cmd($, 'pokemon', 'add galarian mr mime')).toContain('Mr Mime (Galar) joined your party!')
  expect(await cmd($, 'pokemon', 'add raichu')).toContain('Your party is full (3)')
  expect(w.saveNow().party.map(m => m.species)).toEqual(['pikachu', 'eevee', 'mr-mime'])
  expect(await cmd($, 'pokemon', 'remove eevee')).toBe('Eevee went back to the wild.')
  expect(await cmd($, 'pokemon', 'release mr mime')).toBe('Mr Mime (Galar) went back to the wild.')
  expect(await cmd($, 'pokemon', 'remove pikachu')).toContain('would leave your party empty')
  expect(await cmd($, 'pokemon', 'remove vaporeon')).toContain('No vaporeon in your party')
  expect(w.saveNow().party.map(m => m.species)).toEqual(['pikachu'])
})

test('naming a party member makes it lead with its level; a new name replaces the lead and says so', async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu', { xp: 40 }), member('eevee', { xp: 100 })] })
  expect(await cmd($, 'pokemon', 'eevee')).toBe('Eevee leads the party again (Lv 6).')
  expect(w.saveNow().party.map(m => m.species)).toEqual(['eevee', 'pikachu'])
  const text = await cmd($, 'pokemon', 'charizard')
  expect(text).toContain("It's your new lead.")
  expect(text).toContain('Eevee (Lv 6) went back to the wild.')
  expect(w.saveNow().party.map(m => m.species)).toEqual(['charizard', 'pikachu'])
  expect(await cmd($, 'pokemon', 'agumon')).toBe('No Pokémon called "agumon".')
})

test('passing tests and commits earn xp; a lone failed grep does nothing', async ($, on) => {
  answerTools(on)
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu'), member('eevee')] })
  await cmd($, 'pokemon', 'party')
  await $.tool.call(bash('pytest -q') as never)
  await $.tool.call(bash('git commit -m "x"') as never)
  await $.tool.call(bash('grep -rn nothing .', true) as never)
  await $.tool.call(bash('pytest -q', true) as never)
  await cmd($, 'pokemon', 'party')
  expect(w.partyNow().map(m => m.xp)).toEqual([15, 15])
})

test('Charmander evolves at Lv 16, as in the games: saved, seen, announced, and Charmeleon learns its own level', async ($, on) => {
  answerTools(on)
  const w = await begin($, on, { ...emptySave(), party: [member('charmander', { xp: xpForLevel(16) - 5 })] })
  await until($, () => evolveLevel(w.saveNow().party[0]) === 16)
  await $.tool.call(bash('git commit -m "ship it"') as never)
  await until($, () => evolveLevel(w.saveNow().party[0]) === 36 && w.toasts.length > 0)
  expect(w.saveNow().party[0]).toMatchObject({ species: 'charmeleon', evolutions: 1, next: [lv('charizard', 36)] })
  expect(w.saveNow().dex.charmeleon?.seen).toBe(1)
  expect(w.toasts).toEqual(['What? Charmander evolved into Charmeleon!'])
  expect(await cmd($, 'pokemon', 'party')).toMatch(/Charmeleon +Lv 16 /)
})

test('a final stage is marked done; an everstone stops evolution', async ($, on) => {
  answerTools(on)
  const w = await begin($, on, {
    ...emptySave(),
    party: [
      member('charizard', { xp: xpForLevel(40) }),
      member('pikachu', { xp: xpForLevel(30) - 5, next: [lv('raichu', 30)] }),
    ],
  })
  expect(await cmd($, 'pokemon', 'everstone pikachu')).toBe("Pikachu holds an everstone: it won't evolve.")
  await until($, () => w.saveNow().party[0]?.next?.length === 0)
  await $.tool.call(bash('git commit -m x') as never)
  await cmd($, 'pokemon', 'party')
  expect(w.saveNow().party.map(m => m.species)).toEqual(['charizard', 'pikachu'])
  expect(await cmd($, 'pokemon', 'party')).toMatch(/Charizard +Lv 40 /)
  expect(await cmd($, 'pokemon', 'party')).toContain('final form')
  expect(w.toasts).toEqual([])
  expect(await cmd($, 'pokemon', 'everstone pikachu')).toBe('Pikachu dropped its everstone and can evolve again.')
})

test('an everstone given while an evolution downloads stops it, and the everstone stays', async ($, on) => {
  answerTools(on)
  const w = await begin($, on, {
    ...emptySave(),
    party: [member('charmander', { xp: xpForLevel(16) - 5, next: [lv('charmeleon', 16)] })],
  })
  await cmd($, 'pokemon', 'party')
  let open = () => {}
  w.net.stall = new Promise<void>(resolve => (open = resolve))
  const commit = $.tool.call(bash('git commit -m x') as never)
  await w.clock.advance(50)
  expect(await cmd($, 'pokemon', 'everstone charmander')).toBe("Charmander holds an everstone: it won't evolve.")
  w.net.stall = undefined
  open()
  await commit
  await cmd($, 'pokemon', 'party')
  expect(w.saveNow().party[0]).toMatchObject({ species: 'charmander', heldItem: 'everstone' })
  expect(w.toasts).toEqual([])
})

test('/pokemon-play evolve previews without saving; wild visitors land in the Pokédex', async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu')] })
  expect(await cmd($, 'pokemon-play', 'evolve')).toBe(
    'Previewing Pikachu evolving into Raichu; it changes back in a few seconds.',
  )
  expect(w.saveNow().party[0]?.species).toBe('pikachu')
  await $.ui.mount({
    plugin: 'pokemon',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 30, bodyColumns: 80 } as never,
  })
  expect(await cmd($, 'pokemon-play', 'wild')).toMatch(/^A wild .+ wanders by\.$/)
  expect(w.toasts.some(t => /^(✨ )?A wild .+ appeared!$/.test(t))).toBe(true)
  expect(await cmd($, 'pokemon-play', 'night')).toBe('Showing night for 15 seconds.')
  expect(await cmd($, 'pokemon-play', 'dusk lake')).toBe('Showing dusk lake for 15 seconds.')
  expect(await cmd($, 'pokemon-play', 'mountains')).toBe('Showing mountains for 15 seconds.')
  expect(await cmd($, 'pokemon-play', 'dance')).toContain('Try one of: hop, cheer, faint')
})

test('/pokedex shows sightings and the party', async ($, on) => {
  await begin($, on, { ...emptySave(), party: [member('pikachu')] })
  await cmd($, 'pokemon', 'add eevee')
  await cmd($, 'pokemon', 'add shiny vaporeon')
  const dex = await cmd($, 'pokedex')
  // Eevee may be a lucky shiny (1 in 32); the asked-for Vaporeon always is.
  expect(dex).toMatch(new RegExp(`Pokédex: 2 / ${LIST.length} seen · 0 caught · [12] shiny`))
  expect(dex).toMatch(/Shinies: (Eevee, )?Vaporeon/)
  expect(dex).toMatch(/Lead {2}Pikachu +Lv 1 /)
})

test('the band draws the party, and size small makes it shorter', async ($, on) => {
  const tall = Array.from({ length: 12 }, () => `\x1b[38;2;9;9;9m\x1b[48;2;9;9;9m▀\x1b[0m`.repeat(12)).join('\n')
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu'), member('eevee')] }, tall)
  await cmd($, 'pokemon', 'party')
  const mount = async () =>
    JSON.stringify(
      await (
        await $.ui.mount({
          plugin: 'pokemon',
          surface: 'terminal',
          component: 'AbovePrompt',
          props: { hasSurvey: false, isWorking: false, maxRows: 30, bodyColumns: 80 } as never,
        })
      ).drawn(),
    )
  const normal = await mount()
  expect(normal).toContain('"columns":80')
  const rows = (drawn: string) => Number(/"rows":(\d+)/.exec(drawn)?.[1])
  expect(await cmd($, 'pokemon', 'size small')).toBe('Pokémon size: small.')
  expect(w.saveNow().size).toBe('small')
  expect(rows(await mount())).toBeLessThan(rows(normal))
  expect(await cmd($, 'pokemon', 'size huge')).toContain('Sizes: small, normal, auto')
})

test('downloads land in ~/.cache and the next session reads them back instead', async ($, on) => {
  const files = new Map<string, string>()
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu')] }, ART, files)
  await cmd($, 'pokemon', 'add eevee')
  await until($, () => w.saveNow().party.every(m => m.next !== undefined))
  const dir = '/home/ash/.cache/claude-code-pokemon/'
  const cached = [...files.keys()].map(f => f.replace(dir, ''))
  expect(cached).toContain('pokemon.json')
  expect(cached).toContain('sprites/regular/pikachu')
  expect(cached).toContain('pokeapi/species-pikachu.json')
  expect(cached).toContain('pokeapi/chain-pikachu.json')
  expect(cached.some(f => /^sprites\/(regular|shiny)\/eevee$/.test(f))).toBe(true)
  expect(w.fetched.length).toBe(files.size)
})

test('a warm cache means no downloads at all', async ($, on) => {
  const dir = '/home/ash/.cache/claude-code-pokemon'
  const files = new Map([
    [`${dir}/pokemon.json`, JSON.stringify(LIST)],
    [`${dir}/sprites/regular/pikachu`, ART],
  ])
  // Its evolution level and gender already known, so there's nothing to look up either.
  const party = [member('pikachu', { next: [lv('raichu', 30)], gender: 'male' })]
  const w = await begin($, on, { ...emptySave(), party }, ART, files)
  expect(await cmd($, 'pokedex')).toContain(`/ ${LIST.length} seen`)
  expect(w.fetched).toEqual([])
})

test('hiding the band and showing it again: the meadow comes back to life without sending anything', async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu')] })
  await cmd($, 'pokemon', 'party')
  await $.ui.mount({
    plugin: 'pokemon',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 30, bodyColumns: 80 } as never,
  })
  // All of it inside the 6 seconds of `work`, when the party is busiest.
  await $.command.run({ command: 'pokemon-play', args: 'work' } as never)
  await w.clock.advance(1500)
  expect(w.band.frames).toBeGreaterThan(3)

  w.band.isHidden = true
  await w.clock.advance(2000)
  const refusedWhileHidden = w.band.refused
  expect(refusedWhileHidden).toBeGreaterThan(0)
  // Offered about once a second while hidden, not twenty times.
  expect(refusedWhileHidden).toBeLessThanOrEqual(3)

  w.band.isHidden = false
  const before = w.band.frames
  await w.clock.advance(2000)
  // Lively again: far more than the once-a-second offers while hidden, though calm moments send fewer.
  expect(w.band.frames - before).toBeGreaterThan(5)
})

const mountBand = ($: { ui: { mount: (t: never) => Promise<unknown> } }) =>
  $.ui.mount({
    plugin: 'pokemon',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 30, bodyColumns: 80 },
  } as never)

test('two sessions side by side: xp from both adds up and neither overwrites the other', async ($, on) => {
  answerTools(on)
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu', { next: [lv('raichu', 30)] })] })
  await cmd($, 'pokemon', 'party')
  // Meanwhile another Claude Code session earns xp and meets a Mew.
  const other = w.saveNow()
  w.store.set('save', {
    ...other,
    party: [{ ...other.party[0], xp: 50 }],
    dex: { ...other.dex, mew: { seen: 1, shiny: 0, first: 1 } },
  })
  await $.tool.call(bash('pytest -q') as never)
  await until($, () => w.partyNow()[0]?.xp === 55)
  expect(w.saveNow().dex.mew?.seen).toBe(1)
})

test("another session's changes show up here within seconds, without typing anything", async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu', { next: [lv('raichu', 30)] })] })
  await cmd($, 'pokemon', 'party')
  await mountBand($)
  await w.clock.advance(2000)
  expect(w.band.frames).toBeGreaterThan(0)
  w.store.set('save', { ...w.saveNow(), isOff: true })
  await w.clock.advance(11_000)
  const frames = w.band.frames
  await w.clock.advance(2000)
  expect(w.band.frames).toBe(frames)
})

test('/pokemon off puts them in their Poké Balls: nothing drawn, no xp; /pokemon on brings them back', async ($, on) => {
  answerTools(on)
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu', { next: [lv('raichu', 30)] })] })
  await cmd($, 'pokemon', 'party')
  await mountBand($)
  await $.command.run({ command: 'pokemon-play', args: 'work' } as never)
  await w.clock.advance(1000)
  expect(await cmd($, 'pokemon', 'off')).toBe(
    'Your Pokémon are resting in their Poké Balls. /pokemon on brings them back.',
  )
  expect(w.saveNow().isOff).toBe(true)
  expect(await cmd($, 'pokemon', 'off')).toBe('Your Pokémon are already resting.')
  const frames = w.band.frames
  await w.clock.advance(2000)
  expect(w.band.frames).toBe(frames)
  await $.tool.call(bash('pytest -q') as never)
  await cmd($, 'pokemon', 'party')
  expect(w.partyNow()[0]?.xp).toBe(0)
  expect(await cmd($, 'pokemon', 'on')).toBe('Your Pokémon are back in the meadow!')
  expect(w.saveNow().isOff).toBeUndefined()
  await $.command.run({ command: 'pokemon-play', args: 'work' } as never)
  await w.clock.advance(2000)
  expect(w.band.frames).toBeGreaterThan(frames + 10)
  expect(await cmd($, 'pokemon', 'on')).toBe('Your Pokémon are already out.')
})

test('a bare add catches a random Pokémon; a bare remove releases a random member, never the lead', async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu', { next: [lv('raichu', 30)] })] })
  expect(await cmd($, 'pokemon', 'remove')).toContain('would leave your party empty')
  expect(await cmd($, 'pokemon', 'add')).toMatch(/joined your party!$|is already in your party\.$/)
  await cmd($, 'pokemon', 'add eevee')
  const before = w.saveNow().party.length
  expect(before).toBeGreaterThanOrEqual(2)
  expect(await cmd($, 'pokemon', 'remove')).toMatch(/went back to the wild\.$/)
  expect(w.saveNow().party.length).toBe(before - 1)
  expect(w.saveNow().party[0]?.species).toBe('pikachu')
})

test('only an exact spelling catches a Pokémon; anything close gets a suggestion and changes nothing', async ($, on) => {
  const w = await begin($, on, {
    ...emptySave(),
    party: [member('pikachu', { next: [lv('raichu', 30)] }), member('charmander')],
  })
  expect(await cmd($, 'pokemon', 'charized')).toBe('Did you mean Charizard? Run /pokemon charizard')
  expect(await cmd($, 'pokemon', 'pika')).toBe('Did you mean Pikachu? Run /pokemon pikachu')
  expect(await cmd($, 'pokemon', 'shiny charizard mega')).toBe(
    'Did you mean Charizard (Mega X)? Run /pokemon shiny charizard mega x',
  )
  expect(await cmd($, 'pokemon', 'add eeve')).toBe('Did you mean Eevee? Run /pokemon add eevee')
  expect(await cmd($, 'pokemon', 'remove charm')).toBe('Did you mean Charmander? Run /pokemon remove charmander')
  expect(await cmd($, 'pokemon', 'everstone pika')).toBe('Did you mean Pikachu? Run /pokemon everstone pikachu')
  expect(w.saveNow().party.map(m => m.species)).toEqual(['pikachu', 'charmander'])
  expect(w.saveNow().party.some(m => m.heldItem)).toBe(false)
  expect(await cmd($, 'pokemon', 'charizard mega x')).toContain('Charizard (Mega X) appeared!')
})

// The colors on screen in a frame the band was sent: every cell's foreground and background.
const colorsIn = (cells: string) => {
  const words = new Uint32Array(Uint8Array.from(atob(cells), c => c.charCodeAt(0)).buffer)
  const colors = new Set<number>()
  for (let i = 0; i < words.length; i += 3) {
    colors.add(words[i + 1] ?? 0)
    colors.add(words[i + 2] ?? 0)
  }
  return colors
}

const CYAN = 0x00ffff
const BALL_RED = 0xe3350d
const solid = (rgb: string, size: number) =>
  Array.from({ length: size }, () => `\x1b[38;2;${rgb}m\x1b[48;2;${rgb}m▀\x1b[0m`.repeat(size)).join('\n')
const TALL = solid('9;9;9', 12)
// A wild visitor easy to find in the band: a solid cyan block.
const BLOCK = solid('0;255;255', 8)
const throwNet = (): Net => ({
  isOnline: true,
  list: JSON.stringify(LIST),
  sprites: { caterpie: BLOCK, mewtwo: BLOCK },
})
type Aim = {
  pointer: (e: { type: 'down'; x: number; y: number; button: 'left'; fine?: { x: number; y: number } }) => Promise<void>
  drawn: () => Promise<unknown>
  redraw: () => Promise<void>
}
type Line = [string, string, string][]
// The band's text lines while the click layer draws it (null when it's pixel art), drawn afresh as the engine
// does after the plugin invalidates it.
async function aimLines(aim: Aim): Promise<Line[] | null> {
  await aim.redraw()
  const find = (node: unknown): Line[] | null => {
    if (typeof node !== 'object' || node === null) return null
    const n = node as { type?: string; props?: { key?: string; props?: { lines?: Line[] } } }
    if (n.type === 'Client' && n.props?.key === 'aim') return n.props.props?.lines ?? null
    for (const child of Object.values(node)) {
      const found = find(child)
      if (found) return found
    }
    return null
  }
  return find(await aim.drawn())
}
const isAiming = async (aim: Aim) => (await aimLines(aim)) !== null
// The first cell the text band draws as a bare `hex` background, in the cells the click layer counts.
function cellIn(lines: Line[] | null, hex: string) {
  for (const [y, runs] of (lines ?? []).entries()) {
    let x = 0
    for (const [text, , bg] of runs) {
      if (text.startsWith(' ') && bg === hex) return { x, y }
      x += text.length
    }
  }
  return null
}
// Moves the clock on until the text band shows a bare `hex` cell.
async function seenIn(w: { clock: { advance: (ms: number) => Promise<unknown> } }, aim: Aim, hex: string) {
  for (let i = 0; i < 200; i++) {
    const cell = cellIn(await aimLines(aim), hex)
    if (cell) return cell
    await w.clock.advance(50)
  }
  throw new Error('never showed up')
}
// The first band cell whose two pixels are both `color`, in the cells the click layer counts.
function cellOf(cells: string, columns: number, color: number) {
  const words = new Uint32Array(Uint8Array.from(atob(cells), c => c.charCodeAt(0)).buffer)
  for (let i = 0; i < words.length / 3; i++)
    if (words[i * 3] === 0x20 && words[i * 3 + 2] === color) return { x: i % columns, y: Math.floor(i / columns) }
  return null
}
// Moves the clock on until `find` finds something.
async function seen<T>(w: { clock: { advance: (ms: number) => Promise<unknown> } }, find: () => T | null) {
  for (let i = 0; i < 200; i++) {
    const found = find()
    if (found) return found
    await w.clock.advance(50)
  }
  throw new Error('never showed up')
}
// A party of one in daylight with the band up and `name` stepped out of the grass.
async function visited($: Parameters<typeof begin>[0] & Parameters<typeof cmd>[0], on: On, name: string) {
  const w = await begin(
    $,
    on,
    { ...emptySave(), party: [member('pikachu', { next: [lv('raichu', 30)] })] },
    TALL,
    undefined,
    throwNet(),
  )
  await cmd($, 'pokemon', 'party')
  const aim = (await mountBand($ as never)) as Aim
  await cmd($, 'pokemon-play', 'day')
  expect(await cmd($, 'pokemon-play', `wild ${name}`)).toMatch(/^A wild .+ wanders by\.$/)
  const cell = await seenIn(w, aim, '#00ffff')
  return { w, aim, cell }
}

test('while aiming, every step a wild Pokémon takes is drawn: clicks are judged on the picture shown', async ($, on) => {
  const { w, aim } = await visited($, on, 'caterpie')
  // The engine redraws the click layer only when the plugin asks.
  let lines = await aimLines(aim)
  const edges = (l: Line[] | null) => {
    const xs: number[] = []
    for (const runs of l ?? []) {
      let x = 0
      for (const [text, , bg] of runs) {
        for (let i = 0; i < text.length; i++) if (bg === '#00ffff' && text[i] === ' ') xs.push(x + i)
        x += text.length
      }
    }
    return xs.length ? ([Math.min(...xs), Math.max(...xs)] as const) : null
  }
  let jump = 0
  for (let i = 0; i < 300; i++) {
    const asked = w.band.invalidated
    await w.clock.advance(50)
    if (w.band.invalidated === asked) continue
    const before = edges(lines)
    lines = await aimLines(aim)
    const after = edges(lines)
    if (before && after) jump = Math.max(jump, Math.min(Math.abs(after[0] - before[0]), Math.abs(after[1] - before[1])))
  }
  expect(jump).toBeLessThanOrEqual(1)
})

test('a wild Pokémon can be aimed at only once its catch rate is known, so a sure catch stays sure', async ($, on) => {
  const net = throwNet()
  const w = await begin(
    $,
    on,
    { ...emptySave(), party: [member('pikachu', { next: [lv('raichu', 30)] })] },
    TALL,
    undefined,
    net,
  )
  await cmd($, 'pokemon', 'party')
  const aim = (await mountBand($ as never)) as Aim
  await cmd($, 'pokemon-play', 'day')
  let open = () => {}
  net.speciesStall = new Promise<void>(resolve => (open = resolve))
  await cmd($, 'pokemon-play', 'wild caterpie')
  for (let i = 0; i < 80; i++) {
    await w.clock.advance(50)
    expect(await isAiming(aim)).toBe(false)
  }
  net.speciesStall = undefined
  open()
  const cell = await seenIn(w, aim, '#00ffff')
  await aim.pointer({ type: 'down', ...cell, button: 'left' })
  await seen(w, () => w.toasts.find(t => t.startsWith('Gotcha')) ?? null)
})

test('a Poké Ball thrown at a sure catch: it joins the party with ◓, and the Pokédex counts it', async ($, on) => {
  const { w, aim, cell } = await visited($, on, 'caterpie')
  await aim.pointer({ type: 'down', ...cell, button: 'left' })
  await seen(w, () => w.toasts.find(t => t.startsWith('Gotcha')) ?? null)
  expect(w.toasts.some(t => /^Gotcha! (✨ )?Caterpie was caught! It joined your party\.$/.test(t))).toBe(true)
  expect(w.saveNow().party.map(m => m.species)).toEqual(['pikachu', 'caterpie'])
  expect(w.saveNow().party[1]).toMatchObject({ isCaught: true, xp: 0 })
  expect(w.saveNow().dex.caterpie?.caught).toBe(1)
  expect(await cmd($, 'pokemon', 'party')).toMatch(/Caterpie ◓/)
  expect(await cmd($, 'pokedex')).toMatch(/seen · 1 caught ·/)
})

test('a ball thrown at the sky above it misses: it flies, lands, blinks out, and nothing is caught', async ($, on) => {
  const { w, aim, cell } = await visited($, on, 'caterpie')
  await aim.pointer({ type: 'down', x: cell.x, y: 0, button: 'left' })
  let flew = false
  for (let i = 0; i < 40; i++) {
    await w.clock.advance(50)
    if (colorsIn(w.band.cells).has(BALL_RED)) flew = true
  }
  expect(flew).toBe(true)
  expect(JSON.stringify(await aimLines(aim))).not.toContain('#e3350d')
  expect(w.toasts.some(t => t.startsWith('Gotcha'))).toBe(false)
  expect(w.saveNow().party.map(m => m.species)).toEqual(['pikachu'])
})

test('one that can never be caught breaks free: hidden in the ball, then back out', async ($, on) => {
  const { w, aim, cell } = await visited($, on, 'mewtwo')
  await aim.pointer({ type: 'down', ...cell, button: 'left' })
  let hidden = false
  let back = false
  for (let i = 0; i < 60; i++) {
    await w.clock.advance(50)
    const isShown = cellOf(w.band.cells, 80, CYAN) !== null
    if (!isShown) hidden = true
    if (hidden && isShown) back = true
  }
  expect([hidden, back]).toEqual([true, true])
  expect(w.saveNow().dex.mewtwo?.caught).toBeUndefined()
})

test('the click layer is there only while a wild Pokémon can be aimed at; a second click mid-throw does nothing', async ($, on) => {
  const w = await begin(
    $,
    on,
    { ...emptySave(), party: [member('pikachu', { next: [lv('raichu', 30)] })] },
    TALL,
    undefined,
    throwNet(),
  )
  await cmd($, 'pokemon', 'party')
  const aim = (await mountBand($ as never)) as Aim
  await cmd($, 'pokemon-play', 'day')
  expect(await isAiming(aim)).toBe(false)
  await cmd($, 'pokemon-play', 'wild caterpie')
  await w.clock.advance(500)
  expect(await isAiming(aim)).toBe(false)
  const cell = await seenIn(w, aim, '#00ffff')
  await aim.pointer({ type: 'down', ...cell, button: 'left' })
  await aim.pointer({ type: 'down', ...cell, button: 'left' })
  await seen(w, () => w.toasts.find(t => t.startsWith('Gotcha')) ?? null)
  for (let i = 0; i < 60; i++) await w.clock.advance(50)
  expect(w.toasts.filter(t => t.startsWith('Gotcha'))).toHaveLength(1)
  expect(w.saveNow().party.filter(m => m.species === 'caterpie')).toHaveLength(1)
  expect(await isAiming(aim)).toBe(false)
})

test('a wild Pokémon still downloading when another steps out stays away: one visitor at a time', async ($, on) => {
  const w = await begin(
    $,
    on,
    { ...emptySave(), party: [member('pikachu', { next: [lv('raichu', 30)] })] },
    TALL,
    undefined,
    throwNet(),
  )
  await cmd($, 'pokemon', 'party')
  await mountBand($ as never)
  await cmd($, 'pokemon-play', 'day')
  let open = () => {}
  w.net.stall = new Promise<void>(resolve => (open = resolve))
  const slow = cmd($, 'pokemon-play', 'wild mewtwo')
  await w.clock.advance(50)
  w.net.stall = undefined
  await cmd($, 'pokemon-play', 'wild caterpie')
  open()
  await slow
  expect(w.toasts.filter(t => t.includes('appeared'))).toEqual([expect.stringMatching(/Caterpie appeared!$/)])
  expect(w.saveNow().dex.mewtwo).toBeUndefined()
})

test('/pokemon-play wild takes a name: a misspelled one calls nobody, a real one comes by', async ($, on) => {
  await begin($, on, { ...emptySave(), party: [member('pikachu')] }, TALL, undefined, throwNet())
  await cmd($, 'pokemon', 'party')
  await mountBand($ as never)
  expect(await cmd($, 'pokemon-play', 'wild agumon')).toBe('No Pokémon called "agumon".')
  expect(await cmd($, 'pokemon-play', 'wild mewtwo')).toBe('A wild Mewtwo wanders by.')
})

test('a wild Pokémon, end to end: the grass rustles, then a "!" over the party, and a toast names it', async ($, on) => {
  const w = await begin($, on, {
    ...emptySave(),
    party: [member('pikachu', { next: [lv('raichu', 30)] }), member('eevee')],
  })
  await cmd($, 'pokemon', 'party')
  const band = (await mountBand($)) as Aim
  await w.clock.advance(500)
  expect(await cmd($, 'pokemon-play', 'wild')).toMatch(/^A wild .+ wanders by\.$/)
  expect(w.toasts.some(t => /^(✨ )?A wild .+ appeared!$/.test(t))).toBe(true)
  const rustle = [0x8fe36a, 0x6fcf4f]
  let rustled = false
  for (let i = 0; i < 35; i++) {
    await w.clock.advance(50)
    if ([...colorsIn(w.band.cells)].some(c => rustle.includes(c))) rustled = true
  }
  expect(rustled).toBe(true)
  let alerted = false
  for (let i = 0; i < 30; i++) {
    await w.clock.advance(50)
    // Drawn as pixel art or, once it can be aimed at, as text.
    if (colorsIn(w.band.cells).has(0xe0352b) || JSON.stringify(await aimLines(band)).includes('#e0352b')) alerted = true
  }
  expect(alerted).toBe(true)
})

// The engine's own drawing of a Spinner or TurnDuration, from the props the plugin handed down.
function engineLines(on: On) {
  const props: Record<string, unknown>[] = []
  on('ui.render', async (_$, e) => {
    props.push(e.props as Record<string, unknown>)
    return { type: 'Text', children: [JSON.stringify(e.props)] }
  })
  return props
}

const SPINNER = { word: 'Drizzling', message: null, suffix: '…', mode: 'thinking' } as const
const DURATION = { word: 'Baked', durationMs: 64_000 } as const

test("the spinner keeps Claude Code's own line with a Pokémon word; the closing line is all Pokémon", async ($, on) => {
  const engine = engineLines(on)
  await begin($, on, { ...emptySave(), party: [member('pikachu', { next: [lv('raichu', 30)] })] })
  const spinner = await $.ui.mount({ plugin: 'pokemon', surface: 'terminal', component: 'Spinner', props: SPINNER })
  // Drawn by the engine (tip, task list and token count included), from props with the word swapped.
  expect(engine.at(-1)).toEqual({ ...SPINNER, word: pickFor(WORKING, 'Drizzling') })
  expect((await spinner.find({ type: 'Text' }))?.text).toBe(JSON.stringify(engine.at(-1)))
  const compacting = { ...SPINNER, message: 'Compacting conversation' }
  await $.ui.mount({ plugin: 'pokemon', surface: 'terminal', component: 'Spinner', props: compacting })
  expect(engine.at(-1)?.message).toBe('Compacting conversation')

  const done = await $.ui.mount({ plugin: 'pokemon', surface: 'terminal', component: 'TurnDuration', props: DURATION })
  const line = await done.find({ type: 'Text' })
  expect(line?.text).toMatch(new RegExp(`^${BALL} (${DONE.join('|')}) for 1m 4s$`))
  expect((await done.find({ type: 'Box' }))?.props.marginTop).toBe(1)
  expect((await done.find({ type: 'Text', text: new RegExp(`^${BALL}$`) }))?.props.color).toBe(COLORS.red)
  expect((await done.find({ type: 'Text', text: /^for 1m 4s$/ }))?.props.color).toBe(COLORS.blue)
  const verb = await done.findAll({ type: 'Text', text: new RegExp(`^(${DONE.join('|')})$`) })
  expect(verb[0]?.props).toMatchObject({ color: COLORS.yellow, bold: true })
})

test('/pokemon off leaves the spinner and the closing line as the engine draws them', async ($, on) => {
  const engine = engineLines(on)
  await begin($, on, { ...emptySave(), party: [member('pikachu', { next: [lv('raichu', 30)] })] })
  await cmd($, 'pokemon', 'off')
  await $.ui.mount({ plugin: 'pokemon', surface: 'terminal', component: 'Spinner', props: SPINNER })
  expect(engine.at(-1)).toEqual(SPINNER)
  const done = await $.ui.mount({ plugin: 'pokemon', surface: 'terminal', component: 'TurnDuration', props: DURATION })
  expect(engine.at(-1)).toEqual(DURATION)
  expect((await done.find({ type: 'Text' }))?.text).toBe(JSON.stringify(DURATION))
})

test("the desktop spinner keeps its own words: there it names the step it's on", async ($, on) => {
  const engine = engineLines(on)
  await begin($, on, { ...emptySave(), party: [member('pikachu', { next: [lv('raichu', 30)] })] })
  const props = { ...SPINNER, word: 'Creating notes.md', mode: 'tool-use' } as const
  await $.ui.mount({ plugin: 'pokemon', surface: 'desktop', component: 'Spinner', props })
  expect(engine.at(-1)).toEqual(props)
})

test('a name made only of symbols catches nothing, releases no one and holds no everstone', async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu', { xp: 400 }), member('eevee')] })
  expect(await cmd($, 'pokemon', '✨')).toBe('No Pokémon called "✨".')
  expect(await cmd($, 'pokemon', 'add ピカチュウ')).toBe('No Pokémon called "ピカチュウ".')
  expect(await cmd($, 'pokemon', 'remove ♀')).toContain('No ♀ in your party.')
  expect(await cmd($, 'pokemon', 'everstone')).toBe('Which one? /pokemon everstone <name>')
  expect(w.partyNow().map(m => [m.species, m.xp, m.heldItem === 'everstone'])).toEqual([
    ['pikachu', 400, false],
    ['eevee', 0, false],
  ])
})

test('remove names the right one of two forms; leading again records no new sighting', async ($, on) => {
  const w = await begin($, on, {
    ...emptySave(),
    party: [member('vulpix', { form: 'alola', xp: 900 }), member('pikachu'), member('vulpix')],
  })
  expect(await cmd($, 'pokemon', 'remove vulpix')).toBe('Vulpix went back to the wild.')
  expect(w.saveNow().party.map(m => `${m.species}:${m.form}`)).toEqual(['vulpix:alola', 'pikachu:regular'])
  expect(await cmd($, 'pokemon', 'shiny pikachu')).toBe('Pikachu leads the party again (Lv 1).')
  expect(w.saveNow().dex).toEqual({})
  expect(w.saveNow().party[0]?.isShiny).toBe(false)
})

test('another session turning the party off stops xp at once; /pokemon on says they were resting', async ($, on) => {
  answerTools(on)
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu', { next: [lv('raichu', 30)] })] })
  await cmd($, 'pokemon', 'party')
  w.store.set('save', { ...w.saveNow(), isOff: true })
  await $.tool.call(bash('git commit -m x') as never)
  expect(w.partyNow()[0]?.xp).toBe(0)
  expect(await cmd($, 'pokemon', 'on')).toBe('Your Pokémon are back in the meadow!')
})

test('two of one species: only the one due evolves, and the other keeps its everstone', async ($, on) => {
  answerTools(on)
  const w = await begin($, on, {
    ...emptySave(),
    party: [
      member('charmeleon', { id: 'calm', xp: 0, next: [lv('charizard', 36)], heldItem: 'everstone' }),
      member('charmeleon', { id: 'due', xp: xpForLevel(36) - 5, next: [lv('charizard', 36)] }),
    ],
  })
  await $.tool.call(bash('git commit -m x') as never)
  await until($, () => w.saveNow().party.some(m => m.species === 'charizard'))
  expect(w.saveNow().party.map(m => [m.id, m.species, m.heldItem === 'everstone'])).toEqual([
    ['calm', 'charmeleon', true],
    ['due', 'charizard', false],
  ])
  expect(w.toasts).toEqual(['What? Charmeleon evolved into Charizard!'])
})

test('dropping an everstone evolves a Pokémon already past its level', async ($, on) => {
  const w = await begin($, on, {
    ...emptySave(),
    party: [member('charmander', { xp: xpForLevel(20), next: [lv('charmeleon', 16)], heldItem: 'everstone' })],
  })
  expect(await cmd($, 'pokemon', 'everstone charmander')).toBe('Charmander dropped its everstone and can evolve again.')
  await until($, () => w.saveNow().party[0]?.species === 'charmeleon')
})

test('nothing evolves while the party is off; /pokemon on lets it', async ($, on) => {
  const w = await begin($, on, {
    ...emptySave(),
    isOff: true,
    party: [member('charmander', { xp: xpForLevel(16), next: [lv('charmeleon', 16)] })],
  })
  for (let i = 0; i < 5; i++) await cmd($, 'pokemon', 'party')
  expect(w.saveNow().party[0]?.species).toBe('charmander')
  expect(w.toasts).toEqual([])
  await cmd($, 'pokemon', 'on')
  await until($, () => w.saveNow().party[0]?.species === 'charmeleon')
})

test('a tool call refused beneath the plugin earns nothing', async ($, on) => {
  on('tool.call', async () => ({ deny: 'blocked by policy' }))
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu', { next: [lv('raichu', 30)] })] })
  await $.tool.call(bash('git commit -m x') as never)
  await $.tool.call(bash('pytest -q') as never)
  await cmd($, 'pokemon', 'party')
  expect(w.partyNow()[0]?.xp).toBe(0)
})

test('offline at the first start: said once, and a first Pokémon arrives once back online', async ($, on) => {
  const w = await begin($, on, undefined, ART, undefined, { isOnline: false, list: JSON.stringify(LIST) })
  expect(await cmd($, 'pokemon', 'party')).toBe('Your party is empty. /pokemon <name> picks a lead.')
  await w.clock.advance(30_000)
  // A failing download (here the test kit's own "no implementation" once the fake network refuses).
  expect(w.toasts.filter(t => t.startsWith('Pokémon: ')).length).toBe(1)
  w.net.isOnline = true
  await w.clock.advance(11_000)
  expect(w.saveNow().party.length).toBe(1)
})

test('a saved party that could not be drawn offline is drawn once back online', async ($, on) => {
  engineLines(on)
  const w = await begin(
    $,
    on,
    { ...emptySave(), party: [member('pikachu', { next: [lv('raichu', 30)] })] },
    ART,
    undefined,
    {
      isOnline: false,
      list: JSON.stringify(LIST),
    },
  )
  await mountBand($)
  await w.clock.advance(2000)
  expect(w.band.frames).toBe(0)
  w.net.isOnline = true
  await w.clock.advance(11_000)
  await mountBand($)
  await w.clock.advance(2000)
  expect(w.band.frames).toBeGreaterThan(0)
})

test('a broken cache (a crash mid-write) is downloaded again', async ($, on) => {
  const dir = '/home/ash/.cache/claude-code-pokemon'
  const files = new Map([[`${dir}/pokemon.json`, '[{"name": "pika']])
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu', { next: [lv('raichu', 30)] })] }, ART, files)
  expect(await cmd($, 'pokemon', 'add eevee')).toContain('Eevee joined your party!')
  expect(JSON.parse(files.get(`${dir}/pokemon.json`) ?? '')).toEqual(LIST)
  expect(w.toasts).toEqual([])
})

test('a broken download (a Wi-Fi login page) is never cached, and is reported', async ($, on) => {
  const login = '<html>Sign in to the hotel Wi-Fi</html>'
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu', { next: [lv('raichu', 30)] })] }, login)
  await cmd($, 'pokemon', 'party')
  expect([...w.files.keys()].some(f => f.includes('/sprites/'))).toBe(false)
  expect(w.toasts.some(t => t.includes('broken download'))).toBe(true)
})

test('an old species list still serves when its refresh fails', async ($, on) => {
  const dir = '/home/ash/.cache/claude-code-pokemon'
  const files = new Map([
    [`${dir}/pokemon.json`, JSON.stringify(LIST)],
    [`${dir}/sprites/regular/pikachu`, ART],
  ])
  await begin($, on, { ...emptySave(), party: [member('pikachu', { next: [lv('raichu', 30)] })] }, ART, files, {
    isOnline: false,
    list: JSON.stringify(LIST),
    cacheAgeMs: 40 * 24 * 60 * 60_000,
  })
  expect(await cmd($, 'pokedex')).toContain(`/ ${LIST.length} seen`)
})

test('a stalled download never holds up a command', async ($, on) => {
  const w = await begin(
    $,
    on,
    { ...emptySave(), party: [member('pikachu', { next: [lv('raichu', 30)] })] },
    ART,
    undefined,
    {
      isOnline: true,
      list: JSON.stringify(LIST),
      stall: new Promise(() => {}),
    },
  )
  const reply = cmd($, 'pokemon', 'off')
  await w.clock.advance(6000)
  expect(await reply).toBe('Your Pokémon are resting in their Poké Balls. /pokemon on brings them back.')
})

test('names in the downloaded list that are not plain names never become files', async ($, on) => {
  const list = [
    { name: '../../../../.zshrc', forms: ['regular'] },
    { name: 'pikachu', forms: ['regular', '../../x'] },
  ]
  const w = await begin($, on, undefined, ART, undefined, { isOnline: true, list: JSON.stringify(list) })
  await cmd($, 'pokemon', 'party')
  expect(w.saveNow().party.map(m => `${m.species}:${m.form}`)).toEqual(['pikachu:regular'])
  expect([...w.files.keys()].filter(f => f.includes('..'))).toEqual([])
})

test('a store that cannot be read at start is reported, and works again once it can', async ($, on) => {
  const w = await begin(
    $,
    on,
    { ...emptySave(), party: [member('pikachu', { next: [lv('raichu', 30)] })] },
    ART,
    undefined,
    {
      isOnline: true,
      list: JSON.stringify(LIST),
      isStoreBroken: true,
    },
  )
  expect(await cmd($, 'pokemon', 'party')).toMatch(/^Couldn't reach the Pokémon: /)
  expect(w.toasts.filter(t => t.startsWith('Pokémon: ')).length).toBe(1)
  w.net.isStoreBroken = false
  expect(await cmd($, 'pokemon', 'party')).toContain('Lead  Pikachu')
})

test('another surface drawing at the same time leaves the terminal band running; wide bands are clipped to 512', async ($, on) => {
  engineLines(on)
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu')] })
  await cmd($, 'pokemon', 'party')
  await mountBand($)
  await cmd($, 'pokemon-play', 'work')
  await w.clock.advance(1000)
  await $.ui.mount({
    plugin: 'pokemon',
    surface: 'desktop',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 30, bodyColumns: 80 },
  } as never)
  const before = w.band.frames
  await w.clock.advance(2000)
  expect(w.band.frames - before).toBeGreaterThan(5)
  const wide = await $.ui.mount({
    plugin: 'pokemon',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 30, bodyColumns: 600 },
  } as never)
  expect(JSON.stringify(await wide.drawn())).toContain('"columns":512')
})

test('two members due at once evolve one after the other, each with its whole animation', async ($, on) => {
  answerTools(on)
  const w = await begin($, on, {
    ...emptySave(),
    party: [
      member('charmander', { xp: xpForLevel(16) - 5, next: [lv('charmeleon', 16)] }),
      member('pikachu', { xp: xpForLevel(30) - 5, next: [lv('raichu', 30)] }),
    ],
  })
  await cmd($, 'pokemon', 'party')
  await mountBand($)
  await $.tool.call(bash('git commit -m x') as never)
  await until($, () => w.toasts.length === 1)
  for (let i = 0; i < 5; i++) await cmd($, 'pokemon', 'party')
  expect(w.toasts).toEqual(['What? Charmander evolved into Charmeleon!'])
  for (let i = 0; i < 20 && w.toasts.length < 2; i++) await w.clock.advance(500)
  expect(w.toasts).toEqual(['What? Charmander evolved into Charmeleon!', 'What? Pikachu evolved into Raichu!'])
})

test('with no band drawn (a `claude -p` run), evolutions never wait for an animation', async ($, on) => {
  answerTools(on)
  const w = await begin($, on, {
    ...emptySave(),
    party: [
      member('charmander', { xp: xpForLevel(16) - 5, next: [lv('charmeleon', 16)] }),
      member('pikachu', { xp: xpForLevel(30) - 5, next: [lv('raichu', 30)] }),
    ],
  })
  await $.tool.call(bash('git commit -m x') as never)
  await until($, () => w.toasts.length === 2)
  expect(w.saveNow().party.map(m => m.species)).toEqual(['charmeleon', 'raichu'])
})

test("a space too short for the band shows Claude Code's own row instead", async ($, on) => {
  const engine = engineLines(on)
  await begin($, on, { ...emptySave(), party: [member('pikachu', { next: [lv('raichu', 30)] })] })
  await cmd($, 'pokemon', 'party')
  const short = await $.ui.mount({
    plugin: 'pokemon',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 2, bodyColumns: 80 },
  } as never)
  expect(JSON.stringify(await short.drawn())).not.toContain('Raster')
  expect(engine.length).toBeGreaterThan(0)
})

test('each session keeps its XP under its own key, so sessions writing at once never lose any', async ($, on) => {
  answerTools(on)
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu', { id: 'p', next: [lv('raichu', 30)] })] })
  await cmd($, 'pokemon', 'party')
  // Another session's ledger, written between this session's own writes.
  for (let i = 1; i <= 3; i++) {
    w.store.set('xp:other', { at: Date.now(), xp: { p: 10 * i } })
    await $.tool.call(bash('pytest -q') as never)
  }
  await cmd($, 'pokemon', 'party')
  expect(w.partyNow()[0]?.xp).toBe(30 + 15)
  expect(w.saveNow().party[0]?.xp).toBe(0)
  expect(await cmd($, 'pokemon', 'party')).toContain('Lead  Pikachu  Lv 4')
})

// Simulates 15 minutes of the frame and sync timers: longer than the default 5 seconds on a slow machine.
test(
  "an ended session's ledger is folded into the save, then removed, and its XP is never counted twice",
  { timeoutMs: 30_000 },
  async ($, on) => {
    const w = await begin($, on, {
      ...emptySave(),
      party: [member('pikachu', { id: 'p', xp: 5, next: [lv('raichu', 30)] })],
    })
    w.store.set('xp:gone', { at: Date.now() - 2 * 24 * 60 * 60_000, xp: { p: 40 } })
    await cmd($, 'pokemon', 'party')
    expect(w.partyNow()[0]?.xp).toBe(45)
    // One fold round every 30 syncs (5 minutes): folded first, removed a round later.
    await w.clock.advance(310_000)
    expect(w.saveNow().party[0]?.xp).toBe(45)
    expect(w.saveNow().folded).toEqual(['xp:gone'])
    expect(w.partyNow()[0]?.xp).toBe(45)
    await w.clock.advance(310_000)
    expect(w.store.has('xp:gone')).toBe(false)
    await w.clock.advance(310_000)
    expect(w.saveNow().folded).toBeUndefined()
    expect(w.partyNow()[0]?.xp).toBe(45)
    expect(await cmd($, 'pokemon', 'party')).toContain('Lv 4')
  },
)

test('gender follows the species, shows in the party, and decides gender-only evolutions', async ($, on) => {
  answerTools(on)
  const w = await begin($, on, {
    ...emptySave(),
    party: [member('combee', { xp: xpForLevel(21) - 5 }), member('burmy', { form: 'sandy', xp: xpForLevel(20) - 5 })],
  })
  await until($, () => w.saveNow().party.every(m => m.next !== undefined))
  expect(w.saveNow().party.map(m => m.gender)).toEqual(['female', 'male'])
  expect(await cmd($, 'pokemon', 'party')).toContain('Combee ♀')
  await $.tool.call(bash('git commit -m x') as never)
  await until($, () => w.toasts.length === 2)
  // A female Combee becomes Vespiquen; a male Burmy, whatever its cloak, becomes Mothim.
  expect(w.saveNow().party.map(m => `${m.species}:${m.form}:${m.gender}`)).toEqual([
    'vespiquen:regular:female',
    'mothim:regular:male',
  ])
  expect(await cmd($, 'pokemon', 'party')).toContain('Mothim ♂')
})

test('a piped test run reacts to its summary; one still running in the background reacts to nothing', async ($, on) => {
  on('tool.call', async (_$, e) => {
    const { command, run_in_background } = e as unknown as { command: string; run_in_background?: boolean }
    if (run_in_background) return { result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'b1' } }
    const stdout = command.includes('broken') ? '== 1 failed, 2 passed in 0.1s ==' : '== 3 passed in 0.1s =='
    return { result: { stdout, stderr: '', interrupted: false } }
  })
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu', { next: [lv('raichu', 30)] })] })
  await cmd($, 'pokemon', 'party')
  await $.tool.call(bash('pytest 2>&1 | tail -5') as never)
  await cmd($, 'pokemon', 'party')
  expect(w.partyNow()[0]?.xp).toBe(5)
  await $.tool.call(bash('pytest tests/broken.py | tail -5') as never)
  await $.tool.call({ ...bash('pytest'), run_in_background: true } as never)
  await cmd($, 'pokemon', 'party')
  expect(w.partyNow()[0]?.xp).toBe(5)
})

test('the PC box: listed with /pokemon box; a boxed Pokémon can lead (the old lead takes its place) or rejoin', async ($, on) => {
  const w = await begin($, on, {
    ...emptySave(),
    party: [member('pikachu', { xp: 100 }), member('charmander')],
    box: [member('eevee', { xp: 40, isCaught: true })],
  })
  expect(await cmd($, 'pokemon', 'box')).toMatch(/^Your PC box:\n {2}1\. {2}Eevee ◓ {2}Lv 4 /)
  expect(await cmd($, 'pokemon', 'eevee')).toBe(
    'Eevee (Lv 4) came out of the PC box to lead your party. Pikachu (Lv 6) went into the PC box.',
  )
  expect(w.saveNow().party.map(m => m.species)).toEqual(['eevee', 'charmander'])
  expect(w.saveNow().box?.map(m => m.species)).toEqual(['pikachu'])
  expect(await cmd($, 'pokemon', 'add pikachu')).toBe('Pikachu came out of the PC box and joined your party!')
  expect(w.saveNow().party.map(m => m.species)).toEqual(['eevee', 'charmander', 'pikachu'])
  expect(await cmd($, 'pokemon', 'box')).toBe('Your PC box is empty.')
})

test('deposit moves a member into the PC box with its XP; the lead too, never the last one', async ($, on) => {
  const w = await begin($, on, {
    ...emptySave(),
    party: [member('pikachu', { xp: 100 }), member('eevee', { xp: 40 }), member('charmander')],
  })
  expect(await cmd($, 'pokemon', 'deposit')).toBe('Which one? /pokemon deposit <name>')
  expect(await cmd($, 'pokemon', 'deposit vaporeon')).toContain('No vaporeon in your party')
  expect(await cmd($, 'pokemon', 'deposit eevee')).toBe('Eevee (Lv 4) went into the PC box.')
  expect(await cmd($, 'pokemon', 'deposit pikachu')).toBe('Pikachu (Lv 6) went into the PC box.')
  expect(w.saveNow().party.map(m => m.species)).toEqual(['charmander'])
  expect(w.saveNow().box?.map(m => [m.species, m.xp])).toEqual([
    ['eevee', 40],
    ['pikachu', 100],
  ])
  expect(await cmd($, 'pokemon', 'deposit charmander')).toContain('would leave your party empty')
  expect(await cmd($, 'pokemon', 'add eevee')).toBe('Eevee came out of the PC box and joined your party!')
})

test('a shiny named in the PC box comes out of it: the lead goes into the box, not back to the wild', async ($, on) => {
  const w = await begin($, on, {
    ...emptySave(),
    party: [member('pikachu', { xp: 100 })],
    box: [member('eevee', { id: 'boxed', isShiny: true })],
  })
  expect(await cmd($, 'pokemon', 'shiny eevee')).toBe(
    'Eevee (Lv 1) came out of the PC box to lead your party. Pikachu (Lv 6) went into the PC box.',
  )
  expect(w.saveNow().party.map(m => m.id)).toEqual(['boxed'])
  expect(w.saveNow().box?.map(m => m.species)).toEqual(['pikachu'])
})

test('a plain name never takes a regional form out of the PC box', async ($, on) => {
  const w = await begin($, on, {
    ...emptySave(),
    party: [member('pikachu'), member('mr-mime')],
    box: [member('mr-mime', { form: 'galar', id: 'gal' })],
  })
  expect(await cmd($, 'pokemon', 'mr mime')).toBe('Mr Mime leads the party again (Lv 1).')
  expect(await cmd($, 'pokemon', 'add mr mime')).toBe('Mr Mime is already in your party.')
  expect(w.saveNow().party.map(m => `${m.species}:${m.form}`)).toEqual(['mr-mime:regular', 'pikachu:regular'])
  expect(w.saveNow().box?.map(m => m.id)).toEqual(['gal'])
})

test('a name in both the party and the box picks the party one; a full party leaves the box alone', async ($, on) => {
  const w = await begin($, on, {
    ...emptySave(),
    party: [member('pikachu'), member('eevee'), member('charmander')],
    box: [member('eevee', { id: 'boxed' }), member('raichu', { id: 'boxed-raichu' })],
  })
  expect(await cmd($, 'pokemon', 'eevee')).toBe('Eevee leads the party again (Lv 1).')
  expect(await cmd($, 'pokemon', 'add raichu')).toContain('Your party is full (3)')
  expect(w.saveNow().box?.map(m => m.id)).toEqual(['boxed', 'boxed-raichu'])
})

test('a boxed Pokémon comes out by name even when the party holds another form of its species', async ($, on) => {
  const w = await begin($, on, {
    ...emptySave(),
    party: [member('mr-mime', { form: 'galar', id: 'gal', xp: 400 }), member('pikachu')],
    box: [member('mr-mime', { id: 'boxed' })],
  })
  expect(await cmd($, 'pokemon', 'mr mime')).toBe(
    'Mr Mime (Lv 1) came out of the PC box to lead your party. Mr Mime (Galar) (Lv 11) went into the PC box.',
  )
  expect(w.saveNow().party[0]?.id).toBe('boxed')
  expect(w.saveNow().box?.map(m => m.id)).toEqual(['gal'])
  expect(await cmd($, 'pokemon', 'add galarian mr mime')).toBe(
    'Mr Mime (Galar) came out of the PC box and joined your party!',
  )
  expect(w.saveNow().party.map(m => m.id)).toContain('gal')
})

test('an everstone holder never evolves when the party is reordered during an evolution animation', async ($, on) => {
  answerTools(on)
  const w = await begin($, on, {
    ...emptySave(),
    party: [
      member('charmander', { id: 'a', xp: xpForLevel(16) - 5, next: [lv('charmeleon', 16)], gender: 'male' }),
      member('charmeleon', {
        id: 'e',
        xp: xpForLevel(40),
        next: [lv('charizard', 36)],
        heldItem: 'everstone',
        gender: 'male',
      }),
      member('pikachu', { id: 'd', xp: xpForLevel(30) - 5, next: [lv('raichu', 30)], gender: 'male' }),
    ],
  })
  await cmd($, 'pokemon', 'party')
  await mountBand($)
  await $.tool.call(bash('git commit -m x') as never)
  await until($, () => w.toasts.length === 1)
  // Mid-animation, Pikachu moves to lead: the everstone Charmeleon now stands where Pikachu stood.
  expect(await cmd($, 'pokemon', 'pikachu')).toBe('Pikachu leads the party again (Lv 30).')
  for (let i = 0; i < 40 && w.toasts.length < 2; i++) await w.clock.advance(500)
  for (let i = 0; i < 10; i++) await w.clock.advance(500)
  expect(w.saveNow().party.map(m => [m.id, m.species, m.heldItem === 'everstone'])).toEqual([
    ['d', 'raichu', false],
    ['a', 'charmeleon', false],
    ['e', 'charmeleon', true],
  ])
  expect(w.toasts).toEqual(['What? Charmander evolved into Charmeleon!', 'What? Pikachu evolved into Raichu!'])
})

test('a slow party refresh in flight never draws over an evolution', async ($, on) => {
  answerTools(on)
  const net: Net = {
    isOnline: true,
    list: JSON.stringify(LIST),
    sprites: { pikachu: solid('255;0;0', 6), raichu: solid('0;255;0', 6), eevee: solid('0;0;255', 6) },
  }
  const w = await begin(
    $,
    on,
    {
      ...emptySave(),
      party: [member('pikachu', { id: 'p', xp: xpForLevel(30) - 5, next: [lv('raichu', 30)], gender: 'male' })],
    },
    ART,
    undefined,
    net,
  )
  await cmd($, 'pokemon', 'party')
  await mountBand($)
  // Daylight for the whole test: night dims every colour.
  await cmd($, 'pokemon-play', 'day')
  // Warms the caches with Raichu's art and Pikachu's evolution data.
  await cmd($, 'pokemon-play', 'evolve')
  await w.clock.advance(9000)
  // Another session adds an Eevee whose sprite this session has never downloaded; the download stalls.
  let release = () => {}
  net.stall = new Promise<void>(r => (release = r))
  w.store.set('save', {
    ...w.saveNow(),
    party: [...w.saveNow().party, member('eevee', { id: 'v', next: [], gender: 'male' })],
  })
  await w.clock.advance(10_500)
  await $.tool.call(bash('git commit -m x') as never)
  for (let i = 0; i < 20 && w.saveNow().party[0]?.species !== 'raichu'; i++) await w.clock.advance(100)
  expect(w.saveNow().party.map(m => m.species)).toEqual(['raichu', 'eevee'])
  // The toast doesn't wait for the stalled download.
  expect(w.toasts).toContain('What? Pikachu evolved into Raichu!')
  net.stall = undefined
  release()
  for (let i = 0; i < 40; i++) await w.clock.advance(500)
  const colors = colorsIn(w.band.cells)
  // Raichu leads, drawn in front: its colour shows; Pikachu's is nowhere. (Eevee may stand fully behind it.)
  expect(colors.has(0x00ff00)).toBe(true)
  expect(colors.has(0xff0000)).toBe(false)
})

test('Rockruff evolves at Lv 25 into the Lycanroc of the hour: Midnight at night', async ($, on) => {
  answerTools(on)
  const net: Net = { isOnline: true, list: JSON.stringify(LIST), now: hourAt(23) }
  const w = await begin(
    $,
    on,
    { ...emptySave(), party: [member('rockruff', { xp: xpForLevel(25) - 5 })] },
    ART,
    undefined,
    net,
  )
  await until($, () => w.saveNow().party[0]?.next !== undefined)
  await $.tool.call(bash('git commit -m x') as never)
  await until($, () => w.saveNow().party[0]?.species === 'lycanroc')
  expect(w.saveNow().party[0]?.form).toBe('midnight')
})

test('Rockruff by day becomes Midday Lycanroc, the plain form', async ($, on) => {
  answerTools(on)
  const net: Net = { isOnline: true, list: JSON.stringify(LIST), now: hourAt(12) }
  const w = await begin(
    $,
    on,
    { ...emptySave(), party: [member('rockruff', { xp: xpForLevel(25) - 5 })] },
    ART,
    undefined,
    net,
  )
  await until($, () => w.saveNow().party[0]?.next !== undefined)
  await $.tool.call(bash('git commit -m x') as never)
  await until($, () => w.saveNow().party[0]?.species === 'lycanroc')
  expect(w.saveNow().party[0]?.form).toBe('regular')
})

test('Pancham evolves at Lv 32 only with a Dark-type in the party', async ($, on) => {
  answerTools(on)
  const w = await begin($, on, { ...emptySave(), party: [member('pancham', { xp: xpForLevel(32) - 5 })] })
  await until($, () => w.saveNow().party[0]?.next !== undefined)
  await $.tool.call(bash('git commit -m x') as never)
  for (let i = 0; i < 5; i++) await cmd($, 'pokemon', 'party')
  expect(w.saveNow().party[0]?.species).toBe('pancham')
  expect(await cmd($, 'pokemon', 'party')).toContain('evolves at Lv 32 with a Dark-type in the party')
  await cmd($, 'pokemon', 'add umbreon')
  await until($, () => w.saveNow().party[0]?.species === 'pangoro' && w.toasts.length > 0)
  expect(w.toasts).toEqual(['What? Pancham evolved into Pangoro!'])
})

test('Nincada becomes Ninjask at Lv 20, and Shedinja comes along: to the party, or the PC box when full', async ($, on) => {
  answerTools(on)
  const w = await begin($, on, { ...emptySave(), party: [member('nincada', { xp: xpForLevel(20) - 5 })] })
  await until($, () => w.saveNow().party[0]?.next !== undefined)
  await $.tool.call(bash('git commit -m x') as never)
  await until($, () => w.toasts.length === 1)
  expect(w.toasts).toEqual(['What? Nincada evolved into Ninjask! Shedinja joined your party!'])
  expect(w.saveNow().party.map(m => m.species)).toEqual(['ninjask', 'shedinja'])
  // Ninjask's XP from this session's ledger comes along: the same level.
  expect(w.partyNow().map(m => level(m.xp))).toEqual([20, 20])
  // Caught, as in the games.
  expect(w.saveNow().dex.shedinja).toMatchObject({ seen: 1, caught: 1 })
  expect(await cmd($, 'pokedex')).toContain(' · 1 caught · ')
})

test('Pancham counts an Alolan Rattata as the Dark-type it is', async ($, on) => {
  answerTools(on)
  const w = await begin($, on, {
    ...emptySave(),
    party: [member('pancham', { xp: xpForLevel(32) - 5 }), member('rattata', { form: 'alola' })],
  })
  await until($, () => w.saveNow().party.every(m => m.next !== undefined))
  await $.tool.call(bash('git commit -m x') as never)
  await until($, () => w.saveNow().party[0]?.species === 'pangoro' && w.toasts.length > 0)
  expect(w.toasts).toEqual(['What? Pancham evolved into Pangoro!'])
})

test('a plain Rattata is no Dark-type: Pancham waits', async ($, on) => {
  answerTools(on)
  const w = await begin($, on, {
    ...emptySave(),
    party: [member('pancham', { xp: xpForLevel(32) - 5 }), member('rattata')],
  })
  await until($, () => w.saveNow().party.every(m => m.next !== undefined))
  await $.tool.call(bash('git commit -m x') as never)
  for (let i = 0; i < 5; i++) await cmd($, 'pokemon', 'party')
  expect(w.saveNow().party[0]?.species).toBe('pancham')
  expect(w.toasts).toEqual([])
})

test('with a full party, Shedinja goes to the PC box', async ($, on) => {
  answerTools(on)
  const w = await begin($, on, {
    ...emptySave(),
    party: [
      member('nincada', { xp: xpForLevel(20) - 5 }),
      member('pikachu', { next: [] }),
      member('charmander', { next: [] }),
    ],
  })
  await until($, () => w.saveNow().party[0]?.next !== undefined)
  await $.tool.call(bash('git commit -m x') as never)
  await until($, () => w.toasts.length === 1)
  expect(w.toasts).toEqual(['What? Nincada evolved into Ninjask! Shedinja went to the PC box.'])
  expect(w.saveNow().box?.map(m => m.species)).toEqual(['shedinja'])
})

test('Dusclops waits for a Reaper Cloth: past Lv 30 it stays, and the party says what it needs', async ($, on) => {
  answerTools(on)
  const w = await begin($, on, { ...emptySave(), party: [member('dusclops', { xp: xpForLevel(45) })] })
  await until($, () => w.saveNow().party[0]?.next !== undefined)
  await $.tool.call(bash('git commit -m x') as never)
  for (let i = 0; i < 5; i++) await cmd($, 'pokemon', 'party')
  expect(w.saveNow().party[0]?.species).toBe('dusclops')
  expect(await cmd($, 'pokemon', 'party')).toContain('evolves with a Reaper Cloth')
  expect(w.toasts).toEqual([])
})

test('Mantyke evolves once a Remoraid joins the party', async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('mantyke')] })
  await until($, () => w.saveNow().party[0]?.next !== undefined)
  for (let i = 0; i < 5; i++) await cmd($, 'pokemon', 'party')
  expect(w.saveNow().party[0]?.species).toBe('mantyke')
  expect(await cmd($, 'pokemon', 'party')).toContain('evolves with Remoraid in the party')
  await cmd($, 'pokemon', 'add remoraid')
  await until($, () => w.saveNow().party[0]?.species === 'mantine')
})

// A reply's ₽20 is earnInto's ×10 on its 2 XP (save.test.ts); here the two tool events, with two members.
test('work earns ₽ once per event, not per member: a test run ₽50, a commit ₽100', async ($, on) => {
  answerTools(on)
  const w = await begin($, on, {
    ...emptySave(),
    party: [member('pikachu', { next: [] }), member('eevee', { next: [] })],
  })
  expect(await cmd($, 'pokemon', 'bag')).toBe('Bag · ₽3,000\n  Empty. Buy items at the PokéMart: /pokemon mart')
  await $.tool.call(bash('pytest -q') as never)
  await $.tool.call(bash('git commit -m x') as never)
  await until($, () => [...w.store].some(([k, l]) => k.startsWith('xp:') && (l as { money?: number }).money === 150))
  expect(await cmd($, 'pokemon', 'bag')).toContain('Bag · ₽3,150')
})

test('a finished reply earns ₽20, once for the whole party', async ($, on) => {
  on('turn.complete', async () => ({ text: '' }))
  const w = await begin($, on, {
    ...emptySave(),
    party: [member('pikachu', { next: [] }), member('eevee', { next: [] })],
  })
  await cmd($, 'pokemon', 'party')
  await $.turn.complete({ reason: 'answer', answer: 'done', durationMs: 1 } as never)
  await until($, () => [...w.store].some(([k, l]) => k.startsWith('xp:') && (l as { money?: number }).money === 20))
  expect(await cmd($, 'pokemon', 'bag')).toContain('Bag · ₽3,020')
})

test('a Water Stone given to Eevee evolves it into Vaporeon and is used up', async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('eevee')], bag: { 'water-stone': 2 } })
  expect(await cmd($, 'pokemon', 'give water stone eevee')).toBe('Eevee evolved into Vaporeon!')
  expect(w.saveNow().party[0]?.species).toBe('vaporeon')
  expect(w.saveNow().bag).toEqual({ 'water-stone': 1 })
  expect(w.toasts).toEqual(['What? Eevee evolved into Vaporeon!'])
})

test('a stone not in the Bag changes nothing and plays no evolution', async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('eevee')] })
  await until($, () => w.saveNow().party[0]?.next !== undefined)
  const before = JSON.stringify(w.saveNow())
  expect(await cmd($, 'pokemon', 'give eevee water stone')).toBe(
    "You don't have a Water Stone. Buy one at the PokéMart: /pokemon mart",
  )
  await cmd($, 'pokemon', 'party')
  expect(JSON.stringify(w.saveNow())).toBe(before)
  expect(w.toasts).toEqual([])
  // An evolution fetches the new form's sprite before it animates: none was.
  expect(w.fetched.some(url => url.endsWith('/vaporeon'))).toBe(false)
})

test('give refuses what it cannot do, and changes nothing', async ($, on) => {
  const w = await begin($, on, {
    ...emptySave(),
    party: [member('eevee'), member('charmander')],
    bag: { 'water-stone': 1 },
  })
  // Start-up's own lookup of how they evolve lands first.
  await until($, () => w.saveNow().party.every(m => m.next !== undefined))
  const before = JSON.stringify(w.saveNow())
  expect(await cmd($, 'pokemon', 'give fire-stone eevee')).toBe(
    "You don't have a Fire Stone. Buy one at the PokéMart: /pokemon mart",
  )
  expect(await cmd($, 'pokemon', 'give water-stone charmander')).toBe("Charmander can't use a Water Stone.")
  expect(await cmd($, 'pokemon', 'give water-stone mewtwo')).toMatch(/^No mewtwo in your party\./)
  expect(await cmd($, 'pokemon', 'give water-stone')).toBe(
    'Give a Water Stone to whom? /pokemon give water-stone <pokemon>',
  )
  expect(await cmd($, 'pokemon', 'give eevee')).toBe(
    'Give what to whom? /pokemon give <item> <pokemon> · /pokemon bag lists your items.',
  )
  expect(JSON.stringify(w.saveNow())).toBe(before)
})

test('holding: one item each, a new one sends the old back to the Bag; take puts it back', async ($, on) => {
  const w = await begin($, on, {
    ...emptySave(),
    party: [member('pikachu', { next: [] })],
    bag: { 'lucky-egg': 1, 'soothe-bell': 1 },
  })
  expect(await cmd($, 'pokemon', 'give lucky-egg pikachu')).toBe('Pikachu is now holding a Lucky Egg.')
  expect(w.saveNow().bag).toEqual({ 'soothe-bell': 1 })
  expect(await cmd($, 'pokemon', 'give pikachu soothe bell')).toBe(
    'Pikachu is now holding a Soothe Bell. Its Lucky Egg went back to your Bag.',
  )
  expect(w.saveNow().bag).toEqual({ 'lucky-egg': 1 })
  expect(await cmd($, 'pokemon', 'bag')).toContain('  Held        Pikachu: Soothe Bell')
  expect(await cmd($, 'pokemon', 'take pikachu')).toBe("Pikachu's Soothe Bell went back to your Bag.")
  expect(await cmd($, 'pokemon', 'take pikachu')).toBe("Pikachu isn't holding anything.")
  expect(w.saveNow().bag).toEqual({ 'lucky-egg': 1, 'soothe-bell': 1 })
  expect(w.saveNow().party[0]?.heldItem).toBeUndefined()
})

test('the everstone stays free: same words as ever, and it never enters the Bag', async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu', { next: [] })], bag: { 'lucky-egg': 1 } })
  await cmd($, 'pokemon', 'give lucky-egg pikachu')
  expect(await cmd($, 'pokemon', 'everstone pikachu')).toBe(
    "Pikachu holds an everstone: it won't evolve. Its Lucky Egg went back to your Bag.",
  )
  expect(w.saveNow().party[0]?.heldItem).toBe('everstone')
  expect(await cmd($, 'pokemon', 'everstone pikachu')).toBe('Pikachu dropped its everstone and can evolve again.')
  expect(w.saveNow().bag).toEqual({ 'lucky-egg': 1 })
  expect(await cmd($, 'pokemon', 'give everstone pikachu')).toBe("Pikachu holds an everstone: it won't evolve.")
  expect(await cmd($, 'pokemon', 'take pikachu')).toBe('Pikachu dropped its everstone and can evolve again.')
  expect(w.saveNow().bag).toEqual({ 'lucky-egg': 1 })
})

test('a Rare Candy is one level, and the evolution that level brings', async ($, on) => {
  const w = await begin($, on, {
    ...emptySave(),
    party: [member('charmander', { xp: xpForLevel(15) + 3 })],
    bag: { 'rare-candy': 1 },
  })
  expect(await cmd($, 'pokemon', 'give rare candy charmander')).toBe('Charmander grew to Lv 16!')
  expect(w.saveNow().bag).toBeUndefined()
  await until($, () => w.saveNow().party[0]?.species === 'charmeleon')
})

test('a Rare Candy is refused at Lv 100, and kept', async ($, on) => {
  const w = await begin($, on, {
    ...emptySave(),
    party: [member('charizard', { xp: xpForLevel(100), next: [] })],
    bag: { 'rare-candy': 1 },
  })
  expect(await cmd($, 'pokemon', 'give rare-candy charizard')).toBe('Charizard is already Lv 100.')
  expect(w.saveNow().bag).toEqual({ 'rare-candy': 1 })
})

test('a Lucky Egg holder earns half again', async ($, on) => {
  answerTools(on)
  const w = await begin($, on, {
    ...emptySave(),
    party: [member('pikachu', { next: [], heldItem: 'lucky-egg' }), member('eevee', { next: [] })],
  })
  await cmd($, 'pokemon', 'party')
  await $.tool.call(bash('git commit -m x') as never)
  await until($, () => w.partyNow()[0]?.xp === 15)
  expect(w.partyNow().map(m => m.xp)).toEqual([15, 10])
})

test('₽ from two sessions adds up', async ($, on) => {
  answerTools(on)
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu', { id: 'p', next: [] })] })
  await cmd($, 'pokemon', 'party')
  w.store.set('xp:other', { at: Date.now(), xp: { p: 10 }, money: 400 })
  await $.tool.call(bash('git commit -m x') as never)
  await cmd($, 'pokemon', 'party')
  expect(await cmd($, 'pokemon', 'bag')).toContain('Bag · ₽3,500')
})

test('time together brings friendship evolutions: Pichu becomes Pikachu after 10 hours', async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('pichu', { togetherMs: FRIENDSHIP_MS - 90_000 })] })
  await until($, () => w.saveNow().party[0]?.next !== undefined)
  expect(await cmd($, 'pokemon', 'party')).toContain('evolves with friendship (♥ 99%, 2m to go)')
  expect(w.saveNow().party[0]?.species).toBe('pichu')
  await w.clock.advance(180_000)
  await until($, () => w.saveNow().party[0]?.species === 'pikachu')
  expect(w.toasts).toEqual(['What? Pichu evolved into Pikachu!'])
  expect(await cmd($, 'pokemon', 'party')).toContain('together 10h')
})

test('Eevee by friendship: Umbreon at night, Espeon by day', async ($, on) => {
  const net: Net = { isOnline: true, list: JSON.stringify(LIST), now: hourAt(23) }
  const w = await begin(
    $,
    on,
    { ...emptySave(), party: [member('eevee', { togetherMs: FRIENDSHIP_MS - 30_000 })] },
    ART,
    undefined,
    net,
  )
  await w.clock.advance(120_000)
  await until($, () => w.saveNow().party[0]?.species === 'umbreon')
})

test('Eevee by day becomes Espeon', async ($, on) => {
  const net: Net = { isOnline: true, list: JSON.stringify(LIST), now: hourAt(12) }
  const w = await begin(
    $,
    on,
    { ...emptySave(), party: [member('eevee', { togetherMs: FRIENDSHIP_MS - 30_000 })] },
    ART,
    undefined,
    net,
  )
  await w.clock.advance(120_000)
  await until($, () => w.saveNow().party[0]?.species === 'espeon')
})

test('only party time counts: none while off, none in the PC box; a Soothe Bell makes it 1.5 times', async ($, on) => {
  const w = await begin($, on, {
    ...emptySave(),
    party: [
      member('pikachu', { id: 'p', next: [] }),
      member('charmander', { id: 's', next: [], heldItem: 'soothe-bell' }),
    ],
    box: [member('eevee', { id: 'b' })],
  })
  await w.clock.advance(60_000)
  const start = w.saveNow().party.map(m => m.togetherMs ?? 0)
  await w.clock.advance(120_000)
  const party = w.saveNow().party
  expect((party[0]?.togetherMs ?? 0) - (start[0] ?? 0)).toBe(120_000)
  expect((party[1]?.togetherMs ?? 0) - (start[1] ?? 0)).toBe(180_000)
  expect(w.saveNow().box?.[0]?.togetherMs).toBeUndefined()
  await cmd($, 'pokemon', 'off')
  const resting = w.saveNow().party[0]?.togetherMs
  await w.clock.advance(300_000)
  expect(w.saveNow().party[0]?.togetherMs).toBe(resting)
  expect(await cmd($, 'pokemon', 'party')).toContain('together 2m')
})
