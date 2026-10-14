import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { FRIENDSHIP_MS } from '../hooks/evolution'
import { martRows } from '../hooks/mart'
import type { MartProps } from '../hooks/mart'
import { buyItem } from '../hooks/register'
import { emptySave, evolveLevel, level, xpForLevel } from '../hooks/save'
import type { Save } from '../hooks/save'
import { BALL, COLORS, DONE, pickFor, WORKING } from '../hooks/spinner'
import {
  answerTools,
  ART,
  bash,
  begin,
  CHAINS,
  cmd,
  end,
  GENDER_RATES,
  hourAt,
  LIST,
  lv,
  member,
  mountBand,
  named,
  until,
} from './world'
import type { Net } from './world'

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

test('party: add up to three, twins too, remove any but the last', async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu')] })
  expect(await cmd($, 'pokemon', 'add eevee')).toContain('Eevee joined your party!')
  expect(await cmd($, 'pokemon', 'add eevee')).toContain('Eevee joined your party!')
  expect(await cmd($, 'pokemon', 'add raichu')).toContain('Your party is full (3)')
  const [lead, , second] = w.saveNow().party
  expect(w.saveNow().party.map(m => m.species)).toEqual(['pikachu', 'eevee', 'eevee'])
  // The first twin in party order goes.
  expect(await cmd($, 'pokemon', 'remove eevee')).toBe('Eevee went back to the wild.')
  expect(w.saveNow().party.map(m => m.id)).toEqual([lead?.id, second?.id])
  expect(await cmd($, 'pokemon', 'add galarian mr mime')).toContain('Mr Mime (Galar) joined your party!')
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
  expect(await cmd($, 'pokemon', 'add')).toMatch(/joined your party!$/)
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
  // No ₽ button while aiming: the whole band is a click layer then.
  expect(JSON.stringify(await aim.drawn())).not.toContain('"shop"')
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
    const isShown = cellOf(w.band.cells, 67, CYAN) !== null
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

test('another surface drawing at the same time leaves the terminal band running; wide bands are clipped to 512, button included; narrow ones have no button', async ($, on) => {
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
  // Too narrow for the scene and the button: the scene alone.
  const narrow = await $.ui.mount({
    plugin: 'pokemon',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 30, bodyColumns: 20 },
  } as never)
  const drawn = JSON.stringify(await narrow.drawn())
  expect(drawn).toContain('"columns":20')
  expect(drawn).not.toContain('"shop"')
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

// Kirlia: Gardevoir at Lv 30, or Gallade with a Dawn Stone, males only.
const psychic = {
  species: named('kirlia'),
  evolves_to: [
    end('gardevoir', [{ trigger: named('level-up'), min_level: 30 }]),
    end('gallade', [{ trigger: named('use-item'), item: named('dawn-stone'), gender: 2 }]),
  ],
}
// A Kirlia given a Dawn Stone while start-up is still looking up its gender: `rate` decides the gender.
async function dawnStoneOnFreshKirlia(
  $: Parameters<typeof begin>[0] & Parameters<typeof cmd>[0],
  on: On,
  rate: number,
) {
  const net: Net = {
    isOnline: true,
    list: JSON.stringify([...LIST, ...['kirlia', 'gardevoir', 'gallade'].map(name => ({ name, forms: ['regular'] }))]),
    chains: { ...CHAINS, kirlia: psychic, gardevoir: psychic, gallade: psychic },
    genderRates: { ...GENDER_RATES, kirlia: rate },
  }
  const w = await begin(
    $,
    on,
    { ...emptySave(), party: [member('pikachu', { next: [], gender: 'male' })], bag: { 'dawn-stone': 1 } },
    ART,
    undefined,
    net,
  )
  await cmd($, 'pokemon', 'party')
  // Its evolution data is slow to come: summoned seconds ago, its gender isn't known yet.
  let open = () => {}
  net.speciesStall = new Promise<void>(resolve => (open = resolve))
  await cmd($, 'pokemon', 'add kirlia')
  expect(w.saveNow().party[1]?.gender).toBeUndefined()
  const given = cmd($, 'pokemon', 'give dawn stone kirlia')
  await w.clock.advance(50)
  net.speciesStall = undefined
  open()
  return { w, text: await given }
}

test('a Dawn Stone given to a Kirlia whose gender is still unknown makes a Gallade only of a male', async ($, on) => {
  const { w, text } = await dawnStoneOnFreshKirlia($, on, 8)
  expect(text).toBe("Kirlia can't use a Dawn Stone.")
  expect(w.saveNow().party[1]).toMatchObject({ species: 'kirlia', gender: 'female' })
  expect(w.saveNow().bag).toEqual({ 'dawn-stone': 1 })
})

test('a Dawn Stone given to a male Kirlia whose gender was still unknown makes a Gallade', async ($, on) => {
  const { w, text } = await dawnStoneOnFreshKirlia($, on, 0)
  expect(text).toBe('Kirlia evolved into Gallade!')
  expect(w.saveNow().party[1]).toMatchObject({ species: 'gallade', gender: 'male' })
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
  // Not the boxed Galarian one: a new plain twin.
  expect(await cmd($, 'pokemon', 'add mr mime')).toContain('Mr Mime joined your party!')
  expect(w.saveNow().party.map(m => `${m.species}:${m.form}`)).toEqual([
    'mr-mime:regular',
    'pikachu:regular',
    'mr-mime:regular',
  ])
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

test('/pokemon add <name> with that Pokémon in the party adds a twin', async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('eevee', { id: 'e1' })] })
  expect(await cmd($, 'pokemon', 'add eevee')).toContain('Eevee joined your party!')
  const party = w.saveNow().party
  expect(party.map(m => m.species)).toEqual(['eevee', 'eevee'])
  expect(party[1]?.id).not.toBe('e1')
  // Until the numbered pick, a name with twins takes the first in party order.
  expect(await cmd($, 'pokemon', 'eevee')).toBe('Eevee leads the party again (Lv 1).')
  expect(w.saveNow().party.map(m => m.id)).toEqual(party.map(m => m.id))
})

