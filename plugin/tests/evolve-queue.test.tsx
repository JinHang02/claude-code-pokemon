// Evolutions one at a time, each animation whole, and evolutions while another session changes the party.
import { expect, test } from 'claude-code/testing'

import { emptySave, xpForLevel } from '../hooks/save'
import { ART, begin, cmd, hourAt, LIST, member, mountBand, until } from './world'
import type { Net } from './world'

// The colours in a frame: every cell's foreground and background.
const colorsIn = (cells: string) => {
  const words = new Uint32Array(Uint8Array.from(atob(cells), c => c.charCodeAt(0)).buffer)
  const colors = new Set<number>()
  for (let i = 0; i < words.length; i += 3) {
    colors.add(words[i + 1] ?? 0)
    colors.add(words[i + 2] ?? 0)
  }
  return colors
}
const solid = (rgb: string, size: number) =>
  Array.from({ length: size }, () => `\x1b[38;2;${rgb}m\x1b[48;2;${rgb}m▀\x1b[0m`.repeat(size)).join('\n')
type Band = { drawn: () => Promise<unknown>; redraw: () => Promise<void> }
type Node = { type?: string; props?: Record<string, unknown> }
// The band's scene as drawn afresh.
async function sceneOf(band: Band): Promise<Set<number>> {
  await band.redraw()
  const find = (node: unknown): Node | null => {
    if (typeof node !== 'object' || node === null) return null
    const n = node as Node
    if (n.type === 'Raster' && n.props?.key === 'scene') return n
    for (const child of Object.values(node)) {
      const found = find(child)
      if (found) return found
    }
    return null
  }
  return colorsIn(String(find(await band.drawn())?.props?.cells ?? ''))
}
const WHITE = 0xffffff

test(
  'a second stone given while the first evolution plays waits for it to finish, then plays its own',
  { timeoutMs: 30_000 },
  async ($, on) => {
    const VAPOREON = 0x070809
    const net: Net = {
      isOnline: true,
      list: JSON.stringify(LIST),
      now: hourAt(12),
      sprites: { eevee: solid('1;2;3', 6), vaporeon: solid('7;8;9', 6) },
    }
    const w = await begin(
      $,
      on,
      {
        ...emptySave(),
        party: [member('eevee', { id: 'e1', gender: 'male' }), member('eevee', { id: 'e2', gender: 'female' })],
        bag: { 'water-stone': 2 },
      },
      ART,
      undefined,
      net,
    )
    await until($, () => w.saveNow().party.every(m => m.next !== undefined))
    const band = (await mountBand($)) as Band
    await w.clock.advance(500)
    expect(await cmd($, 'pokemon', 'give water stone eevee 1')).toBe('Eevee evolved into Vaporeon!')
    await w.clock.advance(1000)
    let said = ''
    const second = cmd($, 'pokemon', 'give water stone eevee').then(text => (said = text))
    // 1.2 to 3 s into the first animation: a white silhouette, never the new colours yet.
    const shown: boolean[] = []
    for (let i = 0; i < 10; i++) {
      await w.clock.advance(200)
      shown.push((await sceneOf(band)).has(VAPOREON))
    }
    expect(shown).toEqual(Array(10).fill(false))
    expect(said).toBe('')
    for (let i = 0; i < 100 && !said; i++) await w.clock.advance(100)
    await second
    expect(said).toBe('Eevee evolved into Vaporeon!')
    // The second one has its own whole animation: a white silhouette, then both stand as Vaporeon.
    await w.clock.advance(1500)
    expect((await sceneOf(band)).has(WHITE)).toBe(true)
    for (let i = 0; i < 10; i++) await w.clock.advance(500)
    expect(w.saveNow().party.map(m => [m.id, m.species])).toEqual([
      ['e1', 'vaporeon'],
      ['e2', 'vaporeon'],
    ])
    expect(w.saveNow().bag).toBeUndefined()
    expect(w.toasts).toEqual(['What? Eevee evolved into Vaporeon!', 'What? Eevee evolved into Vaporeon!'])
  },
)

