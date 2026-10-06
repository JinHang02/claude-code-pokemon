import type { ClientModule } from 'claude-code'

import type { TextRun } from './sprite'

type Props = { lines: TextRun[][] }

// The band while a wild Pokémon can be aimed at: the scene as coloured text, reporting each left click.
const Aim: ClientModule<Props, true> = (p, s) => {
  if (s.state === undefined) {
    s.onPointer(e => {
      if (e.type === 'down' && e.button === 'left') s.post({ x: e.x, y: e.y, ...(e.fine ? { fine: e.fine } : {}) })
    })
    s.setState(true)
  }
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
