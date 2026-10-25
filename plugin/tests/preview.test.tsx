import { expect, test } from 'claude-code/testing'

import { LANDSCAPES } from '../hooks/backdrop'
import { ALL_HELP, COMMANDS, MAX_ROWS, PLAY, POKEMON, suggest } from '../hooks/commands'
import type { Owned } from '../hooks/commands'
import { emptySave, level } from '../hooks/save'
import { begin, cmd, KIT, member } from './world'

const owned = (extra: Partial<Owned> = {}): Owned => ({
  party: [member('pikachu', { id: 'p', xp: 400 }), member('eevee', { id: 'e', heldItem: 'lucky-egg' })],
  box: [member('charmander', { id: 'c' })],
  bag: { 'fire-stone': 2, 'thunder-stone': 1 },
  levelOf: m => level(m.xp),
  ...extra,
})
// The rows for a draft typed up to its end, the token being its last word.
const rows = (text: string, o = owned()) => {
  const start = /\S*$/.exec(text)?.index ?? text.length
  return suggest(text, text.length, text.slice(start), start, o)
}
const texts = (text: string, o?: Owned) => rows(text, o).map(r => r.text)

test("every command's typeahead line is one short line, with a hint for its words", () => {
  for (const c of Object.values(COMMANDS)) expect([c.name, c.description.length < 90]).toEqual([c.name, true])
  expect(COMMANDS.pokemon.argumentHint).toContain('name')
  expect(COMMANDS.play.argumentHint).toContain('animation')
  expect(COMMANDS.help.name).toBe('pokemon-help')
})

test(
  '/pokemon-help lists every command and every word they take, narrow enough for a small terminal',
  KIT,
  async ($, on) => {
    await begin($, on, { ...emptySave(), party: [member('pikachu', { id: 'p' })] })
    const help = await cmd($, 'pokemon-help')
    expect(help).toBe(ALL_HELP)
    for (const s of POKEMON.filter(s => s.word && s.word !== 'off' && s.word !== 'remove'))
      expect([s.usage, help.includes(s.usage)]).toEqual([s.usage, true])
    for (const word of [...PLAY.map(s => s.word), ...LANDSCAPES])
      expect([word, help.includes(word)]).toEqual([word, true])
    for (const c of ['/pokemon …', '/pokemon-play …', '/pokedex', '/pokemon-help'])
      expect([c, help.includes(c)]).toEqual([c, true])
    expect(help.split('\n').filter(l => [...l].length > 60)).toEqual([])
  },
)

test('on the command itself, every word it takes, written after it', () => {
  const all = rows('/pokemon')
  // Each row shows how it's used, narrow enough for the typeahead's column, and writes the command with its word.
  expect(all.find(r => r.label === 'give <item> <name>')?.text).toBe('/pokemon give ')
  expect(all.find(r => r.label === 'party')?.text).toBe('/pokemon party')
  expect(all.map(r => r.label)).toEqual(
    expect.arrayContaining(['evolve <name> [n]', 'evolve manual, auto', 'on', 'off']),
  )
  expect(all.map(r => r.label)).not.toContain('on, off')
  expect(rows('/pokemon-play').map(r => r.text)).toContain('/pokemon-play dusk ')
  // A prefix of a command is the engine's own list.
  expect(rows('/poke')).toEqual([])
})

test('the first word previews the sub-commands it starts, and the Pokémon it could make lead', () => {
  expect(rows('/pokemon g')).toEqual([
    { text: 'give ', label: 'give <item> <name>', description: 'evolve, level up or hold' },
  ])
  expect(rows('/pokemon e').map(r => r.label)).toEqual([
    'everstone <name>',
    'evolve <name> [n]',
    'evolve manual, auto',
    'evolution <style>',
    'eevee',
  ])
  const eevee = rows('/pokemon ee').find(r => r.text === 'eevee')
  expect(eevee?.description).toBe('Eevee · Lv 1 · party · holds Lucky Egg · make it lead')
  // A species you don't have yet, once two letters say which.
  expect(rows('/pokemon bulb')).toContainEqual({ text: 'bulbasaur', description: 'catch Bulbasaur as your lead' })
  expect(rows('/pokemon add bulb')).toContainEqual({ text: 'bulbasaur', description: 'catch Bulbasaur' })
  expect(rows('/pokemon-play wild bulb')).toContainEqual({
    text: 'bulbasaur',
    description: 'a wild Bulbasaur wanders by',
  })
  expect(texts('/pokemon b')).not.toContain('bulbasaur')
})

test('give previews the Bag first, then the Mart, then the party', () => {
  const items = rows('/pokemon give ')
  expect(items.length).toBeLessThanOrEqual(MAX_ROWS)
  expect(rows('/pokemon give fi')[0]).toEqual({
    text: 'fire-stone ',
    label: 'fire-stone',
    description: 'Fire Stone ×2 in your Bag · then <name>',
  })
  expect(rows('/pokemon give wa')[0]?.description).toBe('Water Stone · none in your Bag: /pokemon buy water-stone')
  // An item typed in words: the row finishes the name.
  expect(texts('/pokemon give thunder st')).toEqual(['stone '])
  expect(texts('/pokemon give fire-stone ')).toEqual(['pikachu', 'eevee'])
  expect(texts('/pokemon give thunder stone p')).toEqual(['pikachu'])
})

test('each word that names one of yours previews the right ones', () => {
  expect(texts('/pokemon deposit ')).toEqual(['pikachu', 'eevee'])
  expect(texts('/pokemon release ')).toEqual(['pikachu', 'eevee', 'charmander'])
  expect(texts('/pokemon box ')).toEqual(['charmander'])
  expect(rows('/pokemon box c')[0]?.description).toBe('Charmander · Lv 1 · PC box')
  expect(texts('/pokemon evolve ')).toEqual(['pikachu', 'eevee', 'manual', 'auto'])
  expect(texts('/pokemon size ')).toEqual(['small', 'normal', 'auto'])
  expect(texts('/pokemon evolution g')).toEqual(['gradient'])
  expect(texts('/pokemon buy rare')).toEqual(['rare-candy '])
  // A form is written as the commands read it.
  expect(texts('/pokemon add ', owned({ party: [member('typhlosion', { form: 'hisui' })], box: [] }))).toEqual([])
  expect(texts('/pokemon take ', owned({ party: [member('typhlosion', { form: 'hisui' })], box: [] }))).toEqual([
    'typhlosion hisui',
  ])
})

test('/pokemon-play previews its scenes, then the other half of a scene', () => {
  expect(texts('/pokemon-play d')).toEqual(['day ', 'dusk ', 'dawn '])
  expect(texts('/pokemon-play dusk ')).toEqual(LANDSCAPES)
  expect(texts('/pokemon-play lake n')).toEqual(['night'])
  expect(texts('/pokemon-play evolve ')).toEqual(['rays', 'white', 'gradient'])
  expect(texts('/pokemon-play hop ')).toEqual([])
  expect(texts('/pokemon-play dusk lake ')).toEqual([])
})

test('nothing for other prompts, other commands, or a command not at the start', () => {
  expect(rows('/pokedex')).toEqual([])
  expect(rows('/pokemonx g')).toEqual([])
  expect(rows('tell me about /pokemon g')).toEqual([])
  expect(rows('give ')).toEqual([])
})
