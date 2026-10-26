// Bugs found in the October 2026 audit: each test failed before its fix.
import { expect, test } from 'claude-code/testing'

import { localHourOf } from '../hooks/backdrop'
import { suggest } from '../hooks/commands'
import type { Owned } from '../hooks/commands'
import { chooseStage } from '../hooks/evolution'
import { classify } from '../hooks/reactions'
import { emptySave, level, SAVE_VERSION, xpForLevel } from '../hooks/save'
import { CHAIN_OF, CHAINS } from './fixtures/evolutions'
import { bash, begin, cmd, KIT, LIST, member, until } from './world'

test('a save read the store refuses at start-up leaves the lead alone: nothing new is caught', KIT, async ($, on) => {
  let reads = 0
  const net = {
    isOnline: true,
    list: JSON.stringify(LIST),
    isStoreBroken: true,
    // Only the first read of the save fails, as when another window holds the store's lock.
    beforeGet: (key: string) => {
      if (key === 'save' && ++reads > 1) net.isStoreBroken = false
    },
  }
  const saved = { ...emptySave(), party: [member('charizard', { id: 'zard', xp: 9000, next: [] })] }
  const w = await begin($, on, saved, undefined, undefined, net)
  for (let i = 0; i < 20; i++) await w.clock.settle()
  await cmd($, 'pokemon', 'party')
  expect(w.saveNow().party.map(m => m.id)).toEqual(['zard'])
  expect(w.saveNow().box ?? []).toEqual([])
})

test(
  'a fold round folds every ended session in one save write, and the next round removes them',
  KIT,
  async ($, on) => {
    const N = 200
    const keys: Record<string, unknown> = {}
    for (let i = 0; i < N; i++) keys[`xp:old${i}`] = { at: 1, xp: { p: 2 }, money: 20 }
    let gets = 0
    let saveWrites = 0
    const saved = { ...emptySave(), party: [member('pikachu', { id: 'p', next: [], gender: 'male' })] }
    const w = await begin($, on, saved, undefined, undefined, {
      isOnline: true,
      list: JSON.stringify(LIST),
      keys,
      beforeGet: () => void gets++,
      beforeSet: (key: string) => void (key === 'save' && saveWrites++),
    })
    await cmd($, 'pokemon', 'party')
    ;[gets, saveWrites] = [0, 0]
    // 30 syncs make one fold round.
    for (let i = 0; i < 30; i++) await w.clock.advance(10_000)
    const s = w.saveNow()
    expect([s.folded?.length, s.party[0]?.xp, s.earned]).toEqual([N, 2 * N, 20 * N])
    expect(saveWrites).toBe(1)
    // Each sync reads every ledger once (30 * N); the fold itself adds a few reads per ledger, not N per ledger.
    expect(gets).toBeLessThan(35 * N)
    for (let i = 0; i < 30; i++) await w.clock.advance(10_000)
    expect([...w.store.keys()].filter(k => k.startsWith('xp:old')).length).toBe(0)
  },
)

test('a save stamped by a newer release is never written over: the command says to update', KIT, async ($, on) => {
  const newer = {
    ...emptySave(),
    party: [member('pikachu', { id: 'p', next: [] })],
    version: 99,
    badges: ['boulder'],
  }
  const w = await begin($, on, newer as never)
  const said = await cmd($, 'pokemon', 'add eevee')
  expect(said).toContain('A newer Pokémon Journey wrote your save')
  const raw = w.store.get('save') as { version?: number; badges?: string[]; party: unknown[] }
  expect([raw.version, raw.badges, raw.party.length]).toEqual([99, ['boulder'], 1])
})

test('every save written carries its version', KIT, async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu', { id: 'p', next: [] })] })
  await cmd($, 'pokemon', 'add eevee')
  expect((w.store.get('save') as { version?: number }).version).toBe(SAVE_VERSION)
})

// Ids whose roll lands on each of the two branches.
const ROLLS = ['a', 'b'].map(want => {
  for (let i = 0; ; i++) if (chooseStage(`x${i}`, ['a', 'b']) === want) return `x${i}`
})
for (const id of ROLLS)
  test(`a Thunder Stone makes a plain Pikachu a plain Raichu (id ${id})`, KIT, async ($, on) => {
    const pika = CHAINS[CHAIN_OF.pikachu ?? -1]
    const list = [
      { name: 'pikachu', forms: ['regular'] },
      { name: 'raichu', forms: ['regular', 'alola'] },
    ]
    const w = await begin(
      $,
      on,
      { ...emptySave(), bag: { 'thunder-stone': 1 }, party: [member('pikachu', { id })] },
      undefined,
      undefined,
      { isOnline: true, list: JSON.stringify(list), chains: { pikachu: pika, raichu: pika } },
    )
    await cmd($, 'pokemon', 'give thunder-stone pikachu')
    await until($, () => w.saveNow().party[0]?.species === 'raichu')
    expect(w.saveNow().party[0]?.form).toBe('regular')
  })

