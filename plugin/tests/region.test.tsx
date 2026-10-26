// /pokemon region: the region whose forms a Pokémon takes when it evolves with no form named.
import { expect, test } from 'claude-code/testing'

import { ALL_HELP, POKEMON_HELP, suggest } from '../hooks/commands'
import { chooseStage } from '../hooks/evolution'
import { readRegion, regionPool } from '../hooks/region'
import { emptySave, level, loadSave, xpForLevel } from '../hooks/save'
import type { Save } from '../hooks/save'
import { CHAIN_OF, CHAINS } from './fixtures/evolutions'
import { answerTools, bash, begin, cmd, KIT, member, until } from './world'

const chainsOf = (...species: string[]) => Object.fromEntries(species.map(s => [s, CHAINS[CHAIN_OF[s] ?? -1]]))
const netFor = (list: { name: string; forms: string[] }[], ...species: string[]) => ({
  isOnline: true,
  list: JSON.stringify(list),
  chains: chainsOf(...species),
})
const PIKACHU = [
  { name: 'pikachu', forms: ['regular'] },
  { name: 'raichu', forms: ['regular', 'alola'] },
]
// Ids whose roll lands on each of two branches: the region decides, whichever the id would roll.
const ROLLS = ['a', 'b'].map(want => {
  for (let i = 0; ; i++) if (chooseStage(`x${i}`, ['a', 'b']) === want) return `x${i}`
})

test('/pokemon region shows, sets, resets and guesses near misses, saved in the save', KIT, async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu', { id: 'p', next: [] })] })
  const shown = await cmd($, 'pokemon', 'region')
  expect(shown).toContain('Region: kanto.')
  expect(shown).toContain('kanto: ')
  expect(shown).toContain('(current)')
  for (const r of ['alola', 'galar', 'hisui', 'paldea']) expect(shown).toContain(`${r}: `)
  expect(await cmd($, 'pokemon', 'region alola')).toContain('Alolan form')
  expect(w.saveNow().region).toBe('alola')
  expect(await cmd($, 'pokemon', 'region')).toContain('alola: Alolan forms (Raichu, Exeggutor, Marowak) (current)')
  // A near miss changes nothing.
  expect(await cmd($, 'pokemon', 'region alolla')).toMatch(/^Did you mean alola\?/)
  expect(await cmd($, 'pokemon', 'region johto')).not.toContain('Did you mean')
  expect(w.saveNow().region).toBe('alola')
  // The adjective works as well.
  await cmd($, 'pokemon', 'region Galarian')
  expect(w.saveNow().region).toBe('galar')
  expect(await cmd($, 'pokemon', 'region kanto')).toContain('own form')
  expect(w.saveNow().region).toBeUndefined()
  expect('region' in (w.store.get('save') as object)).toBe(false)
  await cmd($, 'pokemon', 'region hisui')
  await cmd($, 'pokemon', 'region off')
  expect(w.saveNow().region).toBeUndefined()
})

test('the region is read back from the save another session wrote', KIT, async ($, on) => {
  const saved = { ...emptySave(), region: 'galar', party: [member('pikachu', { id: 'p', next: [] })] } as Save
  await begin($, on, saved)
  expect(await cmd($, 'pokemon', 'region')).toContain('Region: galar.')
})

test('the save keeps a known region and drops anything else', () => {
  expect(loadSave({ ...emptySave(), region: 'hisui' }).region).toBe('hisui')
  expect(loadSave({ ...emptySave(), region: 'johto' }).region).toBeUndefined()
  expect(loadSave({ ...emptySave(), region: 7 }).region).toBeUndefined()
  expect(readRegion('alolan')).toBe('alola')
  expect(readRegion('none')).toBeNull()
  expect(readRegion('kalos')).toBeUndefined()
})

test('the pool: the region, else the own form, else what is left; looks untouched', () => {
  const formOf = (s: string) => s
  expect(regionPool(['regular', 'alola'], formOf, 'regular', 'alola')).toEqual(['alola'])
  expect(regionPool(['regular', 'alola'], formOf, 'regular')).toEqual(['regular'])
  expect(regionPool(['regular', 'alola'], formOf, 'regular', 'galar')).toEqual(['regular'])
  expect(regionPool(['alola'], formOf, 'regular')).toEqual(['alola'])
  expect(regionPool(['galar-zen', 'regular'], formOf, 'regular', 'galar')).toEqual(['galar-zen'])
  expect(regionPool(['fancy', 'meadow'], formOf, 'regular', 'alola')).toEqual(['fancy', 'meadow'])
})

for (const id of ROLLS)
  test(`with region alola a Thunder Stone makes a Pikachu an Alolan Raichu (id ${id})`, KIT, async ($, on) => {
    const saved = { ...emptySave(), region: 'alola', bag: { 'thunder-stone': 1 }, party: [member('pikachu', { id })] }
    const w = await begin($, on, saved as Save, undefined, undefined, netFor(PIKACHU, 'pikachu', 'raichu'))
    await cmd($, 'pokemon', 'give thunder-stone pikachu')
    await until($, () => w.saveNow().party[0]?.species === 'raichu')
    expect(w.saveNow().party[0]?.form).toBe('alola')
  })

