// A party member as drawn: its sprite at full size.
export type Mon = {
  // The party member's id ('wild' for the visitor): twins walk apart, and an evolved one keeps its walker.
  key: string
  name: string
  isShiny: boolean
  // Row-major 0xRRGGBB pixels, -1 transparent.
  pixels: number[]
  width: number
  height: number
}

declare module 'claude-code' {
  interface PluginState {
    // `ledger`: this session's XP ledger key in the store, kept across hot reloads.
    pokemon: { party: Mon[]; error: string | null; ledger: string | null }
  }
}
