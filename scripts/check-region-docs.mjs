#!/usr/bin/env node
// Region documentation wording check: FORBIDDEN, the checks of README.md, docs/index.html and the newest CHANGELOG.md
// notes, and the failures.
import { readFileSync } from 'node:fs'

const root = new URL('../', import.meta.url)

const failures = []
const fail = message => failures.push(message)

function read(path) {
  try {
    return readFileSync(new URL(path, root), 'utf8')
  } catch (error) {
    fail(`${path}: can't be read (${error.code ?? error.message})`)
    return ''
  }
}

// Spec R41: never state the seen threshold, its share or how it is counted. Spec R2: never name a region by number.
const FORBIDDEN = [
  /\b60\s?%/,
  /\b91\b/,
  /threshold/i,
  /seen count/i,
  /\bGen(eration)?\s?2\b/i,
  /\bRegion\s?\d\b/i,
  /per generation/i,
  /generation by generation/i,
]

function checkForbidden(path, text) {
  for (const re of FORBIDDEN) {
    const found = re.exec(text.replace(/\s+/g, ' '))
    if (found) fail(`${path}: says "${found[0]}" (${re})`)
  }
}

for (const path of ['README.md', 'docs/index.html']) checkForbidden(path, read(path))

const sections = read('CHANGELOG.md').split(/^(?=## \[)/m)
const unreleased = sections.find(s => s.startsWith('## [Unreleased]')) ?? ''
const newestRelease = sections.find(s => /^## \[\d/.test(s)) ?? ''
checkForbidden('CHANGELOG.md [Unreleased]', unreleased)
checkForbidden('CHANGELOG.md newest release', newestRelease)

for (const f of failures) console.error(`✗ ${f}`)
console.log(failures.length ? `${failures.length} failed` : 'region docs: all checks pass')
process.exit(failures.length ? 1 : 0)
