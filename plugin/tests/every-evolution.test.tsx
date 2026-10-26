import { expect, test } from 'claude-code/testing'

import { chooseStage, FRIENDSHIP_MS } from '../hooks/evolution'
import type { Time } from '../hooks/evolution'
import { itemName } from '../hooks/items'
import { isFullMoonAt } from '../hooks/moon'
import { spell } from '../hooks/lookup'
import { emptySave, xpForLevel } from '../hooks/save'
import type { Member, Save } from '../hooks/save'
import { CHAIN_OF, CHAINS, GENDER_RATES, LIST } from './fixtures/evolutions'
import { evolutionPaths } from './paths'
import type { Path } from './paths'
import { IS_COVERAGE_RUN } from './coverage-run'
import { answerTools, bash, begin, cmd, KIT, member } from './world'
import type { Net } from './world'

// The test runner has a console; the plugin's types leave it out. scripts/evolution-coverage.mjs reads these lines.
declare const console: { log: (line: string) => void }

const chains = Object.fromEntries(LIST.map(s => [s.name, CHAINS[CHAIN_OF[s.name] ?? -1]]).filter(([, c]) => c))
// The plugin's hour at clock 0: the machine's own offset, or the +0800 the fake `date` answers when it claims UTC.
const offsetHours = (-new Date().getTimezoneOffset() || 480) / 60
const HOURS: Record<Time, number> = { day: 12, night: 23, dusk: 18, 'full-moon': 23 }
const hourMs = (time: Time | undefined) => ((((HOURS[time ?? 'day'] - offsetHours) % 24) + 24) % 24) * 3_600_000
// A full moon's paths play on the first night after the epoch with the moon full (Ursaluna).
const FULL_MOON_DAY = Array.from({ length: 30 }, (_, d) => d).find(d => isFullMoonAt(d * 86_400_000 + hourMs('night')))
const clockAt = (time: Time | undefined) =>
  hourMs(time) + (time === 'full-moon' ? (FULL_MOON_DAY ?? 0) * 86_400_000 : 0)
const net = (now: number): Net => ({
  isOnline: true,
  list: JSON.stringify(LIST),
  chains,
  genderRates: GENDER_RATES,
  types: { umbreon: ['dark'] },
  now,
})

// How a path is triggered, for the checklist.
function how(p: Path): string {
  const w = p.stage.way
  const when = 'time' in w && w.time ? ` (${w.time})` : ''
  if (w.kind === 'level')
    return `${w.isFallback ? 'fallback ' : ''}Lv ${w.level}${when}${w.partyType ? ` with a ${w.partyType} type` : ''}`
  if (w.kind === 'item') return `give ${itemName(w.item)}${when}`
  if (w.kind === 'hold') return `hold ${itemName(w.item)}${when}`
  if (w.kind === 'friendship') return `10 h together${when}`
  if (w.kind === 'party') return `with ${w.species} in the party`
  return `room in the party when Nincada evolves at Lv ${p.siblingLevel}`
}

// A regional form the Pokémon doesn't have, where another branch is due too: never taken by itself (a Kanto Pikachu
// becomes a Kanto Raichu), only when the branch is named, as a player asks for it.
const isRegional = (form: string) => /^(alola|galar|hisui|paldea)\b/.test(form)
const isAskedFor = (p: Path) =>
  isRegional(p.toForm) && p.toForm !== p.fromForm && p.ties.some(t => !isRegional(t.split(':')[1] ?? ''))

// A member id whose own pick, among the evolutions its trigger makes due together, is this path's target: Wurmple's
// Silcoon row is played by a Wurmple that becomes Silcoon, its Cascoon row by one that becomes Cascoon.
function idFor(n: number, p: Path): string {
  const target = `${p.to}:${p.toForm}`
  for (let i = 0; i < 1000; i++) if (chooseStage(`p${n}-${i}`, p.ties) === target) return `p${n}-${i}`
  throw new Error(`no member id picks ${target} among ${p.ties.join(', ')}`)
}

// The report, for scripts/evolution-coverage.mjs only: every path up front, then one result per path, even one that
// fails before it gets there. Other runs print a path's line only when it fails.
const PATHS = evolutionPaths()
if (IS_COVERAGE_RUN) {
  console.log(`COVERAGE-TOTAL|${PATHS.length}`)
  PATHS.forEach((p, n) =>
    console.log(`COVERAGE-PATH|${n}|${p.kind}|${p.from}|${p.fromForm}|${p.gender ?? ''}|${p.to}|${p.toForm}|${how(p)}`),
  )
}

