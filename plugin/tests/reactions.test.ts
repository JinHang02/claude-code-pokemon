import { expect, test } from 'claude-code/testing'

import { classify, STREAK, testVerdict } from '../hooks/reactions'

test('failing tests faint, passing tests cheer and earn xp', () => {
  expect(classify('Bash', 'pytest -q', true, 0)).toEqual({ happenings: ['tool-error'], xp: 0, streak: 0 })
  expect(classify('Bash', 'pytest -q', false, 2)).toEqual({ happenings: ['cheer'], xp: 5, streak: 0 })
  for (const cmd of [
    'docker compose run --rm app bash -lc "pytest tests/x.py"',
    'claude plugin test ./mod',
    'npm test',
    'pnpm run test -- --watch=false',
    'go test ./...',
    'cargo test',
  ])
    expect(classify('Bash', cmd, false, 0).happenings).toEqual(['cheer'])
})

test('a failing build or lint faints; a passing one is no news', () => {
  for (const cmd of ['npx tsc -p .', 'ruff check .', 'npm run build', 'make all', 'docker compose build engine'])
    expect(classify('Bash', cmd, true, 0).happenings).toEqual(['tool-error'])
  expect(classify('Bash', 'ruff check .', false, 0)).toEqual({ happenings: [], xp: 0, streak: 0 })
})

test('a commit cheers and earns the most xp', () => {
  expect(classify('Bash', 'git commit -m "fix"', false, 0)).toEqual({ happenings: ['cheer'], xp: 10, streak: 0 })
  expect(classify('Bash', 'git -C repo commit -am x', false, 0).xp).toBe(10)
  expect(classify('Bash', 'git status', false, 0).xp).toBe(0)
})

test('a plain command failing (grep finding nothing) only faints on a streak', () => {
  let streak = 0
  const seen: string[][] = []
  for (let i = 0; i < STREAK; i++) {
    const out = classify('Bash', 'grep -rn nothing .', true, streak)
    streak = out.streak
    seen.push(out.happenings)
  }
  expect(seen).toEqual([[], [], ['tool-error']])
  expect(streak).toBe(0)
  expect(classify('Bash', 'grep x', true, 1).streak).toBe(2)
  expect(classify('Bash', 'ls', false, 2).streak).toBe(0)
})

test('a failed edit faints; other tools are ignored', () => {
  expect(classify('Edit', undefined, true, 1)).toEqual({ happenings: ['tool-error'], xp: 0, streak: 1 })
  expect(classify('Write', undefined, false, 0).happenings).toEqual([])
  expect(classify('Read', undefined, true, 0).happenings).toEqual([])
  expect(classify('WebFetch', undefined, true, 2).streak).toBe(2)
})

const xpFor = (cmd: string, isError = false) => classify('Bash', cmd, isError, 0)

test('only a command that runs a test counts, wherever it sits in a chain or behind a wrapper', () => {
  for (const cmd of [
    'cd api && pytest',
    'python -m pytest tests/',
    'uv run pytest',
    'FOO=1 npx jest',
    'npm t',
    'make test',
    'deno test',
    './gradlew test',
    'npx playwright test',
    'docker compose run --rm app pytest -q',
    'docker exec web sh -c "cd /app && npm test"',
  ])
    expect(xpFor(cmd)).toEqual({ happenings: ['cheer'], xp: 5, streak: 0 })
  for (const cmd of [
    'cat jest.config.js',
    'pip install pytest',
    'npm install -D vitest',
    'grep -rn "pytest" docs/',
    'which tsc',
    'echo "remember to git commit"',
    'git log --grep="git commit"',
    'git commit --dry-run',
    'git commit-tree abc',
  ])
    expect(xpFor(cmd)).toEqual({ happenings: [], xp: 0, streak: 0 })
})

test('a pipe, a `;` or a `||` hides how a test went: the summary in its output decides, or nothing does', () => {
  for (const cmd of ['pytest 2>&1 | tail -20', 'pytest; echo done', 'pytest || true']) {
    expect(xpFor(cmd)).toEqual({ happenings: [], xp: 0, streak: 0 })
    expect(xpFor(cmd, true)).toEqual({ happenings: [], xp: 0, streak: 1 })
    expect(classify('Bash', cmd, false, 0, '===== 12 passed in 0.34s =====')).toEqual({
      happenings: ['cheer'],
      xp: 5,
      streak: 0,
    })
    expect(classify('Bash', cmd, false, 2, '===== 1 failed, 11 passed in 0.4s =====')).toEqual({
      happenings: ['tool-error'],
      xp: 0,
      streak: 0,
    })
    // Cut off before the summary (`| head`): no way to tell.
    expect(classify('Bash', cmd, false, 0, 'collected 12 items\ntests/test_x.py ....')).toEqual({
      happenings: [],
      xp: 0,
      streak: 0,
    })
  }
  // Output only matters for a test whose result is hidden: a plain command's output is never read.
  expect(classify('Bash', 'cat report.txt', false, 0, '3 passed').happenings).toEqual([])
  // A plain command failing never faints at once, even when it names a tool.
  for (const cmd of ['grep -rn "pytest" x', 'ls | grep jest', 'grep make Makefile'])
    expect(xpFor(cmd, true).happenings).toEqual([])
})

test('a commit message or heredoc never splits the command', () => {
  expect(xpFor('git commit -m "fix; tests | ok"').xp).toBe(10)
  expect(xpFor(`git add . && git commit -m "$(cat <<'EOF'\nfix: it's done | ok; really\nEOF\n)"`).xp).toBe(10)
})

test("each test runner's summary reads as passed or failed", () => {
  const passed = [
    '======================== 12 passed in 0.34s =========================',
    'Tests:       5 passed, 5 total',
    ' Test Files  2 passed (2)\n      Tests  9 passed (9)',
    'ok  \texample.com/pkg\t0.012s',
    'test result: ok. 3 passed; 0 failed; 0 ignored',
    '  4 passing (12ms)',
    '5 examples, 0 failures',
    'Ran 4 tests in 0.001s\n\nOK',
    'Passed!  - Failed:     0, Passed:     5, Skipped:     0',
  ]
  const failed = [
    '=================== 1 failed, 11 passed in 0.40s ===================',
    '========== 1 error in 0.12s ==========',
    'Tests:       1 failed, 4 passed, 5 total',
    ' Tests  1 failed | 3 passed (4)',
    '--- FAIL: TestX (0.00s)\nFAIL\nFAIL\texample.com/pkg\t0.01s',
    'test result: FAILED. 2 passed; 1 failed; 0 ignored',
    '  4 passing (12ms)\n  1 failing',
    '5 examples, 2 failures',
    'FAILED (failures=1)',
    'Failed!  - Failed:     2, Passed:     3',
    'npm ERR! Test failed.  See above for more details.',
  ]
  for (const out of passed) expect(testVerdict(out)).toBe('passed')
  for (const out of failed) expect(testVerdict(out)).toBe('failed')
  expect(testVerdict('collected 12 items')).toBeNull()
})