test('the local hour follows the clocks going back: a London session open across it reads 18:30 GMT as 18', () => {
  const at = Date.UTC(2026, 9, 26, 18, 30) // Monday 26 October, 18:30 GMT
  // Opened on Saturday in summer time: the clock knew its offset (+60), so no host offset was kept.
  expect(localHourOf(at, 0, null) % 24).toBe(18)
  // In summer time the same instant is 19.
  expect(localHourOf(at, 60, null) % 24).toBe(19)
  // A clock that claims UTC on a host at +08:00 uses the host's offset.
  expect(localHourOf(at, 0, 480) % 24).toBe(2)
})

test('a species PokeAPI has never heard of is looked up once, not every minute', KIT, async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('mewtwo', { id: 'm' })] }, undefined, undefined, {
    isOnline: true,
    list: JSON.stringify(LIST),
    missing: ['mewtwo'],
  })
  for (let i = 0; i < 10; i++) await w.clock.advance(60_000)
  expect(w.saveNow().party[0]?.next).toEqual([])
  expect(w.fetched.filter(u => u.includes('pokemon-species/mewtwo')).length).toBeLessThanOrEqual(2)
})

test(
  'a sprite cut short by a crash mid-write is fetched again, not drawn from the cache forever',
  KIT,
  async ($, on) => {
    const whole = '\x1b[38;2;255;0;0m\x1b[48;2;0;0;255m▀\x1b[0m\n\x1b[38;2;255;0;0m█\x1b[0m'
    const cut = whole.slice(0, whole.indexOf('\n') + 6)
    const files = new Map([['/home/ash/.cache/claude-code-pokemon/sprites/regular/pikachu', cut]])
    const w = await begin($, on, { ...emptySave(), party: [member('pikachu', { id: 'p', next: [] })] }, whole, files)
    await cmd($, 'pokemon', 'party')
    expect(w.fetched.some(u => u.endsWith('/regular/pikachu'))).toBe(true)
  },
)

const OWNED: Owned = {
  party: [member('pikachu', { id: 'p' }), member('mr-mime', { id: 'm', form: 'galar' })],
  box: [],
  bag: { 'fire-stone': 1 },
  levelOf: m => level(m.xp),
}
const typeahead = (text: string) => {
  const start = /\S*$/.exec(text)?.index ?? text.length
  return suggest(text, text.length, text.slice(start), start, OWNED).map(r => r.text)
}

test('the typeahead goes on past a space inside a name, for each kind of name', () => {
  expect(typeahead('/pokemon tapu k')).toEqual(['koko'])
  expect(typeahead('/pokemon add tapu l')).toEqual(['lele'])
  expect(typeahead('/pokemon release mr m')).toEqual(['mime galar'])
  expect(typeahead('/pokemon buy fire s')).toEqual(['stone '])
  expect(typeahead('/pokemon-play wild tapu b')).toEqual(['bulu'])
  // The Pokémon first and the item after, as give reads it.
  expect(typeahead('/pokemon give pikachu fi')).toEqual(['fire-stone '])
})

test('a level on its own names whoever is at it: evolve takes the one, release asks which', KIT, async ($, on) => {
  const w = await begin($, on, {
    ...emptySave(),
    party: [member('charmander', { id: 'c', xp: xpForLevel(16) }), member('pikachu', { id: 'p', isShiny: true })],
  })
  await until($, () => w.saveNow().party.every(m => m.next !== undefined))
  expect(await cmd($, 'pokemon', 'evolve lv 16')).toContain('Charmeleon')
  const asked = await cmd($, 'pokemon', 'release shiny')
  expect(asked).toContain('Pikachu')
  expect(w.saveNow().party.some(m => m.id === 'p')).toBe(true)
  expect(await cmd($, 'pokemon', 'evolve lv 99')).toContain('No lv 99 in your party')
})