// The columns where `color` shows in a frame `columns` cells wide, all rows taken together, as [first, last] runs:
// one run per walker standing apart.
function runsOf(cells: string, columns: number, color: number) {
  const words = new Uint32Array(Uint8Array.from(atob(cells), c => c.charCodeAt(0)).buffer)
  const has = new Set<number>()
  for (let i = 0; i < words.length / 3; i++)
    if (words[i * 3 + 1] === color || words[i * 3 + 2] === color) has.add(i % columns)
  const runs: [number, number][] = []
  for (let x = 0; x < columns; x++) {
    const last = runs[runs.length - 1]
    if (has.has(x) && last && last[1] === x - 1) last[1] = x
    else if (has.has(x)) runs.push([x, x])
  }
  return runs
}
// Two runs of `color` at least `gap` columns apart, in the frame last sent; null otherwise.
function apart(cells: string, columns: number, color: number, gap: number) {
  const runs = cells ? runsOf(cells, columns, color) : []
  const [a, b] = runs
  return runs.length === 2 && a && b && b[0] - a[1] > gap ? runs : null
}

test('twins walk as two: each keeps its own place when the party changes', async ($, on) => {
  const EEVEE = 0x010203
  const PIKACHU = 0x040506
  const net: Net = {
    isOnline: true,
    list: JSON.stringify(LIST),
    now: hourAt(12),
    sprites: { eevee: solid('1;2;3', 6), pikachu: solid('4;5;6', 6) },
  }
  const w = await begin(
    $,
    on,
    { ...emptySave(), party: [member('eevee', { id: 'e1' }), member('eevee', { id: 'e2' })] },
    ART,
    undefined,
    net,
  )
  await cmd($, 'pokemon', 'party')
  await mountBand($)
  await cmd($, 'pokemon-play', 'work')
  // Far enough apart that the tick or two below (at most 0.6 columns each) can't bring them together.
  await seen(w, () => apart(w.band.cells, 80, EEVEE, 6))
  expect(await cmd($, 'pokemon', 'add pikachu')).toContain('Pikachu joined your party!')
  await seen(w, () => (w.band.cells && colorsIn(w.band.cells).has(PIKACHU)) || null)
  // Keyed by species, both would now stand on the first one's spot: one run.
  expect(runsOf(w.band.cells, 80, EEVEE)).toHaveLength(2)
})

test('one twin evolving keeps its place, and the other its own', async ($, on) => {
  answerTools(on)
  const CHARMANDER = 0x010203
  const CHARMELEON = 0x070809
  const net: Net = {
    isOnline: true,
    list: JSON.stringify(LIST),
    now: hourAt(12),
    sprites: { charmander: solid('1;2;3', 6), charmeleon: solid('7;8;9', 6) },
  }
  const ready = { xp: xpForLevel(16) - 5, next: [lv('charmeleon', 16)], gender: 'male' as const }
  const w = await begin(
    $,
    on,
    {
      ...emptySave(),
      party: [
        member('charmander', { id: 'a', ...ready }),
        member('charmander', { id: 'b', ...ready, heldItem: 'everstone' }),
      ],
    },
    ART,
    undefined,
    net,
  )
  await cmd($, 'pokemon', 'party')
  // As wide as a band goes, so a new random place is almost never an old one.
  await $.ui.mount({
    plugin: 'pokemon',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 30, bodyColumns: 512 } as never,
  })
  const before = await seen(w, () => apart(w.band.cells, 512, CHARMANDER, 0))
  // The clock stands still from here to the evolution, and the animation holds everyone still.
  await $.tool.call(bash('git commit -m x') as never)
  await until($, () => w.saveNow().party[0]?.species === 'charmeleon')
  expect(w.saveNow().party.map(m => [m.id, m.species])).toEqual([
    ['a', 'charmeleon'],
    ['b', 'charmander'],
  ])
  const frame = await seen(w, () => (w.band.cells && colorsIn(w.band.cells).has(CHARMELEON) && w.band.cells) || null)
  // Keyed by species, the evolved one would get a new spot and its twin would take its old one.
  const now = [...runsOf(frame, 512, CHARMELEON), ...runsOf(frame, 512, CHARMANDER)]
  expect(now.sort((p, q) => p[0] - q[0])).toEqual(before)
  // Past the animation: both walk on, the new sprite and the old.
  for (let i = 0; i < 12; i++) await w.clock.advance(500)
  const both = await seen(w, () => {
    const colors = w.band.cells ? colorsIn(w.band.cells) : new Set<number>()
    return (colors.has(CHARMELEON) && colors.has(CHARMANDER)) || null
  })
  expect(both).toBe(true)
})

// Another session evolves Charmander; this one adopts that save through `adopt` before its next sync looks.
async function evolvedElsewhere($: Engine, on: On, adopt: () => Promise<unknown>) {
  answerTools(on)
  const CHARMELEON = 0x070809
  const net: Net = {
    isOnline: true,
    list: JSON.stringify(LIST),
    now: hourAt(12),
    sprites: { charmander: solid('1;2;3', 6), charmeleon: solid('7;8;9', 6) },
  }
  const w = await begin(
    $,
    on,
    { ...emptySave(), party: [member('charmander', { id: 'a', gender: 'male', next: [lv('charmeleon', 16)] })] },
    ART,
    undefined,
    net,
  )
  await cmd($, 'pokemon', 'party')
  await mountBand($)
  const [was] = w.saveNow().party
  w.store.set('save', {
    ...w.saveNow(),
    party: [{ ...was!, species: 'charmeleon', evolutions: 1, next: [lv('charizard', 36)] }],
  })
  await adopt()
  let isDrawn = false
  for (let i = 0; i < 60 && !isDrawn; i++) {
    await w.clock.advance(500)
    isDrawn = Boolean(w.band.cells) && colorsIn(w.band.cells).has(CHARMELEON)
  }
  return isDrawn
}

