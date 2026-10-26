// The region whose forms evolutions take (/pokemon region): with none (Kanto, the default) a Pokémon evolving by
// itself or by an item keeps its own form, as outside those regions in the games; with Alola a Thunder Stone makes
// a Pikachu an Alolan Raichu, as in Alola. Shared by the save, the commands and the evolutions. Wild Pokémon are
// unaffected: they come in every form wherever you are.
export type Region = 'alola' | 'galar' | 'hisui' | 'paldea'

export const REGIONS: Region[] = ['alola', 'galar', 'hisui', 'paldea']

export const isRegion = (word: unknown): word is Region => REGIONS.includes(word as Region)

// Each word /pokemon region takes, Kanto (no region: each Pokémon's own form) first, with what it does.
export const REGION_TEXT: Record<Region | 'kanto', string> = {
  kanto: "each Pokémon's own form, the default",
  alola: 'Alolan forms (Raichu, Exeggutor, Marowak)',
  galar: 'Galarian forms (Weezing, Mr. Mime)',
  hisui: 'Hisuian forms (Typhlosion, Samurott, Decidueye)',
  paldea: 'Paldean forms, where a Pokémon has one',
}
// As a form's name says it: Alolan Raichu.
export const REGIONAL: Record<Region, string> = {
  alola: 'Alolan',
  galar: 'Galarian',
  hisui: 'Hisuian',
  paldea: 'Paldean',
}
export const REGION_WORDS = Object.keys(REGION_TEXT) as (Region | 'kanto')[]

// A typed word as a region: one of the four (or its adjective, `alolan`), null for none (`kanto`, `none`, `off`),
// undefined for a word that is neither.
export function readRegion(word: string): Region | null | undefined {
  if (word === 'kanto' || word === 'none' || word === 'off') return null
  return REGIONS.find(r => r === word || REGIONAL[r].toLowerCase() === word)
}

// The forms the games give a species in another region (`galar-standard` is Darmanitan's).
export const isRegional = (form: string) => /^(alola|galar|hisui|paldea)\b/.test(form)

// A form of `region`'s (`galar`, `galar-zen`); none for no region.
export const isFrom = (form: string, region?: Region) =>
  region !== undefined && (form === region || form.startsWith(`${region}-`))

// Which of the stages an evolution may take now it picks from, when the person didn't name one: the chosen region's
// form when one is offered, else the Pokémon's own (a regional form other than its own is left to those who ask for
// it), else whatever is left (Cubone at night has only Alolan Marowak). Looks (Vivillon's patterns) and other forms
// are never regional, so they stay in every pool.
export function regionPool<T>(choices: T[], formOf: (s: T) => string, own: string, region?: Region): T[] {
  const local = choices.filter(s => isFrom(formOf(s), region))
  if (local.length) return local
  const kept = choices.filter(s => !isRegional(formOf(s)) || formOf(s) === own)
  return kept.length ? kept : choices
}
