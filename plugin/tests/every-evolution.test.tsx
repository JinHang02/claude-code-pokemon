import { expect, test } from 'claude-code/testing'

import { FRIENDSHIP_MS } from '../hooks/evolution'
import type { Time } from '../hooks/evolution'
import { itemName } from '../hooks/items'
import { spell } from '../hooks/lookup'
import { emptySave, xpForLevel } from '../hooks/save'
import type { Member, Save } from '../hooks/save'
import { CHAIN_OF, CHAINS, GENDER_RATES, LIST } from './fixtures/evolutions'
import { evolutionPaths } from './paths'
import type { Path } from './paths'
import { answerTools, bash, begin, cmd, member, until } from './world'
import type { Net } from './world'

// The test runner has a console; the plugin's types leave it out. scripts/evolution-coverage.mjs reads these lines.
declare const console: { log: (line: string) => void }

const PATHS = evolutionPaths()
console.log(`COVERAGE-TOTAL|${PATHS.length}`)

const chains = Object.fromEntries(LIST.map(s => [s.name, CHAINS[CHAIN_OF[s.name] ?? -1]]).filter(([, c]) => c))
// The plugin's hour at clock 0: the machine's own offset, or the +0800 the fake `date` answers when it claims UTC.
const offsetHours = (-new Date().getTimezoneOffset() || 480) / 60
const HOURS: Record<Time, number> = { day: 12, night: 23, dusk: 18 }
const clockAt = (time: Time | undefined) => ((((HOURS[time ?? 'day'] - offsetHours) % 24) + 24) % 24) * 3_600_000
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

for (const p of PATHS)
  test(`${p.from} (${p.fromForm}${p.gender ? `, ${p.gender}` : ''}) → ${p.to} (${p.toForm}): ${how(p)}`, async ($, on) => {
    answerTools(on)
    const w = p.stage.way
    const time = 'time' in w ? w.time : undefined
    const now = clockAt(time)
    const start: Member = member(p.from, { form: p.fromForm, ...(p.gender ? { gender: p.gender } : {}) })
    const party: Member[] = [start]
    const save: Save = { ...emptySave(), party }
    if (w.kind === 'level') start.xp = xpForLevel(w.level) - 5
    if (w.kind === 'level' && w.partyType) party.push(member('umbreon'))
    if (w.kind === 'shed') start.xp = xpForLevel(p.siblingLevel ?? 20) - 5
    if (w.kind === 'item' || w.kind === 'hold') save.bag = { [w.item]: 1 }
    if (w.kind === 'friendship') {
      start.togetherMs = FRIENDSHIP_MS - 30_000
      save.togetherAt = now
    }
    if (w.kind === 'party') party.push(member(w.species))
    const env = await begin($, on, save, undefined, undefined, net(now))
    const mine = () => env.saveNow().party.find(m => m.id === start.id)
    const evolved = () => mine()?.species !== p.from
    await until($, () => mine()?.next !== undefined || evolved())
    if (w.kind === 'level' || w.kind === 'shed') {
      // One level short: nothing yet.
      expect(mine()?.species).toBe(p.from)
      await $.tool.call(bash('git commit -m x') as never)
    }
    if (w.kind === 'item' || w.kind === 'hold')
      await cmd($, 'pokemon', `give ${w.item} ${spell({ dex: 0, species: p.from, form: p.fromForm })}`)
    if (w.kind === 'friendship') await env.clock.advance(120_000)
    for (let i = 0; i < 20 && !evolved(); i++) await env.clock.advance(1_000)
    await until($, evolved)
    const got = mine()
    const everyone = [...env.saveNow().party, ...(env.saveNow().box ?? [])]
    // Shedinja's path: Nincada itself becomes Ninjask, and Shedinja comes along.
    const result =
      w.kind === 'shed'
        ? everyone.some(m => m.species === 'shedinja')
          ? 'ok'
          : 'got no shedinja'
        : got && p.ties.includes(`${got.species}:${got.form}`)
          ? 'ok'
          : `got ${got?.species}:${got?.form}`
    console.log(`COVERAGE|${p.kind}|${p.from}|${p.fromForm}|${p.to}|${p.toForm}|${how(p)}|${result}`)
    expect(result).toBe('ok')
    if (w.kind === 'item' || w.kind === 'hold') expect(env.saveNow().bag?.[w.item] ?? 0).toBe(0)
    if (w.kind === 'hold') expect(got?.heldItem).toBeUndefined()
  })
