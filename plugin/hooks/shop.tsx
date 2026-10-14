import type { ClientModule } from 'claude-code'

import type { TextRun } from './sprite'

// The band's corner button: the wallet, `+₽` for a moment after earning, and a click opens the PokéMart. `lines`:
// the landscape behind it, the band's own carried on past the scene's right edge, as coloured text.
export type ShopProps = { balance: number; plus: number; lines: TextRun[][] }

const UNITS = [
  ['T', 1e12],
  ['B', 1e9],
  ['M', 1e6],
  ['k', 1e3],
] as const

// The wallet as the button shows it, within its 13 columns (🛒 takes two): `₽ 99,999` in full, then `₽ 100k`,
// `₽ 1.2M`, rounded down so it never shows more than there is.
export function walletLabel(balance: number): string {
  if (balance < 100_000) return ` 🛒 ₽ ${balance.toLocaleString('en-US')} `
  const [unit, size] = UNITS.find(([, size]) => balance >= size) ?? ['k', 1e3]
  // One decimal below 10 of a unit: `1.2M`, `100k`.
  const short = balance < 10 * size ? Math.floor((balance * 10) / size) / 10 : Math.floor(balance / size)
  return ` 🛒 ₽ ${short}${unit} `
}

const GOLD = '#ffd75e'
const PILL = '#1d2029'

// How many columns a label takes: 🛒 takes two.
const columnsOf = (text: string) => [...text].reduce((n, c) => n + (c === '🛒' ? 2 : 1), 0)

// The first `n` columns of a row of the landscape (each of its characters is one column).
function take(runs: TextRun[], n: number): TextRun[] {
  const out: TextRun[] = []
  for (const [text, fg, bg] of runs) {
    if (n <= 0) break
    out.push([text.slice(0, n), fg, bg])
    n -= text.length
  }
  return out
}

// The button as drawn: the landscape, with the wallet at the top row's right end and `+₽` under it, each on a dark
// pill so it reads on any sky.
export function shopRows(p: ShopProps): TextRun[][] {
  const labels = [walletLabel(p.balance), p.plus ? ` +₽${p.plus} ` : '']
  // No landscape (none drawn yet, or props from a hooks module from before it had one): the labels alone.
  const lines: TextRun[][] = p.lines?.length ? p.lines : [[], []]
  return lines.map((runs, y) => {
    const label = labels[y]
    if (!label) return runs
    const width = runs.reduce((n, [text]) => n + text.length, 0)
    return [...take(runs, width - columnsOf(label)), [label, GOLD, PILL]]
  })
}

const Shop: ClientModule<ShopProps, true> = (p, s) => {
  if (s.state === undefined) {
    s.onPointer(e => {
      if (e.type === 'down' && e.button === 'left') s.post({ open: true })
    })
    s.setState(true)
  }
  const { Box, Text } = s.elements
  return (
    <Box flexDirection="column" alignItems="flex-end">
      {shopRows(p).map((runs, y) => (
        <Text key={`r${y}`}>
          {runs.map(([text, fg, bg], i) => (
            <Text
              key={`c${i}`}
              color={fg || undefined}
              backgroundColor={bg || undefined}
              bold={y === 1 && i === runs.length - 1 && p.plus > 0}
            >
              {text}
            </Text>
          ))}
        </Text>
      ))}
    </Box>
  )
}

export default Shop
