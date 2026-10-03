import type { Happening } from './scene'
import { XP } from './save'

// Each matches the start of one command, after any prefixes `commandAt` strips.
const TEST =
  /^(pytest|jest|vitest|mocha|rspec|phpunit|unittest|tox|nox|go test|cargo test|deno test|dotnet test|mvn test|gradle test|\.\/gradlew test|make test|playwright test|claude plugin test|(npm|pnpm|yarn|bun) t|(npm|pnpm|yarn|bun)( run)? test)(\s|$)/
const BUILD =
  /^(tsc|ruff|eslint|mypy|pyright|make|gradle|\.\/gradlew|mvn|cargo (build|check|clippy)|go (build|vet)|docker( compose)? build|(npm|pnpm|yarn|bun)( run)? (build|lint|typecheck))(\s|$)/
// Global options may come first, some with a value: git -C repo commit. A dry run commits nothing.
const COMMIT = /^git\s+(-\S+\s+([^-\s]\S*\s+)?)*commit(\s|$)(?!.*--dry-run)/
// Words that run the command after them: `FOO=1 sudo npx jest`, `uv run pytest`, `python -m pytest`.
const PREFIX =
  /^(\w+=\S*|sudo|time|command|exec|env|nice|npx|bunx|pnpm (exec|dlx)|yarn dlx|uv run|poetry run|pipenv run|hatch run|python3? -m|\()\s+/
// A script handed to a shell (`bash -lc "pytest"`) is classified as its own command.
const SHELL = /(?:^|\s)(?:\S*\/)?(?:ba|z|da)?sh\s+-[a-z]*c[a-z]*\s+(['"])([\s\S]*)\1\s*$/
// Runs a command somewhere else, the command coming after the wrapper's own options and target.
const WRAPPER = /^((docker|podman)( compose)? (run|exec)|kubectl exec|ssh|nix (develop|shell)|devbox run)(\s|$)/
// What a test run prints when something failed, or when it all passed: pytest, jest, vitest, mocha, rspec,
// unittest, go test, cargo test, dotnet test, and npm giving up after a failed run.
const FAILED = [
  /\b[1-9]\d* (failed|failing|failures?|errors?)\b/,
  /^(--- )?FAIL\b/m,
  /test result: FAILED/,
  /^FAILED \(/m,
  /\bFailed:\s+[1-9]/,
  /npm (ERR!|error)/,
]
const PASSED = [/\b[1-9]\d* (passed|passing)\b/, /\b0 failures\b/, /^ok\s/m, /test result: ok\b/, /^OK\b/m, /\bPassed!/]

// How a test run went by its output's summary; null when the output says neither (cut off before it).
export function testVerdict(output: string): 'passed' | 'failed' | null {
  if (FAILED.some(p => p.test(output))) return 'failed'
  return PASSED.some(p => p.test(output)) ? 'passed' : null
}

const EDITS = new Set(['Edit', 'Write', 'NotebookEdit', 'MultiEdit'])
// Plain commands failing this many times in a row count as a real failure.
export const STREAK = 3

export type Outcome = { happenings: Happening[]; xp: number; streak: number }

type Piece = { text: string; op: string }

// Splits a shell command at its operators (`&&`, `||`, `|`, `;`, `&`, newlines), keeping quoted text and
// `$(...)` whole, so a commit message or a heredoc never splits.
function split(command: string): Piece[] {
  const pieces: Piece[] = []
  let text = ''
  let quote = ''
  let depth = 0
  for (let i = 0; i < command.length; i++) {
    const c = command[i] ?? ''
    if (c === '\\' && quote !== "'") {
      text += c + (command[++i] ?? '')
      continue
    }
    if (quote) {
      if (c === quote) quote = ''
      else if (c === '$' && command[i + 1] === '(' && quote === '"') {
        depth++
        quote = ''
        text += c + '('
        i++
        continue
      }
      text += c
      continue
    }
    if (c === "'" || c === '"') quote = c
    else if (c === '$' && command[i + 1] === '(') {
      depth++
      text += '$('
      i++
      continue
    } else if (c === ')' && depth > 0) depth--
    if (depth === 0 && !quote) {
      const two = command.slice(i, i + 2)
      // `2>&1` and `&>` redirect; `|&` pipes stderr too.
      const isRedirect = c === '&' && (/[<>]$/.test(text) || command[i + 1] === '>')
      const op = two === '&&' || two === '||' || two === '|&' ? two : !isRedirect && ';|&\n'.includes(c) ? c : ''
      if (op) {
        pieces.push({ text: text.trim(), op })
        text = ''
        i += op.length - 1
        continue
      }
    }
    text += c
  }
  pieces.push({ text: text.trim(), op: '' })
  return pieces.filter(p => p.text)
}

const commandAt = (text: string) => {
  let rest = text.replace(/\s+/g, ' ')
  for (let next = rest.replace(PREFIX, ''); next !== rest; next = rest.replace(PREFIX, '')) rest = next
  return rest
}

// The commands whose success or failure is the whole command's: the ends of the pipelines in the last list
// (after the last `;`, `&` or newline), joined by `&&`. A list with `||` decides nothing.
function deciders(command: string): string[] {
  const pieces = split(command)
  let start = 0
  pieces.forEach((p, i) => {
    if (p.op === ';' || p.op === '&' || p.op === '\n') start = i + 1
  })
  const last = pieces.slice(start)
  if (last.some(p => p.op === '||')) return []
  return last.filter(p => p.op !== '|' && p.op !== '|&').flatMap(p => expand(commandAt(p.text)))
}

// A command, or what it runs: a shell's script, or the command inside a wrapper (each word onwards).
function expand(command: string): string[] {
  const shell = SHELL.exec(command)
  if (shell) return deciders(shell[2] ?? '')
  if (!WRAPPER.test(command)) return [command]
  const words = command.split(' ')
  return words.map((_, i) => words.slice(i).join(' '))
}

// What a finished tool call means to the Pokémon. A failing test, build or edit faints it; a plain
// command failing (grep finding nothing) only counts toward a streak. Passing tests and commits cheer.
// A test whose result a pipe, `;` or `||` hides (`pytest | tail`) is judged by the summary in `output`.
export function classify(
  tool: string,
  command: string | undefined,
  isError: boolean,
  streak: number,
  output?: string,
): Outcome {
  if (EDITS.has(tool)) return { happenings: isError ? ['tool-error'] : [], xp: 0, streak }
  if (tool !== 'Bash' || command === undefined) return { happenings: [], xp: 0, streak }
  const ran = deciders(command)
  const failed: Outcome = { happenings: ['tool-error'], xp: 0, streak: 0 }
  const passed: Outcome = { happenings: ['cheer'], xp: XP.tests, streak: 0 }
  if (ran.some(c => TEST.test(c))) return isError ? failed : passed
  const isHiddenTest = split(command).some(p => expand(commandAt(p.text)).some(c => TEST.test(c)))
  const verdict = isHiddenTest && output !== undefined ? testVerdict(output) : null
  if (verdict) return verdict === 'failed' ? failed : passed
  if (isError && ran.some(c => BUILD.test(c))) return { happenings: ['tool-error'], xp: 0, streak: 0 }
  if (!isError && ran.some(c => COMMIT.test(c))) return { happenings: ['cheer'], xp: XP.commit, streak: 0 }
  if (!isError) return { happenings: [], xp: 0, streak: 0 }
  return streak + 1 >= STREAK
    ? { happenings: ['tool-error'], xp: 0, streak: 0 }
    : { happenings: [], xp: 0, streak: streak + 1 }
}