PATHS.forEach((p, n) =>
  test(
    `${p.from} (${p.fromForm}${p.gender ? `, ${p.gender}` : ''}) → ${p.to} (${p.toForm}): ${how(p)}`,
    KIT,
    async ($, on) => {
      let isReported = false
      const report = (result: string) => {
        if (!isReported && (IS_COVERAGE_RUN || result !== 'ok'))
          console.log(`COVERAGE|${n}|${result.replace(/[|\s]+/g, ' ').slice(0, 200)}`)
        isReported = true
      }
      try {
        answerTools(on)
        const w = p.stage.way
        const time = 'time' in w ? w.time : undefined
        const now = clockAt(time)
        const start: Member = member(p.from, {
          id: idFor(n, p),
          form: p.fromForm,
          ...(p.gender ? { gender: p.gender } : {}),
        })
        const party: Member[] = [start]
        const asks = isAskedFor(p)
        const into = asks ? ` ${spell({ dex: 0, species: p.to, form: p.toForm })}` : ''
        const save: Save = { ...emptySave(), evolution: asks ? 'manual' : 'auto', party }
        if (w.kind === 'level') start.xp = xpForLevel(w.level) - 5
        if (w.kind === 'level' && w.partyType) party.push(member('umbreon'))
        if (w.kind === 'shed') start.xp = xpForLevel(p.siblingLevel ?? 20) - 5
        if (w.kind === 'item' || w.kind === 'hold') save.bag = { [w.item]: 1 }
        // Time together lives under its own store key, by member id.
        const together = { at: now, ms: { [start.id]: FRIENDSHIP_MS - 30_000 } }
        if (w.kind === 'party') party.push(member(w.species))
        const env = await begin($, on, save, undefined, undefined, {
          ...net(now),
          ...(w.kind === 'friendship' ? { keys: { together } } : {}),
        })
        const mine = () => env.saveNow().party.find(m => m.id === start.id)
        const evolved = () => mine()?.species !== p.from
        // A command at a time, for background work (an evolution's fetches) to land.
        const settle = async (done: () => boolean, failure: () => string) => {
          for (let i = 0; i < 50 && !done(); i++) await cmd($, 'pokemon', 'party')
          if (!done()) throw new Error(failure())
        }
        await settle(
          () => mine()?.next !== undefined || evolved(),
          () => 'never learned how it evolves',
        )
        if (w.kind === 'level' || w.kind === 'shed') {
          // One level short: nothing yet.
          if (evolved()) throw new Error(`evolved a level early, into ${mine()?.species}:${mine()?.form}`)
          await $.tool.call(bash('git commit -m x') as never)
          if (asks) await cmd($, 'pokemon', `evolve ${spell({ dex: 0, species: p.from, form: p.fromForm })}${into}`)
        }
        if (w.kind === 'item' || w.kind === 'hold')
          await cmd($, 'pokemon', `give ${w.item} ${spell({ dex: 0, species: p.from, form: p.fromForm })}${into}`)
        if (w.kind === 'friendship') await env.clock.advance(120_000)
        for (let i = 0; i < 20 && !evolved(); i++) await env.clock.advance(1_000)
        await settle(evolved, () => `never evolved: still ${p.from}`)
        const after = env.saveNow()
        const got = mine()
        const problems: string[] = []
        // Shedinja's path: Nincada itself becomes Ninjask, and Shedinja comes along, caught.
        if (w.kind === 'shed') {
          if (![...after.party, ...(after.box ?? [])].some(m => m.species === 'shedinja'))
            problems.push('got no shedinja')
          if (!after.dex.shedinja?.caught) problems.push('shedinja not caught in the Pokédex')
        } else if (`${got?.species}:${got?.form}` !== `${p.to}:${p.toForm}`)
          problems.push(`got ${got?.species}:${got?.form}`)
        if (got?.evolutions !== 1) problems.push(`evolved ${got?.evolutions} times`)
        if (!after.dex[p.to]?.seen) problems.push(`${p.to} not seen in the Pokédex`)
        // What it became is caught, once.
        if (got && after.dex[got.species]?.caught !== 1)
          problems.push(`${got.species} caught ${after.dex[got.species]?.caught ?? 0} times in the Pokédex`)
        if ((w.kind === 'item' || w.kind === 'hold') && (after.bag?.[w.item] ?? 0) !== 0)
          problems.push(`${w.item} not used up`)
        if (w.kind === 'hold' && got?.heldItem) problems.push(`still holds ${got.heldItem}`)
        const result = problems.join('; ') || 'ok'
        report(result)
        expect(result).toBe('ok')
      } catch (err) {
        report(err instanceof Error ? err.message : String(err))
        throw err
      }
    },
  ),
)
