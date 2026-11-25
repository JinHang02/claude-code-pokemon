// Typing for the band's client modules: SPECIAL, isShifted and typedBy.

// The names Claude Code gives keys that type nothing.
export const SPECIAL = new Set([
  ...['up', 'down', 'left', 'right', 'return', 'enter', 'tab', 'backspace', 'delete', 'escape'],
  ...['pageup', 'pagedown', 'home', 'end', 'insert', 'clear'],
])
// A letter with shift held, should the engine report it so rather than as the capital it types.
export const isShifted = (e: { key: string; shift?: true }): boolean => Boolean(e.shift) && /^[a-z]$/.test(e.key)

// What a key types, or null for a special key or a chord. Characters that arrive together (typed faster than the
// terminal reads them, or pasted) come as one key; control characters in them are left out.
export function typedBy(e: { key: string; ctrl?: true; shift?: true; meta?: true }): string | null {
  if (e.ctrl || e.meta) return null
  if (e.key === 'space') return ' '
  if (SPECIAL.has(e.key) || /^f\d{1,2}$/.test(e.key)) return null
  if (isShifted(e)) return e.key.toUpperCase()
  const text = e.key.replace(/[\u0000-\u001f\u007f]/g, '')
  return text || null
}
