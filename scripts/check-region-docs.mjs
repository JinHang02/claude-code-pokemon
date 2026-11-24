#!/usr/bin/env node
// Region documentation validation: VERSION, FORBIDDEN, SITE_MENTIONS, the checks of README.md, docs/index.html,
// CHANGELOG.md and plugin.json, and the failures.
import { readFileSync } from 'node:fs'

const VERSION = '1.10.0'
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
    const found = re.exec(text)
    if (found) fail(`${path}: says "${found[0]}" (${re})`)
  }
}

const SITE_MENTIONS = [
  [/ferry tickets?/i, 'ferry tickets'],
  [/\bJohto\b/, 'a later region by name'],
  [/\/pokemon travel/, '/pokemon travel'],
  [/\/pokemon restart/, '/pokemon restart'],
  [/\/pokemon buy johto ticket/, 'buying a ticket by command'],
  [/Tickets tab/, "the Mart's Tickets tab"],
  [/\bstarter\b/i, 'the starter choice'],
  [/Start fresh/, 'fresh-or-keep: Start fresh'],
  [/Keep my save/, 'fresh-or-keep: Keep my save'],
  [/\/pokemon choose/, 'the typed starter choice'],
  [/\/pokemon keep/, 'the typed keep'],
  [/\/pokemon fresh/, 'the typed fresh start'],
  [/experience as a trainer/, 'the vague hint'],
  [/\/pokedex.{0,300}?\bregion by region/i, '/pokedex by region'],
]

for (const path of ['README.md', 'docs/index.html']) {
  const text = read(path).replace(/\s+/g, ' ')
  if (!text.trim()) continue
  for (const [re, what] of SITE_MENTIONS) if (!re.test(text)) fail(`${path}: doesn't mention ${what} (${re})`)
  checkForbidden(path, text)
  if (/ctrl\+x tab/.test(text)) fail(`${path}: says ctrl+x tab gives the band its keys`)
  if (/a random first Pokémon|a wild Pokémon will be waiting/i.test(text))
    fail(`${path}: still says the first Pokémon is random`)
}

const readme = read('README.md')
if (readme && !/^\| `\/pokemon region \[region\]`/m.test(readme))
  fail("README.md: upstream's /pokemon region row (evolution forms) is gone")
const site = read('docs/index.html')
if (site && /<(region|name|item)>/.test(site)) fail('docs/index.html: an unescaped <word> in a command')

const changelog = read('CHANGELOG.md')
const unreleased = /^## \[Unreleased\]\n([\s\S]*?)^## \[/m.exec(changelog)?.[1] ?? ''
if (changelog && !unreleased.trim()) fail('CHANGELOG.md: [Unreleased] is empty')
for (const heading of ['Added', 'Changed', 'Known limitations'])
  if (unreleased && !new RegExp(`^### ${heading}\\b`, 'm').test(unreleased))
    fail(`CHANGELOG.md: [Unreleased] has no "### ${heading}"`)
const limitations = /^### Known limitations\b[^\n]*\n([\s\S]*?)(?=^### |$(?![\s\S]))/m.exec(unreleased)?.[1] ?? ''
if (unreleased && !/older (version|window|release)/i.test(limitations))
  fail('CHANGELOG.md: [Unreleased] Known limitations misses the older-window loss')
checkForbidden('CHANGELOG.md [Unreleased]', unreleased)

const manifest = read('plugin/.claude-plugin/plugin.json')
if (manifest) {
  const { version } = JSON.parse(manifest)
  if (version !== VERSION) fail(`plugin/.claude-plugin/plugin.json: version is ${version}, not ${VERSION}`)
}

for (const f of failures) console.error(`✗ ${f}`)
console.log(failures.length ? `${failures.length} failed` : 'region docs: all checks pass')
process.exit(failures.length ? 1 : 0)
