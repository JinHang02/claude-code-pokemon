// Writes plugin/hooks/species-data.ts: per sprite-list species, its catch rate, tier, stage, types and forms (with
// whether a form can turn up in the wild). Run it when PokeAPI or the sprite list changes:
//   node scripts/species-data.mjs
import { writeFile } from 'node:fs/promises'

const LIST_URL = 'https://gitlab.com/phoneybadger/pokemon-colorscripts/-/raw/main/pokemon.json'
const API = 'https://pokeapi.co/api/v2'
const deadline = Date.now() + 10 * 60_000

const ULTRA_BEASTS = new Set([
  'nihilego',
  'buzzwole',
  'pheromosa',
  'xurkitree',
  'celesteela',
  'kartana',
  'guzzlord',
  'poipole',
  'naganadel',
  'stakataka',
  'blacephalon',
])
const NOT_WILD_FORM = [
  /^mega(-[xy])?$/,
  /(^|-)gmax$/,
  /^primal$/,
  /^eternamax$/,
  /^ultra$/,
  /^(galar-)?zen$/,
  /^(school|blade|complete|busted|gulping|gorging|hangry|noice|ash|crowned|unbound|sunshine|eternal)$/,
  /^totem/,
  /^(belle|libre|phd|pop-star|rock-star|cosplay)$/,
  /-cap$/,
  /^starter$/,
  /^(hisui-)?noble$/,
  /^(shadow|ice)-rider$/,
  // Event and gift forms: Spiky-eared Pichu, Dada Zarude, Fancy and Poké Ball Vivillon.
  /^(spiky-eared|dada|fancy|poke-ball)$/,
  // Forms that need a held item: the Therian formes (Reveal Glass, Mirror) and the Origin formes (Griseous, Adamant and
  // Lustrous Orbs).
  /^(therian|origin)$/,
]
// Shadow Lugia (XD) is Psychic/Dark, which PokeAPI lacks; Original Color Magearna is a gift.
const NOT_WILD_PAIR = new Set([
  'necrozma:dawn',
  'necrozma:dusk',
  'kyurem:black',
  'kyurem:white',
  'lugia:shadow',
  'magearna:original',
  // Item, meteorite or move triggers: Rotom's appliances, Deoxys' formes, Genesect's Drives, Gracidea, Secret Sword.
  ...['fan', 'frost', 'heat', 'mow', 'wash'].map(f => `rotom:${f}`),
  ...['attack', 'defense', 'speed'].map(f => `deoxys:${f}`),
  ...['burn', 'chill', 'douse', 'shock'].map(f => `genesect:${f}`),
  'shaymin:sky',
  'keldeo:resolute',
])
// Forms PokeAPI has no entry for whose types match the regular form's.
// Alcremie's sweets, Minior's gen7 colours, Spinda and Marshadow's gen7 share the regular types.
const KNOWN_SAME_TYPES = pair =>
  /^alcremie:/.test(pair) ||
  /^minior:.*-gen7$/.test(pair) ||
  ['marshadow:gen7', 'spinda:blank', 'spinda:filled'].includes(pair)
// Arceus and Silvally alternates are type forms, Furfrou's are trims from a groomer, Alcremie's are sweets from spinning
// Milcery: never wild.
const ALL_FORMS_NOT_WILD = new Set(['arceus', 'silvally', 'furfrou', 'alcremie'])

// Resolves to null on a 404; retries anything else.
async function get(url) {
  for (let tries = 1; ; tries++) {
    if (Date.now() > deadline) throw new Error('gave up after 10 minutes')
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
      return await res.json()
    } catch (err) {
      if (tries === 3) throw err
    }
  }
}

// `fn` over `items`, `size` at a time, results in order.
async function pool(items, size, fn) {
  const out = []
  let next = 0
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const at = next++
        out[at] = await fn(items[at])
      }
    }),
  )
  return out
}

const typeNames = p => [...p.types].sort((a, b) => a.slot - b.slot).map(t => t.type.name)

const list = (await get(LIST_URL)).map(p => ({ name: p.name, forms: p.forms }))
const speciesByName = new Map()
async function speciesOf(name) {
  if (!speciesByName.has(name)) {
    const s = await get(`${API}/pokemon-species/${name}`)
    if (!s) throw new Error(`no PokeAPI species for ${name}`)
    speciesByName.set(name, s)
  }
  return speciesByName.get(name)
}
await pool(list, 8, p => speciesOf(p.name))

