// How the evolution screen looks, as in the games: rays (Gen 4-5), plain white (Gen 1-2) or a gradient (Gen 3).
export type EvolutionStyle = 'rays' | 'white' | 'gradient'

export const EVOLUTION_STYLES: EvolutionStyle[] = ['rays', 'white', 'gradient']

export const DEFAULT_EVOLUTION_STYLE: EvolutionStyle = 'rays'

export const isEvolutionStyle = (word: unknown): word is EvolutionStyle =>
  EVOLUTION_STYLES.includes(word as EvolutionStyle)
