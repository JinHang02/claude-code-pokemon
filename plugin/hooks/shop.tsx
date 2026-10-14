import type { ClientModule } from 'claude-code'

// The band's corner button, laid over the scene's top-right corner: the wallet, `+₽` under it for a moment after
// earning, and a click opens the PokéMart.
export type ShopProps = { balance: number; plus: number }

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

// The button's rows, right-aligned on one dark pill so they read on any sky: the wallet, and `+₽` while it shows.
export function shopRows(p: ShopProps): string[] {
  const labels = [walletLabel(p.balance), ...(p.plus ? [` +₽${p.plus} `] : [])]
  const columns = Math.max(...labels.map(columnsOf))
  return labels.map(label => ' '.repeat(columns - columnsOf(label)) + label)
}

// How big the button is: just its pill, so the scene shows everywhere else.
export function shopSize(p: ShopProps): { columns: number; rows: number } {
  const rows = shopRows(p)
  return { columns: Math.max(...rows.map(columnsOf)), rows: rows.length }
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
    <Box flexDirection="column">
      {shopRows(p).map((row, y) => (
        <Text key={`r${y}`} color={GOLD} backgroundColor={PILL} bold={y === 1}>
          {row}
        </Text>
      ))}
    </Box>
  )
}

export default Shop
