// The smaller reactions: a Pidgey flying a push off, Strength on a long test or build, boxes after an install and
// the party confused by a merge conflict; none pays XP.
import { expect, test } from 'claude-code/testing'

import { ALL_HELP, PLAY } from '../hooks/commands'
import { BOULDER, BOX, CONFUSED, LETTER } from '../hooks/moments'
import { classify, isTestOrBuild, STREAK } from '../hooks/reactions'
import { emptySave } from '../hooks/save'
import { frame, HEADROOM, initialStatus, isCalm, newScene, react, step, TICK_MS } from '../hooks/scene'
import type { Status } from '../hooks/scene'
import type { Pixels } from '../hooks/sprite'
import { bash, begin, cmd, hourAt, KIT, LIST, member, mountBand } from './world'

const ticks = (ms: number) => Math.round(ms / TICK_MS)
const SPRITE = { pixels: Array<number>(64).fill(0xabcdef), width: 8, height: 8 }
const ROWS = Math.ceil((SPRITE.height + 1 + HEADROOM) / 2)
const W = 60
const idle = { kind: 'idle' as const, left: 1e9, age: 0 }
const still: Status = { ...initialStatus(), actors: [{ ...newScene(20), roam: idle }] }
const run = (s: Status, n: number) => {
  for (let i = 0; i < n; i++) s = step(s, W, [SPRITE.width], 0, () => 0.99)
  return s
}
const draw = (s: Status) => frame(s, [SPRITE], W, ROWS)
// The art's own colours: one of them on screen means the picture is drawn.
const colors = (img: Pixels) => new Set(img.pixels.filter(c => c >= 0))
const shows = (img: Pixels, art: Pixels) => [...colors(art)].some(c => img.pixels.includes(c))
const decode = (cells: string) => [...new Uint32Array(Uint8Array.from(atob(cells), c => c.charCodeAt(0)).buffer)]
const onBand = (cells: string, art: Pixels) => {
  const seen = new Set(decode(cells))
  return [...colors(art)].some(c => seen.has(c))
}

test('a push that went through flies off with a Pidgey; a turned-down push, a dry run or nothing sent does not', () => {
  const sent = 'To github.com:me/repo.git\n   1a2b3c4..5d6e7f8  main -> main'
  expect(classify('Bash', 'git push', false, 0, sent)).toEqual({ happenings: ['push'], xp: 0, streak: 0 })
  expect(classify('Bash', 'git push -u origin feat', false, 0).happenings).toEqual(['push'])
  // Piped into tail, it went through when git printed a branch it sent.
  expect(classify('Bash', 'git push 2>&1 | tail -3', false, 0, sent).happenings).toEqual(['push'])
  expect(classify('Bash', 'git push 2>&1 | tail -3', false, 0, 'ok').happenings).toEqual([])
  const rejected = ' ! [rejected]        main -> main (non-fast-forward)\nerror: failed to push some refs'
  expect(classify('Bash', 'git push', true, 0, rejected)).toEqual({ happenings: [], xp: 0, streak: 1 })
  expect(classify('Bash', 'git push 2>&1 | tail -3', false, 0, rejected).happenings).toEqual([])
  expect(classify('Bash', 'git push', true, 0, 'fatal: could not read from remote').happenings).toEqual([])
  expect(classify('Bash', 'git push --dry-run', false, 0).happenings).toEqual([])
  expect(classify('Bash', 'git push', false, 0, 'Everything up-to-date').happenings).toEqual([])
  // A commit and push together: the commit's cheer and XP, the push's bird, nothing more.
  expect(classify('Bash', 'git commit -m x && git push', false, 0, `[main 1a2b3c4] x\n${sent}`)).toEqual({
    happenings: ['cheer', 'push'],
    xp: 10,
    streak: 0,
  })
})

test('an install that finished carries boxes, with no XP; a failed or other one does not', () => {
  for (const c of [
    'npm install',
    'npm i -D vitest',
    'pnpm add zod',
    'yarn add react',
    'pip install -r requirements.txt',
    'python -m pip install requests',
    'uv add httpx',
    'cargo add serde',
    'bundle install',
    'go get example.com/mod',
    'cd web && npm ci',
  ])
    expect([c, classify('Bash', c, false, 0)]).toEqual([c, { happenings: ['boxes'], xp: 0, streak: 0 }])
  expect(classify('Bash', 'npm install', true, 0).happenings).toEqual([])
  for (const c of [
    'npm uninstall left-pad',
    'bundle exec rspec spec/a_spec.rb --dry-run',
    'pip list',
    'echo npm install',
  ])
    expect([c, classify('Bash', c, false, 0).happenings.includes('boxes')]).toEqual([c, false])
})

