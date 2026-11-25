// The band dialog's client module (dialog.tsx) on a fake surface: what pointer and keys post, and what it draws.
import type { ClientElements, ClientKeyEvent, ClientPointerEvent, ClientSurface, JsonValue } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import Dialog from '../hooks/dialog'
import type { DialogProps } from '../hooks/dialogs'

type Typed = { typed: string }
type Drawn = { type: string; props: { color?: string; backgroundColor?: string; children?: unknown } }

const PROPS: DialogProps = {
  lines: [
    [
      ['  ', '#222222', '#f4f1e6'],
      ['(1)', '#e3350d', '#ffffff'],
      [' ', '#222222', '#f4f1e6'],
      ['(2)', '#3a6ea5', '#ffffff'],
    ],
    [
      [' Yes ', '#ffffff', '#b3261e'],
      [' ', '', ''],
      [' No ', '#ffffff', '#3a6ea5'],
    ],
  ],
  hits: [
    { y: 0, x0: 2, x1: 5, act: { pick: 1 } },
    { y: 0, x0: 6, x1: 9, act: { pick: 2 } },
    { y: 1, x0: 0, x1: 5, act: 'yes' },
    { y: 1, x0: 6, x1: 10, act: 'no' },
  ],
}

// Box and Text as plain data, the shape the engine's own elements build.
const ELEMENTS = {
  Box: (props: Drawn['props']): Drawn => ({ type: 'Box', props }),
  Text: (props: Drawn['props']): Drawn => ({ type: 'Text', props }),
} as unknown as ClientElements

/**
 * Fake dialog surface.
 * @returns `posts`: everything posted, in order; `pointer`, `key`: send one event; `redraw`: draw with new props;
 *   `tree`: what the last draw returned.
 */
function mount(first: DialogProps = PROPS) {
  const posts: JsonValue[] = []
  let props = first
  let onPointer: ((e: ClientPointerEvent) => void) | null = null
  let onKey: ((e: ClientKeyEvent) => void) | null = null
  let isDirty = false
  let tree: unknown = null
  const s: { -readonly [K in keyof ClientSurface<Typed>]: ClientSurface<Typed>[K] } = {
    elements: ELEMENTS,
    state: undefined,
    setState: next => {
      s.state = next
      isDirty = true
    },
    columns: 12,
    rows: 2,
    every: () => () => {},
    onPointer: fn => {
      onPointer = fn
      return () => (onPointer = null)
    },
    onKey: fn => {
      onKey = fn
      return () => (onKey = null)
    },
    post: data => void posts.push(data),
  }
  const draw = () => {
    isDirty = false
    tree = Dialog(props, s)
  }
  const settle = () => {
    if (isDirty) draw()
  }
  draw()
  return {
    posts,
    tree: () => tree,
    redraw: (next: DialogProps) => {
      props = next
      draw()
    },
    pointer: (e: ClientPointerEvent) => {
      onPointer?.(e)
      settle()
    },
    key: (e: ClientKeyEvent) => {
      onKey?.(e)
      settle()
    },
  }
}

// ── Pointer ──

test('a left-button down on a ball posts its pick', () => {
  const d = mount()
  d.pointer({ type: 'down', x: 3, y: 0, button: 'left' })
  expect(d.posts).toEqual([{ act: { pick: 1 } }])
})

test("a down on a hit's first column posts; on the column past its end, nothing", () => {
  const d = mount()
  d.pointer({ type: 'down', x: 4, y: 0, button: 'left' })
  d.pointer({ type: 'down', x: 5, y: 0, button: 'left' })
  d.pointer({ type: 'down', x: 0, y: 1, button: 'left' })
  expect(d.posts).toEqual([{ act: { pick: 1 } }, { act: 'yes' }])
})

test('a down off any hit, or outside the region, posts nothing', () => {
  const d = mount()
  d.pointer({ type: 'down', x: 0, y: 0, button: 'left' })
  d.pointer({ type: 'down', x: 3, y: 2, button: 'left' })
  d.pointer({ type: 'down', x: -1, y: 0, button: 'left' })
  expect(d.posts).toEqual([])
})

test('a right- or middle-button down on a hit posts nothing', () => {
  const d = mount()
  d.pointer({ type: 'down', x: 3, y: 0, button: 'right' })
  d.pointer({ type: 'down', x: 0, y: 1, button: 'middle' })
  expect(d.posts).toEqual([])
})

test('a move over ball 2 posts a hover on it; a move over Yes, No or no hit posts nothing', () => {
  const d = mount()
  d.pointer({ type: 'move', x: 7, y: 0 })
  d.pointer({ type: 'move', x: 1, y: 1 })
  d.pointer({ type: 'move', x: 7, y: 1 })
  d.pointer({ type: 'move', x: 0, y: 0 })
  expect(d.posts).toEqual([{ act: { hover: 2 } }])
})

test('moves within one ball post its hover once; leaving it, or a key act, lets the next move post again', () => {
  const d = mount()
  d.pointer({ type: 'move', x: 7, y: 0 })
  d.pointer({ type: 'move', x: 8, y: 0 })
  d.pointer({ type: 'move', x: 6, y: 0 })
  d.pointer({ type: 'move', x: 3, y: 0 })
  d.pointer({ type: 'move', x: 7, y: 0 })
  d.pointer({ type: 'move', x: 0, y: 0 })
  d.pointer({ type: 'move', x: 7, y: 0 })
  d.key({ key: 'left' })
  d.pointer({ type: 'move', x: 7, y: 0 })
  expect(d.posts).toEqual([
    { act: { hover: 2 } },
    { act: { hover: 1 } },
    { act: { hover: 2 } },
    { act: { hover: 2 } },
    { act: 'left' },
    { act: { hover: 2 } },
  ])
})

