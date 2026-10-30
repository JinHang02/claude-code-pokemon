import type { ClientModule } from 'claude-code'

import type { TextRun } from './sprite'

// `top`: the band row this strip starts on, when the band is drawn by several stacked (sprite.ts, strips).
type Props = { lines: TextRun[][]; top?: number }

// The band while a wild Pokémon can be aimed at: the scene (or a strip of it) as coloured text, reporting each left
// click in the band's own rows.
const Aim: ClientModule<Props, { top: number }> = (p, s) => {
  if (s.state === undefined) {
    const at = { top: p.top ?? 0 }
    s.onPointer(e => {
      if (e.type !== 'down' || e.button !== 'left') return
      const y = e.y + at.top
      s.post(e.fine ? { x: e.x, y, fine: { x: e.fine.x, y: e.fine.y + at.top } } : { x: e.x, y })
    })
    s.setState(at)
  } else s.state.top = p.top ?? 0
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

export default Aim
