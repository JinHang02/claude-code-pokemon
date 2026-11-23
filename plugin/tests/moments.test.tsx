// The smaller reactions: a Pidgey flying a push off, Strength on a long test or build, boxes after an install and
// the party confused by a merge conflict; none pays XP.
import { expect, test } from 'claude-code/testing'

import { ALL_HELP, PLAY } from '../hooks/commands'
import { BOULDER, BOX, CONFUSED, FLAMES, LETTER, MOUND, SQUINT, STASH_BALL } from '../hooks/moments'
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
  for (const word of ['push', 'boulder', 'boxes', 'confused', 'stash', 'rebase', 'camp', 'sparkle', 'eyes']) {
    expect([word, PLAY.some(s => s.word === word)]).toEqual([word, true])
    expect([word, ALL_HELP.split('\n').some(l => l.startsWith(`  ${word} `))]).toEqual([word, true])
  }
  expect(ALL_HELP.split('\n').filter(l => [...l].length > 60)).toEqual([])
})

test('a stash that set work aside buries a Poké Ball; popping, listing or nothing to save does not', () => {
  for (const c of [
    'git stash',
    'git stash -u',
    'git stash push -m wip',
    'git -C app stash save x',
    'cd a && git stash',
  ])
    expect([c, classify('Bash', c, false, 0, 'Saved working directory').happenings]).toEqual([c, ['stash']])
  for (const c of ['git stash pop', 'git stash list', 'git stash apply', 'git stash drop', 'echo git stash'])
    expect([c, classify('Bash', c, false, 0).happenings]).toEqual([c, []])
  expect(classify('Bash', 'git stash', false, 0, 'No local changes to save').happenings).toEqual([])
  expect(classify('Bash', 'git stash', true, 0).happenings).toEqual([])
})

test('a rebase that went through shimmers; a conflict, an abort or nothing to do does not', () => {
  const done = 'Successfully rebased and updated refs/heads/feat.'
  for (const c of ['git rebase main', 'git rebase --continue', 'git rebase --onto main a b'])
    expect([c, classify('Bash', c, false, 0, done)]).toEqual([c, { happenings: ['rebase'], xp: 0, streak: 0 }])
  expect(classify('Bash', 'git rebase --abort', false, 0).happenings).toEqual([])
  expect(classify('Bash', 'git rebase main', false, 0, 'Current branch feat is up to date.').happenings).toEqual([])
  expect(classify('Bash', 'git rebase main', true, 0, 'CONFLICT (content): Merge conflict in a.ts').happenings).toEqual(
    ['confused'],
  )
})

test('a lint or type check that passed sparkles, with no XP; a failed one or a formatter does not', () => {
  for (const c of [
    'npx tsc --noEmit',
    'ruff check .',
    'eslint src',
    'mypy app',
    'cargo clippy',
    'go vet ./...',
    'npm run lint',
    'pnpm typecheck',
  ])
    expect([c, classify('Bash', c, false, 0)]).toEqual([c, { happenings: ['sparkle'], xp: 0, streak: 0 }])
  expect(classify('Bash', 'eslint src', true, 0).happenings).toEqual(['tool-error'])
  for (const c of ['ruff format .', 'tsc --version', 'npm run build', 'echo eslint'])
    expect([c, classify('Bash', c, false, 0).happenings]).toEqual([c, []])
  // A lint and a test run together: the tests' cheer and XP, and the lint's sparkle.
  expect(classify('Bash', 'npm run lint && npm test', false, 0, 'Tests: 3 passed').happenings).toEqual([
    'cheer',
    'sparkle',
  ])
})

test('an rm -rf, anywhere in the command, makes the lead cover its eyes; a plain rm does not', () => {
  for (const c of [
    'rm -rf dist',
    'rm -fr x',
    'rm -Rf x',
    'rm -r -f x',
    'rm --recursive --force x',
    'cd a && sudo rm -rf b',
  ])
    expect([c, classify('Bash', c, false, 0).happenings]).toEqual([c, ['eyes']])
  for (const c of ['rm a.txt', 'rm -r dir', 'rm -f a', 'echo rm -rf', 'git rm -rf x'])
    expect([c, classify('Bash', c, false, 0).happenings]).toEqual([c, []])
})

test('a stash: the lead stays to dig, the Poké Ball sinks, a heap of dirt is left, then all is calm', () => {
  let s = run(react(still, 'stash'), 2)
  const x = s.actors[0]?.x
  expect([shows(draw(s), STASH_BALL), isCalm(s)]).toEqual([true, false])
  expect(s.fx.some(p => p.kind === 'dust')).toBe(false)
  s = run(s, ticks(600))
  expect(s.fx.some(p => p.kind === 'dust')).toBe(true)
  // Sinking: the ball goes down with no heap over it yet.
  s = run(s, ticks(1000))
  expect([shows(draw(s), STASH_BALL), shows(draw(s), MOUND)]).toEqual([true, false])
  s = run(s, ticks(1200))
  expect([s.actors[0]?.x, shows(draw(s), MOUND), shows(draw(s), STASH_BALL)]).toEqual([x, true, false])
  s = run(s, ticks(800))
  expect([s.stash, shows(draw(s), MOUND), shows(draw(s), STASH_BALL)]).toEqual([undefined, false, false])
  expect(isCalm(run(s, ticks(1000)))).toBe(true)
})

test('a rebase washes the band in a moving shimmer, then leaves it exactly as it was', () => {
  const before = draw(still)
  let s = run(react(still, 'rebase'), ticks(400))
  const mid = draw(s)
  expect(mid.pixels.some((c, i) => c !== before.pixels[i])).toBe(true)
  s = run(s, ticks(1300))
  expect([s.warp, isCalm(s)]).toEqual([undefined, true])
  expect(draw({ ...s, t: still.t }).pixels).toEqual(before.pixels)
})

