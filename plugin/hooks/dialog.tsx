// The band dialog's client module: KEYS, and Dialog (the default export).
import type { ClientModule } from 'claude-code'

import type { DialogAct, DialogHit, DialogProps } from './dialogs'
import { isShifted, typedBy } from './typing'

export const KEYS: Record<string, DialogAct> = {
  left: 'left',
  right: 'right',
  return: 'enter',
  y: 'yes',
  n: 'no',
  x: 'close',
}

const hitAt = (p: DialogProps, x: number, y: number): DialogHit | undefined =>
  p.hits.find(h => h.y === y && x >= h.x0 && x < h.x1)

type State = { typed: string; hover?: number }

const keyAct = (key: string): DialogAct | undefined => (Object.hasOwn(KEYS, key) ? KEYS[key] : undefined)

const Dialog: ClientModule<DialogProps, State> = (p, s) => {
  let typed = s.state?.typed ?? ''
  let hover = s.state?.hover
  const keep = () => s.setState({ typed, ...(hover === undefined ? {} : { hover }) })
  s.onPointer(e => {
    const hit = hitAt(p, e.x, e.y)
    if (e.type === 'move') {
      const pick = hit && typeof hit.act === 'object' && 'pick' in hit.act ? hit.act.pick : undefined
      if (pick === hover) return
      hover = pick
      keep()
      if (pick !== undefined) s.post({ act: { hover: pick } })
      return
    }
    if (hit && e.type === 'down' && e.button === 'left') s.post({ act: hit.act })
  })
  s.onKey(e => {
    const isChord = Boolean(e.ctrl || e.meta)
    const a = typed || isShifted(e) || isChord ? undefined : keyAct(e.key)
    if (a) {
      if (hover !== undefined) {
        hover = undefined
        keep()
      }
      return s.post({ act: a })
    }
    const ch = typedBy(e)
    if (ch === null) return
    typed += ch
    keep()
    s.post({ typed })
  })
  const { Box, Text } = s.elements
  return (
    <Box flexDirection="column">
      {p.lines.map((runs, y) => (
        <Text key={`r${y}`}>
          {runs.map(([text, fg, bg], i) => (
            <Text key={`c${i}`} color={fg || undefined} backgroundColor={bg || undefined}>
              {text}
            </Text>
          ))}
        </Text>
      ))}
    </Box>
  )
}

export default Dialog