test('a merge conflict in the output confuses the party, after any faint', () => {
  const out = 'Auto-merging a.ts\nCONFLICT (content): Merge conflict in a.ts\nAutomatic merge failed; fix conflicts'
  expect(classify('Bash', 'git merge feat', true, 0, out)).toEqual({ happenings: ['confused'], xp: 0, streak: 1 })
  expect(classify('Bash', 'git pull', true, STREAK - 1, out).happenings).toEqual(['tool-error', 'confused'])
  expect(classify('Bash', 'git rebase main', true, 0, 'CONFLICT (modify/delete): b.ts deleted').happenings).toEqual([
    'confused',
  ])
  expect(classify('Bash', 'git merge feat', false, 0, 'Fast-forward').happenings).toEqual([])
  // Only a command's output: an edit is never confused.
  expect(classify('Edit', undefined, false, 0, out).happenings).toEqual([])
})

test('tests and builds anywhere in a command can run long; other commands cannot', () => {
  for (const c of ['npm test', 'pytest -x | tail', 'cd app && cargo build', 'npx tsc -p .', 'make'])
    expect([c, isTestOrBuild(c)]).toEqual([c, true])
  for (const c of ['git push', 'npm install', 'ls', 'pytest --version'])
    expect([c, isTestOrBuild(c)]).toEqual([c, false])
})

test('the Pidgey crosses the band left to right with its letter, then the band is calm again', () => {
  let s = react(still, 'push')
  s = run(s, 1)
  expect(isCalm(s)).toBe(false)
  const at = (img: Pixels) => img.pixels.findIndex(c => c === 0xb07a45) % img.width
  s = run(s, ticks(1000))
  const first = at(draw(s))
  s = run(s, ticks(1000))
  const second = at(draw(s))
  expect(first >= 0 && second > first).toBe(true)
  expect(shows(draw(s), LETTER)).toBe(true)
  s = run(s, ticks(1500))
  expect([s.flight, shows(draw(s), LETTER)]).toEqual([undefined, false])
  expect(isCalm(run(s, ticks(3000)))).toBe(true)
})

test('boxes go over every head for a few seconds; the confused party gets a "?!" and a spin', () => {
  const two: Status = { ...still, actors: [still.actors[0] ?? newScene(), { ...newScene(40), roam: idle }] }
  let s = run(react(two, 'boxes'), 2)
  const img = frame(s, [SPRITE, SPRITE], W, ROWS)
  const tape = 0xeedcae
  expect(img.pixels.filter(c => c === tape).length).toBe(4)
  s = run(s, ticks(4500))
  expect([s.boxes, shows(frame(s, [SPRITE, SPRITE], W, ROWS), BOX)]).toEqual([undefined, false])

  let c = react(still, 'confused')
  const facings: number[] = []
  for (let i = 0; i < ticks(800); i++) {
    c = run(c, 1)
    facings.push(c.actors[0]?.facing ?? 0)
  }
  // It turns about, more than once, and the "?!" is up while it does.
  expect(facings.filter((f, i) => i > 0 && f !== facings[i - 1]).length).toBeGreaterThan(2)
  expect(shows(draw(c), CONFUSED)).toBe(true)
  c = run(c, ticks(2500))
  expect([c.mood, shows(draw(c), CONFUSED)]).toEqual([null, false])
})

test('pushing a boulder, the lead stays put and leans into it; at the end it dusts off and the boulder goes', () => {
  // At the right wall: the boulder goes on its left.
  const wall: Status = { ...still, actors: [{ ...newScene(W - SPRITE.width), facing: 1, roam: idle }] }
  let s = run(react(wall, 'boulder-start'), 1)
  expect(s.actors[0]?.facing).toBe(-1)
  const img = draw(s)
  const stone = img.pixels.findIndex(c => c === 0x8f8f8f) % img.width
  expect(stone >= 0 && stone < W - SPRITE.width).toBe(true)
  const xs = new Set<number>()
  for (let i = 0; i < ticks(3000); i++) {
    s = run({ ...s, isWorking: true }, 1)
    xs.add(s.actors[0]?.x ?? -1)
  }
  expect([...xs]).toEqual([W - SPRITE.width])
  expect(shows(draw(s), BOULDER)).toBe(true)
  s = run(react(s, 'boulder-end'), 1)
  expect(shows(draw(s), BOULDER)).toBe(false)
  expect(s.fx.filter(p => p.kind === 'dust').length).toBeGreaterThan(3)
  s = run({ ...s, isWorking: false }, ticks(1500))
  expect([s.strength, isCalm(s)]).toEqual([undefined, true])
  // An end with no start does nothing.
  expect(react(still, 'boulder-end').strength).toBeUndefined()
})

test('every new reaction has a preview, listed in help and the typeahead, inside 60 columns', () => {
  for (const word of ['push', 'boulder', 'boxes', 'confused']) {
    expect([word, PLAY.some(s => s.word === word)]).toEqual([word, true])
    expect([word, ALL_HELP.split('\n').some(l => l.startsWith(`  ${word} `))]).toEqual([word, true])
  }
  expect(ALL_HELP.split('\n').filter(l => [...l].length > 60)).toEqual([])
})

