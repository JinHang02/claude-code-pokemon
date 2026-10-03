import { expect, test } from 'claude-code/testing'

import { DONE, formatDuration, pickFor, WORKING } from '../hooks/spinner'

test('working words read as gerunds before the ellipsis; closing words never end in one', () => {
  expect(WORKING.length).toBeGreaterThanOrEqual(30)
  expect(new Set(WORKING).size).toBe(WORKING.length)
  for (const word of WORKING) expect(word.split(' ')[0]).toMatch(/ing$/)
  expect(new Set(DONE).size).toBe(DONE.length)
  for (const word of [...WORKING, ...DONE]) expect(word).not.toMatch(/(…|\.\.\.)$/)
})

test('one engine word always maps to the same Pokémon word, and different ones spread out', () => {
  expect(pickFor(WORKING, 'Drizzling')).toBe(pickFor(WORKING, 'Drizzling'))
  expect(WORKING).toContain(pickFor(WORKING, 'Drizzling'))
  expect(DONE).toContain(pickFor(DONE, ''))
  const seeds = ['Drizzling', 'Sauteing', 'Baking', 'Pondering', 'Brewing', 'Churning', 'Forging', 'Musing']
  expect(new Set(seeds.map(s => pickFor(WORKING, s))).size).toBeGreaterThan(4)
})

test('durations are spelled as the closing line spells them', () => {
  expect(formatDuration(0)).toBe('0s')
  expect(formatDuration(400)).toBe('0s')
  expect(formatDuration(3_400)).toBe('3s')
  expect(formatDuration(59_999)).toBe('59s')
  expect(formatDuration(64_000)).toBe('1m 4s')
  expect(formatDuration(119_600)).toBe('2m 0s')
  expect(formatDuration(3_725_000)).toBe('1h 2m 5s')
  expect(formatDuration(2 * 86_400_000 + 3 * 3_600_000 + 4 * 60_000)).toBe('2d 3h 4m')
})