test("another session's evolution is drawn even when XP lands here before the next sync", async ($, on) => {
  expect(await evolvedElsewhere($, on, () => $.tool.call(bash('git commit -m x') as never))).toBe(true)
})

test("another session's evolution is drawn even when a command here writes the save first", async ($, on) => {
  // `size` writes the save without a sync first.
  expect(await evolvedElsewhere($, on, () => cmd($, 'pokemon', 'size small'))).toBe(true)
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
  // Daylight again: the first showing has run out, and the band's phase follows the wall clock, dim after 19:00.
  await cmd($, 'pokemon-play', 'day')
  for (let i = 0; i < 4; i++) await w.clock.advance(500)
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

test('an item name a little off gets a suggestion that keeps the Pokémon; one far off gets the usual help', async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu', { next: [] })] })
  await cmd($, 'pokemon', 'party')
  const before = JSON.stringify(w.saveNow())
  expect(await cmd($, 'pokemon', 'give thunderstone pikachu')).toBe(
    'Did you mean Thunder Stone? Run /pokemon give thunder-stone pikachu',
  )
  expect(await cmd($, 'pokemon', 'give upgrade porygon')).toBe(
    'Did you mean Up-Grade? Run /pokemon give up-grade porygon',
  )
  expect(await cmd($, 'pokemon', 'give fire ston eevee')).toBe(
    'Did you mean Fire Stone? Run /pokemon give fire-stone eevee',
  )
  expect(await cmd($, 'pokemon', 'give banana pikachu')).toBe(
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

test('take reaches a PC box member holding an item when the name is only in the box; the party one comes first', async ($, on) => {
  const w = await begin($, on, {
    ...emptySave(),
    party: [member('pikachu', { next: [], heldItem: 'lucky-egg' })],
    box: [
      member('eevee', { next: [] }),
      member('eevee', { next: [], heldItem: 'soothe-bell' }),
      member('pikachu', { next: [], heldItem: 'metal-coat' }),
      member('charmander', { next: [] }),
    ],
  })
  await cmd($, 'pokemon', 'party')
  expect(await cmd($, 'pokemon', 'bag')).toContain(
    '  Held        Pikachu: Lucky Egg · Eevee (box): Soothe Bell · Pikachu (box): Metal Coat',
  )
  expect(await cmd($, 'pokemon', 'take eevee')).toBe("Eevee's Soothe Bell went back to your Bag.")
  expect(w.saveNow().box?.map(m => m.heldItem)).toEqual([undefined, undefined, 'metal-coat', undefined])
  expect(await cmd($, 'pokemon', 'take pikachu')).toBe("Pikachu's Lucky Egg went back to your Bag.")
  expect(w.saveNow().box?.[2]?.heldItem).toBe('metal-coat')
  expect(await cmd($, 'pokemon', 'take charmander')).toBe("Charmander isn't holding anything.")
  expect(w.saveNow().bag).toEqual({ 'lucky-egg': 1, 'soothe-bell': 1 })
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
  await cmd($, 'pokemon', 'everstone pikachu')
  expect(await cmd($, 'pokemon', 'give lucky-egg pikachu')).toBe(
    'Pikachu is now holding a Lucky Egg. It dropped its everstone and can evolve again.',
  )
  expect(w.saveNow().bag).toBeUndefined()
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

// Time together as earlier sessions left it in its own store key: `ms` by member id, last added at `at`.
const together = (ms: Record<string, number>, at = 0, now?: number): Net => ({
  isOnline: true,
  list: JSON.stringify(LIST),
  ...(now !== undefined ? { now } : {}),
  keys: { together: { at, ms } },
})

test('time together brings friendship evolutions: Pichu becomes Pikachu after 10 hours', async ($, on) => {
  const w = await begin(
    $,
    on,
    { ...emptySave(), party: [member('pichu', { id: 'p' })] },
    ART,
    undefined,
    together({ p: FRIENDSHIP_MS - 90_000 }),
  )
  await until($, () => w.saveNow().party[0]?.next !== undefined)
  expect(await cmd($, 'pokemon', 'party')).toContain('evolves with friendship (♥ 99%, 2m to go)')
  expect(w.saveNow().party[0]?.species).toBe('pichu')
  await w.clock.advance(180_000)
  await until($, () => w.saveNow().party[0]?.species === 'pikachu')
  expect(w.toasts).toEqual(['What? Pichu evolved into Pikachu!'])
  expect(await cmd($, 'pokemon', 'party')).toContain('together 10h')
})

test('Eevee by friendship: Umbreon at night, Espeon by day', async ($, on) => {
  const w = await begin(
    $,
    on,
    { ...emptySave(), party: [member('eevee', { id: 'e' })] },
    ART,
    undefined,
    together({ e: FRIENDSHIP_MS - 30_000 }, 0, hourAt(23)),
  )
  await w.clock.advance(120_000)
  await until($, () => w.saveNow().party[0]?.species === 'umbreon')
})

test('Eevee by day becomes Espeon', async ($, on) => {
  const w = await begin(
    $,
    on,
    { ...emptySave(), party: [member('eevee', { id: 'e' })] },
    ART,
    undefined,
    together({ e: FRIENDSHIP_MS - 30_000 }, 0, hourAt(12)),
  )
  await w.clock.advance(120_000)
  await until($, () => w.saveNow().party[0]?.species === 'espeon')
})

test('only party time counts: none while off, none in the PC box; a Soothe Bell makes it 1.5 times; a long gap counts 2 minutes', async ($, on) => {
  const w = await begin($, on, {
    ...emptySave(),
    party: [
      member('pikachu', { id: 'p', next: [] }),
      member('charmander', { id: 's', next: [], heldItem: 'soothe-bell' }),
    ],
    box: [member('eevee', { id: 'b' })],
  })
  await w.clock.advance(60_000)
  const start = w.togetherNow()
  await w.clock.advance(120_000)
  expect((w.togetherNow().p ?? 0) - (start.p ?? 0)).toBe(120_000)
  expect((w.togetherNow().s ?? 0) - (start.s ?? 0)).toBe(180_000)
  expect(w.togetherNow().b).toBeUndefined()
  await cmd($, 'pokemon', 'off')
  const resting = w.togetherNow().p
  await w.clock.advance(300_000)
  expect(w.togetherNow().p).toBe(resting)
  expect(await cmd($, 'pokemon', 'party')).toContain('together 2m')
  // Back on after five minutes: the first beat adds the cap, not the five minutes.
  await cmd($, 'pokemon', 'on')
  await w.clock.advance(60_000)
  expect(w.togetherNow().p).toBe((resting ?? 0) + 120_000)
})

test("heartbeats never write the save: another session's purchase landing mid-beat survives, and a minute counts once", async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu', { id: 'p', next: [], gender: 'male' })] })
  await cmd($, 'pokemon', 'party')
  // The first beat sets the shared stamp.
  await w.clock.advance(60_000)
  const writes: string[] = []
  let isArmed = false
  w.net.beforeSet = key => {
    writes.push(key)
    // Another session buys a Fire Stone after this session's next beat read the store, before it writes.
    if (isArmed && (key === 'save' || key === 'together')) {
      isArmed = false
      w.store.set('save', { ...w.saveNow(), bag: { 'fire-stone': 1 }, spent: 3000 })
    }
  }
  await w.clock.advance(59_000)
  isArmed = true
  await w.clock.advance(1_000)
  expect(isArmed).toBe(false)
  // Another session's beat, 30 s after this one's: this one's next beat adds only the 30 s since.
  const after = w.store.get('together') as { at: number; ms: Record<string, number> }
  w.store.set('together', { at: after.at + 30_000, ms: { p: (after.ms.p ?? 0) + 30_000 } })
  await w.clock.advance(60_000)
  expect(w.saveNow().bag).toEqual({ 'fire-stone': 1 })
  expect(w.saveNow().spent).toBe(3000)
  expect(writes.filter(k => k === 'save')).toEqual([])
  expect(w.togetherNow().p).toBe(120_000)
  expect(await cmd($, 'pokemon', 'bag')).toContain('Bag · ₽0')
})

test('a member keeps its time together through evolution, deposit and withdraw; a release drops it', async ($, on) => {
  const w = await begin(
    $,
    on,
    {
      ...emptySave(),
      party: [
        member('charmander', { id: 'c', xp: xpForLevel(16) - 1 }),
        member('pikachu', { id: 'p', next: [], gender: 'male' }),
        member('eevee', { id: 'e', next: [], gender: 'male' }),
      ],
      bag: { 'rare-candy': 1 },
    },
    ART,
    undefined,
    together({ c: 5 * 3_600_000, p: 3_600_000, e: 60_000 }),
  )
  expect(await cmd($, 'pokemon', 'give rare candy charmander')).toBe('Charmander grew to Lv 16!')
  await until($, () => w.saveNow().party[0]?.species === 'charmeleon')
  expect(await cmd($, 'pokemon', 'party')).toMatch(/Charmeleon .*together 5h/)
  await cmd($, 'pokemon', 'deposit charmeleon')
  await w.clock.advance(120_000)
  expect(w.togetherNow().c).toBe(5 * 3_600_000)
  expect(await cmd($, 'pokemon', 'box')).toContain('together 5h')
  await cmd($, 'pokemon', 'release eevee')
  await cmd($, 'pokemon', 'add charmeleon')
  expect(await cmd($, 'pokemon', 'party')).toMatch(/Charmeleon .*together 5h/)
  await w.clock.advance(60_000)
  expect(w.togetherNow().e).toBeUndefined()
  expect(w.togetherNow().c).toBe(5 * 3_600_000 + 60_000)
})

test('a save from 1.3.0 betas moves its time together to its own key once, before the save is written', async ($, on) => {
  // As a beta kept it: on each member and the save.
  const beta = {
    ...emptySave(),
    party: [{ ...member('pikachu', { id: 'p' }), togetherMs: 3 * 3_600_000 }],
    box: [{ ...member('eevee', { id: 'b' }), togetherMs: 60_000 }],
    togetherAt: 5,
  }
  const w = await begin($, on, beta as Save)
  await until($, () => w.saveNow().party[0]?.next !== undefined)
  expect(w.store.get('together')).toEqual({ at: 5, ms: { p: 3 * 3_600_000, b: 60_000 } })
  expect(JSON.stringify(w.saveNow())).not.toContain('together')
  expect(await cmd($, 'pokemon', 'party')).toContain('together 3h')
  // A beta window still writing its old fields changes nothing here.
  w.store.set('save', { ...w.saveNow(), party: [{ ...w.saveNow().party[0], togetherMs: 9 * 3_600_000 }] })
  await cmd($, 'pokemon', 'size small')
  expect(w.togetherNow().p).toBe(3 * 3_600_000)
  expect(await cmd($, 'pokemon', 'party')).toContain('together 3h')
})

type Band = {
  pointer: (e: { type: 'down'; x: number; y: number; button: 'left'; in?: string }) => Promise<void>
  key: (e: { key: string; in?: string }) => Promise<void>
  post: (data: unknown, scope?: { in?: string }) => Promise<void>
  drawn: () => Promise<unknown>
  redraw: () => Promise<void>
}
// The props of the `Client` keyed `key` in the band as drawn afresh, or null when it isn't there.
async function clientProps<T>(band: Band, key: string): Promise<T | null> {
  await band.redraw()
  const find = (node: unknown): T | null => {
    if (typeof node !== 'object' || node === null) return null
    const n = node as { type?: string; props?: { key?: string; props?: T } }
    if (n.type === 'Client' && n.props?.key === key) return n.props.props ?? null
    for (const child of Object.values(node)) {
      const found = find(child)
      if (found) return found
    }
    return null
  }
  return find(await band.drawn())
}
const martOf = (band: Band) => clientProps<MartProps>(band, 'mart')
// Clicks the Mart's control for `act`, where the Mart draws it now.
async function clickMart(band: Band, act: unknown) {
  const p = await martOf(band)
  const hit = p && martRows(p).hits.find(h => JSON.stringify(h.act) === JSON.stringify(act))
  if (!hit) throw new Error(`no ${JSON.stringify(act)} in the Mart`)
  await band.pointer({ type: 'down', x: hit.x0, y: hit.y, button: 'left', in: 'mart' })
}
// A wheel tick over the band, as the engine raises it: `by` rows, negative toward the top.
const wheel = ($: { ui: { scroll: (e: never) => Promise<unknown> } }, by: number) =>
  $.ui.scroll({
    component: 'AbovePrompt',
    requestId: 'band',
    offset: 0,
    by,
    bodyRows: 9,
    contentRows: 9,
    origin: { kind: 'person' },
  } as never)

test('the ₽ button opens the PokéMart; Buy takes ₽ and fills the Bag; not enough ₽ changes nothing; x closes it', async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu')] })
  await cmd($, 'pokemon', 'party')
  const band = (await mountBand($)) as Band
  expect(await clientProps(band, 'shop')).toMatchObject({ balance: 3000, plus: 0 })
  expect(await martOf(band)).toBeNull()
  await band.pointer({ type: 'down', x: 3, y: 0, button: 'left', in: 'shop' })
  expect(await martOf(band)).toMatchObject({ balance: 3000, state: { tab: 0, sel: 0, top: 0, qty: 1 } })
  expect((await martOf(band))?.icon?.length).toBeGreaterThan(0)
  await clickMart(band, 'buy')
  expect(w.saveNow().bag).toEqual({ 'fire-stone': 1 })
  expect(w.saveNow().spent).toBe(3000)
  expect(await martOf(band)).toMatchObject({ balance: 0, message: 'Bought a Fire Stone!', isError: false })
  await clickMart(band, 'buy')
  expect(w.saveNow().bag).toEqual({ 'fire-stone': 1 })
  expect(await martOf(band)).toMatchObject({ message: 'Not enough ₽: 3,000 more to go.', isError: true })
  await band.key({ key: 'down', in: 'mart' })
  await band.key({ key: '+', in: 'mart' })
  expect((await martOf(band))?.state).toEqual({ tab: 0, sel: 1, top: 0, qty: 2 })
  await band.key({ key: 'x', in: 'mart' })
  expect(await martOf(band)).toBeNull()
  expect(await clientProps(band, 'shop')).toMatchObject({ balance: 0, plus: 0 })
})

test('a refused buy keeps its quantity; a bought one goes back to ×1; any move clears the message; Max says when one is too dear', async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu')], earned: 3000 })
  await cmd($, 'pokemon', 'party')
  const band = (await mountBand($)) as Band
  await band.pointer({ type: 'down', x: 3, y: 0, button: 'left', in: 'shop' })
  await band.redraw()
  const shown = async () => {
    const p = await martOf(band)
    return { message: p?.message, isError: p?.isError, qty: p?.state.qty, sel: p?.state.sel, tab: p?.state.tab }
  }
  // ₽6,000: three Fire Stones are too many, and the three stay chosen.
  await band.key({ key: '+', in: 'mart' })
  await band.key({ key: '+', in: 'mart' })
  await band.key({ key: 'return', in: 'mart' })
  expect(await shown()).toEqual({ message: 'Not enough ₽: 3,000 more to go.', isError: true, qty: 3, sel: 0, tab: 0 })
  expect(w.saveNow().bag).toBeUndefined()
  // One less: the refusal was about three, so it goes.
  await band.key({ key: '-', in: 'mart' })
  expect(await shown()).toEqual({ message: '', isError: false, qty: 2, sel: 0, tab: 0 })
  await band.key({ key: 'return', in: 'mart' })
  expect(w.saveNow().bag).toEqual({ 'fire-stone': 2 })
  expect(await shown()).toEqual({ message: 'Bought 2 × Fire Stone!', isError: false, qty: 1, sel: 0, tab: 0 })
  // ₽0 left: Max can't buy even one, says so, and stays at ×1.
  await band.key({ key: 'down', in: 'mart' })
  expect(await shown()).toEqual({ message: '', isError: false, qty: 1, sel: 1, tab: 0 })
  await clickMart(band, 'max')
  expect(await shown()).toEqual({
    message: 'Not enough ₽ for one Water Stone: 3,000 more to go.',
    isError: true,
    qty: 1,
    sel: 1,
    tab: 0,
  })
  // A new tab clears it; so does a new item after a refused buy.
  await band.key({ key: 'right', in: 'mart' })
  expect(await shown()).toEqual({ message: '', isError: false, qty: 1, sel: 0, tab: 1 })
  await band.key({ key: 'return', in: 'mart' })
  expect((await shown()).isError).toBe(true)
  await clickMart(band, { pick: 1 })
  expect(await shown()).toEqual({ message: '', isError: false, qty: 1, sel: 1, tab: 1 })
})

// Claude Code raises the wheel over the band only for a band taller than its window, which the Mart never is: it
// leaves any scroll to the band, as with the Mart closed.
test('the Mart leaves a scroll of the band alone: it passes on and the selection stays', async ($, on) => {
  // What the engine does with a scroll the plugin passes on.
  const passed: number[] = []
  on('ui.scroll', async (_$, e) => {
    passed.push((e as unknown as { by: number }).by)
    return {}
  })
  await begin($, on, { ...emptySave(), party: [member('pikachu')] })
  await cmd($, 'pokemon', 'party')
  const band = (await mountBand($)) as Band
  await wheel($ as never, 1)
  await cmd($, 'pokemon', 'mart')
  await wheel($ as never, 1)
  await wheel($ as never, -1)
  expect(passed).toEqual([1, 1, -1])
  expect((await martOf(band))?.state).toEqual({ tab: 0, sel: 0, top: 0, qty: 1 })
})

test('the Mart lists what would evolve your party', async ($, on) => {
  const stone = { species: 'raichu', way: { kind: 'item' as const, item: 'thunder-stone' } }
  await begin($, on, { ...emptySave(), party: [member('pikachu', { next: [stone], gender: 'male' })] })
  await cmd($, 'pokemon', 'party')
  const band = (await mountBand($)) as Band
  await cmd($, 'pokemon', 'mart')
  const p = await martOf(band)
  expect(p?.items.find(i => i.id === 'thunder-stone')?.party).toBe('Pikachu → Raichu')
  expect(p?.items.find(i => i.id === 'fire-stone')?.party).toBeUndefined()
})

test('the Mart counts twins that one item would evolve', async ($, on) => {
  const water = { species: 'vaporeon', way: { kind: 'item' as const, item: 'water-stone' } }
  const fire = { species: 'flareon', way: { kind: 'item' as const, item: 'fire-stone' } }
  await begin($, on, {
    ...emptySave(),
    party: [
      member('eevee', { next: [water, fire], gender: 'male' }),
      member('eevee', { next: [water], gender: 'female' }),
    ],
  })
  await cmd($, 'pokemon', 'party')
  const band = (await mountBand($)) as Band
  await cmd($, 'pokemon', 'mart')
  const p = await martOf(band)
  expect(p?.items.find(i => i.id === 'water-stone')?.party).toBe('Eevee ×2 → Vaporeon')
  expect(p?.items.find(i => i.id === 'fire-stone')?.party).toBe('Eevee → Flareon')
})

test('the Mart takes only its own acts: raw buys of anything, bad picks and tabs change nothing', async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu')] })
  await cmd($, 'pokemon', 'party')
  const band = (await mountBand($)) as Band
  await cmd($, 'pokemon', 'mart')
  await band.redraw()
  for (const data of [
    { buy: { id: 'gimmighoul-coin', qty: 1 } },
    { buy: { id: 'everstone', qty: 1 } },
    { buy: { id: 'fire-stone', qty: 0 } },
    { buy: { id: 'fire-stone', qty: 1000 } },
    { buy: { id: 'fire-stone', qty: 1.5 } },
    { act: 'teleport' },
    { act: { pick: -1 } },
    { act: { pick: 1.5 } },
    { act: { tab: 'Other' } },
    'buy',
  ]) {
    await band.post(data, { in: 'mart' })
    expect(w.saveNow().bag).toBeUndefined()
    expect(w.saveNow().spent).toBeUndefined()
  }
  // `{ act: 'buy' }` with a stray field is still a buy of one Fire Stone: the Mart's own quantity counts.
  await band.post({ act: 'buy', qty: 1000 }, { in: 'mart' })
  expect(w.saveNow().bag).toEqual({ 'fire-stone': 1 })
  expect((await martOf(band))?.state).toEqual({ tab: 0, sel: 0, top: 0, qty: 1 })
})

test('a buy the store refuses says why in the Mart and in a toast, and the Mart stays open', async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu')] })
  await cmd($, 'pokemon', 'party')
  const band = (await mountBand($)) as Band
  await cmd($, 'pokemon', 'mart')
  await band.redraw()
  w.net.isStoreBroken = true
  await clickMart(band, 'buy')
  w.net.isStoreBroken = false
  const said = await martOf(band)
  expect(said).toMatchObject({ message: expect.stringMatching(/^Couldn't do that: ./), isError: true })
  expect(w.toasts).toContain(`Pokémon: ${said?.message.slice("Couldn't do that: ".length)}`)
  expect(w.saveNow().bag).toBeUndefined()
})

test('/pokemon mart opens it in the band and says so without one; /pokemon off closes it', async ($, on) => {
  await begin($, on, { ...emptySave(), party: [member('pikachu')] })
  await cmd($, 'pokemon', 'party')
  expect(await cmd($, 'pokemon', 'mart')).toBe(
    "The PokéMart opens in the Pokémon band above the prompt, and it isn't showing here. No mouse? /pokemon buy <item> [count] works too.",
  )
  const band = (await mountBand($)) as Band
  // Claude Code gives a band the keys only on a click: the reply says to click it.
  expect(await cmd($, 'pokemon', 'mart')).toBe(
    'The PokéMart is open above the prompt. Click it to use the keys: ↑ ↓ choose, ← → change tabs, - + set how many, Enter buys, x closes. No mouse? /pokemon buy <item> [count] works too.',
  )
  expect(await martOf(band)).not.toBeNull()
  await cmd($, 'pokemon', 'off')
  await cmd($, 'pokemon', 'on')
  expect(await martOf(band)).toBeNull()
})

test('a wild Pokémon closes the Mart, and /pokemon mart waits until it has gone', async ($, on) => {
  await begin($, on, { ...emptySave(), party: [member('pikachu')] }, TALL, undefined, throwNet())
  await cmd($, 'pokemon', 'party')
  const band = (await mountBand($)) as Band
  await cmd($, 'pokemon', 'mart')
  expect(await martOf(band)).not.toBeNull()
  expect(await cmd($, 'pokemon-play', 'wild caterpie')).toMatch(/wanders by/)
  expect(await martOf(band)).toBeNull()
  expect(await cmd($, 'pokemon', 'mart')).toBe(
    'A wild Caterpie is out: catch it or let it go first. No mouse? /pokemon buy <item> [count] works too.',
  )
  expect(await martOf(band)).toBeNull()
})

test('no ₽ button and no Mart from the moment a wild Pokémon is out, before it can be aimed at; the button comes back after', async ($, on) => {
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
  const band = (await mountBand($)) as Band & Aim
  await cmd($, 'pokemon-play', 'day')
  expect(await clientProps(band, 'shop')).not.toBeNull()
  // Its catch rate is still loading (up to 20 s offline): it can't be aimed at yet.
  let open = () => {}
  net.speciesStall = new Promise<void>(resolve => (open = resolve))
  await cmd($, 'pokemon-play', 'wild caterpie')
  // A click on the button as last drawn, before the band is drawn again without it.
  await band.post({ open: true }, { in: 'shop' })
  expect(await martOf(band)).toBeNull()
  expect(await clientProps(band, 'shop')).toBeNull()
  // Through the rustle and after: still no button, and still not aimable.
  for (let i = 0; i < 60; i++) await w.clock.advance(50)
  expect(await isAiming(band)).toBe(false)
  expect(await clientProps(band, 'shop')).toBeNull()
  net.speciesStall = undefined
  open()
  const cell = await seenIn(w, band, '#00ffff')
  await band.pointer({ type: 'down', ...cell, button: 'left' })
  await seen(w, () => w.toasts.find(t => t.startsWith('Gotcha')) ?? null)
  let isBack = false
  for (let i = 0; i < 100 && !isBack; i++) {
    await w.clock.advance(50)
    isBack = (await clientProps(band, 'shop')) !== null
  }
  expect(isBack).toBe(true)
})

test('the party turned off in another session closes the Mart: it stays closed when they come back', async ($, on) => {
  engineLines(on)
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu')] })
  await cmd($, 'pokemon', 'party')
  const band = (await mountBand($)) as Band
  await cmd($, 'pokemon', 'mart')
  expect(await martOf(band)).not.toBeNull()
  // Another session turns them off, then on again; this one picks each up at its next sync.
  w.store.set('save', { ...w.saveNow(), isOff: true })
  await w.clock.advance(10_000)
  await band.redraw()
  const { isOff: _, ...back } = w.saveNow()
  w.store.set('save', back)
  await w.clock.advance(10_000)
  expect(await martOf(band)).toBeNull()
  expect(await clientProps(band, 'shop')).not.toBeNull()
})

// The first node of the band as drawn afresh that `is` picks, or null.
async function nodeIn(band: Band, is: (n: Node) => boolean): Promise<Node | null> {
  await band.redraw()
  const find = (node: unknown): Node | null => {
    if (typeof node !== 'object' || node === null) return null
    if (is(node as Node)) return node as Node
    for (const child of Object.values(node)) {
      const found = find(child)
      if (found) return found
    }
    return null
  }
  return find(await band.drawn())
}
type Node = { type?: string; props?: Record<string, unknown> }
const isShop = (n: Node) => n.type === 'Client' && n.props?.key === 'shop'
// A drawn Box laid over the band, holding the ₽ button.
const holdsShop = (n: Node) =>
  n.type === 'Box' && n.props?.position === 'absolute' && JSON.stringify(n).includes('"key":"shop"')

test('earning shows +₽ under the button for a moment, the button a row taller for it', async ($, on) => {
  answerTools(on)
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu')] })
  await cmd($, 'pokemon', 'party')
  const band = (await mountBand($)) as Band
  await $.tool.call(bash('git commit -m x') as never)
  // The ₽ lands in the background: a command waits for it.
  await cmd($, 'pokemon', 'party')
  expect(await clientProps(band, 'shop')).toMatchObject({ balance: 3100, plus: 100 })
  expect((await nodeIn(band, isShop))?.props).toMatchObject({ width: 12, height: 2 })
  await w.clock.advance(1500)
  expect(await clientProps(band, 'shop')).toMatchObject({ balance: 3100, plus: 0 })
  expect((await nodeIn(band, isShop))?.props).toMatchObject({ width: 12, height: 1 })
})

test("the band is one picture, the ₽ button just its label laid over the picture's top-right corner", async ($, on) => {
  await begin($, on, { ...emptySave(), party: [member('pikachu')] })
  await cmd($, 'pokemon', 'party')
  const band = (await mountBand($)) as Band
  // The scene's Raster takes the whole 80 columns, the landscape running on under the button.
  const scene = await nodeIn(band, n => n.type === 'Raster')
  expect(scene?.props).toMatchObject({ key: 'scene', columns: 80 })
  const over = await nodeIn(band, holdsShop)
  expect(over?.props).toMatchObject({ position: 'absolute', top: 0, right: 0 })
  // As big as the wallet's pill and no bigger: ` 🛒 ₽ 3,000 ` is 12 columns.
  expect((await nodeIn(band, isShop))?.props).toMatchObject({ width: 12, height: 1 })
})

test("nobody walks under the ₽ button: every frame's right 13 columns are the landscape alone", async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu')] }, TALL)
  await cmd($, 'pokemon', 'party')
  await mountBand($)
  let frames = 0
  let last = ''
  let isSeen = false
  for (let i = 0; i < 400; i++) {
    await w.clock.advance(50)
    if (!w.band.cells || w.band.cells === last) continue
    last = w.band.cells
    const words = new Uint32Array(Uint8Array.from(atob(w.band.cells), c => c.charCodeAt(0)).buffer)
    const cells = words.length / 3
    expect(cells % 80).toBe(0)
    for (let c = 0; c < cells; c++) {
      const has = words[c * 3 + 1] === 0x090909 || words[c * 3 + 2] === 0x090909
      if (has && c % 80 >= 67) throw new Error(`the party drawn at column ${c % 80}`)
      isSeen ||= has
    }
    frames++
  }
  expect(frames).toBeGreaterThan(50)
  expect(isSeen).toBe(true)
})

test('buyItem refuses what the Mart never sells and any quantity but 1 to 999, before it touches anything', async () => {
  // Any use of the engine fails the test: a refusal reads and writes nothing.
  const untouched = new Proxy(
    {},
    {
      get: (_, key) => {
        throw new Error(`buyItem used $.${String(key)}`)
      },
    },
  ) as never
  const refuse = (id: unknown, qty: unknown) => buyItem(untouched, id, qty)
  for (const id of ['everstone', 'gimmighoul-coin', 'not-an-item', 7, null])
    expect(await refuse(id, 1)).toEqual({ text: "That isn't for sale.", isError: true })
  for (const qty of [0, 1000, 1.5, -1, '2', NaN, null])
    expect(await refuse('fire-stone', qty)).toEqual({ text: "That isn't a quantity you can buy.", isError: true })
})

test('/pokemon buy takes the item first or last, a count, and one by default; ₽ and the Bag follow', async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu')], earned: 20_000 })
  expect(await cmd($, 'pokemon', 'buy rare candy')).toBe('Bought a Rare Candy! ₽18,200 left.')
  expect(await cmd($, 'pokemon', 'buy 3 fire stone')).toBe('Bought 3 × Fire Stone! ₽9,200 left.')
  expect(await cmd($, 'pokemon', 'buy fire-stone 2')).toBe('Bought 2 × Fire Stone! ₽3,200 left.')
  expect(w.saveNow().bag).toEqual({ 'rare-candy': 1, 'fire-stone': 5 })
  expect(await cmd($, 'pokemon', 'bag')).toMatch(/^Bag · ₽3,200\n/)
})

test('/pokemon buy suggests a near miss and asks what when nothing is close', async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu')] })
  expect(await cmd($, 'pokemon', 'buy thunderstone 2')).toBe(
    'Did you mean Thunder Stone? Run /pokemon buy thunder-stone 2',
  )
  expect(await cmd($, 'pokemon', 'buy fire ston')).toBe('Did you mean Fire Stone? Run /pokemon buy fire-stone')
  expect(await cmd($, 'pokemon', 'buy banana')).toBe(
    'Buy what? /pokemon buy <item> [count] · /pokemon buy lists the Mart.',
  )
  expect(await cmd($, 'pokemon', 'buy 2 thunderstone')).toBe(
    'Did you mean Thunder Stone? Run /pokemon buy thunder-stone 2',
  )
  // Only what the Mart sells is suggested: the Everstone is free, not for sale.
  expect(await cmd($, 'pokemon', 'buy evrstone')).toBe(
    'Buy what? /pokemon buy <item> [count] · /pokemon buy lists the Mart.',
  )
  expect(w.saveNow().bag).toBeUndefined()
  expect(w.saveNow().spent).toBeUndefined()
})

test('/pokemon buy with two counts, or a count past 999, buys nothing', async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu')], earned: 20_000 })
  expect(await cmd($, 'pokemon', 'buy 3 fire stone 2')).toBe(
    'Buy what? /pokemon buy <item> [count] · /pokemon buy lists the Mart.',
  )
  expect(await cmd($, 'pokemon', 'buy 1000 rare candy')).toBe("That isn't a quantity you can buy.")
  expect(w.saveNow().bag).toBeUndefined()
  expect(w.saveNow().spent).toBeUndefined()
})