test('a passed lint brings twinkles around the lead, for a moment only', () => {
  let s = run(react(still, 'sparkle'), ticks(500))
  expect(s.fx.some(p => p.kind === 'twinkle')).toBe(true)
  expect(draw(s).pixels.includes(0xffffff)).toBe(true)
  s = run(s, ticks(2500))
  expect([s.sparkle, s.fx.some(p => p.kind === 'twinkle'), isCalm(s)]).toEqual([undefined, false, true])
})

test('at an rm -rf the lead turns away under a "><" and turns back when it is over', () => {
  const facing = still.actors[0]?.facing
  let s = run(react(still, 'eyes'), ticks(500))
  expect([s.actors[0]?.facing, shows(draw(s), SQUINT)]).toEqual([facing === 1 ? -1 : 1, true])
  s = run(s, ticks(1600))
  expect([s.mood, s.actors[0]?.facing, shows(draw(s), SQUINT)]).toEqual([null, facing, false])
})

test('at a long turn the party gathers on both sides of a campfire, facing it, and the fire goes out at the end', () => {
  const two: Status = {
    ...still,
    isWorking: true,
    actors: [
      { ...newScene(2), roam: idle },
      { ...newScene(50), roam: idle },
    ],
  }
  const both = (s: Status) => frame(s, [SPRITE, SPRITE], W, ROWS)
  let s = react(two, 'camp-start')
  for (let i = 0; i < ticks(4000); i++) s = step(s, W, [SPRITE.width, SPRITE.width], 0, () => 0.99)
  const fire = s.camp?.x ?? -1
  const [lead, other] = s.actors
  expect(fire).toBeGreaterThan(0)
  expect([lead?.x, lead?.facing]).toEqual([fire - 2 - SPRITE.width, 1])
  expect([other?.x, other?.facing]).toEqual([fire + 7 + 2, -1])
  const flames = new Set(FLAMES.flatMap(f => [...colors(f)]))
  expect(both(s).pixels.some(c => flames.has(c))).toBe(true)
  expect(isCalm(s)).toBe(false)
  s = react(s, 'camp-end')
  expect([s.camp, s.fx.filter(p => p.kind === 'dust').length]).toEqual([undefined, 3])
  expect(both(run(s, 1)).pixels.some(c => flames.has(c))).toBe(false)
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
  expect(await cmd($, 'pokemon-play', 'stash')).toBe('Playing stash.')
  await w.clock.advance(300)
  expect(onBand(w.band.cells, STASH_BALL)).toBe(true)
  await w.clock.advance(4000)
  expect(await cmd($, 'pokemon-play', 'eyes')).toBe('Playing eyes.')
  await w.clock.advance(500)
  expect(onBand(w.band.cells, SQUINT)).toBe(true)
  await w.clock.advance(3000)
  expect(await cmd($, 'pokemon-play', 'camp')).toBe('Playing camp.')
  await w.clock.advance(1000)
  expect(onBand(w.band.cells, FLAMES[0] as Pixels)).toBe(true)
  await w.clock.advance(8000)
  expect(onBand(w.band.cells, FLAMES[0] as Pixels)).toBe(false)
  for (const word of ['rebase', 'sparkle']) expect(await cmd($, 'pokemon-play', word)).toBe(`Playing ${word}.`)
})

test('a turn past 10 minutes sets up camp until it ends; a shorter one does not', KIT, async ($, on) => {
  on('turn.start', async (_$, e) => ({ turnId: (e as { turnId: string }).turnId }))
  on('turn.complete', async () => ({ text: '' }))
  const w = await begin($, on, party, undefined, undefined, noon)
  await cmd($, 'pokemon', 'party')
  const band = (await mountBand($)) as { drawn: () => Promise<unknown> }
  await band.drawn()
  // The flames' orange alone: their red is also the "!" a wild visitor brings.
  const lit = () => onBand(w.band.cells, { pixels: [0xff8c1a], width: 1, height: 1 })
  await $.turn.start({ text: 'hi', turnId: 'm1' } as never)
  for (let i = 0; i < 9; i++) await w.clock.advance(60_000)
  await $.turn.complete({ reason: 'answer', answer: 'ok', durationMs: 1, turnId: 'm1' } as never)
  await $.turn.start({ text: 'again', turnId: 'm2' } as never)
  for (let i = 0; i < 9; i++) await w.clock.advance(60_000)
  expect(lit()).toBe(false)
  await w.clock.advance(61_000)
  expect(lit()).toBe(true)
  await $.turn.complete({ reason: 'answer', answer: 'ok', durationMs: 1, turnId: 'm2' } as never)
  await w.clock.advance(200)
  expect(lit()).toBe(false)
})

// Six minutes and more of ticks: longer than a usual session test.
test('after them the party still falls asleep, drawing at the calm rate', { timeoutMs: 90_000 }, async ($, on) => {
  const w = await begin($, on, party, undefined, undefined, noon)
  await cmd($, 'pokemon', 'party')
  const band = (await mountBand($)) as { drawn: () => Promise<unknown> }
  await band.drawn()
  for (const word of ['push', 'boxes', 'confused', 'boulder', 'stash', 'rebase', 'sparkle', 'eyes', 'camp'])
    await cmd($, 'pokemon-play', word)
  for (let i = 0; i < 360; i++) await w.clock.advance(1000)
  const before = w.band.frames
  for (let i = 0; i < 20; i++) await w.clock.advance(1000)
  const rate = (w.band.frames - before) / 20
  expect(rate > 2 && rate <= 5).toBe(true)
})
