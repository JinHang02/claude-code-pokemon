import { expect, test } from 'claude-code/testing'

import { ALL_HELP, MAX_ROWS, POKEMON_HELP, suggest } from '../hooks/commands'
import type { Owned } from '../hooks/commands'
import { TRAVEL_REGIONS } from '../hooks/travel-regions'
import { level } from '../hooks/save'
import { member } from './world'

const owned: Owned = {
  party: [member('pikachu', { id: 'p' })],
  box: [],
  bag: {},
  levelOf: m => level(m.xp),
}
const texts = (text: string): string[] => {
  const start = /\S*$/.exec(text)?.index ?? text.length
  return suggest(text, text.length, text.slice(start), start, owned).map(r => r.text)
}
const columns = (help: string): number[] => help.split('\n').map(l => [...l].length)
const HINT = 'Regions: ferry tickets in the PokéMart open new ones as you gain trainer experience.'

test('/pokemon help and /pokemon-help list travel, restart and the typed answers, every line at most 60 columns', () => {
  for (const help of [POKEMON_HELP, ALL_HELP]) {
    expect(help).toMatch(/^ {2}travel <region> /m)
    expect(help).toMatch(/^ {2}restart \[yes\|no\] /m)
    expect(help).toMatch(/^ {2}choose <starter> /m)
    expect(help).toMatch(/^ {2}keep /m)
    expect(help).toMatch(/^ {2}fresh \[yes\|no\] /m)
    expect(help).toMatch(/^ {2}buy <region> ticket /m)
    expect(Math.max(...columns(help))).toBeLessThanOrEqual(60)
  }
})

test('/pokemon-help hints at what opens a region and never states the rule', () => {
  const lines = ALL_HELP.split('\n')
  const first = lines.findIndex(l => l.startsWith('Regions:'))
  expect(first).toBeGreaterThan(-1)
  const hint = lines.slice(first, first + 2)
  expect(hint.join(' ')).toBe(HINT)
  for (const l of hint) expect([l, /%|threshold|91|seen/i.test(l)]).toEqual([l, false])
})

test('the typeahead offers travel on t and restart on re', () => {
  expect(texts('/pokemon t')).toContain('travel ')
  expect(texts('/pokemon re')).toContain('restart ')
  expect(texts('/pokemon')).toEqual(expect.arrayContaining(['/pokemon travel ', '/pokemon restart ']))
})

test("travel's word offers the region names in order, filtered by what's typed in any case", () => {
  expect(TRAVEL_REGIONS.length).toBe(MAX_ROWS)
  expect(texts('/pokemon travel ')).toEqual(TRAVEL_REGIONS.map(r => r.id))
  expect(texts('/pokemon travel jo')).toEqual(['johto'])
  expect(texts('/pokemon travel JO')).toEqual(['johto'])
  expect(texts('/pokemon travel galar')).toEqual(['galar'])
})

test('travel offers nothing for an unknown region, a second word, or restart any word', () => {
  expect(texts('/pokemon travel zz')).toEqual([])
  expect(texts('/pokemon travel johtoo')).toEqual([])
  expect(texts('/pokemon travel johto ')).toEqual([])
})

test('the typeahead offers choose, keep and fresh; choose takes a starter, restart and fresh yes or no', () => {
  expect(texts('/pokemon ch')).toContain('choose ')
  expect(texts('/pokemon ke')).toContain('keep')
  expect(texts('/pokemon fr')).toContain('fresh ')
  expect(texts('/pokemon choose cy')).toEqual(['cyndaquil'])
  expect(texts('/pokemon choose ')).toHaveLength(MAX_ROWS)
  expect(texts('/pokemon choose zz')).toEqual([])
  expect(texts('/pokemon restart ')).toEqual(['yes', 'no'])
  expect(texts('/pokemon fresh y')).toEqual(['yes'])
})

test("buy's typeahead offers a later region's ticket by name, word by word, and never Kanto's", () => {
  expect(texts('/pokemon buy jo')).toEqual(['johto ticket '])
  expect(texts('/pokemon buy JO')).toEqual(['johto ticket '])
  expect(texts('/pokemon buy johto t')).toEqual(['ticket '])
  expect(texts('/pokemon buy ga')).toContain('galar ticket ')
  expect(texts('/pokemon buy ka')).not.toContain('kanto ticket ')
  expect(texts('/pokemon buy johto x')).toEqual([])
})
