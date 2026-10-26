import { expect, test } from 'claude-code/testing'

import { ALL_HELP, COMMANDS, suggest } from '../hooks/commands'
import type { Owned } from '../hooks/commands'
import { emptySave, formatDex, level, xpForLevel } from '../hooks/save'
import type { Save } from '../hooks/save'
import { begin, cmd, KIT, LIST, member } from './world'

// Two Eevee (the lead and one in the PC box), a Pikachu, and a Pokédex that has caught Eevee.
const saved = (): Save => ({
  ...emptySave(),
  party: [member('eevee', { xp: xpForLevel(12) }), member('pikachu')],
  box: [member('eevee', { xp: xpForLevel(3) })],
  dex: { eevee: { seen: 2, shiny: 0, first: 0, caught: 1 }, pikachu: { seen: 1, shiny: 0, first: 0 } },
})

// A command's answer for a terminal `columns` wide.
const sized = async ($: Parameters<typeof cmd>[0], args: string, columns: number) =>
  (await $.command.run({ command: 'pokedex', args, presentation: { columns } } as never)).text ?? ''

test('/pokedex <name>: its number, types, Pokédex counts, evolutions, forms and yours', KIT, async ($, on) => {
  await begin($, on, saved())
  expect(await cmd($, 'pokedex', 'eevee')).toBe(
    [
      '#3 Eevee · Normal · common · caught ✓ (2 seen, 1 caught, 0 shiny)',
      'Evolves into: Vaporeon (Water Stone) · Espeon (friendship, by day) · Umbreon (friendship, at night)',
      'Forms: none',
      'You have: Eevee Lv 12 (lead) · Eevee Lv 3 (PC box #1)',
    ].join('\n'),
  )
  // Seen, not caught; what it evolves from, read off the same chain; a final stage.
  expect(await cmd($, 'pokedex', 'raichu')).toBe(
    [
      '#2 Raichu · Electric · common · not seen yet',
      'Evolves from: Pikachu (Lv 30)',
      'Evolves into: none, final form',
      'Forms: none',
      'You have: none',
    ].join('\n'),
  )
  const pikachu = await cmd($, 'pokedex', 'PIKACHU')
  expect(pikachu).toContain('#1 Pikachu · Electric · common · not caught yet (1 seen, 0 caught, 0 shiny)')
  expect(pikachu).toContain('Evolves into: Raichu (Lv 30)')
  expect(pikachu).toContain('You have: Pikachu Lv 1 (party)')
  // An unseen legendary that doesn't evolve.
  const mewtwo = await cmd($, 'pokedex', 'mewtwo')
  expect(mewtwo).toContain('#32 Mewtwo · Psychic · legendary · not seen yet')
  expect(mewtwo).toContain('Evolves into: none\n')
})

