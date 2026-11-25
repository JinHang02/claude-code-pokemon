import type { ClientModule } from 'claude-code'

import type { TravelRegion } from './travel-regions'

// A pill laid over a top corner of the band's scene: the wallet at the right, the region at the left.
// `dot`: the colour of a `●` before the row's text. `act`: the Mart tab a click opens.
export type PillRow = { text: string; dot?: string }
export type PillProps = { rows: PillRow[]; act: 'mart' | 'tickets' }
// The wallet the right pill shows: the balance, and `+₽` under it for a moment after earning.
export type Wallet = { balance: number; plus: number }

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
export function shopRows(p: Wallet): string[] {
  const labels = [walletLabel(p.balance), ...(p.plus ? [` +₽${p.plus} `] : [])]
  const columns = Math.max(...labels.map(columnsOf))
  return labels.map(label => ' '.repeat(columns - columnsOf(label)) + label)
}

export const walletPill = (w: Wallet): PillProps => ({ rows: shopRows(w).map(text => ({ text })), act: 'mart' })

const REGION_WHOLE_COLUMNS = 48
const REGION_LETTERS = 3

/** `r`'s label on a band `columns` wide: `KANTO`, or `KAN` below `wholeFrom` columns. */
export const regionLabelText = (r: TravelRegion, columns: number, wholeFrom = REGION_WHOLE_COLUMNS): string =>
  (columns >= wholeFrom ? r.name : r.name.slice(0, REGION_LETTERS)).toUpperCase()

const DOT = '●'
const dotted = (row: PillRow) => (row.dot === undefined ? row.text : ` ${DOT} ${row.text} `)

export function shopSize(p: PillProps): { columns: number; rows: number } {
  return { columns: Math.max(...p.rows.map(row => columnsOf(dotted(row)))), rows: p.rows.length }
}

const Pill: ClientModule<PillProps, true> = (p, s) => {
  if (s.state === undefined) {
    s.onPointer(e => {
      if (e.type === 'down' && e.button === 'left') s.post({ open: p.act })
    })
    s.setState(true)
  }
  const { Box, Text } = s.elements
  return (
    <Box flexDirection="column">
      {p.rows.map((row, y) =>
        row.dot === undefined ? (
          <Text key={`r${y}`} color={GOLD} backgroundColor={PILL} bold={y === 1}>
            {row.text}
          </Text>
        ) : (
          <Text key={`r${y}`} backgroundColor={PILL} bold>
            <Text key="pad"> </Text>
            <Text key="dot" color={row.dot}>
              {DOT}
            </Text>
            <Text key="text" color={GOLD}>{` ${row.text} `}</Text>
          </Text>
        ),
      )}
    </Box>
  )
}

export default Pill
