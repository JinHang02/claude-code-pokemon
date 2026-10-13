import { expect, test } from 'claude-code/testing'

import { forSale, isItemId, itemById, itemName, ITEMS, MAX_BAG, splitGive, TABS, withArticle } from '../hooks/items'

test('the Mart sells 42 items in four tabs, at the prices the spec sets', () => {
  expect(MAX_BAG).toBe(999)
  expect(TABS).toEqual(['Stones', 'Hold items', 'Special', 'Other'])
  expect(TABS.map(t => forSale().filter(i => i.tab === t).length)).toEqual([10, 18, 11, 3])
  expect(itemById('thunder-stone')).toMatchObject({ name: 'Thunder Stone', kind: 'evolve', price: 3000 })
  expect(itemById('metal-coat')).toMatchObject({ tab: 'Hold items', kind: 'evolve', price: 5000 })
  expect(itemById('razor-claw')).toMatchObject({ kind: 'hold', price: 5000 })
  expect(itemById('linking-cord')).toMatchObject({ tab: 'Special', kind: 'evolve', price: 5000 })
  expect(itemById('rare-candy')).toMatchObject({ kind: 'candy', price: 4800 })
  expect(itemById('soothe-bell')?.price).toBe(4000)
  expect(itemById('lucky-egg')?.price).toBe(10000)
  // The Everstone is known (it can be held) but never sold: /pokemon everstone gives one free.
  expect(itemById('everstone')?.isSold).toBe(false)
  expect(forSale().some(i => i.id === 'everstone')).toBe(false)
})

test('every item has its game name and a description, and ids are plain names', () => {
  for (const i of ITEMS) {
    expect(i.id).toMatch(/^[a-z]+(-[a-z]+)*$/)
    expect(i.text.length).toBeGreaterThan(40)
    expect(i.color).toMatch(/^#[0-9a-f]{6}$/)
  }
  expect(itemById('kings-rock')?.name).toBe("King's Rock")
  expect(itemById('up-grade')?.name).toBe('Up-Grade')
  expect(itemById('thunder-stone')?.text).toBe(
    'A peculiar stone that can make certain species of Pokémon evolve. It has a distinct thunderbolt pattern.',
  )
  expect(isItemId('fire-stone')).toBe(true)
  expect(isItemId('gimmighoul-coin')).toBe(false)
  expect(isItemId('constructor')).toBe(false)
  expect(itemName('dusk-stone')).toBe('Dusk Stone')
})

test('a/an, and finding the item in a give, first or last', () => {
  expect(withArticle('Thunder Stone')).toBe('a Thunder Stone')
  expect(withArticle('Ice Stone')).toBe('an Ice Stone')
  expect(withArticle('Up-Grade')).toBe('an Up-Grade')
  expect(splitGive(['thunder', 'stone', 'pikachu'])).toEqual({ item: itemById('thunder-stone'), rest: ['pikachu'] })
  expect(splitGive(['mr', 'mime', 'moon', 'stone'])).toEqual({ item: itemById('moon-stone'), rest: ['mr', 'mime'] })
  expect(splitGive(['kings', 'rock', 'slowpoke'])).toEqual({ item: itemById('kings-rock'), rest: ['slowpoke'] })
  expect(splitGive(['scroll', 'of', 'waters', 'kubfu'])?.item.id).toBe('scroll-of-waters')
  expect(splitGive(['rare', 'candy'])).toEqual({ item: itemById('rare-candy'), rest: [] })
  expect(splitGive(['pikachu'])).toBeNull()
  expect(splitGive([])).toBeNull()
})
