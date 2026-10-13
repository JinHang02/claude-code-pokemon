import type { ClientModule } from 'claude-code'

// The band's corner button: the wallet, `+₽` for a moment after earning, and a click opens the PokéMart.
export type ShopProps = { balance: number; plus: number }

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
      <Text color="#ffd75e" backgroundColor="#1d2029">{` 🛒 ₽ ${p.balance.toLocaleString('en-US')} `}</Text>
      {p.plus ? (
        <Text color="#ffd75e" bold>
          {`+₽${p.plus} `}
        </Text>
      ) : null}
    </Box>
  )
}

export default Shop