test(
  "another session's release while a sprite downloads: one walker per Pokémon, and the evolution starts from its own picture",
  { timeoutMs: 30_000 },
  async ($, on) => {
    // The party lists as published for drawing.
    const published: string[][] = []
    const held = new Map<string, { value: unknown; version: number }>()
    on('state.get', async (_$, e) => ({ value: held.get(e.key) ?? { value: undefined, version: 0 } }))
    on('state.set', async (_$, e) => {
      const version = (held.get(e.key)?.version ?? 0) + 1
      held.set(e.key, { value: e.value, version })
      if (Array.isArray(e.value)) published.push((e.value as { key: string }[]).map(m => m.key))
      return { value: { isSet: true, version } }
    })
    const CHARMANDER = 0x010203
    const CHARMELEON = 0x070809
    let go = () => {}
    const net: Net = {
      isOnline: true,
      list: JSON.stringify(LIST),
      now: hourAt(12),
      sprites: {
        charmander: solid('1;2;3', 6),
        charmeleon: solid('7;8;9', 6),
        eevee: solid('10;11;12', 6),
        caterpie: solid('0;255;255', 6),
        pikachu: solid('4;5;6', 6),
      },
    }
    const plain = { next: [], gender: 'male' as const }
    const w = await begin(
      $,
      on,
      {
        ...emptySave(),
        party: [
          member('pikachu', { id: 'm', ...plain }),
          member('charmander', { id: 'c', xp: xpForLevel(16), gender: 'male', heldItem: 'everstone' }),
          member('eevee', { id: 'e', ...plain }),
        ],
      },
      undefined,
      // Charmeleon's sprite already in the download cache: only the Caterpie's waits.
      new Map([['/home/ash/.cache/claude-code-pokemon/sprites/regular/charmeleon', solid('7;8;9', 6)]]),
      net,
    )
    await until($, () => w.saveNow().party[1]?.next !== undefined)
    const band = (await $.ui.mount({
      plugin: 'pokemon',
      surface: 'terminal',
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 30, bodyColumns: 512 } as never,
    })) as Band
    await w.clock.advance(500)
    // Another session releases Pikachu and catches a Caterpie, whose sprite this session must still download.
    net.stall = new Promise<void>(r => (go = r))
    const s = w.saveNow()
    w.store.set('save', { ...s, party: [s.party[1], s.party[2], member('caterpie', { id: 'k', ...plain })] })
    const from = published.length
    expect(await cmd($, 'pokemon', 'take charmander')).toBe('Charmander dropped its everstone and can evolve again.')
    // The animation's first frames show the old form in colour: Charmander's, not the released Pikachu's.
    let isOwn = false
    for (let i = 0; i < 6 && !isOwn; i++) {
      await w.clock.advance(50)
      isOwn = (await sceneOf(band)).has(CHARMANDER)
    }
    expect(isOwn).toBe(true)
    for (let i = 0; i < 10; i++) await w.clock.advance(100)
    expect(w.saveNow().party[0]?.species).toBe('charmeleon')
    delete net.stall
    go()
    for (let i = 0; i < 20; i++) await w.clock.advance(100)
    expect(published.length).toBeGreaterThan(from)
    for (const list of published.slice(from)) expect(new Set(list).size).toBe(list.length)
    expect(published.at(-1)).toEqual(['c', 'e', 'k'])
    for (let i = 0; i < 10; i++) await w.clock.advance(500)
    expect((await sceneOf(band)).has(CHARMELEON)).toBe(true)
  },
)

test("a stone given to a Pokémon another session just released says it's gone, and keeps the stone", async ($, on) => {
  let go = () => {}
  const net: Net = { isOnline: true, list: JSON.stringify(LIST) }
  const plain = { next: [], gender: 'male' as const }
  const w = await begin(
    $,
    on,
    {
      ...emptySave(),
      party: [member('pikachu', { id: 'p', ...plain }), member('eevee', { id: 'e', ...plain })],
      bag: { 'water-stone': 1 },
    },
    undefined,
    undefined,
    net,
  )
  await cmd($, 'pokemon', 'party')
  net.stall = new Promise<void>(r => (go = r))
  const pending = cmd($, 'pokemon', 'give water stone eevee')
  for (let i = 0; i < 20; i++) await w.clock.advance(10)
  const s = w.saveNow()
  w.store.set('save', { ...s, party: s.party.filter(m => m.id !== 'e') })
  delete net.stall
  go()
  expect(await pending).toBe('Eevee is no longer in your party. Your Water Stone is still in your Bag.')
  expect(w.saveNow().party.map(m => m.id)).toEqual(['p'])
  expect(w.saveNow().bag).toEqual({ 'water-stone': 1 })
  expect(w.toasts).toEqual([])
})

test('a stone waiting its turn behind another evolution, for a Pokémon released meanwhile, keeps the stone', async ($, on) => {
  const w = await begin($, on, {
    ...emptySave(),
    party: [member('eevee', { id: 'e1', gender: 'male' }), member('eevee', { id: 'e2', gender: 'female' })],
    bag: { 'water-stone': 2 },
  })
  await until($, () => w.saveNow().party.every(m => m.next !== undefined))
  await mountBand($)
  await w.clock.advance(500)
  expect(await cmd($, 'pokemon', 'give water stone eevee 1')).toBe('Eevee evolved into Vaporeon!')
  let said = ''
  const waiting = cmd($, 'pokemon', 'give water stone eevee').then(text => (said = text))
  await w.clock.advance(500)
  expect(await cmd($, 'pokemon', 'release eevee')).toBe('Bye bye, Eevee (Lv 1, party)! It went back to the wild.')
  for (let i = 0; i < 100 && !said; i++) await w.clock.advance(100)
  await waiting
  expect(said).toBe('Eevee is no longer in your party. Your Water Stone is still in your Bag.')
  expect(w.saveNow().party.map(m => [m.id, m.species])).toEqual([['e1', 'vaporeon']])
  expect(w.saveNow().bag).toEqual({ 'water-stone': 1 })
})
