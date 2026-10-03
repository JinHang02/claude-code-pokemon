// What the spinner says while Claude works; the engine draws the ellipsis after it.
export const WORKING = [
  'Catching',
  'Training',
  'Evolving',
  'Battling',
  'Healing at the Pokémon Center',
  'Using Thunderbolt',
  'Consulting Professor Oak',
  'Searching tall grass',
  'Throwing a Poké Ball',
  'Charging Solar Beam',
  'Leveling up',
  'Hatching an Egg',
  'Surfing',
  'Flying to the next town',
  'Learning a new move',
  'Checking the Pokédex',
  'Challenging the Gym Leader',
  'Earning a badge',
  'Fishing with a Super Rod',
  'Riding the Bicycle',
  'Using Dig',
  'Trading over the Link Cable',
  'Exploring Viridian Forest',
  'Using Cut on a tree',
  'Feeding a Rare Candy',
  'Shopping at the Poké Mart',
  'Waking a Snorlax',
  'Using Teleport',
  'Tailing Team Rocket',
  'Stocking up on Potions',
  'Pushing boulders with Strength',
  'Storing Pokémon in the PC',
] as const

// The closing line's word, read as `<word> for 3s`.
export const DONE = [
  'Caught',
  'Trained',
  'Evolved',
  'Battled',
  'Surfed',
  'Flew',
  'Fished',
  'Dug',
  'Healed',
  'Leveled up',
  'Explored',
  'Searched tall grass',
  'Rested at the Pokémon Center',
  'Challenged the Gym',
  'Hatched an Egg',
  'Studied the Pokédex',
  'Wandered Route 1',
  'Cycled',
  'Charged Hyper Beam',
  'Traded',
  'Sailed the S.S. Anne',
] as const

export const BALL = '◓'
export const COLORS = { red: '#E3350D', yellow: '#FFCB05', blue: '#3D7DCA' } as const

// The same seed always picks the same entry, so a line keeps its word across redraws.
export function pickFor<T>(list: readonly T[], seed: string): T {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return list[(h >>> 0) % list.length] as T
}

// `3s`, `1m 4s`, `1h 2m 5s`, `2d 3h 4m`, as the engine's closing line spells a duration.
export function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.floor(Math.max(0, ms) / 1000)}s`
  let days = Math.floor(ms / 86_400_000)
  let hours = Math.floor((ms % 86_400_000) / 3_600_000)
  let minutes = Math.floor((ms % 3_600_000) / 60_000)
  let seconds = Math.round((ms % 60_000) / 1000)
  if (seconds === 60) {
    seconds = 0
    minutes++
  }
  if (minutes === 60) {
    minutes = 0
    hours++
  }
  if (hours === 24) {
    hours = 0
    days++
  }
  if (days) return `${days}d ${hours}h ${minutes}m`
  if (hours) return `${hours}h ${minutes}m ${seconds}s`
  return `${minutes}m ${seconds}s`
}