test('typing keeps going after a hover', () => {
  const d = mount()
  d.key({ key: 'h' })
  d.pointer({ type: 'move', x: 7, y: 0 })
  d.key({ key: 'i' })
  expect(d.posts).toEqual([{ typed: 'h' }, { act: { hover: 2 } }, { typed: 'hi' }])
})

test('an up, enter or leave over a ball posts nothing', () => {
  const d = mount()
  d.pointer({ type: 'up', x: 3, y: 0, button: 'left' })
  d.pointer({ type: 'enter', x: 3, y: 0 })
  d.pointer({ type: 'leave', x: 3, y: 0 })
  expect(d.posts).toEqual([])
})

test('a click is judged on the props drawn last', () => {
  const d = mount()
  d.redraw({ lines: PROPS.lines, hits: [{ y: 1, x0: 0, x1: 5, act: 'no' }] })
  d.pointer({ type: 'down', x: 3, y: 0, button: 'left' })
  d.pointer({ type: 'down', x: 1, y: 1, button: 'left' })
  expect(d.posts).toEqual([{ act: 'no' }])
})

// ── Keys ──

test('← → Enter n x post left, right, enter, no and close', () => {
  const d = mount()
  for (const key of ['left', 'right', 'return', 'n', 'x']) d.key({ key })
  expect(d.posts).toEqual([{ act: 'left' }, { act: 'right' }, { act: 'enter' }, { act: 'no' }, { act: 'close' }])
})

test('y alone is typed, never a yes', () => {
  const d = mount()
  d.key({ key: 'y' })
  expect(d.posts).toEqual([{ typed: 'y' }])
})

test('x with shift held types a capital X, not a close', () => {
  const d = mount()
  d.key({ key: 'x', shift: true })
  expect(d.posts).toEqual([{ typed: 'X' }])
})

test('a run of characters typed fast, starting with a dialog key, is typed whole', () => {
  const d = mount()
  d.key({ key: 'xcode' })
  expect(d.posts).toEqual([{ typed: 'xcode' }])
})

test('typing named like an inherited object key is typed, not taken for a dialog key', () => {
  for (const key of ['constructor', 'toString', 'hasOwnProperty', '__proto__', 'valueOf']) {
    const d = mount()
    d.key({ key })
    expect(d.posts).toEqual([{ typed: key }])
  }
})

test('once typing has begun, y, x and Enter are typing too, and what is typed accumulates', () => {
  const d = mount()
  d.key({ key: 'a' })
  d.key({ key: 'y' })
  d.key({ key: 'space' })
  d.key({ key: 'x' })
  d.key({ key: 'return' })
  expect(d.posts).toEqual([{ typed: 'a' }, { typed: 'ay' }, { typed: 'ay ' }, { typed: 'ay x' }])
})

test('ctrl and meta chords, and special keys that type nothing, post nothing', () => {
  const d = mount()
  d.key({ key: 'c', ctrl: true })
  d.key({ key: 'x', ctrl: true })
  d.key({ key: 'v', meta: true })
  for (const key of ['up', 'down', 'tab', 'backspace', 'f1']) d.key({ key })
  expect(d.posts).toEqual([])
})

test('typing survives a redraw with new props', () => {
  const d = mount()
  d.key({ key: 'h' })
  d.redraw(PROPS)
  d.key({ key: 'i' })
  expect(d.posts).toEqual([{ typed: 'h' }, { typed: 'hi' }])
})

// ── Drawing ──

function textOf(node: unknown): string {
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (typeof node !== 'object' || node === null) return ''
  return textOf((node as Drawn).props.children)
}
const childrenOf = (node: unknown): Drawn[] => {
  const children = (node as Drawn).props.children
  return (Array.isArray(children) ? children.flat() : [children]).filter(
    (c): c is Drawn => typeof c === 'object' && c !== null,
  )
}

test('one Text row per line, each run in its own colours; an empty colour is left unset', () => {
  const d = mount()
  const rows = childrenOf(d.tree())
  expect(rows.map(r => r.type)).toEqual(['Text', 'Text'])
  expect(rows.map(textOf)).toEqual(['  (1) (2)', ' Yes   No '])
  const runs = rows.map(r => childrenOf(r).map(c => [textOf(c), c.props.color, c.props.backgroundColor]))
  expect(runs).toEqual([
    [
      ['  ', '#222222', '#f4f1e6'],
      ['(1)', '#e3350d', '#ffffff'],
      [' ', '#222222', '#f4f1e6'],
      ['(2)', '#3a6ea5', '#ffffff'],
    ],
    [
      [' Yes ', '#ffffff', '#b3261e'],
      [' ', undefined, undefined],
      [' No ', '#ffffff', '#3a6ea5'],
    ],
  ])
})

test('no lines draw no rows', () => {
  const d = mount({ lines: [], hits: [] })
  expect(childrenOf(d.tree())).toEqual([])
})