test('a pasted sentence after a command answers at once instead of holding the plugin up', KIT, async ($, on) => {
  await begin($, on, { ...emptySave(), party: [member('eevee', { id: 'e', next: [] })] })
  const words = Array.from({ length: 80 }, (_, i) => `word${i % 7}`).join(' ')
  const t0 = performance.now()
  expect(await cmd($, 'pokemon', `evolve ${words}`)).toContain('No ')
  expect(performance.now() - t0).toBeLessThan(1500)
})

test('full-width digits pick and count like plain ones', KIT, async ($, on) => {
  const w = await begin($, on, {
    ...emptySave(),
    party: [member('pikachu', { id: 'p' }), member('eevee', { id: 'e1' }), member('eevee', { id: 'e2' })],
  })
  await cmd($, 'pokemon', 'release eevee ２')
  expect(w.saveNow().party.map(m => m.id)).toEqual(['p', 'e1'])
  // Three Fire Stones at ₽3,000 each, against the ₽3,000 a new player has.
  expect(await cmd($, 'pokemon', 'buy fire stone ３')).toContain('₽6,000 more to go')
})

test('/pokemon buy and /pokemon bag wrap their lists to the terminal', KIT, async ($, on) => {
  await begin($, on, {
    ...emptySave(),
    party: [member('pikachu', { id: 'p' })],
    bag: { 'fire-stone': 1, 'water-stone': 2, 'thunder-stone': 3, 'leaf-stone': 4, 'moon-stone': 5, 'sun-stone': 6 },
  })
  for (const args of ['buy', 'bag']) {
    const text = (await $.command.run({ command: 'pokemon', args, presentation: { columns: 60 } } as never)).text ?? ''
    expect(text.split('\n').filter(l => [...l].length > 60 - 5)).toEqual([])
  }
})

test('/pokemon evolve with only symbols says there is no such Pokémon, not the evolution mode', KIT, async ($, on) => {
  await begin($, on, { ...emptySave(), party: [member('pikachu', { id: 'p', next: [] })] })
  expect(await cmd($, 'pokemon', 'evolve 🎉')).not.toContain('Evolution is')
})

test('reactions: no false faints, and XP only for real work', () => {
  const run = (command: string, isError: boolean, output?: string) => classify('Bash', command, isError, 0, output)
  // pytest that collects nothing exits 5: neither a pass nor a fail.
  expect(run('pytest -k nothing', true, '=== no tests ran in 0.01s ===')).toEqual({ happenings: [], xp: 0, streak: 0 })
  // A passing run whose log mentions errors earlier: the summary at the end decides.
  const log = 'validate: 2 errors expected\n--- PASS: TestValidate\nok  \tpkg\t0.2s'
  expect(run('go test ./... -v | tee out.txt', false, log).happenings).toEqual(['cheer'])
  // A summary with both is a failure.
  expect(run('pytest | tail -3', false, '=== 1 failed, 2 passed in 0.1s ===').happenings).toEqual(['tool-error'])
  // Amends and empty commits earn nothing; a plain one does.
  expect(run('git commit --amend --no-edit', false).xp).toBe(0)
  expect(run('git commit --allow-empty -m x', false).xp).toBe(0)
  expect(run('git commit -m x', false).xp).toBe(10)
  // A script whose name only starts with "test" is no test run.
  expect(run('npm run testdb:seed', false).xp).toBe(0)
  expect(run('npm run test:unit', false).xp).toBe(5)
  // A commit piped into tail went through when git printed its summary.
  expect(run('git commit -m fix 2>&1 | tail -3', false, '[main 1a2b3c4] fix\n 1 file changed').xp).toBe(10)
  expect(run('git commit -m fix 2>&1 | tail -3', false, 'nothing to commit, working tree clean').xp).toBe(0)
})

test('an interrupted test run says nothing about the tests: no XP for what ran before the stop', KIT, async ($, on) => {
  // Stopped after a first file passed: the summary so far reads as a pass, which the stop makes meaningless.
  on('tool.call', async () => ({
    result: { stdout: 'PASS src/a.test.ts\nTests: 3 passed', stderr: '', interrupted: true },
    text: 'Tests: 3 passed',
  }))
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu', { id: 'p', next: [] })] })
  const xp = w.partyNow()[0]?.xp
  await $.tool.call(bash('npm test') as never)
  await cmd($, 'pokemon', 'party')
  expect(w.partyNow()[0]?.xp).toBe(xp)
})
