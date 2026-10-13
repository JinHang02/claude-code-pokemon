import type { ClientModule } from 'claude-code'

// The band's corner button: the wallet, `+₽` for a moment after earning, and a click opens the PokéMart.
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
      <Text color="#ffd75e" backgroundColor="#1d2029">
        {walletLabel(p.balance)}
      </Text>
      {p.plus ? (
        <Text color="#ffd75e" bold>
          {`+₽${p.plus} `}
        </Text>
      ) : null}
    </Box>
  )
}

export default Shop
