type Named = { name: string }

// One way a species is reached: the level it needs, and the PokeAPI forms it starts from and ends as
// (`meowth-galar` only; `raichu-alola`).
// `gender`: 1 when only females evolve this way, 2 when only males.
export type EvolutionDetail = {
  min_level?: number | null
  gender?: number | null
  required_pokemon_form?: Named | null
  evolved_pokemon_form?: Named | null
}

// A PokeAPI evolution chain node; `evolution_details` say how its species is reached.
export type ChainLink = {
  species: Named
  evolves_to: ChainLink[]
  evolution_details?: EvolutionDetail[]
}

// Evolutions with no level in the games (a stone, a trade, friendship, a held item...) happen here, unless
// another branch evolves by level: then they happen at that level, so neither branch shuts out the other.
export const OTHER_EVOLVE_LEVEL = 30

// `form`: the PokeAPI form the evolution leads to (`raichu-alola`), when the games name one.
export type Stage = { species: string; level: number; form?: string }

const find = (chain: ChainLink, name: string): ChainLink | undefined =>
  chain.species.name === name ? chain : chain.evolves_to.map(c => find(c, name)).find(Boolean)

export type Gender = 'female' | 'male' | null

// A Pokémon's gender from its species' `gender_rate` (eighths female; -1 genderless). A species with a single
// gender always has it; otherwise `was` stays when it's set, or one is rolled.
export function genderOf(rate: unknown, was: Gender | undefined, rand = Math.random): Gender {
  if (typeof rate !== 'number' || rate < 0) return null
  if (rate === 0) return 'male'
  if (rate === 8) return 'female'
  return was === 'female' || was === 'male' ? was : rand() < rate / 8 ? 'female' : 'male'
}

const GENDER_CODES: Record<number, Gender> = { 1: 'female', 2: 'male' }

// What `name` evolves into and at which level, from the PokeAPI form `formName` (`meowth-galar`); empty for a
// final stage or a name not in the chain. Ways for the other gender never apply (`gender` undefined: any).
// A form with evolutions of its own takes only those; a form the games give none (Gigantamax) evolves as the
// plain species; the plain species also answers to the games' own name for it (`burmy-plant`: a form missing
// from `forms`, the species' forms in the sprite list); otherwise the evolutions no form is named for apply.
export function nextStages(
  chain: ChainLink,
  name: string,
  formName = name,
  gender?: Gender,
  forms: string[] = [],
): Stage[] {
  const ways = (find(chain, name)?.evolves_to ?? [])
    .flatMap(child =>
      (child.evolution_details?.length ? child.evolution_details : [{}]).map(detail => ({ child, detail })),
    )
    .filter(w => gender === undefined || !w.detail.gender || GENDER_CODES[w.detail.gender] === gender)
  const required = (w: (typeof ways)[number]) => w.detail.required_pokemon_form?.name
  const forForm = (form: string) => ways.filter(w => required(w) === form)
  const asPlain =
    formName === name && forms.length
      ? ways.filter(
          w => required(w)?.startsWith(`${name}-`) && !forms.includes(required(w)?.slice(name.length + 1) ?? ''),
        )
      : []
  const chosen = [forForm(formName), forForm(name), asPlain].find(w => w.length) ?? ways.filter(w => !required(w))
  const stages = new Map<string, { species: string; form?: string; level: number | null }>()
  for (const { child, detail } of chosen) {
    const form = detail.evolved_pokemon_form?.name
    const key = `${child.species.name}|${form ?? ''}`
    const level = typeof detail.min_level === 'number' ? detail.min_level : null
    const had = stages.get(key)?.level ?? null
    const best = had === null ? level : level === null ? had : Math.min(had, level)
    stages.set(key, { species: child.species.name, ...(form ? { form } : {}), level: best })
  }
  const levels = [...stages.values()].map(s => s.level).filter((l): l is number => l !== null)
  const otherLevel = levels.length ? Math.max(...levels) : OTHER_EVOLVE_LEVEL
  return [...stages.values()].map(s => ({ ...s, level: s.level ?? otherLevel }))
}

// The plugin's form for an evolved `stage` (forms as the sprite list names them: `alola`, `galar`...): the one
// the games name when the sprites have it; otherwise the member's own form when the evolved species has it.
export function evolvedForm(stage: Stage, memberForm: string, forms: string[]): string {
  if (stage.form !== undefined) {
    const named = stage.form.startsWith(`${stage.species}-`) ? stage.form.slice(stage.species.length + 1) : ''
    // `darmanitan-galar-standard` is the sprites' `galar`.
    return forms.includes(named) ? named : (forms.find(f => f !== 'regular' && named.startsWith(`${f}-`)) ?? 'regular')
  }
  return forms.includes(memberForm) ? memberForm : 'regular'
}

// The PokeAPI form name of a species in one of the plugin's forms: `meowth-galar`, `pikachu`.
export const pokeapiForm = (species: string, form: string) => (form === 'regular' ? species : `${species}-${form}`)
