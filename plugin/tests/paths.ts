import { evolvedForm, nextStages, pokeapiForm } from '../hooks/evolution'
import type { ChainLink, Stage } from '../hooks/evolution'
import { CHAIN_OF, CHAINS, LIST } from './fixtures/evolutions'

export type PathKind = 'level' | 'fallback' | 'item' | 'hold' | 'friendship' | 'party' | 'shed'
// One evolution between two species the plugin shows. `ties`: every `species:form` the same trigger can give (Wurmple
// becomes Silcoon or Cascoon). `siblingLevel`: for Shedinja, the level Nincada becomes Ninjask at.
export type Path = {
  kind: PathKind
  from: string
  fromForm: string
  gender?: 'female' | 'male'
  to: string
  toForm: string
  stage: Stage
  ties: string[]
  siblingLevel?: number
}

const FORMS = new Map(LIST.map(s => [s.name, s.forms]))

export const chainFor = (species: string): ChainLink | undefined => CHAINS[CHAIN_OF[species] ?? -1] as ChainLink

const find = (chain: ChainLink, name: string): ChainLink | undefined =>
  chain.species.name === name ? chain : chain.evolves_to.map(c => find(c, name)).find(Boolean)

const kindOf = (s: Stage): PathKind =>
  s.way.kind === 'level' && s.way.isFallback ? 'fallback' : (s.way.kind as PathKind)

// The way without its level's fallback mark: two stages with this key happen on the same trigger.
const triggerKey = (s: Stage) => JSON.stringify(s.way)

// Genders worth trying for `name`: both when a way out of it is for one gender only.
function gendersOf(chain: ChainLink, name: string): ('female' | 'male' | undefined)[] {
  const link = find(chain, name)
  const isSplit = (link?.evolves_to ?? []).some(c => (c.evolution_details ?? []).some(d => d.gender))
  return isSplit ? ['female', 'male'] : [undefined]
}

// Every evolution between two species in the sprite list, per starting form and gender that changes the outcome.
// Forms that evolve as the plain species (Gigantamax, Mega) are the same path and kept once.
export function evolutionPaths(): Path[] {
  const paths = new Map<string, Path>()
  for (const { name, forms } of LIST) {
    const chain = chainFor(name)
    if (!chain) continue
    const others = forms.filter(f => f !== 'regular')
    for (const form of forms)
      for (const gender of gendersOf(chain, name)) {
        const stages = nextStages(chain, name, pokeapiForm(name, form), gender ?? undefined, others).filter(s =>
          FORMS.has(s.species),
        )
        const formOf = (s: Stage) => evolvedForm(s, form, FORMS.get(s.species) ?? [])
        const level = stages.find(s => s.way.kind === 'level')
        for (const stage of stages) {
          const toForm = formOf(stage)
          const key = `${name}|${gender ?? ''}|${stage.species}|${toForm}|${triggerKey(stage)}`
          if (paths.has(key)) continue
          paths.set(key, {
            kind: kindOf(stage),
            from: name,
            fromForm: form,
            ...(gender ? { gender } : {}),
            to: stage.species,
            toForm,
            stage,
            ties: stages.filter(s => triggerKey(s) === triggerKey(stage)).map(s => `${s.species}:${formOf(s)}`),
            ...(stage.way.kind === 'shed' && level?.way.kind === 'level' ? { siblingLevel: level.way.level } : {}),
          })
        }
      }
  }
  return [...paths.values()]
}
