// The PokéMart's stock and what a Bag can hold: the games' names, prices and descriptions, bundled so the Mart
// works offline. `evolve`: given, it evolves the Pokémon at once and is used up (stones, trade items, the Linking
// Cord). `hold`: given, the Pokémon holds it. `candy`: given, one level.
export type Tab = 'Stones' | 'Hold items' | 'Special' | 'Other'
export type Kind = 'evolve' | 'hold' | 'candy'
export type Item = {
  id: string
  name: string
  tab: Tab
  kind: Kind
  price: number
  // The colour of its ◆ in the Mart.
  color: string
  text: string
  isSold?: false
}

export const TABS: Tab[] = ['Stones', 'Hold items', 'Special', 'Other']
export const MAX_BAG = 999

export const ITEMS: Item[] = [
  {
    id: 'fire-stone',
    name: 'Fire Stone',
    tab: 'Stones',
    kind: 'evolve',
    price: 3000,
    color: '#f08030',
    text: 'A peculiar stone that can make certain species of Pokémon evolve. The stone has a fiery orange heart.',
  },
  {
    id: 'water-stone',
    name: 'Water Stone',
    tab: 'Stones',
    kind: 'evolve',
    price: 3000,
    color: '#6890f0',
    text: 'A peculiar stone that can make certain species of Pokémon evolve. It is the blue of a pool of clear water.',
  },
  {
    id: 'thunder-stone',
    name: 'Thunder Stone',
    tab: 'Stones',
    kind: 'evolve',
    price: 3000,
    color: '#f8d030',
    text: 'A peculiar stone that can make certain species of Pokémon evolve. It has a distinct thunderbolt pattern.',
  },
  {
    id: 'leaf-stone',
    name: 'Leaf Stone',
    tab: 'Stones',
    kind: 'evolve',
    price: 3000,
    color: '#78c850',
    text: 'A peculiar stone that can make certain species of Pokémon evolve. It has an unmistakable leaf pattern.',
  },
  {
    id: 'ice-stone',
    name: 'Ice Stone',
    tab: 'Stones',
    kind: 'evolve',
    price: 3000,
    color: '#98d8d8',
    text: 'A peculiar stone that can make certain species of Pokémon evolve. It has an unmistakable snowflake pattern.',
  },
  {
    id: 'moon-stone',
    name: 'Moon Stone',
    tab: 'Stones',
    kind: 'evolve',
    price: 3000,
    color: '#705898',
    text: 'A peculiar stone that can make certain species of Pokémon evolve. It is as black as the night sky.',
  },
  {
    id: 'sun-stone',
    name: 'Sun Stone',
    tab: 'Stones',
    kind: 'evolve',
    price: 3000,
    color: '#f85838',
    text: 'A peculiar stone that can make certain species of Pokémon evolve. It burns as red as the evening sun.',
  },
  {
    id: 'shiny-stone',
    name: 'Shiny Stone',
    tab: 'Stones',
    kind: 'evolve',
    price: 3000,
    color: '#f8f8f8',
    text: 'A peculiar stone that can make certain species of Pokémon evolve. It shines with a dazzling light.',
  },
  {
    id: 'dusk-stone',
    name: 'Dusk Stone',
    tab: 'Stones',
    kind: 'evolve',
    price: 3000,
    color: '#705848',
    text: 'A peculiar stone that can make certain species of Pokémon evolve. It holds shadows as dark as can be.',
  },
  {
    id: 'dawn-stone',
    name: 'Dawn Stone',
    tab: 'Stones',
    kind: 'evolve',
    price: 3000,
    color: '#60e0f8',
    text: 'A peculiar stone that can make certain species of Pokémon evolve. It sparkles like a glittering eye.',
  },
  {
    id: 'metal-coat',
    name: 'Metal Coat',
    tab: 'Hold items',
    kind: 'evolve',
    price: 5000,
    color: '#b8b8d0',
    text: "An item to be held by a Pokémon. It's a special metallic film that can boost the power of Steel-type moves.",
  },
  {
    id: 'kings-rock',
    name: "King's Rock",
    tab: 'Hold items',
    kind: 'evolve',
    price: 5000,
    color: '#e0c040',
    text: 'An item to be held by a Pokémon. When the holder successfully inflicts damage, the target may also flinch.',
  },
  {
    id: 'dragon-scale',
    name: 'Dragon Scale',
    tab: 'Hold items',
    kind: 'evolve',
    price: 5000,
    color: '#7058f8',
    text: 'A very tough and inflexible scale. Dragon-type Pokémon may be holding this item when caught.',
  },
  {
    id: 'up-grade',
    name: 'Up-Grade',
    tab: 'Hold items',
    kind: 'evolve',
    price: 5000,
    color: '#e85050',
    text: 'A transparent device somehow filled with all sorts of data. It was produced by Silph Co.',
  },
  {
    id: 'dubious-disc',
    name: 'Dubious Disc',
    tab: 'Hold items',
    kind: 'evolve',
    price: 5000,
    color: '#a070d0',
    text: 'A transparent device overflowing with dubious data. Its producer is unknown.',
  },
  {
    id: 'protector',
    name: 'Protector',
    tab: 'Hold items',
    kind: 'evolve',
    price: 5000,
    color: '#a08060',
    text: "A protective item of some sort. It is extremely stiff and heavy. It's loved by a certain Pokémon.",
  },
  {
    id: 'electirizer',
    name: 'Electirizer',
    tab: 'Hold items',
    kind: 'evolve',
    price: 5000,
    color: '#f8d030',
    text: "A box packed with a tremendous amount of electric energy. It's loved by a certain Pokémon.",
  },
  {
    id: 'magmarizer',
    name: 'Magmarizer',
    tab: 'Hold items',
    kind: 'evolve',
    price: 5000,
    color: '#f08030',
    text: "A box packed with a tremendous amount of magma energy. It's loved by a certain Pokémon.",
  },
  {
    id: 'reaper-cloth',
    name: 'Reaper Cloth',
    tab: 'Hold items',
    kind: 'evolve',
    price: 5000,
    color: '#705898',
    text: "A cloth imbued with horrifyingly strong spiritual energy. It's loved by a certain Pokémon.",
  },
  {
    id: 'deep-sea-tooth',
    name: 'Deep Sea Tooth',
    tab: 'Hold items',
    kind: 'evolve',
    price: 5000,
    color: '#c0c8e0',
    text: "An item to be held by Clamperl. This fang gleams a sharp silver and raises the holder's Sp. Atk stat.",
  },
  {
    id: 'deep-sea-scale',
    name: 'Deep Sea Scale',
    tab: 'Hold items',
    kind: 'evolve',
    price: 5000,
    color: '#f0a0c0',
    text: "An item to be held by Clamperl. This scale shines with a faint pink and raises the holder's Sp. Def stat.",
  },
  {
    id: 'prism-scale',
    name: 'Prism Scale',
    tab: 'Hold items',
    kind: 'evolve',
    price: 5000,
    color: '#c0e0f8',
    text: 'A mysterious scale that causes a certain Pokémon to evolve. It shines in rainbow colors.',
  },
  {
    id: 'sachet',
    name: 'Sachet',
    tab: 'Hold items',
    kind: 'evolve',
    price: 5000,
    color: '#f0a0d0',
    text: "A sachet filled with fragrant perfumes that are just slightly too overwhelming. Yet it's loved by a certain Pokémon.",
  },
  {
    id: 'whipped-dream',
    name: 'Whipped Dream',
    tab: 'Hold items',
    kind: 'evolve',
    price: 5000,
    color: '#f8e0f0',
    text: "A soft and sweet treat made of fluffy, puffy, whipped, and whirled cream. It's loved by a certain Pokémon.",
  },
  {
    id: 'razor-claw',
    name: 'Razor Claw',
    tab: 'Hold items',
    kind: 'hold',
    price: 5000,
    color: '#c0c0c0',
    text: "An item to be held by a Pokémon. This sharply hooked claw increases the holder's critical-hit ratio.",
  },
  {
    id: 'razor-fang',
    name: 'Razor Fang',
    tab: 'Hold items',
    kind: 'hold',
    price: 5000,
    color: '#e0e0e0',
    text: 'An item to be held by a Pokémon. When the holder successfully inflicts damage, the target may also flinch.',
  },
  {
    id: 'oval-stone',
    name: 'Oval Stone',
    tab: 'Hold items',
    kind: 'hold',
    price: 5000,
    color: '#e8e0c8',
    text: "A peculiar stone that can make certain species of Pokémon evolve. It's as round as a Pokémon Egg.",
  },
  {
    id: 'strawberry-sweet',
    name: 'Strawberry Sweet',
    tab: 'Hold items',
    kind: 'hold',
    price: 5000,
    color: '#f05070',
    text: 'A strawberry-shaped sweet. When a Milcery holds this, it will spin around happily.',
  },
  {
    id: 'linking-cord',
    name: 'Linking Cord',
    tab: 'Special',
    kind: 'evolve',
    price: 5000,
    color: '#a0d0f8',
    text: "A string exuding a mysterious energy that makes you feel a strange sense of connection. It's loved by certain Pokémon.",
  },
  {
    id: 'tart-apple',
    name: 'Tart Apple',
    tab: 'Special',
    kind: 'evolve',
    price: 5000,
    color: '#a8d040',
    text: "A peculiar apple that can make a certain species of Pokémon evolve. It's exceptionally tart.",
  },
  {
    id: 'sweet-apple',
    name: 'Sweet Apple',
    tab: 'Special',
    kind: 'evolve',
    price: 5000,
    color: '#e05050',
    text: "A peculiar apple that can make a certain species of Pokémon evolve. It's exceptionally sweet.",
  },
  {
    id: 'cracked-pot',
    name: 'Cracked Pot',
    tab: 'Special',
    kind: 'evolve',
    price: 5000,
    color: '#c08050',
    text: 'A peculiar teapot that can make a certain species of Pokémon evolve. It may be cracked, but tea poured from it is delicious.',
  },
  {
    id: 'chipped-pot',
    name: 'Chipped Pot',
    tab: 'Special',
    kind: 'evolve',
    price: 5000,
    color: '#c08050',
    text: 'A peculiar teapot that can make a certain species of Pokémon evolve. It may be chipped, but tea poured from it is delicious.',
  },
  {
    id: 'black-augurite',
    name: 'Black Augurite',
    tab: 'Special',
    kind: 'evolve',
    price: 5000,
    color: '#404048',
    text: "A glassy black stone that produces a sharp cutting edge when split. It's loved by a certain Pokémon.",
  },
  {
    id: 'peat-block',
    name: 'Peat Block',
    tab: 'Special',
    kind: 'evolve',
    price: 5000,
    color: '#806040',
    text: "A block of muddy material that can be used as fuel for burning when it is dried. It's loved by a certain Pokémon.",
  },
  {
    id: 'scroll-of-darkness',
    name: 'Scroll of Darkness',
    tab: 'Special',
    kind: 'evolve',
    price: 5000,
    color: '#383838',
    text: 'A peculiar scroll that can make a certain species of Pokémon evolve. Written upon it are the true secrets of the path of darkness.',
  },
  {
    id: 'scroll-of-waters',
    name: 'Scroll of Waters',
    tab: 'Special',
    kind: 'evolve',
    price: 5000,
    color: '#4080d0',
    text: 'A peculiar scroll that can make a certain species of Pokémon evolve. Written upon it are the true secrets of the path of water.',
  },
  {
    id: 'galarica-cuff',
    name: 'Galarica Cuff',
    tab: 'Special',
    kind: 'evolve',
    price: 5000,
    color: '#b07850',
    text: 'A cuff made from woven-together Galarica Twigs. Giving it to Galarian Slowpoke makes the Pokémon very happy.',
  },
  {
    id: 'galarica-wreath',
    name: 'Galarica Wreath',
    tab: 'Special',
    kind: 'evolve',
    price: 5000,
    color: '#b07850',
    text: 'A wreath made from woven-together Galarica Twigs. Placing it on the head of a Galarian Slowpoke makes the Pokémon very happy.',
  },
  {
    id: 'rare-candy',
    name: 'Rare Candy',
    tab: 'Other',
    kind: 'candy',
    price: 4800,
    color: '#a070f0',
    text: 'A candy that is packed with energy. When consumed, it will instantly raise the level of a single Pokémon by one.',
  },
  {
    id: 'lucky-egg',
    name: 'Lucky Egg',
    tab: 'Other',
    kind: 'hold',
    price: 10000,
    color: '#f8f0d0',
    text: "An item to be held by a Pokémon. It's an egg filled with happiness that earns the holder extra XP as you work together.",
  },
  {
    id: 'soothe-bell',
    name: 'Soothe Bell',
    tab: 'Other',
    kind: 'hold',
    price: 4000,
    color: '#f0d060',
    text: 'An item to be held by a Pokémon. The comforting chime of this bell calms the holder, making it friendly faster.',
  },
  {
    id: 'everstone',
    name: 'Everstone',
    tab: 'Other',
    kind: 'hold',
    price: 0,
    color: '#c8c8c8',
    isSold: false,
    text: 'An item to be held by a Pokémon. A Pokémon holding this peculiar stone is prevented from evolving.',
  },
]

const BY_ID = new Map(ITEMS.map(i => [i.id, i]))

export const itemById = (id: string): Item | undefined => BY_ID.get(id)
export const isItemId = (id: unknown): id is string => typeof id === 'string' && BY_ID.has(id)
export const isForSale = (item: Item | undefined) => Boolean(item && item.isSold !== false)
export const forSale = (): Item[] => ITEMS.filter(isForSale)
export const itemName = (id: string) => itemById(id)?.name ?? id

// "a Thunder Stone", "an Up-Grade".
export const withArticle = (name: string) => `${/^[AEIOU]/.test(name) ? 'an' : 'a'} ${name}`

// The item a give names, from slugged words, and the words left for the Pokémon: the item comes first or last.
export function splitGive(words: string[]): { item: Item; rest: string[] } | null {
  for (let n = words.length; n > 0; n--) {
    const front = itemById(words.slice(0, n).join('-'))
    if (front) return { item: front, rest: words.slice(n) }
    const back = itemById(words.slice(words.length - n).join('-'))
    if (back) return { item: back, rest: words.slice(0, words.length - n) }
  }
  return null
}