test('/pokedex reads names as /pokemon does: misspelt, a form, shiny', KIT, async ($, on) => {
  await begin($, on, saved())
  expect(await cmd($, 'pokedex', 'pikachuu')).toBe('Did you mean Pikachu? Run /pokedex pikachu')
  expect(await cmd($, 'pokedex', 'xyzzyq')).toBe('No Pokémon called "xyzzyq".')
  // A form shows its own types, and the species' forms.
  const rattata = await cmd($, 'pokedex', 'alolan rattata')
  expect(rattata).toMatch(/^#31 Rattata \(Alola\) · Dark\/Normal · common · not seen yet\n/)
  expect(rattata).toContain('Forms: Alola')
  expect(await cmd($, 'pokedex', 'mr mime galarian')).toMatch(/^#5 Mr\. Mime \(Galar\) · Ice\/Psychic · /)
  expect(await cmd($, 'pokedex', 'shiny eevee')).toMatch(/^#3 Eevee · /)
  // Full-width letters, as from a Japanese keyboard.
  expect(await cmd($, 'pokedex', 'ｅｅｖｅｅ')).toMatch(/^#3 Eevee · /)
})

test('/pokedex <name> offline: the rest of the entry, and evolutions need a connection', KIT, async ($, on) => {
  const w = await begin($, on, saved())
  // Online first, so the session has its species list; Charmander's evolutions were never downloaded.
  expect(await cmd($, 'pokedex', 'eevee')).toContain('Vaporeon')
  w.net.isOnline = false
  // Eevee's are cached.
  expect(await cmd($, 'pokedex', 'eevee')).toContain('Evolves into: Vaporeon (Water Stone)')
  const entry = await cmd($, 'pokedex', 'charmander')
  expect(entry).toBe(
    [
      '#7 Charmander · Fire · common · not seen yet',
      'Evolution info needs a connection.',
      'Forms: none',
      'You have: none',
    ].join('\n'),
  )
})

test('/pokedex <name> names six of yours, counts the rest, and fits a narrow terminal', KIT, async ($, on) => {
  await begin($, on, {
    ...saved(),
    box: Array.from({ length: 8 }, (_, i) => member('eevee', { xp: xpForLevel(i + 2) })),
  })
  const wide = await cmd($, 'pokedex', 'eevee')
  expect(wide).toContain(
    'You have: Eevee Lv 12 (lead) · Eevee Lv 2 (PC box #1) · Eevee Lv 3 (PC box #2) · Eevee Lv 4 (PC box #3) · ' +
      'Eevee Lv 5 (PC box #4) · Eevee Lv 6 (PC box #5) · … and 3 more',
  )
  for (const columns of [40, 60, 80]) {
    const text = await sized($, 'eevee', columns)
    // Claude Code indents a reply 5 columns.
    expect([columns, text.split('\n').filter(l => [...l].length > columns - 5)]).toEqual([columns, []])
    // No line Markdown would read as a heading or a numbered list.
    expect(text.split('\n').filter(l => /^\s*(#+ |\d+\. )/.test(l))).toEqual([])
    expect(text).toContain('… and 3 more')
    expect(text).toContain('Umbreon (friendship, at night)')
  }
  expect((await sized($, 'eevee', 40)).split('\n').slice(0, 5)).toEqual([
    '#3 Eevee · Normal · common',
    'caught ✓ (2 seen, 1 caught, 0',
    'shiny)',
    'Evolves into:',
    '  Vaporeon (Water Stone)',
  ])
})

test('bare /pokedex keeps the whole Pokédex and the party', KIT, async ($, on) => {
  const w = await begin($, on, saved())
  const all = await cmd($, 'pokedex')
  const [dex, party] = all.split('\n\n')
  expect(dex).toBe(
    formatDex(
      w.saveNow(),
      LIST.map(s => s.name),
    ),
  )
  expect(party).toMatch(/^Your party:\n {2}Lead {2}Eevee {4}Lv 12 /)
  expect(await cmd($, 'pokedex', '   ')).toBe(all)
  expect(await cmd($, 'pokedex', 'shiny')).toBe(all)
})

const owned = (dex: Save['dex'] = {}): Owned => ({
  party: [member('pikachu')],
  bag: {},
  dex,
  levelOf: m => level(m.xp),
})
const rows = (text: string, o = owned()) => {
  const start = /\S*$/.exec(text)?.index ?? text.length
  return suggest(text, text.length, text.slice(start), start, o)
}

test('/pokedex previews species names from two letters, with what your Pokédex has', () => {
  expect(rows('/pokedex c')).toEqual([])
  expect(rows('/pokedex')).toEqual([])
  expect(rows('/pokedex ch', owned({ charmander: { seen: 3, shiny: 0, first: 0, caught: 1 } })).slice(0, 3)).toEqual([
    { text: 'charmander', description: '#4 Charmander · Fire · caught ✓' },
    { text: 'charmeleon', description: '#5 Charmeleon · Fire · not seen yet' },
    { text: 'charizard', description: '#6 Charizard · Fire/Flying · not seen yet' },
  ])
  // Yours too: a Pokédex entry is for any species.
  expect(rows('/pokedex pika', owned({ pikachu: { seen: 1, shiny: 0, first: 0 } }))).toEqual([
    { text: 'pikachu', description: '#25 Pikachu · Electric · seen' },
  ])
  // A name in several words: the row writes the rest of it.
  expect(rows('/pokedex tapu k')).toEqual([
    { text: 'koko', label: 'tapu-koko', description: '#785 Tapu Koko · Electric/Fairy · not seen yet' },
  ])
  expect(rows('/pokedex mr').map(r => r.text)).toEqual(['mr mime', 'mr rime'])
  expect(rows('/pokemon-play wild ch').length).toBeGreaterThan(0)
})

test("/pokedex's own lines say it takes a name", () => {
  expect(COMMANDS.dex.argumentHint).toBe('[name]')
  expect(COMMANDS.dex.description.length).toBeLessThan(90)
  expect(ALL_HELP).toContain('/pokedex <name>')
})
