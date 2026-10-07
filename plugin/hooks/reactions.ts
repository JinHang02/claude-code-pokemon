import type { Happening } from './scene'
import { XP } from './save'

// Each matches the start of one command, after any prefixes `commandAt` strips.
const TEST =
  /^(pytest|jest|vitest|mocha|rspec|phpunit|unittest|tox|nox|go test|cargo test|deno test|dotnet test|mvn test|gradle test|\.\/gradlew test|make test|playwright test|claude plugin test|(npm|pnpm|yarn|bun) t|(npm|pnpm|yarn|bun)( run)? test[\w:.-]*)(\s|$)/
// Asks a runner about itself (version, help, the tests it would run) without running any.
const NO_RUN =
  /\s(-h|--help|-V|--version|--co|--collect-only|--fixtures|--markers|--listTests|--showConfig|--no-run|-list|--list)(\s|=|$)/
const BUILD =
  /^(tsc|ruff|eslint|mypy|pyright|make|gradle|\.\/gradlew|mvn|cargo (build|check|clippy)|go (build|vet)|docker( compose)? build|(npm|pnpm|yarn|bun)( run)? (build|lint|typecheck))(\s|$)/
// Global options may come first, some with a value: git -C repo commit.
const COMMIT = /^git\s+(-\S+\s+([^-\s]\S*\s+)?)*commit(\s|$)/
// Words that run the command after them: `FOO=1 sudo npx jest`, `uv run pytest`, `python -m pytest`,
// `timeout 300 pytest`, a subshell's `(`, and a path to the runner (`.venv/bin/pytest`).
const PREFIX =
  /^(?:(?:\w+=(?:"[^"]*"|'[^']*'|[^\s"'])*|sudo|time|command|exec|env|nice|timeout(?: -[ks] \S+| -\S+)* \d\S*|npx|bunx|pnpm (?:exec|dlx)|yarn dlx|uv run|poetry run|pipenv run|hatch run|python3? -m)\s+|\(\s*|\S*\/\.?bin\/(?=\S))/
// A script handed to a shell (`bash -lc "pytest"`) is classified as its own command.
const SHELL = /^(?:\S*\/)?(?:ba|z|da)?sh\s+-[a-z]*c[a-z]*\s+(['"])([\s\S]*)\1\s*$/
// Runs a command somewhere else: after the wrapper come its options (`value` ones take the next word), its
// target (host, container, image, service) when it has one, then the command. Nix runs what follows `-c`.
const WRAPPERS: { at: RegExp; value: RegExp; target: boolean }[] = [
  {
    at: /^(docker|podman)( compose)? (run|exec)( |$)/,
    value:
      /^(-[acehlmpuvw]|--(attach|add-host|cap-add|cap-drop|cpus|device|dns|entrypoint|env|env-file|gpus|group-add|hostname|index|label|link|log-driver|log-opt|memory|mount|name|network|platform|publish|pull|restart|runtime|security-opt|shm-size|tmpfs|ulimit|user|volume|volumes-from|workdir))$/,
    target: true,
  },
  { at: /^kubectl exec( |$)/, value: /^(-[cfn]|--(container|context|filename|kubeconfig|namespace))$/, target: true },
  { at: /^ssh( |$)/, value: /^-[BbcDEeFIiJLlmOoPpQRSWw]$/, target: true },
  { at: /^nix (develop|shell) (.* )?(-c|--command)( |$)/, value: /^$/, target: false },
  { at: /^devbox run( |$)/, value: /^(-[ce]|--(config|env|env-file))$/, target: false },
]
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
// `$(...)` whole, so a commit message never splits. A heredoc's body is left out.
function split(command: string): Piece[] {
  const pieces: Piece[] = []
  let text = ''
  let quote = ''
  // The quote each open `$(` sits in, restored at its `)`.
  const outer: string[] = []
  const heredocs: { delim: string; tabs: boolean }[] = []
  for (let i = 0; i < command.length; i++) {
    const c = command[i] ?? ''
    if (c === '\\' && quote !== "'") {
      text += c + (command[++i] ?? '')
      continue
    }
    if (c === '$' && command[i + 1] === '(' && quote !== "'") {
      outer.push(quote)
      quote = ''
      text += '$('
      i++
      continue
    }
    if (quote) {
      if (c === quote) quote = ''
      text += c
      continue
    }
    // A here-string (`<<<`) has no body.
    const heredoc =
      c === '<' ? /^<<(?:<|(-?) ?(?:'([^']*)'|"([^"]*)"|\\?([^\s;&|<>()'"]+)))/.exec(command.slice(i)) : null
    if (heredoc?.[0] === '<<<') {
      text += '<<<'
      i += 2
      continue
    }
    if (heredoc) {
      heredocs.push({ delim: heredoc[2] ?? heredoc[3] ?? heredoc[4] ?? '', tabs: heredoc[1] === '-' })
      text += heredoc[0]
      i += heredoc[0].length - 1
      continue
    }
    if (c === '\n' && heredocs.length) {
      // Skip the bodies, each up to its delimiter line, then go on from the newline ending the last one.
      let end = i
      for (const { delim, tabs } of heredocs.splice(0)) {
        do {
          const start = end + 1
          end = command.indexOf('\n', start)
          if (end === -1) end = command.length
          const line = command.slice(start, end)
          if ((tabs ? line.replace(/^\t+/, '') : line) === delim) break
        } while (end < command.length)
      }
      if (outer.length) text += '\n'
      else {
        pieces.push({ text: text.trim(), op: '\n' })
        text = ''
      }
      i = end - 1
      continue
    }
    if (c === "'" || c === '"') quote = c
    else if (c === ')' && outer.length) quote = outer.pop() ?? ''
    if (!outer.length && !quote) {
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

// Splits a command into words at unquoted whitespace, each keeping its quotes.
function words(command: string): string[] {
  const out: string[] = []
  let word = ''
  let quote = ''
  for (let i = 0; i < command.length; i++) {
    const c = command[i] ?? ''
    if (c === '\\' && quote !== "'") {
      word += c + (command[++i] ?? '')
      continue
    }
    if (quote) {
      if (c === quote) quote = ''
    } else if (c === "'" || c === '"') quote = c
    else if (/\s/.test(c)) {
      if (word) out.push(word)
      word = ''
      continue
    }
    word += c
  }
  if (word) out.push(word)
  return out
}

const unquote = (word: string) => /^'([^']*)'$/.exec(word)?.[1] ?? /^"((?:\\.|[^"\\])*)"$/.exec(word)?.[1]

const commandAt = (text: string) => {
  let rest = text.replace(/\s+/g, ' ')
  for (let next = rest.replace(PREFIX, ''); next !== rest; next = rest.replace(PREFIX, '')) rest = next
  // The `)` closing a subshell: `(cd x && npm test)`.
  const count = (c: string) => rest.split(c).length - 1
  return rest.endsWith(')') && count(')') > count('(') ? rest.slice(0, -1).trimEnd() : rest
}

// The commands whose success or failure is the whole command's: the ends of the pipelines in the last list
// (after the last `;`, `&` or newline, a trailing `;` or newline aside), joined by `&&`. A list with `||`
// decides nothing.
function deciders(command: string): string[] {
  const pieces = split(command)
  let start = 0
  pieces.forEach((p, i) => {
    if (p.op === '&' || ((p.op === ';' || p.op === '\n') && i < pieces.length - 1)) start = i + 1
  })
  const last = pieces.slice(start)
  if (last.some(p => p.op === '||')) return []
  return last.filter(p => p.op !== '|' && p.op !== '|&').flatMap(p => expand(commandAt(p.text)))
}

// A command, or what it runs: a shell's script, or the command a wrapper runs (a quoted one read as a script).
function expand(command: string): string[] {
  const shell = SHELL.exec(command)
  if (shell) return deciders(shell[2] ?? '')
  const wrapper = WRAPPERS.find(w => w.at.test(command))
  if (!wrapper) return [command]
  const ws = words(command.replace(wrapper.at, ''))
  let i = 0
  let entry = ''
  for (; i < ws.length && ws[i]?.startsWith('-'); i++) {
    const w = ws[i] ?? ''
    if (w === '--') {
      i++
      break
    }
    if (w.startsWith('--entrypoint=')) entry = w.slice('--entrypoint='.length)
    else if (wrapper.value.test(w)) {
      if (w === '--entrypoint') entry = ws[i + 1] ?? ''
      i++
    }
  }
  if (wrapper.target) i++
  if (ws[i] === '--') i++
  const script = !entry && ws.length === i + 1 ? unquote(ws[i] ?? '') : undefined
  if (script !== undefined) return deciders(script)
  const run = [entry, ...ws.slice(i)].filter(Boolean).join(' ')
  return run ? expand(commandAt(run)) : []
}

const isTestRun = (command: string) => TEST.test(command) && !NO_RUN.test(command)
// A dry run commits nothing; a message only mentioning one is no dry run.
const isCommit = (command: string) => COMMIT.test(command) && !words(command).includes('--dry-run')

// What a finished tool call means to the Pokémon. A failing test, build or edit faints it; a plain
// command failing (grep finding nothing) only counts toward a streak. Passing tests and commits cheer.
// A test whose result a pipe, `;` or `||` hides (`pytest | tail`) is judged by the summary in `output`,
// and so is one that passed before a later command failed (`npm test && git commit`).
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
  const isTest = ran.some(isTestRun)
  const isHiddenTest = !isTest && split(command).some(p => expand(commandAt(p.text)).some(isTestRun))
  const verdict = output !== undefined && (isHiddenTest || (isTest && isError)) ? testVerdict(output) : null
  if (isTest && verdict !== 'passed') return isError ? failed : passed
  if (isHiddenTest && verdict) return verdict === 'failed' ? failed : passed
  if (isError && ran.some(c => BUILD.test(c))) return { happenings: ['tool-error'], xp: 0, streak: 0 }
  if (!isError && ran.some(isCommit)) return { happenings: ['cheer'], xp: XP.commit, streak: 0 }
  if (!isError) return { happenings: [], xp: 0, streak: 0 }
  return streak + 1 >= STREAK
    ? { happenings: ['tool-error'], xp: 0, streak: 0 }
    : { happenings: [], xp: 0, streak: streak + 1 }
}