// Depth in the evolution chain (1 = first), and whether the chain's root is a baby.
async function chainOf(name) {
  let s = await speciesOf(name)
  let depth = 1
  while (s.evolves_from_species) {
    s = await speciesOf(s.evolves_from_species.name)
    depth++
  }
  return { depth, rootIsBaby: s.is_baby }
}

const table = {}
// Forms found in neither /pokemon nor /pokemon-form, so given the regular types.
const fallbacks = []
await pool(list, 8, async p => {
  const s = await speciesOf(p.name)
  const { depth, rootIsBaby } = await chainOf(p.name)
  // A chain that starts at a baby counts its first real stage as 1.
  const stage = rootIsBaby && !s.is_baby ? depth - 1 : depth
  const tier = ULTRA_BEASTS.has(p.name)
    ? 'ultra-beast'
    : s.is_mythical
      ? 'mythical'
      : s.is_legendary
        ? 'legendary'
        : 'common'

  const mon = (await get(`${API}/pokemon/${p.name}`)) ?? (await get(s.varieties.find(v => v.is_default).pokemon.url))
  const types = typeNames(mon)

  const forms = {}
  for (const f of p.forms.filter(f => f !== 'regular')) {
    let formTypes = types
    let battleOnly = false
    // PokeAPI sometimes names a form's Pokémon with a suffix (darmanitan-galar-standard).
    const suffixed = s.varieties.find(v => v.pokemon.name.startsWith(`${p.name}-${f}-`))
    const variety = (await get(`${API}/pokemon/${p.name}-${f}`)) ?? (suffixed ? await get(suffixed.pokemon.url) : null)
    let form = variety?.forms?.[0] ? await get(variety.forms[0].url) : null
    if (variety) {
      formTypes = typeNames(variety)
    } else {
      form = await get(`${API}/pokemon-form/${p.name}-${f}`)
      if (form) formTypes = typeNames(form)
      else fallbacks.push(`${p.name}:${f}`)
    }
    battleOnly = Boolean(form?.is_battle_only || form?.is_mega)
    const isWild =
      !battleOnly &&
      !NOT_WILD_FORM.some(re => re.test(f)) &&
      !NOT_WILD_PAIR.has(`${p.name}:${f}`) &&
      !ALL_FORMS_NOT_WILD.has(p.name)
    forms[f] = { types: formTypes, isWild }
  }
  table[p.name] = { rate: s.capture_rate, tier, isBaby: s.is_baby, stage, types, forms }
})

console.log(`${fallbacks.length} forms fell back to the regular types: ${fallbacks.sort().join(' ')}`)
// Only wild forms need right types; a form that is never wild may keep the regular ones.
const unexpected = fallbacks.filter(x => table[x.split(':')[0]].forms[x.split(':')[1]].isWild && !KNOWN_SAME_TYPES(x))
if (unexpected.length)
  throw new Error(
    `forms with no PokeAPI types, add them to KNOWN_SAME_TYPES if the regular types are right: ${unexpected}`,
  )

const ordered = Object.fromEntries(list.map(p => [p.name, table[p.name]]))
const out = [
  "// Generated by scripts/species-data.mjs from PokeAPI and the sprite list: don't edit by hand.",
  'export type SpeciesInfo = {',
  '  rate: number',
  "  tier: 'common' | 'legendary' | 'mythical' | 'ultra-beast'",
  '  isBaby: boolean',
  '  stage: 1 | 2 | 3',
  '  types: string[]',
  '  forms: Record<string, { types: string[]; isWild: boolean }>',
  '}',
  `export const SPECIES: Record<string, SpeciesInfo> = ${JSON.stringify(ordered)}`,
  '',
].join('\n')
await writeFile(new URL('../plugin/hooks/species-data.ts', import.meta.url), out)

const all = Object.values(ordered)
const count = t => all.filter(s => s.tier === t).length
const formEntries = all.flatMap(s => Object.values(s.forms))
console.log(
  `${all.length} species; common ${count('common')}, legendary ${count('legendary')}, mythical ${count('mythical')}, ` +
    `ultra-beast ${count('ultra-beast')}; babies ${all.filter(s => s.isBaby).length}; ` +
    `forms ${formEntries.length}, non-wild ${formEntries.filter(f => !f.isWild).length}`,
)