const party = { ...emptySave(), party: [member('pikachu', { id: 'p', next: [] })] }
const noon = { isOnline: true, list: JSON.stringify(LIST), now: hourAt(12) }

test(
  'a test still running after 30 s brings the boulder out until it ends; a pass still cheers',
  KIT,
  async ($, on) => {
    let finish = () => {}
    const done = new Promise<void>(r => (finish = r))
    on('tool.call', async () => {
      await done
      return { result: { stdout: 'Tests: 3 passed', stderr: '', interrupted: false } }
    })
    const w = await begin($, on, party, undefined, undefined, noon)
    await cmd($, 'pokemon', 'party')
    const band = (await mountBand($)) as { drawn: () => Promise<unknown> }
    await band.drawn()
    const xp = w.partyNow()[0]?.xp ?? 0
    const call = $.tool.call(bash('npm test') as never)
    await w.clock.advance(29_000)
    expect(onBand(w.band.cells, BOULDER)).toBe(false)
    await w.clock.advance(2000)
    expect(onBand(w.band.cells, BOULDER)).toBe(true)
    await w.clock.advance(1000)
    expect(onBand(w.band.cells, BOULDER)).toBe(true)
    finish()
    await call
    await w.clock.advance(200)
    expect(onBand(w.band.cells, BOULDER)).toBe(false)
    await cmd($, 'pokemon', 'party')
    expect(w.partyNow()[0]?.xp).toBe(xp + 5)
  },
)

test('a quick test, a long plain command and a push bring no boulder; a push pays no XP', KIT, async ($, on) => {
  let finish = () => {}
  let done = Promise.resolve()
  on('tool.call', async () => {
    await done
    return { result: { stdout: '   1a2b3c4..5d6e7f8  main -> main', stderr: '', interrupted: false } }
  })
  const w = await begin($, on, party, undefined, undefined, noon)
  await cmd($, 'pokemon', 'party')
  const band = (await mountBand($)) as { drawn: () => Promise<unknown> }
  await band.drawn()
  const xp = w.partyNow()[0]?.xp ?? 0
  await $.tool.call(bash('npm test') as never)
  await w.clock.advance(31_000)
  expect(onBand(w.band.cells, BOULDER)).toBe(false)
  done = new Promise<void>(r => (finish = r))
  const sleep = $.tool.call(bash('sleep 60') as never)
  await w.clock.advance(31_000)
  expect(onBand(w.band.cells, BOULDER)).toBe(false)
  finish()
  await sleep
  done = Promise.resolve()
  await $.tool.call(bash('git push') as never)
  await w.clock.advance(1500)
  expect(onBand(w.band.cells, LETTER)).toBe(true)
  await cmd($, 'pokemon', 'party')
  expect(w.partyNow()[0]?.xp).toBe(xp + 5)
})

test('each preview plays its reaction on the band', KIT, async ($, on) => {
  const w = await begin($, on, party, undefined, undefined, noon)
  await cmd($, 'pokemon', 'party')
  const band = (await mountBand($)) as { drawn: () => Promise<unknown> }
  await band.drawn()
  expect(await cmd($, 'pokemon-play', 'push')).toBe('Playing push.')
  await w.clock.advance(1500)
  expect(onBand(w.band.cells, LETTER)).toBe(true)
  expect(await cmd($, 'pokemon-play', 'boxes')).toBe('Playing boxes.')
  await w.clock.advance(500)
  expect(onBand(w.band.cells, BOX)).toBe(true)
  expect(await cmd($, 'pokemon-play', 'confused')).toBe('Playing confused.')
  await w.clock.advance(500)
  expect(onBand(w.band.cells, CONFUSED)).toBe(true)
  expect(await cmd($, 'pokemon-play', 'boulder')).toBe('Playing boulder.')
  await w.clock.advance(1000)
  expect(onBand(w.band.cells, BOULDER)).toBe(true)
  await w.clock.advance(5000)
  expect(onBand(w.band.cells, BOULDER)).toBe(false)
})

// Six minutes and more of ticks: longer than a usual session test.
test('after them the party still falls asleep, drawing at the calm rate', { timeoutMs: 90_000 }, async ($, on) => {
  const w = await begin($, on, party, undefined, undefined, noon)
  await cmd($, 'pokemon', 'party')
  const band = (await mountBand($)) as { drawn: () => Promise<unknown> }
  await band.drawn()
  for (const word of ['push', 'boxes', 'confused', 'boulder']) await cmd($, 'pokemon-play', word)
  for (let i = 0; i < 360; i++) await w.clock.advance(1000)
  const before = w.band.frames
  for (let i = 0; i < 20; i++) await w.clock.advance(1000)
  const rate = (w.band.frames - before) / 20
  expect(rate > 2 && rate <= 5).toBe(true)
})
