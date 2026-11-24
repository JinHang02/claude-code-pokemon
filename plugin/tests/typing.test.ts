// What a key types in a band client, and which keys and chords type nothing.
import { expect, test } from 'claude-code/testing'

import { isShifted, SPECIAL, typedBy } from '../hooks/typing'

test('space types a space; a single character or a run of them types itself', () => {
  expect(typedBy({ key: 'space' })).toBe(' ')
  expect(typedBy({ key: 'a' })).toBe('a')
  expect(typedBy({ key: 'P' })).toBe('P')
  expect(typedBy({ key: '/' })).toBe('/')
  expect(typedBy({ key: 'é' })).toBe('é')
  expect(typedBy({ key: '😀' })).toBe('😀')
  expect(typedBy({ key: '/pokemon travel johto' })).toBe('/pokemon travel johto')
  expect(typedBy({ key: '   ' })).toBe('   ')
})

test('arrows, return, escape and function keys type nothing', () => {
  for (const key of ['up', 'down', 'left', 'right', 'return', 'enter', 'escape', 'tab', 'backspace', 'delete'])
    expect(typedBy({ key })).toBeNull()
  for (const key of ['f1', 'f12']) expect(typedBy({ key })).toBeNull()
  for (const key of SPECIAL) expect(typedBy({ key })).toBeNull()
})

test('a function-key-like name past two digits, or an uppercase F, is typed as text', () => {
  expect(typedBy({ key: 'f123' })).toBe('f123')
  expect(typedBy({ key: 'F1' })).toBe('F1')
})

test('ctrl and meta chords type nothing', () => {
  expect(typedBy({ key: 'a', ctrl: true })).toBeNull()
  expect(typedBy({ key: 'v', meta: true })).toBeNull()
  expect(typedBy({ key: 'space', ctrl: true })).toBeNull()
  expect(typedBy({ key: 'a', ctrl: true, shift: true })).toBeNull()
})

test('shift with a lowercase letter types the capital; shift with anything else types the key', () => {
  expect(typedBy({ key: 'a', shift: true })).toBe('A')
  expect(typedBy({ key: 'A', shift: true })).toBe('A')
  expect(typedBy({ key: '1', shift: true })).toBe('1')
  expect(typedBy({ key: 'up', shift: true })).toBeNull()
})

test('control characters are left out of a pasted run; only control characters type nothing', () => {
  expect(typedBy({ key: 'ab\u0001c' })).toBe('abc')
  expect(typedBy({ key: 'bag\r' })).toBe('bag')
  expect(typedBy({ key: 'a\u007fb' })).toBe('ab')
  expect(typedBy({ key: '\u0001\u001f\u007f' })).toBeNull()
  expect(typedBy({ key: '\r' })).toBeNull()
  expect(typedBy({ key: '' })).toBeNull()
})

test('isShifted holds only for shift plus one lowercase ASCII letter', () => {
  expect(isShifted({ key: 'a', shift: true })).toBe(true)
  expect(isShifted({ key: 'z', shift: true })).toBe(true)
  expect(isShifted({ key: 'a' })).toBe(false)
  expect(isShifted({ key: 'A', shift: true })).toBe(false)
  expect(isShifted({ key: 'ab', shift: true })).toBe(false)
  expect(isShifted({ key: 'é', shift: true })).toBe(false)
  expect(isShifted({ key: '1', shift: true })).toBe(false)
  expect(isShifted({ key: 'up', shift: true })).toBe(false)
  expect(isShifted({ key: '', shift: true })).toBe(false)
})