test('/pokemon buy refuses as the Mart does, and changes nothing', async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu')], bag: { 'rare-candy': 998 } })
  await until($, () => w.saveNow().party[0]?.next !== undefined)
  const money = () => ({ bag: w.saveNow().bag, spent: w.saveNow().spent, earned: w.saveNow().earned })
  const before = money()
  expect(await cmd($, 'pokemon', 'buy fire stone 2')).toBe('Not enough ₽: 3,000 more to go.')
  expect(await cmd($, 'pokemon', 'buy everstone')).toBe("That isn't for sale.")
  expect(await cmd($, 'pokemon', 'buy fire stone 0')).toBe("That isn't a quantity you can buy.")
  expect(await cmd($, 'pokemon', 'buy fire stone 1000')).toBe("That isn't a quantity you can buy.")
  expect(await cmd($, 'pokemon', 'buy fire stone 2.5')).toBe("That isn't a quantity you can buy.")
  expect(await cmd($, 'pokemon', 'buy rare candy 2')).toBe('Your Bag has room for 1 more.')
  expect(money()).toEqual(before)
})

test('a full stack of one item refuses a buy of it', async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu')], bag: { 'fire-stone': 999 } })
  await until($, () => w.saveNow().party[0]?.next !== undefined)
  const money = () => ({ bag: w.saveNow().bag, spent: w.saveNow().spent, earned: w.saveNow().earned })
  const before = money()
  expect(await cmd($, 'pokemon', 'buy fire stone')).toBe("Your Bag can't hold more Fire Stone.")
  expect(money()).toEqual(before)
})

test('a bare /pokemon buy lists the Mart by tab with prices and the balance', async ($, on) => {
  await begin($, on, { ...emptySave(), party: [member('pikachu')] })
  const text = await cmd($, 'pokemon', 'buy')
  expect(text.split('\n')[0]).toBe('PokéMart · ₽3,000')
  for (const tab of ['Stones', 'Hold items', 'Special', 'Other']) expect(text).toContain(`  ${tab.padEnd(10)}  `)
  expect(text).toContain('Fire Stone ₽3,000')
  expect(text).toContain('Rare Candy ₽4,800')
  expect(text).not.toContain('Everstone')
})