test('a branch named beats the region: region alola, give … pikachu raichu is a Kanto Raichu', KIT, async ($, on) => {
  const saved = {
    ...emptySave(),
    region: 'alola',
    bag: { 'thunder-stone': 1 },
    party: [member('pikachu', { id: ROLLS[1] })],
  }
  const w = await begin($, on, saved as Save, undefined, undefined, netFor(PIKACHU, 'pikachu', 'raichu'))
  await cmd($, 'pokemon', 'give thunder-stone pikachu raichu')
  await until($, () => w.saveNow().party[0]?.species === 'raichu')
  expect(w.saveNow().party[0]?.form).toBe('regular')
})

test('with region alola a Leaf Stone makes an Exeggcute an Alolan Exeggutor', KIT, async ($, on) => {
  const list = [
    { name: 'exeggcute', forms: ['regular'] },
    { name: 'exeggutor', forms: ['regular', 'alola'] },
  ]
  const saved = { ...emptySave(), region: 'alola', bag: { 'leaf-stone': 1 }, party: [member('exeggcute', { id: 'e' })] }
  const w = await begin($, on, saved as Save, undefined, undefined, netFor(list, 'exeggcute', 'exeggutor'))
  await cmd($, 'pokemon', 'give leaf-stone exeggcute')
  await until($, () => w.saveNow().party[0]?.species === 'exeggutor')
  expect(w.saveNow().party[0]?.form).toBe('alola')
})

for (const id of ROLLS)
  test(
    `with region galar a Koffing evolving by itself at Lv 35 is a Galarian Weezing (id ${id})`,
    KIT,
    async ($, on) => {
      answerTools(on)
      const list = [
        { name: 'koffing', forms: ['regular'] },
        { name: 'weezing', forms: ['regular', 'galar'] },
      ]
      const koffing = member('koffing', { id, xp: xpForLevel(35) - 5 })
      const saved = { ...emptySave(), region: 'galar', evolution: 'auto', party: [koffing] }
      const w = await begin($, on, saved as Save, undefined, undefined, netFor(list, 'koffing', 'weezing'))
      await until($, () => w.saveNow().party[0]?.next !== undefined)
      expect(level(w.saveNow().party[0]?.xp ?? 0)).toBe(34)
      await $.tool.call(bash('git commit -m x') as never)
      await until($, () => w.saveNow().party[0]?.species === 'weezing')
      expect(w.saveNow().party[0]?.form).toBe('galar')
    },
  )

test('with region hisui, /pokemon evolve quilava takes the Hisuian Typhlosion without asking', KIT, async ($, on) => {
  const list = [
    { name: 'quilava', forms: ['regular'] },
    { name: 'typhlosion', forms: ['regular', 'hisui'] },
  ]
  const saved = { ...emptySave(), region: 'hisui', party: [member('quilava', { id: 'q', xp: xpForLevel(36) })] }
  const w = await begin($, on, saved as Save, undefined, undefined, netFor(list, 'quilava', 'typhlosion'))
  await until($, () => w.saveNow().party[0]?.next !== undefined)
  await cmd($, 'pokemon', 'evolve quilava')
  await until($, () => w.saveNow().party[0]?.species === 'typhlosion')
  expect(w.saveNow().party[0]?.form).toBe('hisui')
})

test('with no region, /pokemon evolve quilava still asks which Typhlosion', KIT, async ($, on) => {
  const list = [
    { name: 'quilava', forms: ['regular'] },
    { name: 'typhlosion', forms: ['regular', 'hisui'] },
  ]
  const saved = { ...emptySave(), party: [member('quilava', { id: 'q', xp: xpForLevel(36) })] }
  const w = await begin($, on, saved, undefined, undefined, netFor(list, 'quilava', 'typhlosion'))
  await until($, () => w.saveNow().party[0]?.next !== undefined)
  expect(await cmd($, 'pokemon', 'evolve quilava')).toContain('Pick one')
  expect(w.saveNow().party[0]?.species).toBe('quilava')
})

const typeahead = (text: string) => {
  const start = /\S*$/.exec(text)?.index ?? text.length
  return suggest(text, text.length, text.slice(start), start, { party: [], box: [], bag: {}, levelOf: () => 1 })
}

test('the help lists region, and the typeahead offers it and its words', () => {
  const line = POKEMON_HELP.split('\n').find(l => l.trim().startsWith('region'))
  expect(line).toBeDefined()
  expect([...(line ?? '')].length).toBeLessThanOrEqual(55)
  expect(ALL_HELP).toContain('region <region>')
  expect(typeahead('/pokemon reg').map(r => r.text)).toContain('region ')
  expect(typeahead('/pokemon region ').map(r => r.text)).toEqual(['kanto', 'alola', 'galar', 'hisui', 'paldea'])
  expect(typeahead('/pokemon region a').map(r => r.text)).toEqual(['alola'])
  expect(typeahead('/pokemon region h')[0]?.description).toContain('Hisuian')
})
