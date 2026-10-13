# PokéMart and Game-Accurate Evolutions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every evolution among the plugin's 905 species happens the way the games do it: by level (with time of
day), by an item bought at a PokéMart with ₽ earned from work, by friendship from time together, or by a few special
rules; the rest keep a level that never makes a Pokémon evolve twice in a row.

**Architecture:** `evolution.ts` turns each PokeAPI evolution detail into a `Way` (level, item, hold, friendship,
party, shed, or a fallback level) and decides which stages are due for a context (level, time of day, held item,
time together, party). `items.ts` is the bundled catalogue. `save.ts` gains the Bag, ₽ (earned through the same
per-session ledgers as XP), held items, time together, and migrates old saves. `register.tsx` wires `give`, `take`,
`bag`, `mart`, a 60 s friendship heartbeat and buying. `mart.tsx` and `shop.tsx` are `Client` modules: the Mart
inside the band and its corner button. A generated PokeAPI fixture drives a coverage test and an end-to-end test of
every evolution, whose report becomes `specs/evolution-coverage.md`.

**Tech Stack:** TypeScript Claude Code mod (function hooks, `Client` surface modules), `claude-code/testing` kit,
PokeAPI, Node 22 scripts, Prettier 3.9.9.

**Spec:** `specs/2026-10-13-pokemart-design.md` (read it first; this plan argues from it).

## Global Constraints

- Repo: `~/Documents/claude-code-pokemon`; the plugin is `plugin/`. Never edit `~/.claude/mods/pokemon` by hand:
  it is a synced copy.
- **No git.** No `git add`, `commit`, `push`, `stash` or branch. The owner does all git. Steps that would commit
  say "No commit".
- Comments follow the repo: one short line on what the code can't say; no history, no incident talk.
- Run the suite on a copy, never in `plugin/` (the engine lays files there):
  `S=/private/tmp/claude-501/-Users-jinhangtang-Documents-claude-code-pokemon/48227af5-ff23-4c43-8fb5-cdca1d5b3d3c/scratchpad/pokemon-test`
  - Tests: `rm -rf $S && cp -R ~/Documents/claude-code-pokemon/plugin $S && claude plugin test $S`
  - One file: `... && claude plugin test $S 2>&1 | grep -E "^\(fail\)|pass$|fail$"` after deleting the other
    `*.test.ts*` files from `$S/tests` (the runner has no filter flag).
  - Types: `cp -R ~/.claude/mods/pokemon/.claude-plugin/types $S/.claude-plugin/ && cp ~/.claude/mods/pokemon/tsconfig.json $S/ && (cd $S && npx --yes -p typescript tsc -p .)`
- Baseline before Task 1: **170 tests pass, `tsc` clean** (checked 2026-10-13).
- Tests can't read or write files and can't `import()` dynamically; `console.log` lines do reach the runner's
  output.
- A `Client` gets keys only after a click gives it the focus, and **Escape never reaches it** (it returns the focus
  to the prompt). Its pointer events are `down | move | up | enter | leave`; the **wheel** over the band arrives as
  the band's `ui.scroll` event instead.
- Values (spec): ₽ = XP × 10 per event, once per event; start ₽3,000; stones ₽3,000; hold, special items and the
  Linking Cord ₽5,000; Rare Candy ₽4,800; Soothe Bell ₽4,000; Lucky Egg ₽10,000; Bag ≤ 999 per item; friendship at
  10 h together (`36_000_000` ms); Soothe Bell ×1.5; Lucky Egg +50% XP; heartbeat 60 s, gap capped at 120 s;
  fallback level `max(30, reached + 10)`; Rare Candy refused at Lv 100.
- Version 1.3.0 in `plugin/.claude-plugin/plugin.json` only.

## Spec adjustments (found while planning; the owner reviews them with this plan)

1. **Esc can't close the Mart** (the engine keeps Escape). `x` or a click on `✕` closes it; Esc hands the keyboard
   back to the prompt with the Mart still open.
2. **The mouse wheel works through the band, not the `Client`.** A `Client` gets no wheel events, but the band's
   `ui.scroll` hook does: while the Mart is open it moves the selection. `↑` `↓` and clicks on `▲ n above` /
   `▼ n more` work too.
3. **Item pictures are 12×6-cell pixel icons** built once by `scripts/item-icons.mjs` (PokeAPI sprites, then the
   Pokémon Showdown item sheet, else a generic Bag icon) and bundled. They show when the band has at least 8 rows;
   a smaller band shows a `◆` in the item's colour.
4. **Level-up hold items** (Razor Claw, Razor Fang, Oval Stone, Strawberry Sweet) and Mantyke's Remoraid rule
   evolve at the **next evolution check** (a level-up, a `give`, or the 60 s heartbeat) instead of strictly the next
   level-up, so nothing waits for XP once the condition holds.
5. **Alcremie** gets a cream that follows the time of day (from PokeAPI's own forms) instead of the plain form.

## Review Focus

1. A save written by 1.2.0 (`evolveAt`, `hasEverstone`) loads: the everstone becomes the held item, old cached
   levels are looked up again, and the wallet starts at ₽3,000 (Task 4 test "a 1.2.0 save loads...").
2. Two sessions earning at once never lose ₽, and a ledger folded into the save is never counted twice (Task 4
   test "₽ from two ledgers...").
3. A `give` naming an item the person doesn't have, an item that does nothing for that Pokémon, or a Pokémon not in
   the party changes nothing and says why (Task 6 test "give refuses...").
4. A closed laptop (a gap of hours between heartbeats) adds at most 120 s of time together, and two sessions add
   each real minute once (Task 4 test "time together...").
5. A Mart message that isn't one the Mart sends (an unknown act, a bad item, a quantity of 0, 1000 or a fraction,
   the Everstone) changes nothing (Task 8's refusal test).

---

### Task 1: Probe: the corner button and the Mart in a real terminal (owner present)

**Files:** a throwaway mod under `$S/../probe-mart/` only. Nothing in the repo.

The design depends on three things only a real terminal can show. Answer them before Task 8.

- [ ] **Step 1: Write the probe mod.** Copy `~/.claude/mods/pokemon` to `$S/../probe-mart`, then in its
      `hooks/register.tsx` `ui.render` hook for `AbovePrompt`, replace the final
      `return <Raster key="scene" .../>` with:

```tsx
const BUTTON = 13
return (
  <Box flexDirection="row">
    <Raster key="scene" columns={columns - BUTTON} rows={rows} cells={cells} />
    <Client key="shop" module="./probe-button.tsx" width={BUTTON} height={rows} props={{ n: probeClicks }} />
  </Box>
)
```

with `let probeClicks = 0` at module level, `const { Box, Client, Raster } = $.ui.resolve(e)`, and in the
`ui.message` hook `if (e.element === 'shop') { probeClicks++; $.ui.toast(`shop click ${probeClicks}`) }`. Add
`hooks/probe-button.tsx`:

```tsx
import type { ClientModule } from 'claude-code'

import { helper } from './probe-helper'

const Button: ClientModule<{ n: number }, true> = (p, s) => {
  if (s.state === undefined) {
    s.onPointer(e => {
      if (e.type === 'down' && e.button === 'left') s.post({ open: true })
    })
    s.onKey(e => s.post({ key: e.key }))
    s.setState(true)
  }
  const { Text } = s.elements
  return <Text color="#ffd75e">{helper(`🛒 ₽ 1,240 ${p.n}`)}</Text>
}

export default Button
```

and `hooks/probe-helper.ts`: `export const helper = (t: string) => t.trim()`. In `tick`, the `$.ui.blit` call
gets `columns: band.columns` where `band.columns` is now `columns - BUTTON`.

- [ ] **Step 2: Run it.** `claude --plugin-dir $S/../probe-mart` in iTerm2 (or the owner's terminal) with the
      real mod disabled for that session. The owner watches for one minute of normal use.
- [ ] **Step 3: Record the answers** in `$S/../probe-mart/ANSWERS.md`:
  1. Does the band keep animating smoothly with the button beside it (no stall, no flicker)?
  2. Does a click on the button toast `shop click 1`, `2`...?
  3. After clicking the button, do letter and arrow keys reach it (`ui.message` with `{ key }`; toast them)?
  4. Did `probe-button.tsx` load its import of `./probe-helper` (the text shows; no `ui.fault`)?
  5. Does `🛒` take two columns (the text fits in 13)?
- [ ] **Step 4: Decide.**
  - 1–2 yes: Task 8 uses the side button as written.
  - 1 no: Task 8 Step 6 drops the button (the corner shows `₽ 1,240` as part of the Raster's text? no: leave it
    out) and `/pokemon mart` is the only way in; README says so.
  - 3 no: the Mart works by clicks only; Task 8 keeps the key handler (harmless) and the README omits keys.
  - 4 no: `mart.tsx` must not import anything but types; Task 8's code already keeps `mart.tsx` self-contained,
    and its pure helpers are duplicated nowhere else, so nothing changes.
- [ ] **Step 5:** Delete `$S/../probe-mart`. No commit.

---

### Task 2: `items.ts`: the catalogue

**Files:**

- Create: `plugin/hooks/items.ts`
- Test: `plugin/tests/items.test.ts`

**Interfaces:**

- Produces: `type Tab`, `type Kind = 'evolve' | 'hold' | 'candy'`, `type Item`, `TABS`, `ITEMS`, `MAX_BAG = 999`,
  `itemById(id): Item | undefined`, `isItemId(x): x is string`, `isForSale(item): boolean`, `forSale(): Item[]`,
  `withArticle(name): string`, `itemName(id): string`, `splitGive(words): { item; rest } | null`.

- [ ] **Step 1: Write the failing test** `plugin/tests/items.test.ts`:

```ts
import { expect, test } from 'claude-code/testing'

import { forSale, isItemId, itemById, itemName, ITEMS, MAX_BAG, splitGive, TABS, withArticle } from '../hooks/items'

test('the Mart sells 42 items in four tabs, at the prices the spec sets', () => {
  expect(MAX_BAG).toBe(999)
  expect(TABS).toEqual(['Stones', 'Hold items', 'Special', 'Other'])
  expect(TABS.map(t => forSale().filter(i => i.tab === t).length)).toEqual([10, 18, 11, 3])
  expect(itemById('thunder-stone')).toMatchObject({ name: 'Thunder Stone', kind: 'evolve', price: 3000 })
  expect(itemById('metal-coat')).toMatchObject({ tab: 'Hold items', kind: 'evolve', price: 5000 })
  expect(itemById('razor-claw')).toMatchObject({ kind: 'hold', price: 5000 })
  expect(itemById('linking-cord')).toMatchObject({ tab: 'Special', kind: 'evolve', price: 5000 })
  expect(itemById('rare-candy')).toMatchObject({ kind: 'candy', price: 4800 })
  expect(itemById('soothe-bell')?.price).toBe(4000)
  expect(itemById('lucky-egg')?.price).toBe(10000)
  // The Everstone is known (it can be held) but never sold: /pokemon everstone gives one free.
  expect(itemById('everstone')?.isSold).toBe(false)
  expect(forSale().some(i => i.id === 'everstone')).toBe(false)
})

test('every item has its game name and a description, and ids are plain names', () => {
  for (const i of ITEMS) {
    expect(i.id).toMatch(/^[a-z]+(-[a-z]+)*$/)
    expect(i.text.length).toBeGreaterThan(40)
    expect(i.color).toMatch(/^#[0-9a-f]{6}$/)
  }
  expect(itemById('kings-rock')?.name).toBe("King's Rock")
  expect(itemById('up-grade')?.name).toBe('Up-Grade')
  expect(itemById('thunder-stone')?.text).toBe(
    'A peculiar stone that can make certain species of Pokémon evolve. It has a distinct thunderbolt pattern.',
  )
  expect(isItemId('fire-stone')).toBe(true)
  expect(isItemId('gimmighoul-coin')).toBe(false)
  expect(isItemId('constructor')).toBe(false)
  expect(itemName('dusk-stone')).toBe('Dusk Stone')
})

test('a/an, and finding the item in a give, first or last', () => {
  expect(withArticle('Thunder Stone')).toBe('a Thunder Stone')
  expect(withArticle('Ice Stone')).toBe('an Ice Stone')
  expect(withArticle('Up-Grade')).toBe('an Up-Grade')
  expect(splitGive(['thunder', 'stone', 'pikachu'])).toEqual({ item: itemById('thunder-stone'), rest: ['pikachu'] })
  expect(splitGive(['mr', 'mime', 'moon', 'stone'])).toEqual({ item: itemById('moon-stone'), rest: ['mr', 'mime'] })
  expect(splitGive(['kings', 'rock', 'slowpoke'])).toEqual({ item: itemById('kings-rock'), rest: ['slowpoke'] })
  expect(splitGive(['scroll', 'of', 'waters', 'kubfu'])?.item.id).toBe('scroll-of-waters')
  expect(splitGive(['rare', 'candy'])).toEqual({ item: itemById('rare-candy'), rest: [] })
  expect(splitGive(['pikachu'])).toBeNull()
  expect(splitGive([])).toBeNull()
})
```

- [ ] **Step 2: Run it.** Copy, delete other test files from `$S/tests`, run. Expected: FAIL, the file does not
      load (`../hooks/items` missing).

- [ ] **Step 3: Write `plugin/hooks/items.ts`:**

```ts
// The PokéMart's stock and what a Bag can hold: the games' names, prices and descriptions, bundled so the Mart
// works offline. `evolve`: given, it evolves the Pokémon at once and is used up (stones, trade items, the Linking
// Cord). `hold`: given, the Pokémon holds it. `candy`: given, one level.
export type Tab = 'Stones' | 'Hold items' | 'Special' | 'Other'
export type Kind = 'evolve' | 'hold' | 'candy'
export type Item = {
  id: string
  name: string
  tab: Tab
  kind: Kind
  price: number
  // The colour of its ◆ in the Mart.
  color: string
  text: string
  isSold?: false
}

export const TABS: Tab[] = ['Stones', 'Hold items', 'Special', 'Other']
export const MAX_BAG = 999

export const ITEMS: Item[] = [
  {
    id: 'fire-stone',
    name: 'Fire Stone',
    tab: 'Stones',
    kind: 'evolve',
    price: 3000,
    color: '#f08030',
    text: 'A peculiar stone that can make certain species of Pokémon evolve. The stone has a fiery orange heart.',
  },
  {
    id: 'water-stone',
    name: 'Water Stone',
    tab: 'Stones',
    kind: 'evolve',
    price: 3000,
    color: '#6890f0',
    text: 'A peculiar stone that can make certain species of Pokémon evolve. It is the blue of a pool of clear water.',
  },
  {
    id: 'thunder-stone',
    name: 'Thunder Stone',
    tab: 'Stones',
    kind: 'evolve',
    price: 3000,
    color: '#f8d030',
    text: 'A peculiar stone that can make certain species of Pokémon evolve. It has a distinct thunderbolt pattern.',
  },
  {
    id: 'leaf-stone',
    name: 'Leaf Stone',
    tab: 'Stones',
    kind: 'evolve',
    price: 3000,
    color: '#78c850',
    text: 'A peculiar stone that can make certain species of Pokémon evolve. It has an unmistakable leaf pattern.',
  },
  {
    id: 'ice-stone',
    name: 'Ice Stone',
    tab: 'Stones',
    kind: 'evolve',
    price: 3000,
    color: '#98d8d8',
    text: 'A peculiar stone that can make certain species of Pokémon evolve. It has an unmistakable snowflake pattern.',
  },
  {
    id: 'moon-stone',
    name: 'Moon Stone',
    tab: 'Stones',
    kind: 'evolve',
    price: 3000,
    color: '#705898',
    text: 'A peculiar stone that can make certain species of Pokémon evolve. It is as black as the night sky.',
  },
  {
    id: 'sun-stone',
    name: 'Sun Stone',
    tab: 'Stones',
    kind: 'evolve',
    price: 3000,
    color: '#f85838',
    text: 'A peculiar stone that can make certain species of Pokémon evolve. It burns as red as the evening sun.',
  },
  {
    id: 'shiny-stone',
    name: 'Shiny Stone',
    tab: 'Stones',
    kind: 'evolve',
    price: 3000,
    color: '#f8f8f8',
    text: 'A peculiar stone that can make certain species of Pokémon evolve. It shines with a dazzling light.',
  },
  {
    id: 'dusk-stone',
    name: 'Dusk Stone',
    tab: 'Stones',
    kind: 'evolve',
    price: 3000,
    color: '#705848',
    text: 'A peculiar stone that can make certain species of Pokémon evolve. It holds shadows as dark as can be.',
  },
  {
    id: 'dawn-stone',
    name: 'Dawn Stone',
    tab: 'Stones',
    kind: 'evolve',
    price: 3000,
    color: '#60e0f8',
    text: 'A peculiar stone that can make certain species of Pokémon evolve. It sparkles like a glittering eye.',
  },
  {
    id: 'metal-coat',
    name: 'Metal Coat',
    tab: 'Hold items',
    kind: 'evolve',
    price: 5000,
    color: '#b8b8d0',
    text: "An item to be held by a Pokémon. It's a special metallic film that can boost the power of Steel-type moves.",
  },
  {
    id: 'kings-rock',
    name: "King's Rock",
    tab: 'Hold items',
    kind: 'evolve',
    price: 5000,
    color: '#e0c040',
    text: 'An item to be held by a Pokémon. When the holder successfully inflicts damage, the target may also flinch.',
  },
  {
    id: 'dragon-scale',
    name: 'Dragon Scale',
    tab: 'Hold items',
    kind: 'evolve',
    price: 5000,
    color: '#7058f8',
    text: 'A very tough and inflexible scale. Dragon-type Pokémon may be holding this item when caught.',
  },
  {
    id: 'up-grade',
    name: 'Up-Grade',
    tab: 'Hold items',
    kind: 'evolve',
    price: 5000,
    color: '#e85050',
    text: 'A transparent device somehow filled with all sorts of data. It was produced by Silph Co.',
  },
  {
    id: 'dubious-disc',
    name: 'Dubious Disc',
    tab: 'Hold items',
    kind: 'evolve',
    price: 5000,
    color: '#a070d0',
    text: 'A transparent device overflowing with dubious data. Its producer is unknown.',
  },
  {
    id: 'protector',
    name: 'Protector',
    tab: 'Hold items',
    kind: 'evolve',
    price: 5000,
    color: '#a08060',
    text: "A protective item of some sort. It is extremely stiff and heavy. It's loved by a certain Pokémon.",
  },
  {
    id: 'electirizer',
    name: 'Electirizer',
    tab: 'Hold items',
    kind: 'evolve',
    price: 5000,
    color: '#f8d030',
    text: "A box packed with a tremendous amount of electric energy. It's loved by a certain Pokémon.",
  },
  {
    id: 'magmarizer',
    name: 'Magmarizer',
    tab: 'Hold items',
    kind: 'evolve',
    price: 5000,
    color: '#f08030',
    text: "A box packed with a tremendous amount of magma energy. It's loved by a certain Pokémon.",
  },
  {
    id: 'reaper-cloth',
    name: 'Reaper Cloth',
    tab: 'Hold items',
    kind: 'evolve',
    price: 5000,
    color: '#705898',
    text: "A cloth imbued with horrifyingly strong spiritual energy. It's loved by a certain Pokémon.",
  },
  {
    id: 'deep-sea-tooth',
    name: 'Deep Sea Tooth',
    tab: 'Hold items',
    kind: 'evolve',
    price: 5000,
    color: '#c0c8e0',
    text: "An item to be held by Clamperl. This fang gleams a sharp silver and raises the holder's Sp. Atk stat.",
  },
  {
    id: 'deep-sea-scale',
    name: 'Deep Sea Scale',
    tab: 'Hold items',
    kind: 'evolve',
    price: 5000,
    color: '#f0a0c0',
    text: "An item to be held by Clamperl. This scale shines with a faint pink and raises the holder's Sp. Def stat.",
  },
  {
    id: 'prism-scale',
    name: 'Prism Scale',
    tab: 'Hold items',
    kind: 'evolve',
    price: 5000,
    color: '#c0e0f8',
    text: 'A mysterious scale that causes a certain Pokémon to evolve. It shines in rainbow colors.',
  },
  {
    id: 'sachet',
    name: 'Sachet',
    tab: 'Hold items',
    kind: 'evolve',
    price: 5000,
    color: '#f0a0d0',
    text: "A sachet filled with fragrant perfumes that are just slightly too overwhelming. Yet it's loved by a certain Pokémon.",
  },
  {
    id: 'whipped-dream',
    name: 'Whipped Dream',
    tab: 'Hold items',
    kind: 'evolve',
    price: 5000,
    color: '#f8e0f0',
    text: "A soft and sweet treat made of fluffy, puffy, whipped, and whirled cream. It's loved by a certain Pokémon.",
  },
  {
    id: 'razor-claw',
    name: 'Razor Claw',
    tab: 'Hold items',
    kind: 'hold',
    price: 5000,
    color: '#c0c0c0',
    text: "An item to be held by a Pokémon. This sharply hooked claw increases the holder's critical-hit ratio.",
  },
  {
    id: 'razor-fang',
    name: 'Razor Fang',
    tab: 'Hold items',
    kind: 'hold',
    price: 5000,
    color: '#e0e0e0',
    text: 'An item to be held by a Pokémon. When the holder successfully inflicts damage, the target may also flinch.',
  },
  {
    id: 'oval-stone',
    name: 'Oval Stone',
    tab: 'Hold items',
    kind: 'hold',
    price: 5000,
    color: '#e8e0c8',
    text: "A peculiar stone that can make certain species of Pokémon evolve. It's as round as a Pokémon Egg.",
  },
  {
    id: 'strawberry-sweet',
    name: 'Strawberry Sweet',
    tab: 'Hold items',
    kind: 'hold',
    price: 5000,
    color: '#f05070',
    text: 'A strawberry-shaped sweet. When a Milcery holds this, it will spin around happily.',
  },
  {
    id: 'linking-cord',
    name: 'Linking Cord',
    tab: 'Special',
    kind: 'evolve',
    price: 5000,
    color: '#a0d0f8',
    text: "A string exuding a mysterious energy that makes you feel a strange sense of connection. It's loved by certain Pokémon.",
  },
  {
    id: 'tart-apple',
    name: 'Tart Apple',
    tab: 'Special',
    kind: 'evolve',
    price: 5000,
    color: '#a8d040',
    text: "A peculiar apple that can make a certain species of Pokémon evolve. It's exceptionally tart.",
  },
  {
    id: 'sweet-apple',
    name: 'Sweet Apple',
    tab: 'Special',
    kind: 'evolve',
    price: 5000,
    color: '#e05050',
    text: "A peculiar apple that can make a certain species of Pokémon evolve. It's exceptionally sweet.",
  },
  {
    id: 'cracked-pot',
    name: 'Cracked Pot',
    tab: 'Special',
    kind: 'evolve',
    price: 5000,
    color: '#c08050',
    text: 'A peculiar teapot that can make a certain species of Pokémon evolve. It may be cracked, but tea poured from it is delicious.',
  },
  {
    id: 'chipped-pot',
    name: 'Chipped Pot',
    tab: 'Special',
    kind: 'evolve',
    price: 5000,
    color: '#c08050',
    text: 'A peculiar teapot that can make a certain species of Pokémon evolve. It may be chipped, but tea poured from it is delicious.',
  },
  {
    id: 'black-augurite',
    name: 'Black Augurite',
    tab: 'Special',
    kind: 'evolve',
    price: 5000,
    color: '#404048',
    text: "A glassy black stone that produces a sharp cutting edge when split. It's loved by a certain Pokémon.",
  },
  {
    id: 'peat-block',
    name: 'Peat Block',
    tab: 'Special',
    kind: 'evolve',
    price: 5000,
    color: '#806040',
    text: "A block of muddy material that can be used as fuel for burning when it is dried. It's loved by a certain Pokémon.",
  },
  {
    id: 'scroll-of-darkness',
    name: 'Scroll of Darkness',
    tab: 'Special',
    kind: 'evolve',
    price: 5000,
    color: '#383838',
    text: 'A peculiar scroll that can make a certain species of Pokémon evolve. Written upon it are the true secrets of the path of darkness.',
  },
  {
    id: 'scroll-of-waters',
    name: 'Scroll of Waters',
    tab: 'Special',
    kind: 'evolve',
    price: 5000,
    color: '#4080d0',
    text: 'A peculiar scroll that can make a certain species of Pokémon evolve. Written upon it are the true secrets of the path of water.',
  },
  {
    id: 'galarica-cuff',
    name: 'Galarica Cuff',
    tab: 'Special',
    kind: 'evolve',
    price: 5000,
    color: '#b07850',
    text: 'A cuff made from woven-together Galarica Twigs. Giving it to Galarian Slowpoke makes the Pokémon very happy.',
  },
  {
    id: 'galarica-wreath',
    name: 'Galarica Wreath',
    tab: 'Special',
    kind: 'evolve',
    price: 5000,
    color: '#b07850',
    text: 'A wreath made from woven-together Galarica Twigs. Placing it on the head of a Galarian Slowpoke makes the Pokémon very happy.',
  },
  {
    id: 'rare-candy',
    name: 'Rare Candy',
    tab: 'Other',
    kind: 'candy',
    price: 4800,
    color: '#a070f0',
    text: 'A candy that is packed with energy. When consumed, it will instantly raise the level of a single Pokémon by one.',
  },
  {
    id: 'lucky-egg',
    name: 'Lucky Egg',
    tab: 'Other',
    kind: 'hold',
    price: 10000,
    color: '#f8f0d0',
    text: "An item to be held by a Pokémon. It's an egg filled with happiness that earns the holder extra XP as you work together.",
  },
  {
    id: 'soothe-bell',
    name: 'Soothe Bell',
    tab: 'Other',
    kind: 'hold',
    price: 4000,
    color: '#f0d060',
    text: 'An item to be held by a Pokémon. The comforting chime of this bell calms the holder, making it friendly faster.',
  },
  {
    id: 'everstone',
    name: 'Everstone',
    tab: 'Other',
    kind: 'hold',
    price: 0,
    color: '#c8c8c8',
    isSold: false,
    text: 'An item to be held by a Pokémon. A Pokémon holding this peculiar stone is prevented from evolving.',
  },
]

const BY_ID = new Map(ITEMS.map(i => [i.id, i]))

export const itemById = (id: string): Item | undefined => BY_ID.get(id)
export const isItemId = (id: unknown): id is string => typeof id === 'string' && BY_ID.has(id)
export const isForSale = (item: Item | undefined) => Boolean(item && item.isSold !== false)
export const forSale = (): Item[] => ITEMS.filter(isForSale)
export const itemName = (id: string) => itemById(id)?.name ?? id

// "a Thunder Stone", "an Up-Grade".
export const withArticle = (name: string) => `${/^[AEIOU]/.test(name) ? 'an' : 'a'} ${name}`

// The item a give names, from slugged words, and the words left for the Pokémon: the item comes first or last.
export function splitGive(words: string[]): { item: Item; rest: string[] } | null {
  for (let n = words.length; n > 0; n--) {
    const front = itemById(words.slice(0, n).join('-'))
    if (front) return { item: front, rest: words.slice(n) }
    const back = itemById(words.slice(words.length - n).join('-'))
    if (back) return { item: back, rest: words.slice(0, words.length - n) }
  }
  return null
}
```

- [ ] **Step 4: Run it.** Expected: 3 pass. Then `npx --yes prettier@3.9.9 --write plugin/hooks/items.ts
plugin/tests/items.test.ts` (it reflows the long rows) and run again: 3 pass.

- [ ] **Step 5:** No commit.

---

### Task 3: `evolution.ts`: ways, the fallback, and what's due

**Files:**

- Modify: `plugin/hooks/evolution.ts` (whole file below)
- Test: `plugin/tests/evolution.test.ts` (rewrite the expectations that named `level:`)

**Interfaces:**

- Consumes: `itemById`, `isForSale` (Task 2); `type Phase` from `./backdrop`.
- Produces: `type EvolutionDetail` (wider), `type ChainLink`, `type Time = 'day' | 'night' | 'dusk'`, `type Way`,
  `type Stage = { species: string; form?: string; way: Way }`, `FALLBACK_LEVEL = 30`, `FALLBACK_GAP = 10`,
  `FRIENDSHIP_MS = 36_000_000`, `wayOf(detail): Way | null`, `nextStages(chain, name, formName?, gender?, forms?):
Stage[]` (same parameters as today), `type DueContext`, `timeMatches(time, phase)`, `dueStages(stages, context):
Stage[]`, unchanged `genderOf`, `evolvedForm(stage, memberForm, forms)`, `pokeapiForm`. `OTHER_EVOLVE_LEVEL` is
  removed.

- [ ] **Step 1: Rewrite the tests.** In `plugin/tests/evolution.test.ts`:
  - Import line: `import { dueStages, evolvedForm, FRIENDSHIP_MS, genderOf, nextStages, pokeapiForm, timeMatches,
wayOf } from '../hooks/evolution'` and `import type { ChainLink, Stage } from '../hooks/evolution'`.
  - Add helpers after `link`:

```ts
const lv = (species: string, level: number, extra: Partial<Stage> = {}): Stage => ({
  species,
  ...extra,
  way: { kind: 'level', level },
})
const fallback = (species: string, level: number, extra: Partial<Stage> = {}): Stage => ({
  species,
  ...extra,
  way: { kind: 'level', level, isFallback: true },
})
```

- Every `{ species: 'x', level: N }` expectation where the chain gives `min_level: N` becomes `lv('x', N)`; where
  the chain has no level (`{ min_level: null }`, `{}`) it becomes `fallback('x', 30)` (or as the replaced tests
  below say). `{ species, form, level }` keeps `form` in the third argument: `lv('persian', 28)`,
  `fallback('persian', 30, { form: 'persian-alola' })`.
- `evolvedForm({ species: 'raichu', level: 30, form: 'raichu-alola' }, ...)` and the other `evolvedForm` calls
  drop `level: N` and take `way: { kind: 'level', level: N }`.
- Replace the test `'stones, friendship and other conditions happen at a set level'` and
  `'a branch with no level evolves alongside its levelled sibling...'` with:

```ts
const named = (name: string) => ({ name })
const realPichu = link(
  'pichu',
  [],
  link(
    'pikachu',
    [{ trigger: named('level-up'), min_happiness: 220 }],
    link('raichu', [{ trigger: named('use-item'), item: named('thunder-stone') }]),
  ),
)

test('each PokeAPI detail becomes the way it works here', () => {
  expect(wayOf({ trigger: named('level-up'), min_level: 16 })).toEqual({ kind: 'level', level: 16 })
  expect(wayOf({ trigger: named('level-up'), min_level: 25, time_of_day: 'night' })).toEqual({
    kind: 'level',
    level: 25,
    time: 'night',
  })
  expect(wayOf({ trigger: named('level-up'), min_level: 32, party_type: named('dark') })).toEqual({
    kind: 'level',
    level: 32,
    partyType: 'dark',
  })
  expect(wayOf({ trigger: named('use-item'), item: named('thunder-stone') })).toEqual({
    kind: 'item',
    item: 'thunder-stone',
  })
  expect(wayOf({ trigger: named('use-item'), item: named('peat-block'), time_of_day: 'full-moon' })).toEqual({
    kind: 'item',
    item: 'peat-block',
    time: 'night',
  })
  // A trade while holding an item is giving that item; a plain trade is the Linking Cord.
  expect(wayOf({ trigger: named('trade'), held_item: named('reaper-cloth') })).toEqual({
    kind: 'item',
    item: 'reaper-cloth',
  })
  expect(wayOf({ trigger: named('trade') })).toEqual({ kind: 'item', item: 'linking-cord' })
  expect(wayOf({ trigger: named('trade'), trade_species: named('shelmet') })).toEqual({
    kind: 'item',
    item: 'linking-cord',
  })
  expect(wayOf({ trigger: named('level-up'), held_item: named('razor-claw'), time_of_day: 'night' })).toEqual({
    kind: 'hold',
    item: 'razor-claw',
    time: 'night',
  })
  expect(wayOf({ trigger: named('spin'), held_item: named('strawberry-sweet'), time_of_day: 'day' })).toEqual({
    kind: 'hold',
    item: 'strawberry-sweet',
    time: 'day',
  })
  expect(wayOf({ trigger: named('level-up'), min_happiness: 160, time_of_day: 'day' })).toEqual({
    kind: 'friendship',
    time: 'day',
  })
  expect(wayOf({ trigger: named('level-up'), party_species: named('remoraid') })).toEqual({
    kind: 'party',
    species: 'remoraid',
  })
  expect(wayOf({ trigger: named('shed') })).toEqual({ kind: 'shed' })
  // Moves, unsold items, places and battles: nothing the plugin can do.
  expect(wayOf({ trigger: named('level-up'), known_move_type: named('fairy'), min_happiness: 160 })).toBeNull()
  expect(wayOf({ trigger: named('level-up'), known_move: named('ancient-power') })).toBeNull()
  expect(wayOf({ trigger: named('use-item'), item: named('syrupy-apple') })).toBeNull()
  expect(wayOf({ trigger: named('spin'), held_item: named('ribbon-sweet') })).toBeNull()
  expect(wayOf({ trigger: named('level-up') })).toBeNull()
  expect(wayOf({ trigger: named('three-critical-hits') })).toBeNull()
})

test('stones and friendship evolve the way the games do', () => {
  expect(nextStages(realPichu, 'pichu')).toEqual([{ species: 'pikachu', way: { kind: 'friendship' } }])
  expect(nextStages(realPichu, 'pikachu')).toEqual([
    { species: 'raichu', way: { kind: 'item', item: 'thunder-stone' } },
  ])
})

test('what the plugin cannot do falls back to a level 10 past the one the species was reached at, at least 30', () => {
  const ice = link(
    'swinub',
    [],
    link(
      'piloswine',
      [{ trigger: named('level-up'), min_level: 33 }],
      link('mamoswine', [{ trigger: named('level-up'), known_move: named('ancient-power') }]),
    ),
  )
  expect(nextStages(ice, 'piloswine')).toEqual([fallback('mamoswine', 43)])
  const mime = link('mime-jr', [], link('mr-mime', [{ trigger: named('level-up'), known_move: named('mimic') }]))
  expect(nextStages(mime, 'mime-jr')).toEqual([fallback('mr-mime', 30)])
})

test('Shedinja comes along with Ninjask; the time of day names Lycanroc', () => {
  const bug = link(
    'nincada',
    [],
    link('ninjask', [{ trigger: named('level-up'), min_level: 20 }]),
    link('shedinja', [{ trigger: named('shed') }]),
  )
  expect(nextStages(bug, 'nincada')).toEqual([lv('ninjask', 20), { species: 'shedinja', way: { kind: 'shed' } }])
  const dog = link(
    'rockruff',
    [],
    link('lycanroc', [
      { trigger: named('level-up'), min_level: 25, time_of_day: 'day' },
      { trigger: named('level-up'), min_level: 25, time_of_day: 'night' },
    ]),
  )
  expect(nextStages(dog, 'rockruff')).toEqual([
    { species: 'lycanroc', form: 'lycanroc-midday', way: { kind: 'level', level: 25, time: 'day' } },
    { species: 'lycanroc', form: 'lycanroc-midnight', way: { kind: 'level', level: 25, time: 'night' } },
  ])
})

test('the same way in several games is one stage, at the lowest level', () => {
  const darumaka = link(
    'darumaka',
    [],
    link('darmanitan', [
      { trigger: named('level-up'), min_level: 35 },
      { trigger: named('level-up'), min_level: 35 },
    ]),
  )
  expect(nextStages(darumaka, 'darumaka')).toEqual([lv('darmanitan', 35)])
})

test('what is due: level and time, a held item, friendship time, a party member, never with an Everstone', () => {
  const base = { level: 20, phase: 'day' as const, togetherMs: 0, party: [], partyTypes: [] }
  const night = { species: 'lycanroc', way: { kind: 'level', level: 25, time: 'night' } } as Stage
  expect(dueStages([night], { ...base, level: 25 })).toEqual([])
  expect(dueStages([night], { ...base, level: 25, phase: 'night' })).toEqual([night])
  // Dawn is morning: "day" evolutions happen then too.
  expect(timeMatches('day', 'dawn')).toBe(true)
  expect(timeMatches('dusk', 'night')).toBe(false)
  expect(timeMatches(undefined, 'night')).toBe(true)
  const claw = { species: 'weavile', way: { kind: 'hold', item: 'razor-claw', time: 'night' } } as Stage
  expect(dueStages([claw], { ...base, phase: 'night' })).toEqual([])
  expect(dueStages([claw], { ...base, phase: 'night', heldItem: 'razor-claw' })).toEqual([claw])
  const love = { species: 'crobat', way: { kind: 'friendship' } } as Stage
  expect(dueStages([love], { ...base, togetherMs: FRIENDSHIP_MS - 1 })).toEqual([])
  expect(dueStages([love], { ...base, togetherMs: FRIENDSHIP_MS })).toEqual([love])
  const fish = { species: 'mantine', way: { kind: 'party', species: 'remoraid' } } as Stage
  expect(dueStages([fish], { ...base, party: ['mantyke', 'remoraid'] })).toEqual([fish])
  const panda = { species: 'pangoro', way: { kind: 'level', level: 32, partyType: 'dark' } } as Stage
  expect(dueStages([panda], { ...base, level: 32 })).toEqual([])
  expect(dueStages([panda], { ...base, level: 32, partyTypes: ['normal', 'dark'] })).toEqual([panda])
  // Given items and Shedinja are never due by themselves.
  const stone = { species: 'raichu', way: { kind: 'item', item: 'thunder-stone' } } as Stage
  expect(dueStages([stone, { species: 'shedinja', way: { kind: 'shed' } }], { ...base, level: 100 })).toEqual([])
  expect(dueStages([lv('charmeleon', 16)], { ...base, level: 16, heldItem: 'everstone' })).toEqual([])
})
```

- The `mimeJr` and `slowpoke` fixtures stay. `mime-jr`'s expectation becomes
  `[fallback('mr-mime', 30), fallback('mr-mime', 30, { form: 'mr-mime-galar' })]`; `mr-mime` (galar) →
  `[lv('mr-rime', 42)]`; the slowpoke test (`slowking` with `{ min_level: null }`) is replaced by:
  `expect(nextStages(slowpoke, 'slowpoke')).toEqual([lv('slowbro', 37), fallback('slowking', 30)])` and its title
  becomes `'a branch with no way here falls back to its own level, not its sibling's'`.
- `meowth-alola`'s Persian (`{ min_level: null, required_pokemon_form... }`) becomes
  `[fallback('persian', 30, { form: 'persian-alola' })]` (the real data says friendship; the coverage test checks
  that).

- [ ] **Step 2: Run it.** Expected: FAIL (no `wayOf` export; stages have `level`).

- [ ] **Step 3: Replace `plugin/hooks/evolution.ts`** with:

```ts
import type { Phase } from './backdrop'
import { isForSale, itemById } from './items'

type Named = { name: string }

// One way a species is reached in PokeAPI's chain: the trigger and what it needs. `gender`: 1 when only females
// evolve this way, 2 when only males. The forms it starts from and ends as (`meowth-galar` only; `raichu-alola`).
export type EvolutionDetail = {
  trigger?: Named | null
  min_level?: number | null
  gender?: number | null
  item?: Named | null
  held_item?: Named | null
  trade_species?: Named | null
  min_happiness?: number | null
  min_affection?: number | null
  known_move?: Named | null
  known_move_type?: Named | null
  party_species?: Named | null
  party_type?: Named | null
  time_of_day?: string | null
  required_pokemon_form?: Named | null
  evolved_pokemon_form?: Named | null
}

// A PokeAPI evolution chain node; `evolution_details` say how its species is reached.
export type ChainLink = {
  species: Named
  evolves_to: ChainLink[]
  evolution_details?: EvolutionDetail[]
}

export type Time = 'day' | 'night' | 'dusk'

// How an evolution happens here. `level`: at that level, at that time, with a party member of that type.
// `item`: given, at once. `hold`: while held. `friendship`: after FRIENDSHIP_MS together. `party`: with that species
// in the party. `shed`: comes along when its pre-evolution evolves (Shedinja).
export type Way =
  | { kind: 'level'; level: number; time?: Time; partyType?: string; isFallback?: true }
  | { kind: 'item'; item: string; time?: Time }
  | { kind: 'hold'; item: string; time?: Time }
  | { kind: 'friendship'; time?: Time }
  | { kind: 'party'; species: string }
  | { kind: 'shed' }

// `form`: the PokeAPI form the evolution leads to (`raichu-alola`), when the games name one.
export type Stage = { species: string; form?: string; way: Way }

// Evolutions the games tie to what the plugin can't do (a move, steps, a battle) happen at this level at the
// earliest, and FALLBACK_GAP levels after the species was reached, so none comes straight after another.
export const FALLBACK_LEVEL = 30
export const FALLBACK_GAP = 10
export const FRIENDSHIP_MS = 10 * 60 * 60_000

const TIMES: Record<string, Time> = { day: 'day', night: 'night', dusk: 'dusk', 'full-moon': 'night' }
// Forms the games pick by the time of day without naming them in the chain.
const TIME_FORMS: Record<string, Partial<Record<Time, string>>> = {
  lycanroc: { day: 'lycanroc-midday', night: 'lycanroc-midnight', dusk: 'lycanroc-dusk' },
}

const sold = (item: Named | null | undefined) => (item && isForSale(itemById(item.name)) ? item.name : null)
// Needs an item the Mart doesn't sell (another Sweet, a Gen 9 item): another detail covers the species.
const isUnsold = (d: EvolutionDetail) => Boolean((d.item && !sold(d.item)) || (d.held_item && !sold(d.held_item)))

// How one PokeAPI detail works here, or null when it needs what the plugin doesn't have.
export function wayOf(d: EvolutionDetail): Way | null {
  const time = TIMES[d.time_of_day ?? '']
  const at = time ? { time } : {}
  if (d.known_move || d.known_move_type) return null
  const trigger = d.trigger?.name ?? 'level-up'
  if (typeof d.min_level === 'number')
    return { kind: 'level', level: d.min_level, ...at, ...(d.party_type ? { partyType: d.party_type.name } : {}) }
  if (trigger === 'use-item') {
    const item = sold(d.item)
    return item ? { kind: 'item', item, ...at } : null
  }
  if (trigger === 'trade') {
    const item = d.held_item ? sold(d.held_item) : 'linking-cord'
    return item ? { kind: 'item', item, ...at } : null
  }
  if (trigger === 'shed') return { kind: 'shed' }
  if (d.held_item) {
    const item = sold(d.held_item)
    return item ? { kind: 'hold', item, ...at } : null
  }
  if (trigger !== 'level-up') return null
  if (d.min_happiness || d.min_affection) return { kind: 'friendship', ...at }
  if (d.party_species) return { kind: 'party', species: d.party_species.name }
  return null
}

const find = (chain: ChainLink, name: string): ChainLink | undefined =>
  chain.species.name === name ? chain : chain.evolves_to.map(c => find(c, name)).find(Boolean)

const parentOf = (chain: ChainLink, name: string): ChainLink | undefined =>
  chain.evolves_to.some(c => c.species.name === name)
    ? chain
    : chain.evolves_to.map(c => parentOf(c, name)).find(Boolean)

// The level `name` is reached at here: its pre-evolution's level, or the fallback it came by; 1 otherwise.
function reachedAt(chain: ChainLink, name: string): number {
  const parent = parentOf(chain, name)
  const details = parent?.evolves_to.find(c => c.species.name === name)?.evolution_details ?? []
  if (!parent) return 1
  const ways = details.map(wayOf)
  const levels = ways.flatMap(w => (w?.kind === 'level' ? [w.level] : []))
  if (levels.length) return Math.min(...levels)
  return ways.some(Boolean) || details.some(isUnsold) ? 1 : fallbackFrom(chain, parent.species.name)
}

const fallbackFrom = (chain: ChainLink, name: string) => Math.max(FALLBACK_LEVEL, reachedAt(chain, name) + FALLBACK_GAP)

export type Gender = 'female' | 'male' | null

// A Pokémon's gender from its species' `gender_rate` (eighths female; -1 genderless). A species with a single
// gender always has it; otherwise `was` stays when it's set, or one is rolled.
export function genderOf(rate: unknown, was: Gender | undefined, rand = Math.random): Gender {
  if (typeof rate !== 'number' || rate < 0) return null
  if (rate === 0) return 'male'
  if (rate === 8) return 'female'
  return was === 'female' || was === 'male' ? was : rand() < rate / 8 ? 'female' : 'male'
}

const GENDER_CODES: Record<number, Gender> = { 1: 'female', 2: 'male' }

// What `name` evolves into and how, from the PokeAPI form `formName` (`meowth-galar`); empty for a final stage or a
// name not in the chain. Ways for the other gender never apply (`gender` undefined: any). A form with evolutions of
// its own takes only those; a form the games give none (Gigantamax) evolves as the plain species; the plain species
// also answers to the games' own name for it (`burmy-plant`: a form missing from `forms`, the species' forms in the
// sprite list); otherwise the evolutions no form is named for apply. A species and form the plugin has no way to
// reach gets the fallback level.
export function nextStages(
  chain: ChainLink,
  name: string,
  formName = name,
  gender?: Gender,
  forms: string[] = [],
): Stage[] {
  const ways = (find(chain, name)?.evolves_to ?? [])
    .flatMap(child =>
      (child.evolution_details?.length ? child.evolution_details : [{}]).map(detail => ({ child, detail })),
    )
    .filter(w => gender === undefined || !w.detail.gender || GENDER_CODES[w.detail.gender] === gender)
  const required = (w: (typeof ways)[number]) => w.detail.required_pokemon_form?.name
  const forForm = (form: string) => ways.filter(w => required(w) === form)
  const asPlain =
    formName === name && forms.length
      ? ways.filter(
          w => required(w)?.startsWith(`${name}-`) && !forms.includes(required(w)?.slice(name.length + 1) ?? ''),
        )
      : []
  const chosen = [forForm(formName), forForm(name), asPlain].find(w => w.length) ?? ways.filter(w => !required(w))
  const stages = new Map<string, Stage>()
  // Species and forms some detail leads to that the plugin can't carry out: the fallback, unless another way can.
  const stuck = new Map<string, Stage>()
  for (const { child, detail } of chosen) {
    const species = child.species.name
    const way = wayOf(detail)
    const time = way && 'time' in way ? way.time : undefined
    const form = detail.evolved_pokemon_form?.name ?? (time ? TIME_FORMS[species]?.[time] : undefined)
    const target = `${species}|${form ?? ''}`
    if (!way) {
      if (!isUnsold(detail) && !stuck.has(target))
        stuck.set(target, {
          species,
          ...(form ? { form } : {}),
          way: { kind: 'level', level: fallbackFrom(chain, name), isFallback: true },
        })
      continue
    }
    // The same way in several games is one stage; a level one keeps its lowest level.
    const { level: _, ...shape } = way.kind === 'level' ? way : { ...way, level: 0 }
    const key = `${target}|${JSON.stringify(shape)}`
    const had = stages.get(key)?.way
    if (had?.kind === 'level' && way.kind === 'level' && had.level <= way.level) continue
    stages.set(key, { species, ...(form ? { form } : {}), way })
  }
  const reached = new Set([...stages.values()].map(s => `${s.species}|${s.form ?? ''}`))
  for (const [target, stage] of stuck) if (!reached.has(target)) stages.set(`${target}|fallback`, stage)
  return [...stages.values()]
}

// What an evolution check sees: the Pokémon's level, held item and time together; the time of day; the party's
// species and types.
export type DueContext = {
  level: number
  phase: Phase
  heldItem?: string
  togetherMs: number
  party: string[]
  partyTypes: string[]
}

// "day" in the games includes the morning.
export const timeMatches = (time: Time | undefined, phase: Phase) =>
  !time || (time === 'day' ? phase === 'day' || phase === 'dawn' : time === phase)

// The stages that happen by themselves now. Given items and Shedinja never do; an Everstone stops them all.
export function dueStages(stages: Stage[], c: DueContext): Stage[] {
  if (c.heldItem === 'everstone') return []
  return stages.filter(({ way }) => {
    if ('time' in way && !timeMatches(way.time, c.phase)) return false
    if (way.kind === 'level') return c.level >= way.level && (!way.partyType || c.partyTypes.includes(way.partyType))
    if (way.kind === 'hold') return c.heldItem === way.item
    if (way.kind === 'friendship') return c.togetherMs >= FRIENDSHIP_MS
    if (way.kind === 'party') return c.party.includes(way.species)
    return false
  })
}

// The plugin's form for an evolved `stage` (forms as the sprite list names them: `alola`, `galar`...): the one
// the games name when the sprites have it; otherwise the member's own form when the evolved species has it.
export function evolvedForm(stage: Stage, memberForm: string, forms: string[]): string {
  if (stage.form !== undefined) {
    const named = stage.form.startsWith(`${stage.species}-`) ? stage.form.slice(stage.species.length + 1) : ''
    // `darmanitan-galar-standard` is the sprites' `galar`.
    return forms.includes(named) ? named : (forms.find(f => f !== 'regular' && named.startsWith(`${f}-`)) ?? 'regular')
  }
  return forms.includes(memberForm) ? memberForm : 'regular'
}

// The PokeAPI form name of a species in one of the plugin's forms: `meowth-galar`, `pikachu`.
export const pokeapiForm = (species: string, form: string) => (form === 'regular' ? species : `${species}-${form}`)
```

- [ ] **Step 4: Run it.** Expected: every `evolution.test.ts` test passes. `register.tsx` and `save.ts` don't
      type-check yet (they use `Stage.level`); that is Tasks 4–5. Run only this file.

- [ ] **Step 5:** No commit.

---

### Task 4: `save.ts`: Bag, ₽, held items, time together, migration, party text

**Files:**

- Modify: `plugin/hooks/save.ts`
- Test: `plugin/tests/save.test.ts`

**Interfaces:**

- Consumes: `Stage`, `Way`, `FRIENDSHIP_MS` (Task 3); `isItemId`, `itemById`, `itemName`, `withArticle`, `ITEMS`,
  `TABS`, `MAX_BAG`, `type Item` (Task 2).
- Produces:
  - `Member`: `next?: Stage[]`, `heldItem?: string`, `togetherMs?: number` (no `evolveAt`, no `hasEverstone`).
  - `Save`: `bag?: Record<string, number>`, `spent?: number`, `earned?: number`, `foldedMoney?: Record<string,
number>`, `togetherAt?: number`.
  - `Ledger`: `{ at: number; xp: Record<string, number>; money: number }`.
  - `STARTING_MONEY = 3000`, `MONEY_PER_XP = 10`, `MAX_LEVEL = 100`, `TOGETHER_CAP_MS = 120_000`.
  - `earnInto(ledger, party, amount, now): Ledger` (adds ₽ once, Lucky Egg +50% XP).
  - `extraMoney(ledgers, folded?, foldedMoney?): number`, `balanceOf(save, cash): number`, `formatMoney(n)`.
  - `buy(save, cash, item, qty): { save: Save; text: string; isError: boolean }`.
  - `takeFromBag(save, id): Save`, `putInBag(save, id): Save | null`.
  - `addTogether(save, now): Save`, `formatSpan(ms): string`.
  - `evolveLevel(m?: Member): number | null | undefined`, `evolvesText(m): string`, `formatBag(save, cash)`, `TIME_TEXT` (`by day` / `at night` / `at dusk`).
  - `isDueToEvolve` is removed (`dueStages` replaces it).

- [ ] **Step 1: Write the failing tests.** In `plugin/tests/save.test.ts`:
  - Remove the `isDueToEvolve` import and its test (lines 145–150) and the three `evolveAt` load expectations
    (154–156). Where a fixture object has `evolveAt: ...` and `hasEverstone: ...`, use `next: [...]` and
    `heldItem: 'everstone'` as in the Task 5 mapping table. Lines 42/44 (`hasEverstone: 'no'`, `evolveAt: 0` in a
    malformed member) become `heldItem: 'no-such-item'` and `next: 'soon'`, and that test's expectation keeps both
    out of the loaded member.
  - Add:

```ts
import {
  addTogether,
  balanceOf,
  buy,
  earnInto,
  evolveLevel,
  evolvesText,
  extraMoney,
  foldLedger,
  formatBag,
  formatParty,
  formatSpan,
  loadLedger,
  loadSave,
  putInBag,
  STARTING_MONEY,
  takeFromBag,
  TOGETHER_CAP_MS,
} from '../hooks/save'
import { itemById } from '../hooks/items'
import { FRIENDSHIP_MS } from '../hooks/evolution'

const stone = { species: 'raichu', way: { kind: 'item', item: 'thunder-stone' } } as const

test('a 1.2.0 save loads: the everstone is held, cached levels are looked up again, ₽3,000 to spend', () => {
  const old = loadSave({
    party: [
      { id: 'a', species: 'pikachu', form: 'regular', xp: 40, evolveAt: 30, hasEverstone: true },
      { id: 'b', species: 'eevee', form: 'regular', xp: 0, evolveAt: 30 },
    ],
  })
  expect(old.party[0]).toEqual({
    id: 'a',
    species: 'pikachu',
    form: 'regular',
    isShiny: false,
    xp: 40,
    evolutions: 0,
    heldItem: 'everstone',
  })
  expect(old.party[1]?.next).toBeUndefined()
  expect(balanceOf(old, 0)).toBe(STARTING_MONEY)
})

test('next stages, held items, time together and the Bag load only when well formed', () => {
  const s = loadSave({
    party: [
      { id: 'a', species: 'pikachu', form: 'regular', next: [stone], heldItem: 'lucky-egg', togetherMs: 5000 },
      { id: 'b', species: 'eevee', form: 'regular', next: [{ species: 'x', way: { kind: 'teleport' } }] },
      { id: 'c', species: 'onix', form: 'regular', heldItem: 'gimmighoul-coin', togetherMs: -4 },
    ],
    bag: { 'fire-stone': 2, 'rare-candy': 1000, everstone: 1, constructor: 3, 'ice-stone': 0.5 },
    spent: 300,
    earned: 50,
    togetherAt: 99,
  })
  expect(s.party[0]).toMatchObject({ next: [stone], heldItem: 'lucky-egg', togetherMs: 5000 })
  // One unreadable stage: the whole list is looked up again.
  expect(s.party[1]?.next).toBeUndefined()
  expect('heldItem' in (s.party[2] ?? {})).toBe(false)
  expect('togetherMs' in (s.party[2] ?? {})).toBe(false)
  expect(s.bag).toEqual({ 'fire-stone': 2, 'rare-candy': 999 })
  expect([s.spent, s.earned, s.togetherAt]).toEqual([300, 50, 99])
})

test('earning: ₽ once per event, XP per member, a Lucky Egg holder gets half again', () => {
  const party = [
    { id: 'a', species: 'pikachu', form: 'regular', isShiny: false, xp: 0, evolutions: 0 },
    { id: 'b', species: 'eevee', form: 'regular', isShiny: false, xp: 0, evolutions: 0, heldItem: 'lucky-egg' },
  ]
  const l = earnInto(loadLedger({}), party, 10, 7)
  expect(l).toEqual({ at: 7, xp: { a: 10, b: 15 }, money: 100 })
  expect(earnInto(l, party, 2, 8).money).toBe(120)
})

test('₽ from two ledgers adds up, and a folded ledger is never counted twice', () => {
  const one = { at: 1, xp: {}, money: 200 }
  const two = { at: 2, xp: {}, money: 50 }
  const s0 = loadSave({})
  expect(balanceOf(s0, extraMoney({ 'xp:1': one, 'xp:2': two }))).toBe(3250)
  const s1 = foldLedger(s0, 'xp:1', one)
  expect(s1.earned).toBe(200)
  expect(balanceOf(s1, extraMoney({ 'xp:1': one, 'xp:2': two }, s1.folded, s1.foldedMoney))).toBe(3250)
  // It earned more after the fold: only the new part is added.
  const s2 = foldLedger(s1, 'xp:1', { ...one, money: 260 })
  expect(s2.earned).toBe(260)
  expect(foldLedger(s2, 'xp:1', { ...one, money: 260 })).toBe(s2)
  expect(loadSave(JSON.parse(JSON.stringify(s2)))).toEqual(s2)
})

test('buying: the price comes off, the Bag fills to 999, and nothing changes when it can't', () => {
  const s = loadSave({})
  const stoneItem = itemById('thunder-stone')!
  const one = buy(s, 0, stoneItem, 1)
  expect(one).toMatchObject({ text: 'Bought a Thunder Stone!', isError: false })
  expect(one.save.bag).toEqual({ 'thunder-stone': 1 })
  expect(balanceOf(one.save, 0)).toBe(0)
  expect(buy(one.save, 0, stoneItem, 1)).toEqual({
    save: one.save,
    text: 'Not enough ₽: ₽3,000 more to go.',
    isError: true,
  })
  const rich = buy(loadSave({ earned: 10_000_000 }), 0, itemById('rare-candy')!, 998)
  expect(rich.text).toBe('Bought 998 × Rare Candy!')
  expect(buy(rich.save, 0, itemById('rare-candy')!, 2).text).toBe('Your Bag has room for 1 more.')
  const full = buy(rich.save, 0, itemById('rare-candy')!, 1).save
  expect(buy(full, 0, itemById('rare-candy')!, 1).text).toBe("Your Bag can't hold more Rare Candy.")
})

test('the Bag: taking one out removes an emptied item; putting one back stops at 999', () => {
  const s = loadSave({ bag: { 'fire-stone': 1, 'rare-candy': 999 } })
  expect(takeFromBag(s, 'fire-stone').bag).toEqual({ 'rare-candy': 999 })
  expect(putInBag(s, 'fire-stone')?.bag).toEqual({ 'fire-stone': 2, 'rare-candy': 999 })
  expect(putInBag(s, 'rare-candy')).toBeNull()
})

test('time together: the gap since the last beat, capped, a Soothe Bell ×1.5, the same stamp for every session', () => {
  const a = { id: 'a', species: 'pichu', form: 'regular', isShiny: false, xp: 0, evolutions: 0 }
  const b = { ...a, id: 'b', heldItem: 'soothe-bell' }
  const first = addTogether(loadSave({ party: [a, b] }), 1_000)
  expect(first.togetherAt).toBe(1_000)
  expect(first.party.map(m => m.togetherMs ?? 0)).toEqual([0, 0])
  const next = addTogether(first, 61_000)
  expect(next.party.map(m => m.togetherMs)).toEqual([60_000, 90_000])
  // A laptop closed for a weekend adds the cap, not the weekend.
  const back = addTogether(next, 61_000 + 3 * 86_400_000)
  expect(back.party[0]?.togetherMs).toBe(60_000 + TOGETHER_CAP_MS)
  // A second session beating just after adds only the moment since.
  expect(addTogether(back, 61_000 + 3 * 86_400_000 + 1_000).party[0]?.togetherMs).toBe(
    60_000 + TOGETHER_CAP_MS + 1_000,
  )
  expect(formatSpan(((365 + 3) * 24 * 60 + 2 * 60 + 7) * 60_000 + 59_000)).toBe('1y 3d 2h 7m')
  expect(formatSpan(30_000)).toBe('0m')
  expect(formatSpan(2 * 60 * 60_000)).toBe('2h')
})

test('the party says how each one evolves, and the Bag lists what you have', () => {
  const m = (extra: object) => ({ id: 'x', species: 'eevee', form: 'regular', isShiny: false, xp: 0, evolutions: 0, ...extra })
  expect(evolvesText(m({ next: [{ species: 'charmeleon', way: { kind: 'level', level: 16 } }] }))).toBe(
    'evolves at Lv 16',
  )
  expect(evolvesText(m({ next: [stone] }))).toBe('evolves with a Thunder Stone')
  expect(
    evolvesText(m({ next: [{ species: 'lycanroc', way: { kind: 'level', level: 25, time: 'night' } }] })),
  ).toBe('evolves at Lv 25 at night')
  expect(
    evolvesText(
      m({ togetherMs: FRIENDSHIP_MS * 0.67, next: [{ species: 'espeon', way: { kind: 'friendship', time: 'day' } }] }),
    ),
  ).toBe('evolves with friendship by day (♥ 67%, 3h 18m to go)')
  expect(evolvesText(m({ next: [] }))).toBe('final form')
  expect(evolvesText(m({ next: [stone], heldItem: 'everstone' }))).toBe('everstone')
  expect(evolveLevel(m({ next: [stone, { species: 'x', way: { kind: 'level', level: 40 } }] }))).toBe(40)
  expect(evolveLevel(m({ next: [stone] }))).toBeNull()
  expect(evolveLevel(m({}))).toBeUndefined()
  const s = loadSave({
    party: [m({ heldItem: 'soothe-bell', togetherMs: 2 * 3_600_000, next: [stone] })],
    bag: { 'thunder-stone': 1, 'fire-stone': 2, 'metal-coat': 1, 'rare-candy': 3 },
  })
  expect(formatParty(s)).toContain('Eevee  Lv 1')
  expect(formatParty(s)).toContain('together 2h')
  expect(formatParty(s)).toContain('holds a Soothe Bell')
  expect(formatBag(s, 0)).toBe(
    [
      'Bag · ₽3,000',
      '  Stones      Fire Stone ×2 · Thunder Stone ×1',
      '  Hold items  Metal Coat ×1',
      '  Other       Rare Candy ×3',
      '  Held        Eevee: Soothe Bell',
    ].join('\n'),
  )
  expect(formatBag(loadSave({}), 0)).toBe('Bag · ₽3,000\n  Empty. Buy items at the PokéMart: /pokemon mart')
})
```

- [ ] **Step 2: Run `save.test.ts` alone.** Expected: FAIL (missing exports).

- [ ] **Step 3: Implement in `plugin/hooks/save.ts`.**
  - Imports at the top:

```ts
import { FRIENDSHIP_MS } from './evolution'
import type { Stage, Time, Way } from './evolution'
import { isItemId, itemById, itemName, ITEMS, MAX_BAG, TABS, withArticle } from './items'
import type { Item } from './items'
```

- `Member`: replace the `evolveAt` and `hasEverstone` lines with:

```ts
  // What it evolves into and how, as in the games; [] at a final stage, absent until looked up.
  next?: Stage[]
  // The one item it holds, as in the games: an Everstone stops it evolving.
  heldItem?: string
  // Time in the party while Claude Code was open: friendship evolutions come from it.
  togetherMs?: number
```

- `Save`: add after `foldedXp`:

```ts
  // Items by id, 1 to MAX_BAG each.
  bag?: Record<string, number>
  // ₽ spent ever, and ₽ from folded ledgers (with what each added, as for XP).
  spent?: number
  earned?: number
  foldedMoney?: Record<string, number>
  // When time together was last added, by any session.
  togetherAt?: number
```

and extend the comment above `Save` with: `` `bag`, `spent`, `earned`: the wallet is STARTING_MONEY + earned (and
  unfolded ledgers) - spent. ``

- `Ledger`: `export type Ledger = { at: number; xp: Record<string, number>; money: number }`.
- Constants after `XP`:

```ts
export const MONEY_PER_XP = 10
export const STARTING_MONEY = 3000
export const MAX_LEVEL = 100
// The most one heartbeat adds to time together: a closed laptop isn't time together.
export const TOGETHER_CAP_MS = 120_000
const TIMES: Time[] = ['day', 'night', 'dusk']
```

- In `loadMember`, replace the `evolveAt` lines and the `hasEverstone` spread:

```ts
function loadWay(w: unknown): Way | null {
  if (!isObject(w)) return null
  const time = TIMES.includes(w.time as Time) ? { time: w.time as Time } : {}
  if (w.kind === 'level')
    return typeof w.level === 'number' && Number.isInteger(w.level) && w.level > 0
      ? {
          kind: 'level',
          level: w.level,
          ...time,
          ...(isName(w.partyType) ? { partyType: w.partyType } : {}),
          ...(w.isFallback === true ? { isFallback: true as const } : {}),
        }
      : null
  if (w.kind === 'item' || w.kind === 'hold') return isItemId(w.item) ? { kind: w.kind, item: w.item, ...time } : null
  if (w.kind === 'friendship') return { kind: 'friendship', ...time }
  if (w.kind === 'party') return isName(w.species) ? { kind: 'party', species: w.species } : null
  if (w.kind === 'shed') return { kind: 'shed' }
  return null
}

// Stored next stages; one that can't be read means the list is looked up again.
function loadStages(raw: unknown): Stage[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const stages = raw.flatMap((s: unknown): Stage[] => {
    const way = isObject(s) && isName(s.species) ? loadWay(s.way) : null
    return isObject(s) && way
      ? [{ species: s.species as string, ...(isName(s.form) ? { form: s.form } : {}), way }]
      : []
  })
  return stages.length === raw.length ? stages : undefined
}
```

    and in the returned member, in place of the old `evolveAt`/`hasEverstone` spreads:

```ts
    ...(loadStages(raw.next) ? { next: loadStages(raw.next) } : {}),
    ...(isItemId(raw.heldItem)
      ? { heldItem: raw.heldItem }
      : raw.hasEverstone === true
        ? { heldItem: 'everstone' }
        : {}),
    ...(count(raw.togetherMs) ? { togetherMs: count(raw.togetherMs) } : {}),
```

- In `loadSave`, before `return`:

```ts
const bag: Record<string, number> = {}
for (const [id, n] of Object.entries(isObject(s.bag) ? s.bag : {}))
  if (isItemId(id) && itemById(id)?.isSold !== false && count(n)) bag[id] = Math.min(MAX_BAG, count(n))
const foldedMoney: Record<string, number> = {}
for (const [key, n] of Object.entries(isObject(s.foldedMoney) ? s.foldedMoney : {}))
  if (folded.includes(key) && count(n)) foldedMoney[key] = count(n)
```

    and in the returned object:

```ts
    ...(Object.keys(bag).length ? { bag } : {}),
    ...(count(s.spent) ? { spent: count(s.spent) } : {}),
    ...(count(s.earned) ? { earned: count(s.earned) } : {}),
    ...(Object.keys(foldedMoney).length ? { foldedMoney } : {}),
    ...(count(s.togetherAt) ? { togetherAt: count(s.togetherAt) } : {}),
```

- `loadLedger` returns `{ at: count(l.at), xp, money: count(l.money) }`.
- Add after `extraXp`:

```ts
// The ₽ in session ledgers not yet folded into the save. A ledger folded with no record of its ₽ had none.
export function extraMoney(
  ledgers: Record<string, Ledger>,
  folded: string[] = [],
  foldedMoney: Record<string, number> = {},
): number {
  let more = 0
  for (const [key, l] of Object.entries(ledgers))
    more += Math.max(0, l.money - (folded.includes(key) ? (foldedMoney[key] ?? l.money) : 0))
  return more
}

// The ₽ to spend: `cash` is extraMoney of the ledgers.
export const balanceOf = (save: Save, cash: number) => STARTING_MONEY + (save.earned ?? 0) + cash - (save.spent ?? 0)

export const formatMoney = (n: number) => `₽${n.toLocaleString('en-US')}`
```

- `foldLedger` becomes:

```ts
export function foldLedger(save: Save, key: string, ledger: Ledger): Save {
  const isFolded = save.folded?.includes(key) ?? false
  const counted = save.foldedXp?.[key]
  if (isFolded && !counted) return save
  const more = above(ledger.xp, counted)
  const money = Math.max(0, ledger.money - (save.foldedMoney?.[key] ?? 0))
  if (isFolded && !Object.keys(more).length && !money) return save
  return {
    ...withExtra(save, more),
    folded: isFolded ? (save.folded ?? []) : [...(save.folded ?? []), key],
    foldedXp: { ...save.foldedXp, [key]: { ...counted, ...ledger.xp } },
    ...(ledger.money
      ? { earned: (save.earned ?? 0) + money, foldedMoney: { ...save.foldedMoney, [key]: ledger.money } }
      : {}),
  }
}
```

    (A fold with no XP map yet: `counted` is undefined and `isFolded` false, so the first fold always records it.
    The `isFolded && !counted` early return keeps legacy folds untouched.)

- Replace `isDueToEvolve` with:

```ts
// The level it evolves at by itself: the lowest level way; null when none is by level; undefined until looked up.
export function evolveLevel(m: Member | undefined): number | null | undefined {
  if (!m?.next) return undefined
  const levels = m.next.flatMap(s => (s.way.kind === 'level' ? [s.way.level] : []))
  return levels.length ? Math.min(...levels) : null
}
```

- `earnInto` becomes:

```ts
// A session's ledger after every party member earns `amount` XP (a Lucky Egg holder half again) and the wallet
// `amount` × MONEY_PER_XP, once.
export const earnInto = (ledger: Ledger, party: Member[], amount: number, now: number): Ledger => ({
  at: now,
  xp: Object.assign(
    tally(),
    ledger.xp,
    Object.fromEntries(
      party.map(m => [
        m.id,
        (Object.hasOwn(ledger.xp, m.id) ? (ledger.xp[m.id] ?? 0) : 0) +
          (m.heldItem === 'lucky-egg' ? Math.round(amount * 1.5) : amount),
      ]),
    ),
  ),
  money: ledger.money + amount * MONEY_PER_XP,
})
```

- Add the Bag and time together after `storeCaught`:

```ts
export function takeFromBag(save: Save, id: string): Save {
  const left = (save.bag?.[id] ?? 0) - 1
  const { [id]: _, ...rest } = save.bag ?? {}
  const bag = left > 0 ? { ...rest, [id]: left } : rest
  const { bag: __, ...without } = save
  return Object.keys(bag).length ? { ...without, bag } : without
}

// One more of `id` in the Bag, or null when it already holds MAX_BAG.
export function putInBag(save: Save, id: string): Save | null {
  const have = save.bag?.[id] ?? 0
  return have >= MAX_BAG ? null : { ...save, bag: { ...save.bag, [id]: have + 1 } }
}

// `qty` of `item` bought with what the wallet holds (`cash`: the ledgers' unfolded ₽), or why not.
export function buy(save: Save, cash: number, item: Item, qty: number): { save: Save; text: string; isError: boolean } {
  const have = save.bag?.[item.id] ?? 0
  const room = MAX_BAG - have
  const cost = item.price * qty
  const left = balanceOf(save, cash)
  if (!room) return { save, text: `Your Bag can't hold more ${item.name}.`, isError: true }
  if (qty > room) return { save, text: `Your Bag has room for ${room} more.`, isError: true }
  if (left < cost) return { save, text: `Not enough ₽: ${formatMoney(cost - left)} more to go.`, isError: true }
  return {
    save: { ...save, spent: (save.spent ?? 0) + cost, bag: { ...save.bag, [item.id]: have + qty } },
    text: qty === 1 ? `Bought ${withArticle(item.name)}!` : `Bought ${qty} × ${item.name}!`,
    isError: false,
  }
}

// Time together since the last beat (from any session), capped, added to each party member.
export function addTogether(save: Save, now: number): Save {
  const gap = save.togetherAt === undefined ? 0 : Math.max(0, Math.min(now - save.togetherAt, TOGETHER_CAP_MS))
  const party = gap
    ? save.party.map(m => ({
        ...m,
        togetherMs: (m.togetherMs ?? 0) + Math.round(m.heldItem === 'soothe-bell' ? gap * 1.5 : gap),
      }))
    : save.party
  return { ...save, party, togetherAt: now }
}

// "1y 3d 2h 7m": from the largest unit that isn't zero, down to minutes.
export function formatSpan(ms: number): string {
  let minutes = Math.floor(ms / 60_000)
  const parts: string[] = []
  for (const [unit, size] of [
    ['y', 525_600],
    ['d', 1440],
    ['h', 60],
    ['m', 1],
  ] as const) {
    const n = Math.floor(minutes / size)
    minutes -= n * size
    if (n || parts.length) parts.push(`${n}${unit}`)
  }
  while (parts.length > 1 && parts[parts.length - 1]?.startsWith('0')) parts.pop()
  return parts.join(' ') || '0m'
}
```

- Replace `memberColumns`' `evolves` with `evolvesText`:

```ts
export const TIME_TEXT: Record<Time, string> = { day: 'by day', night: 'at night', dusk: 'at dusk' }

function wayText(w: Way, m: Member): string {
  const when = 'time' in w && w.time ? ` ${TIME_TEXT[w.time]}` : ''
  if (w.kind === 'level')
    return `at Lv ${w.level}${when}${w.partyType ? ` with a ${titleCase(w.partyType)}-type in the party` : ''}`
  if (w.kind === 'item') return `with ${withArticle(itemName(w.item))}${when}`
  if (w.kind === 'hold') return `holding ${withArticle(itemName(w.item))}${when}`
  if (w.kind === 'party') return `with ${titleCase(w.species)} in the party`
  if (w.kind === 'friendship') {
    const ms = m.togetherMs ?? 0
    const left = FRIENDSHIP_MS - ms
    const pct = Math.min(100, Math.floor((ms / FRIENDSHIP_MS) * 100))
    return `with friendship${when} (♥ ${pct}%${left > 0 ? `, ${formatSpan(left + 59_999)} to go` : ''})`
  }
  return ''
}

// How a member evolves next: "evolves at Lv 36", "evolves with a Thunder Stone", "final form".
export function evolvesText(m: Member): string {
  if (m.heldItem === 'everstone') return 'everstone'
  if (!m.next) return ''
  const texts = [...new Set(m.next.map(s => wayText(s.way, m)).filter(Boolean))]
  if (!texts.length) return 'final form'
  return `evolves ${texts.length > 3 ? `${texts.slice(0, 3).join(', ')} or another way` : texts.join(' or ')}`
}
```

    and in `memberColumns`, `evolves` becomes `evolvesText(m) ? `· ${evolvesText(m)}` : ''`, and two columns go
    after it: `m.heldItem && m.heldItem !== 'everstone' ? `· holds ${withArticle(itemName(m.heldItem))}` : ''` and
    `m.togetherMs ? `· together ${formatSpan(m.togetherMs)}` : ''`. (`(left + 59_999)` rounds the time to go up to
    the minute: 3h 17m 12s left shows `3h 18m`.)

- `formatBag`:

```ts
// The Bag by tab, the wallet, and who holds what. `cash`: the ledgers' unfolded ₽.
export function formatBag(save: Save, cash: number): string {
  const lines = [`Bag · ${formatMoney(balanceOf(save, cash))}`]
  for (const tab of TABS) {
    const items = ITEMS.filter(i => i.tab === tab && (save.bag?.[i.id] ?? 0) > 0).sort((a, b) =>
      a.name.localeCompare(b.name),
    )
    if (items.length) lines.push(`  ${tab.padEnd(10)}  ${items.map(i => `${i.name} ×${save.bag?.[i.id]}`).join(' · ')}`)
  }
  const held = save.party.flatMap(m =>
    m.heldItem ? [`${displayName(m.species, m.form)}: ${itemName(m.heldItem)}`] : [],
  )
  if (held.length) lines.push(`  ${'Held'.padEnd(10)}  ${held.join(' · ')}`)
  if (lines.length === 1) lines.push('  Empty. Buy items at the PokéMart: /pokemon mart')
  return lines.join('\n')
}
```

- [ ] **Step 4: Run `save.test.ts` and `evolution.test.ts` alone.** Expected: all pass. (Import cycle check:
      `save.ts` imports `evolution.ts`, which imports `items.ts`; `items.ts` imports nothing; `lookup.ts` imports
      `save.ts`. No cycle.)

- [ ] **Step 5:** No commit.

---

### Task 5: `register.tsx`: evolutions follow the ways

**Files:**

- Modify: `plugin/hooks/register.tsx` (imports; `localHour`; new `typesOf`, `evolutionContext`, `dueFor`;
  `evolutionsOf`, `checkEvolutions`, `evolveMember`, `toggleEverstone`)
- Modify: `plugin/hooks/save.ts` (export `TIME_TEXT`)
- Test: `plugin/tests/commands.test.tsx`

**Interfaces:**

- Consumes: `Stage`, `Time`, `dueStages`, `timeMatches`, `evolvedForm`, `nextStages`, `genderOf`, `pokeapiForm`
  (Task 3); `Member.next`, `Member.heldItem`, `evolvesText`, `evolveLevel`, `takeFromBag`, `storeCaught`,
  `recordSeen` (Task 4); `withArticle`, `itemName` (Task 2).
- Produces (used by Tasks 6–8):
  - `evolveMember($, at: number, isPreview = false, given?: string): Promise<string>`: `given` is an item id from
    the Bag; it evolves by that item now (time of day permitting), takes it from the Bag in the same save write, and
    answers a refusal otherwise.
  - `evolutionContext($): Promise<{ phase: Phase; party: string[]; partyTypes: string[] }>`.
  - `dueFor(m: Member, c: { phase: Phase; party: string[]; partyTypes: string[] }): Stage[]`.
  - `typesOf($, species: string): Promise<string[]>`.
  - `localHour(ms = Date.now()): number`.
  - `save.ts` exports `TIME_TEXT: Record<Time, string>` (`by day` / `at night` / `at dusk`).

- [ ] **Step 1: Update the test harness** in `plugin/tests/commands.test.tsx`.
  - Imports: add `import type { Stage } from '../hooks/evolution'`, and `evolveLevel` to the `'../hooks/save'`
    import.
  - Below `const member = ...` add:

```ts
const lv = (species: string, level: number): Stage => ({ species, way: { kind: 'level', level } })
// The plugin's hour at clock 0 is its own UTC offset, or the +0800 the fake `date` answers when it claims UTC.
const offsetHours = (-new Date().getTimezoneOffset() || 480) / 60
// The clock time (from 0) at which the plugin's local hour is `hour`.
const hourAt = (hour: number) => ((((hour - offsetHours) % 24) + 24) % 24) * 3_600_000
```

- `Net` gains `now?: number` (where the fake clock starts), and `world` starts its clock with
  `const clock = mock.clock(on, net.now === undefined ? undefined : { now: net.now })`.
- Each species' types, for party-type evolutions; put it next to `CAPTURE_RATES`:

```ts
// Each species' types where a test needs one: Pancham evolves only with a Dark type in the party.
const TYPES: Record<string, string[]> = { umbreon: ['dark'] }
```

    and in the `http.fetch` mock, right after the `if (species) return ok(...)` block:

```ts
const mon = /\/pokemon\/([a-z0-9-]+)$/.exec(e.url)?.[1]
if (mon) return ok(JSON.stringify({ types: (TYPES[mon] ?? ['normal']).map(name => ({ type: { name } })) }))
```

- Chains. `electric` becomes a made-up level chain (the tests use it for plumbing, not the games):

```ts
// Made up for plumbing: here Pikachu evolves by level, so a second species can evolve beside Charmander.
const electric = {
  species: { name: 'pikachu' },
  evolves_to: [{ species: { name: 'raichu' }, evolution_details: [{ min_level: 30 }], evolves_to: [] }],
}
```

    and these real-shaped chains go after `cloaks`:

```ts
const named = (name: string) => ({ name })
const end = (species: string, details: object[]) => ({
  species: named(species),
  evolution_details: details,
  evolves_to: [],
})
const babies = {
  species: named('pichu'),
  evolves_to: [end('pikachu', [{ trigger: named('level-up'), min_happiness: 220 }])],
}
const fox = {
  species: named('eevee'),
  evolves_to: [
    end('vaporeon', [{ trigger: named('use-item'), item: named('water-stone') }]),
    end('espeon', [{ trigger: named('level-up'), min_happiness: 160, time_of_day: 'day' }]),
    end('umbreon', [{ trigger: named('level-up'), min_happiness: 160, time_of_day: 'night' }]),
  ],
}
const dog = {
  species: named('rockruff'),
  evolves_to: [
    end('lycanroc', [
      { trigger: named('level-up'), min_level: 25, time_of_day: 'day', required_pokemon_form: named('rockruff') },
      { trigger: named('level-up'), min_level: 25, time_of_day: 'night', required_pokemon_form: named('rockruff') },
    ]),
  ],
}
const panda = {
  species: named('pancham'),
  evolves_to: [end('pangoro', [{ trigger: named('level-up'), min_level: 32, party_type: named('dark') }])],
}
const bug = {
  species: named('nincada'),
  evolves_to: [
    end('ninjask', [{ trigger: named('level-up'), min_level: 20 }]),
    end('shedinja', [{ trigger: named('shed') }]),
  ],
}
const ghost = {
  species: named('duskull'),
  evolves_to: [
    {
      species: named('dusclops'),
      evolution_details: [{ trigger: named('level-up'), min_level: 37 }],
      evolves_to: [end('dusknoir', [{ trigger: named('trade'), held_item: named('reaper-cloth') }])],
    },
  ],
}
const kite = {
  species: named('mantyke'),
  evolves_to: [end('mantine', [{ trigger: named('level-up'), party_species: named('remoraid') }])],
}
```

    `CHAINS` becomes:

```ts
const CHAINS: Record<string, unknown> = {
  charmander: fire,
  charmeleon: fire,
  charizard: fire,
  pikachu: electric,
  raichu: electric,
  pichu: babies,
  eevee: fox,
  vaporeon: fox,
  espeon: fox,
  umbreon: fox,
  rockruff: dog,
  lycanroc: dog,
  pancham: panda,
  pangoro: panda,
  nincada: bug,
  ninjask: bug,
  shedinja: bug,
  duskull: ghost,
  dusclops: ghost,
  dusknoir: ghost,
  mantyke: kite,
  mantine: kite,
  combee: bees,
  vespiquen: bees,
  burmy: cloaks,
  mothim: cloaks,
}
```

    `LIST` gains, after `{ name: 'caterpie', ... }`: `pichu`, `espeon`, `umbreon`, `rockruff`, `pancham`,
    `pangoro`, `nincada`, `ninjask`, `shedinja`, `duskull`, `dusclops`, `dusknoir`, `mantyke`, `mantine`,
    `remoraid` (each `forms: ['regular']`) and `{ name: 'lycanroc', forms: ['regular', 'dusk', 'midnight'] }`.
    The test `'a warm cache means no downloads at all'` then expects `` `/ ${LIST.length} seen` `` instead of
    `'/ 15 seen'`.

- The mechanical mapping, applied to every test in the file (old → new):

| Old                                               | New                                                   |
| ------------------------------------------------- | ----------------------------------------------------- |
| `evolveAt: 30` (always a Pikachu)                 | `next: [lv('raichu', 30)]`                            |
| `evolveAt: 16`                                    | `next: [lv('charmeleon', 16)]`                        |
| `evolveAt: 36`                                    | `next: [lv('charizard', 36)]`                         |
| `evolveAt: null`                                  | `next: []`                                            |
| `hasEverstone: true`                              | `heldItem: 'everstone'`                               |
| `Boolean(m.hasEverstone)`                         | `m.heldItem === 'everstone'`                          |
| `m.hasEverstone` (line 561)                       | `m.heldItem`                                          |
| `w.saveNow().party[0]?.evolveAt === N`            | `evolveLevel(w.saveNow().party[0]) === N`             |
| `.every(m => m.evolveAt !== undefined)`           | `.every(m => m.next !== undefined)`                   |
| `w.saveNow().party[0]?.evolveAt === null`         | `w.saveNow().party[0]?.next?.length === 0`            |
| `toMatchObject({ ..., evolveAt: 36 })` (line 302) | `toMatchObject({ ..., next: [lv('charizard', 36)] })` |
| `toMatchObject({ ..., hasEverstone: true })`      | `toMatchObject({ ..., heldItem: 'everstone' })`       |

- Delete the tests `'Pikachu needs a Thunder Stone in the games, so it evolves at Lv 30 here'` and
  `'Pikachu at Lv 30 becomes Raichu'` (Task 6 tests stones on the real-shaped Eevee).

- [ ] **Step 2: Write the failing tests** at the end of `plugin/tests/commands.test.tsx`:

```ts
test('Rockruff evolves at Lv 25 into the Lycanroc of the hour: Midnight at night', async ($, on) => {
  answerTools(on)
  const net: Net = { isOnline: true, list: JSON.stringify(LIST), now: hourAt(23) }
  const w = await begin(
    $,
    on,
    { ...emptySave(), party: [member('rockruff', { xp: xpForLevel(25) - 5 })] },
    ART,
    undefined,
    net,
  )
  await until($, () => w.saveNow().party[0]?.next !== undefined)
  await $.tool.call(bash('git commit -m x') as never)
  await until($, () => w.saveNow().party[0]?.species === 'lycanroc')
  expect(w.saveNow().party[0]?.form).toBe('midnight')
})

test('Rockruff by day becomes Midday Lycanroc, the plain form', async ($, on) => {
  answerTools(on)
  const net: Net = { isOnline: true, list: JSON.stringify(LIST), now: hourAt(12) }
  const w = await begin(
    $,
    on,
    { ...emptySave(), party: [member('rockruff', { xp: xpForLevel(25) - 5 })] },
    ART,
    undefined,
    net,
  )
  await until($, () => w.saveNow().party[0]?.next !== undefined)
  await $.tool.call(bash('git commit -m x') as never)
  await until($, () => w.saveNow().party[0]?.species === 'lycanroc')
  expect(w.saveNow().party[0]?.form).toBe('regular')
})

test('Pancham evolves at Lv 32 only with a Dark-type in the party', async ($, on) => {
  answerTools(on)
  const w = await begin($, on, { ...emptySave(), party: [member('pancham', { xp: xpForLevel(32) - 5 })] })
  await until($, () => w.saveNow().party[0]?.next !== undefined)
  await $.tool.call(bash('git commit -m x') as never)
  for (let i = 0; i < 5; i++) await cmd($, 'pokemon', 'party')
  expect(w.saveNow().party[0]?.species).toBe('pancham')
  expect(await cmd($, 'pokemon', 'party')).toContain('evolves at Lv 32 with a Dark-type in the party')
  await cmd($, 'pokemon', 'add umbreon')
  await until($, () => w.saveNow().party[0]?.species === 'pangoro')
  expect(w.toasts).toEqual(['What? Pancham evolved into Pangoro!'])
})

test('Nincada becomes Ninjask at Lv 20, and Shedinja comes along: to the party, or the PC box when full', async ($, on) => {
  answerTools(on)
  const w = await begin($, on, { ...emptySave(), party: [member('nincada', { xp: xpForLevel(20) - 5 })] })
  await until($, () => w.saveNow().party[0]?.next !== undefined)
  await $.tool.call(bash('git commit -m x') as never)
  await until($, () => w.toasts.length === 1)
  expect(w.toasts).toEqual(['What? Nincada evolved into Ninjask! Shedinja joined your party!'])
  expect(w.saveNow().party.map(m => m.species)).toEqual(['ninjask', 'shedinja'])
  expect(w.saveNow().dex.shedinja?.seen).toBe(1)
})

test('with a full party, Shedinja goes to the PC box', async ($, on) => {
  answerTools(on)
  const w = await begin($, on, {
    ...emptySave(),
    party: [
      member('nincada', { xp: xpForLevel(20) - 5 }),
      member('pikachu', { next: [] }),
      member('charmander', { next: [] }),
    ],
  })
  await until($, () => w.saveNow().party[0]?.next !== undefined)
  await $.tool.call(bash('git commit -m x') as never)
  await until($, () => w.toasts.length === 1)
  expect(w.toasts).toEqual(['What? Nincada evolved into Ninjask! Shedinja went to the PC box.'])
  expect(w.saveNow().box?.map(m => m.species)).toEqual(['shedinja'])
})

test('Dusclops waits for a Reaper Cloth: past Lv 30 it stays, and the party says what it needs', async ($, on) => {
  answerTools(on)
  const w = await begin($, on, { ...emptySave(), party: [member('dusclops', { xp: xpForLevel(45) })] })
  await until($, () => w.saveNow().party[0]?.next !== undefined)
  await $.tool.call(bash('git commit -m x') as never)
  for (let i = 0; i < 5; i++) await cmd($, 'pokemon', 'party')
  expect(w.saveNow().party[0]?.species).toBe('dusclops')
  expect(await cmd($, 'pokemon', 'party')).toContain('evolves with a Reaper Cloth')
  expect(w.toasts).toEqual([])
})

test('Mantyke evolves once a Remoraid joins the party', async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('mantyke')] })
  await until($, () => w.saveNow().party[0]?.next !== undefined)
  for (let i = 0; i < 5; i++) await cmd($, 'pokemon', 'party')
  expect(w.saveNow().party[0]?.species).toBe('mantyke')
  expect(await cmd($, 'pokemon', 'party')).toContain('evolves with Remoraid in the party')
  await cmd($, 'pokemon', 'add remoraid')
  await until($, () => w.saveNow().party[0]?.species === 'mantine')
})
```

- [ ] **Step 3: Run the suite** (the Tests command). Expected: FAIL. `register.tsx` doesn't compile against the
      Task 3–4 types (`Stage.level`, `isDueToEvolve`, `evolveAt`), so every file that imports it fails to load.

- [ ] **Step 4: Implement in `plugin/hooks/save.ts`:** change `const TIME_TEXT` to `export const TIME_TEXT`.

- [ ] **Step 5: Implement in `plugin/hooks/register.tsx`.**
  - Imports: the `'./evolution'` line becomes
    `import { dueStages, evolvedForm, genderOf, nextStages, pokeapiForm, timeMatches } from './evolution'` and
    `import type { ChainLink, Stage } from './evolution'`. From `'./save'` drop `isDueToEvolve`; add `evolvesText`,
    `storeCaught` (already there), `takeFromBag`, `TIME_TEXT`. Add `import { itemName, withArticle } from './items'`.
  - `localHour` takes the time:

```tsx
// Hours since the epoch in local time. The plugin's own clock knows the offset (and follows daylight saving);
// when it claims UTC, the host's answer from session start is used.
const localHour = (ms = Date.now()) => {
  const own = -new Date().getTimezoneOffset()
  return Math.floor((ms / 60_000 + (own !== 0 ? own : (tzOffsetMin ?? 0))) / 60)
}
```

- After `evolutionsOf` (whose body is unchanged: `nextStages` now returns stages with ways, and the
  `stages.filter(n => list.some(s => s.name === n.species))` line stays), add:

```tsx
// A species' types, from PokeAPI (cached). Offline, none: an evolution that needs a type waits.
const types = new Map<string, string[]>()
async function typesOf($: EngineInterface, name: string): Promise<string[]> {
  const known = types.get(name)
  if (known) return known
  try {
    const res = await cachedFetch($, `${POKEAPI}/pokemon/${name}`, `pokeapi/pokemon-${name}.json`, isJson)
    if (!res.ok) return []
    const raw = (JSON.parse(res.text) as { types?: unknown }).types
    const found = (Array.isArray(raw) ? raw : []).flatMap((t: { type?: { name?: unknown } }) => {
      const type = t.type?.name
      return isName(type) ? [type] : []
    })
    types.set(name, found)
    return found
  } catch {
    return []
  }
}

type Surroundings = { phase: Phase; party: string[]; partyTypes: string[] }

// The time of day and the party, as evolutions see them; types are fetched only when a member needs one.
async function evolutionContext($: EngineInterface): Promise<Surroundings> {
  const hour = localHour(await $.clock.now())
  const party = save.party.map(m => m.species)
  const needsTypes = save.party.some(m => m.next?.some(s => s.way.kind === 'level' && s.way.partyType))
  const partyTypes = needsTypes ? (await Promise.all(party.map(p => typesOf($, p)))).flat() : []
  return { phase: phaseAt(((hour % 24) + 24) % 24), party, partyTypes }
}

// The stages `m` reaches by itself now.
const dueFor = (m: Member, c: Surroundings): Stage[] =>
  dueStages(m.next ?? [], {
    level: level(m.xp),
    phase: c.phase,
    ...(m.heldItem ? { heldItem: m.heldItem } : {}),
    togetherMs: m.togetherMs ?? 0,
    party: c.party,
    partyTypes: c.partyTypes,
  })
```

- `checkEvolutions` becomes:

```tsx
// Looks up how every party member that doesn't know it yet evolves, then evolves any already due, one animation
// at a time. Nothing evolves while the party is off.
async function checkEvolutions($: EngineInterface) {
  for (const member of save.party.filter(m => m.next === undefined || m.gender === undefined)) {
    // Its gender first (kept through evolutions when the species allows it): some evolutions are for one only.
    const { genderRate } = await evolutionsOf($, member)
    const gender = genderOf(genderRate, member.gender)
    const { stages } = await evolutionsOf($, { ...member, gender })
    await mutate($, s => ({
      ...s,
      party: s.party.map(m =>
        m.id === member.id && m.species === member.species ? { ...m, next: stages, gender } : m,
      ),
    }))
  }
  const context = await evolutionContext($)
  const isDue = (id: string) => view().party.some(m => m.id === id && dueFor(m, context).length > 0)
  for (const { id } of save.party) {
    if (save.isOff || !isDue(id)) continue
    // The one before finishes its animation first; nothing to wait for when no band is drawn.
    for (let wait = 0; band && status.mood?.kind === 'evolve' && wait < EVOLVE + ticks(2000); wait += 5)
      await $.clock.sleep(TICK_MS * 5)
    // The party may have changed during the wait: it is looked up again by id.
    const at = save.party.findIndex(m => m.id === id)
    if (!save.isOff && isDue(id)) await evolveMember($, at)
  }
}
```

- `evolveMember` becomes:

```tsx
// Evolves party member `at` into a form it can reach now: by itself, or by the item `given` from the Bag (used up
// in the same write). The animation plays from its current sprite. A preview plays it and puts the old form back
// afterwards; a real one saves the new form and tells the person.
async function evolveMember($: EngineInterface, at: number, isPreview = false, given?: string): Promise<string> {
  const member = save.party[at]
  if (!member) return 'Your party is empty.'
  const name = displayName(member.species, member.form)
  try {
    const { stages } = await evolutionsOf($, member)
    const options = stages.filter(s => s.way.kind !== 'shed')
    const context = await evolutionContext($)
    const byItem = options.filter(s => s.way.kind === 'item' && s.way.item === given)
    const allowed = isPreview
      ? options
      : given
        ? byItem.filter(s => timeMatches(s.way.kind === 'item' ? s.way.time : undefined, context.phase))
        : dueFor({ ...member, xp: member.xp + (extra[member.id] ?? 0), next: stages }, context)
    const next = allowed[Math.floor(Math.random() * allowed.length)]
    if (!next) {
      if (!isPreview && !options.length)
        await mutate($, s => ({
          ...s,
          party: s.party.map(m => (m.id === member.id ? { ...m, next: [] } : m)),
        }))
      if (given) {
        const way = byItem[0]?.way
        const time = way?.kind === 'item' ? way.time : undefined
        return time
          ? `${name} can use ${withArticle(itemName(given))} only ${TIME_TEXT[time]}.`
          : `${name} can't use ${withArticle(itemName(given))}.`
      }
      return options.length
        ? `${name} ${evolvesText({ ...member, next: stages })}.`
        : `${name} doesn't evolve any further.`
    }
    const forms = (await loadSpecies($)).find(s => s.name === next.species)?.forms ?? []
    const form = evolvedForm(next, member.form, forms)
    const { art, isShiny } = await fetchArt($, fileOf({ species: next.species, form }), member.isShiny)
    // It may have moved, left, or been given an everstone during the downloads.
    const slot = isPreview ? at : save.party.findIndex(m => m.id === member.id && m.species === member.species)
    const now = save.party[slot]
    if (!now) return `${name} already evolved.`
    if (!isPreview && !given && now.heldItem === 'everstone') return `${name} holds an everstone: it won't evolve.`
    evolveFrom = fitted?.lefts[slot] ?? null
    const { next: _, ...rest } = member
    const evolved: Member = { ...rest, species: next.species, form, isShiny, evolutions: member.evolutions + 1 }
    const newName = displayName(next.species, form)
    const mon: Mon = { key: keyOf(evolved), name: newName, isShiny, ...parseAnsi(art) }
    await update($, party, list => list.map((m, i) => (i === slot ? mon : m)))
    status = evolve(status, slot)
    if (isPreview) {
      $.clock.after(EVOLVE * TICK_MS + 3000, () => background($, refreshParty($)))
      return `Previewing ${name} evolving into ${newName}; it changes back in a few seconds.`
    }
    // Shedinja comes along when Nincada evolves by level, with Nincada's level and shininess.
    const shed = next.way.kind === 'level' ? stages.find(s => s.way.kind === 'shed') : undefined
    let shedText = ''
    // Another session may have evolved it first: then that evolution stands.
    let outcome = `${name} already evolved.`
    await mutate($, s => {
      const i = s.party.findIndex(m => m.id === member.id && m.species === member.species)
      const latest = s.party[i]
      if (!latest) return s
      if (!given && latest.heldItem === 'everstone') {
        outcome = `${name} holds an everstone: it won't evolve.`
        return s
      }
      if (given && !s.bag?.[given]) {
        outcome = `You don't have ${withArticle(itemName(given))}.`
        return s
      }
      outcome = ''
      const { next: __, heldItem, ...kept } = latest
      // A held item that made it evolve is used up; any other stays held.
      const keeps = heldItem && !(next.way.kind === 'hold' && next.way.item === heldItem)
      const grown: Member = {
        ...kept,
        ...(keeps ? { heldItem } : {}),
        species: next.species,
        form,
        isShiny,
        evolutions: latest.evolutions + 1,
      }
      const seen = recordSeen(given ? takeFromBag(s, given) : s, next.species, isShiny, Date.now())
      const after = { ...seen, party: seen.party.map((m, j) => (j === i ? grown : m)) }
      if (!shed) return after
      const shedinja: Member = {
        id: newId(),
        species: shed.species,
        form: 'regular',
        isShiny,
        xp: latest.xp,
        evolutions: 1,
      }
      const stored = storeCaught(recordSeen(after, shed.species, isShiny, Date.now()), shedinja)
      const shedName = displayName(shed.species)
      shedText = stored.isInParty ? ` ${shedName} joined your party!` : ` ${shedName} went to the PC box.`
      return stored.save
    })
    if (!outcome) $.ui.toast(`What? ${name} evolved into ${newName}!${shedText}`)
    // Also redraws over any refresh that was already under way with the old sprite.
    await refreshParty($)
    if (outcome) return outcome
    background($, learnEvolutions($))
    return `${name} evolved into ${newName}!${shedText}`
  } catch (err) {
    if (!isPreview) await report($, err)
    return `${name} couldn't evolve right now: ${err instanceof Error ? err.message : String(err)}`
  }
}
```

- `toggleEverstone`: the Everstone is now the held item (Task 6 replaces this function; until then no other item
  can be held). Replace its `isDropped`/`rest`/`return` lines with:

```tsx
isDropped = m.heldItem === 'everstone'
text = isDropped
  ? `${name} dropped its everstone and can evolve again.`
  : `${name} holds an everstone: it won't evolve.`
const { heldItem: _, ...rest } = m
return { ...s, party: s.party.map((p, i) => (i === at ? (isDropped ? rest : { ...rest, heldItem: 'everstone' }) : p)) }
```

- [ ] **Step 6: Run the suite and the types.** Expected: every test passes, the 7 new ones included, and `tsc` is
      clean. A test still failing on an `evolveAt` or `hasEverstone` word was missed by the Step 1 table; fix it with
      the same table. `'/pokemon-play evolve previews without saving...'` must still pass unchanged.

- [ ] **Step 7:** `npx --yes prettier@3.9.9 --write plugin/hooks plugin/tests`, run the suite again. No commit.

---

### Task 6: `register.tsx`: ₽, the Bag, `give` and `take`

**Files:**

- Modify: `plugin/hooks/register.tsx`
- Test: `plugin/tests/commands.test.tsx`

**Interfaces:**

- Consumes: `evolveMember($, at, false, given)` (Task 5); `extraMoney`, `formatBag`, `buy`, `putInBag`,
  `takeFromBag`, `MAX_LEVEL`, `MONEY_PER_XP`, `xpForLevel` (Task 4); `splitGive`, `itemById`, `itemName`,
  `isForSale`, `withArticle`, `MAX_BAG`, `type Item` (Task 2).
- Produces (used by Task 8):
  - `let cash: number`: the ledgers' unfolded ₽ (with `extra`), kept by `countLedgers(ledgers)`.
  - `let plus: { amount: number; until: number } | null`: the last earning, shown on the button until `until`.
  - `buyItem($, id: unknown, qty: unknown): Promise<{ text: string; isError: boolean }>`.
  - Commands `/pokemon bag`, `/pokemon give <item> <pokemon>` (either order), `/pokemon take <pokemon>`.

- [ ] **Step 1: Write the failing tests** at the end of `plugin/tests/commands.test.tsx`:

```ts
// A reply's ₽20 is earnInto's ×10 on its 2 XP (save.test.ts); here the two tool events, with two members.
test('work earns ₽ once per event, not per member: a test run ₽50, a commit ₽100', async ($, on) => {
  answerTools(on)
  const w = await begin($, on, {
    ...emptySave(),
    party: [member('pikachu', { next: [] }), member('eevee', { next: [] })],
  })
  expect(await cmd($, 'pokemon', 'bag')).toBe('Bag · ₽3,000\n  Empty. Buy items at the PokéMart: /pokemon mart')
  await $.tool.call(bash('pytest -q') as never)
  await $.tool.call(bash('git commit -m x') as never)
  await until($, () => [...w.store].some(([k, l]) => k.startsWith('xp:') && (l as { money?: number }).money === 150))
  expect(await cmd($, 'pokemon', 'bag')).toContain('Bag · ₽3,150')
})

test('a Water Stone given to Eevee evolves it into Vaporeon and is used up', async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('eevee')], bag: { 'water-stone': 2 } })
  expect(await cmd($, 'pokemon', 'give water stone eevee')).toBe('Eevee evolved into Vaporeon!')
  expect(w.saveNow().party[0]?.species).toBe('vaporeon')
  expect(w.saveNow().bag).toEqual({ 'water-stone': 1 })
  expect(w.toasts).toEqual(['What? Eevee evolved into Vaporeon!'])
})

test('give refuses what it cannot do, and changes nothing', async ($, on) => {
  const w = await begin($, on, {
    ...emptySave(),
    party: [member('eevee'), member('charmander')],
    bag: { 'water-stone': 1 },
  })
  const before = JSON.stringify(w.saveNow())
  expect(await cmd($, 'pokemon', 'give fire-stone eevee')).toBe(
    "You don't have a Fire Stone. Buy one at the PokéMart: /pokemon mart",
  )
  expect(await cmd($, 'pokemon', 'give water-stone charmander')).toBe("Charmander can't use a Water Stone.")
  expect(await cmd($, 'pokemon', 'give water-stone mewtwo')).toMatch(/^No mewtwo in your party\./)
  expect(await cmd($, 'pokemon', 'give water-stone')).toBe(
    'Give a Water Stone to whom? /pokemon give water-stone <pokemon>',
  )
  expect(await cmd($, 'pokemon', 'give eevee')).toBe(
    'Give what to whom? /pokemon give <item> <pokemon> · /pokemon bag lists your items.',
  )
  expect(JSON.stringify(w.saveNow())).toBe(before)
})

test('holding: one item each, a new one sends the old back to the Bag; take puts it back', async ($, on) => {
  const w = await begin($, on, {
    ...emptySave(),
    party: [member('pikachu', { next: [] })],
    bag: { 'lucky-egg': 1, 'soothe-bell': 1 },
  })
  expect(await cmd($, 'pokemon', 'give lucky-egg pikachu')).toBe('Pikachu is now holding a Lucky Egg.')
  expect(w.saveNow().bag).toEqual({ 'soothe-bell': 1 })
  expect(await cmd($, 'pokemon', 'give pikachu soothe bell')).toBe(
    'Pikachu is now holding a Soothe Bell. Its Lucky Egg went back to your Bag.',
  )
  expect(w.saveNow().bag).toEqual({ 'lucky-egg': 1 })
  expect(await cmd($, 'pokemon', 'bag')).toContain('  Held        Pikachu: Soothe Bell')
  expect(await cmd($, 'pokemon', 'take pikachu')).toBe("Pikachu's Soothe Bell went back to your Bag.")
  expect(await cmd($, 'pokemon', 'take pikachu')).toBe("Pikachu isn't holding anything.")
  expect(w.saveNow().bag).toEqual({ 'lucky-egg': 1, 'soothe-bell': 1 })
  expect(w.saveNow().party[0]?.heldItem).toBeUndefined()
})

test('the everstone stays free: same words as ever, and it never enters the Bag', async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu', { next: [] })], bag: { 'lucky-egg': 1 } })
  await cmd($, 'pokemon', 'give lucky-egg pikachu')
  expect(await cmd($, 'pokemon', 'everstone pikachu')).toBe(
    "Pikachu holds an everstone: it won't evolve. Its Lucky Egg went back to your Bag.",
  )
  expect(w.saveNow().party[0]?.heldItem).toBe('everstone')
  expect(await cmd($, 'pokemon', 'everstone pikachu')).toBe('Pikachu dropped its everstone and can evolve again.')
  expect(w.saveNow().bag).toEqual({ 'lucky-egg': 1 })
  expect(await cmd($, 'pokemon', 'give everstone pikachu')).toBe("Pikachu holds an everstone: it won't evolve.")
  expect(await cmd($, 'pokemon', 'take pikachu')).toBe('Pikachu dropped its everstone and can evolve again.')
  expect(w.saveNow().bag).toEqual({ 'lucky-egg': 1 })
})

test('a Rare Candy is one level, and the evolution that level brings', async ($, on) => {
  const w = await begin($, on, {
    ...emptySave(),
    party: [member('charmander', { xp: xpForLevel(15) + 3 })],
    bag: { 'rare-candy': 1 },
  })
  expect(await cmd($, 'pokemon', 'give rare candy charmander')).toBe('Charmander grew to Lv 16!')
  expect(w.saveNow().bag).toBeUndefined()
  await until($, () => w.saveNow().party[0]?.species === 'charmeleon')
  const top = await begin($, on, {
    ...emptySave(),
    party: [member('charizard', { xp: xpForLevel(100), next: [] })],
    bag: { 'rare-candy': 1 },
  })
  expect(await cmd($, 'pokemon', 'give rare-candy charizard')).toBe('Charizard is already Lv 100.')
  expect(top.saveNow().bag).toEqual({ 'rare-candy': 1 })
})

test('a Lucky Egg holder earns half again', async ($, on) => {
  answerTools(on)
  const w = await begin($, on, {
    ...emptySave(),
    party: [member('pikachu', { next: [], heldItem: 'lucky-egg' }), member('eevee', { next: [] })],
  })
  await cmd($, 'pokemon', 'party')
  await $.tool.call(bash('git commit -m x') as never)
  await until($, () => w.partyNow()[0]?.xp === 15)
  expect(w.partyNow().map(m => m.xp)).toEqual([15, 10])
})

test('₽ from two sessions adds up', async ($, on) => {
  answerTools(on)
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu', { id: 'p', next: [] })] })
  await cmd($, 'pokemon', 'party')
  w.store.set('xp:other', { at: Date.now(), xp: { p: 10 }, money: 400 })
  await $.tool.call(bash('git commit -m x') as never)
  await cmd($, 'pokemon', 'party')
  expect(await cmd($, 'pokemon', 'bag')).toContain('Bag · ₽3,500')
})
```

    (The Rare Candy test's second `begin` reuses the same `on`: if the kit refuses a second world in one test, split
    it into its own test.)

- [ ] **Step 2: Run the suite.** Expected: the 8 new tests FAIL (`bag`, `give`, `take` fall through to `setLead`
      and answer "No Pokémon called ...").

- [ ] **Step 3: Implement in `plugin/hooks/register.tsx`.**
  - Imports: from `'./save'` add `buy`, `extraMoney`, `formatBag`, `MAX_LEVEL`, `MONEY_PER_XP`, `putInBag`,
    `xpForLevel`; from `'./items'` add `isForSale`, `itemById`, `MAX_BAG`, `splitGive` and
    `import type { Item } from './items'`.
  - State, under `let extra`:

```tsx
// The ledgers' ₽ not yet folded into the save.
let cash = 0
// The last ₽ earned, shown on the shop button until `until`.
let plus: { amount: number; until: number } | null = null
```

    and after `const view = ...`:

```tsx
// The ledgers' XP and ₽ not yet folded into the save, counted against the save's own marks.
function countLedgers(ledgers: Record<string, Ledger>) {
  extra = extraXp(ledgers, save.folded, save.foldedXp)
  cash = extraMoney(ledgers, save.folded, save.foldedMoney)
}
```

    Replace each of the four `extra = extraXp(await readLedgers($), save.folded, save.foldedXp)` lines (in `mutate`,
    `sync`, `load`, `earn`) with `countLedgers(await readLedgers($))`.

- `foldLedgers`' cleanup of gone ledgers drops their ₽ marks too:

```tsx
if (gone.length)
  await mutate($, s => {
    const folded = (s.folded ?? []).filter(k => !gone.includes(k))
    const foldedXp = Object.fromEntries(Object.entries(s.foldedXp ?? {}).filter(([k]) => !gone.includes(k)))
    const foldedMoney = Object.fromEntries(Object.entries(s.foldedMoney ?? {}).filter(([k]) => !gone.includes(k)))
    const { folded: _, foldedXp: __, foldedMoney: ___, ...rest } = s
    return {
      ...rest,
      ...(folded.length ? { folded } : {}),
      ...(Object.keys(foldedXp).length ? { foldedXp } : {}),
      ...(Object.keys(foldedMoney).length ? { foldedMoney } : {}),
    }
  })
```

- `earn`: add `let isPaid = false` beside `leveledUp`; set `isPaid = true` right after the
  `$.store.set(ledgerKey, earnInto(...))` line; after the `queued(...)` call:

```tsx
if (isPaid) {
  plus = { amount: amount * MONEY_PER_XP, until: Date.now() + 1200 }
  $.ui.invalidate('ui.render')
  $.clock.after(1300, () => $.ui.invalidate('ui.render'))
}
```

- Replace `toggleEverstone` with these, after `depositMember`:

```tsx
// `/pokemon give <item> <name>`: a stone or trade item evolves it now; a hold item is held; a Rare Candy is a level.
async function giveItem($: EngineInterface, args: string): Promise<string> {
  const found = splitGive(slug(args).split('-').filter(Boolean))
  if (!found) return 'Give what to whom? /pokemon give <item> <pokemon> · /pokemon bag lists your items.'
  const { item, rest } = found
  const who = rest.join(' ')
  if (!who) return `Give ${withArticle(item.name)} to whom? /pokemon give ${item.id} <pokemon>`
  await sync($)
  if (item.kind === 'candy') return feedCandy($, who, item)
  if (item.kind === 'hold') return holdItem($, who, item, `give ${item.id} `)
  const at = findMember(save, who, `give ${item.id} `)
  if (typeof at === 'string') return at
  if (!save.bag?.[item.id]) return `You don't have ${withArticle(item.name)}. Buy one at the PokéMart: /pokemon mart`
  return evolveMember($, at, false, item.id)
}

// The member `query` names holds `item` from the Bag (an Everstone is free); what it held goes back to the Bag.
async function holdItem($: EngineInterface, query: string, item: Item, command: string): Promise<string> {
  let text = ''
  await mutate($, s => {
    const at = findMember(s, query, command)
    if (typeof at === 'string') {
      text = at
      return s
    }
    const m = s.party[at]
    if (!m) return s
    const name = displayName(m.species, m.form)
    const isFree = item.id === 'everstone'
    if (!isFree && !s.bag?.[item.id]) {
      text = `You don't have ${withArticle(item.name)}. Buy one at the PokéMart: /pokemon mart`
      return s
    }
    if (m.heldItem === item.id) {
      text = `${name} is already holding ${withArticle(item.name)}.`
      return s
    }
    let after = isFree ? s : takeFromBag(s, item.id)
    const old = m.heldItem
    if (old && old !== 'everstone') {
      const back = putInBag(after, old)
      if (!back) {
        text = `Your Bag can't hold more ${itemName(old)}: take it back first.`
        return s
      }
      after = back
    }
    text = isFree ? `${name} holds an everstone: it won't evolve.` : `${name} is now holding ${withArticle(item.name)}.`
    if (old) text += old === 'everstone' ? ' It dropped its everstone.' : ` Its ${itemName(old)} went back to your Bag.`
    return { ...after, party: after.party.map((p, i) => (i === at ? { ...p, heldItem: item.id } : p)) }
  })
  // A held item may be what it was waiting for.
  background($, learnEvolutions($))
  return text
}

// `/pokemon take <name>`: its held item back to the Bag; an Everstone is just dropped.
async function takeItem($: EngineInterface, query: string): Promise<string> {
  if (!query.trim()) return 'Which one? /pokemon take <name>'
  let text = ''
  let isDropped = false
  await mutate($, s => {
    const at = findMember(s, query, 'take ')
    if (typeof at === 'string') {
      text = at
      return s
    }
    const m = s.party[at]
    if (!m) return s
    const name = displayName(m.species, m.form)
    const { heldItem, ...rest } = m
    if (!heldItem) {
      text = `${name} isn't holding anything.`
      return s
    }
    let after = s
    if (heldItem === 'everstone') {
      text = `${name} dropped its everstone and can evolve again.`
      isDropped = true
    } else {
      const back = putInBag(s, heldItem)
      if (!back) {
        text = `Your Bag can't hold more ${itemName(heldItem)}.`
        return s
      }
      after = back
      text = `${name}'s ${itemName(heldItem)} went back to your Bag.`
    }
    return { ...after, party: after.party.map((p, i) => (i === at ? rest : p)) }
  })
  // Already past its level: it evolves now.
  if (isDropped) background($, learnEvolutions($))
  return text
}

// `/pokemon everstone <name>`: gives it the free Everstone, or takes it back.
async function toggleEverstone($: EngineInterface, query: string): Promise<string> {
  if (!query.trim()) return 'Which one? /pokemon everstone <name>'
  await sync($)
  const at = findMember(save, query, 'everstone ')
  if (typeof at === 'number' && save.party[at]?.heldItem === 'everstone') return takeItem($, query)
  const everstone = itemById('everstone')
  return everstone ? holdItem($, query, everstone, 'everstone ') : 'Your party is empty.'
}

// A Rare Candy: one level, up to MAX_LEVEL; the level may bring an evolution.
async function feedCandy($: EngineInterface, query: string, item: Item): Promise<string> {
  let text = ''
  let grew = false
  await mutate($, s => {
    const at = findMember(s, query, `give ${item.id} `)
    if (typeof at === 'string') {
      text = at
      return s
    }
    const m = s.party[at]
    if (!m) return s
    const name = displayName(m.species, m.form)
    if (!s.bag?.[item.id]) {
      text = `You don't have ${withArticle(item.name)}. Buy one at the PokéMart: /pokemon mart`
      return s
    }
    const xp = m.xp + (extra[m.id] ?? 0)
    const lv = level(xp)
    if (lv >= MAX_LEVEL) {
      text = `${name} is already Lv ${MAX_LEVEL}.`
      return s
    }
    text = `${name} grew to Lv ${lv + 1}!`
    grew = true
    const after = takeFromBag(s, item.id)
    return { ...after, party: after.party.map((p, i) => (i === at ? { ...p, xp: p.xp + xpForLevel(lv + 1) - xp } : p)) }
  })
  if (grew) background($, learnEvolutions($))
  return text
}

// `qty` of the item `id`, as the Mart posts it: anything but an item for sale and a whole 1..MAX_BAG changes nothing.
async function buyItem($: EngineInterface, id: unknown, qty: unknown): Promise<{ text: string; isError: boolean }> {
  const item = typeof id === 'string' ? itemById(id) : undefined
  if (!item || !isForSale(item) || typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1 || qty > MAX_BAG)
    return { text: "That isn't for sale.", isError: true }
  let result = { text: '', isError: true }
  const ledgers = await readLedgers($)
  await mutate($, s => {
    const bought = buy(s, extraMoney(ledgers, s.folded, s.foldedMoney), item, qty)
    result = { text: bought.text, isError: bought.isError }
    return bought.save
  })
  return result
}
```

    (`buyItem` has no caller until Task 8.)

- In `pokemon($, args)`'s switch, before `case 'off':`:

```tsx
    case 'bag':
      await sync($)
      return formatBag(save, cash)
    case 'give':
      return giveItem($, tail)
    case 'take':
      return takeItem($, tail)
```

- The `/pokemon` command's description becomes:
  `'Your Pokémon: /pokemon <name> picks a lead · add/remove [name] · deposit <name> · party · box · bag · give <item> <name> · take <name> · mart · size small|normal|auto · everstone · on/off'`.

- [ ] **Step 4: Run the suite and the types.** Expected: all pass, `tsc` clean. If a test that counts
      `w.band.invalidated` (the aiming test near line 682) now sees the earn's extra invalidations, it compares
      against the count it took itself and keeps passing; if it doesn't, take the count after the tool call.

- [ ] **Step 5:** Prettier on `plugin/hooks plugin/tests`, run again. No commit.

---

### Task 7: The friendship heartbeat

**Files:**

- Modify: `plugin/hooks/register.tsx`
- Test: `plugin/tests/commands.test.tsx`

**Interfaces:**

- Consumes: `addTogether`, `FRIENDSHIP_MS` (Tasks 3–4); `learnEvolutions`, `mutate`, `started` (existing).
- Produces: `TOGETHER_EVERY_MS = 60_000`; `together($)` run on that period from `session.start`.

- [ ] **Step 1: Write the failing tests** at the end of `plugin/tests/commands.test.tsx` (add `FRIENDSHIP_MS` to
      the `'../hooks/evolution'` import):

```ts
test('time together brings friendship evolutions: Pichu becomes Pikachu after 10 hours', async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('pichu', { togetherMs: FRIENDSHIP_MS - 90_000 })] })
  await until($, () => w.saveNow().party[0]?.next !== undefined)
  expect(await cmd($, 'pokemon', 'party')).toContain('evolves with friendship (♥ 99%, 2m to go)')
  expect(w.saveNow().party[0]?.species).toBe('pichu')
  await w.clock.advance(180_000)
  await until($, () => w.saveNow().party[0]?.species === 'pikachu')
  expect(w.toasts).toEqual(['What? Pichu evolved into Pikachu!'])
  expect(await cmd($, 'pokemon', 'party')).toContain('together 10h')
})

test('Eevee by friendship: Umbreon at night, Espeon by day', async ($, on) => {
  const net: Net = { isOnline: true, list: JSON.stringify(LIST), now: hourAt(23) }
  const w = await begin(
    $,
    on,
    { ...emptySave(), party: [member('eevee', { togetherMs: FRIENDSHIP_MS - 30_000 })] },
    ART,
    undefined,
    net,
  )
  await w.clock.advance(120_000)
  await until($, () => w.saveNow().party[0]?.species === 'umbreon')
})

test('Eevee by day becomes Espeon', async ($, on) => {
  const net: Net = { isOnline: true, list: JSON.stringify(LIST), now: hourAt(12) }
  const w = await begin(
    $,
    on,
    { ...emptySave(), party: [member('eevee', { togetherMs: FRIENDSHIP_MS - 30_000 })] },
    ART,
    undefined,
    net,
  )
  await w.clock.advance(120_000)
  await until($, () => w.saveNow().party[0]?.species === 'espeon')
})

test('only party time counts: none while off, none in the PC box; a Soothe Bell makes it 1.5 times', async ($, on) => {
  const w = await begin($, on, {
    ...emptySave(),
    party: [
      member('pikachu', { id: 'p', next: [] }),
      member('charmander', { id: 's', next: [], heldItem: 'soothe-bell' }),
    ],
    box: [member('eevee', { id: 'b' })],
  })
  await w.clock.advance(60_000)
  const start = w.saveNow().party.map(m => m.togetherMs ?? 0)
  await w.clock.advance(120_000)
  const party = w.saveNow().party
  expect((party[0]?.togetherMs ?? 0) - (start[0] ?? 0)).toBe(120_000)
  expect((party[1]?.togetherMs ?? 0) - (start[1] ?? 0)).toBe(180_000)
  expect(w.saveNow().box?.[0]?.togetherMs).toBeUndefined()
  await cmd($, 'pokemon', 'off')
  const resting = w.saveNow().party[0]?.togetherMs
  await w.clock.advance(300_000)
  expect(w.saveNow().party[0]?.togetherMs).toBe(resting)
  expect(await cmd($, 'pokemon', 'party')).toContain('together 2m')
})
```

    (Coming back with `/pokemon on` after a long rest adds at most 120 s, because `togetherAt` is shared and the gap
    is capped: Task 4's unit test covers that.)

- [ ] **Step 2: Run the suite.** Expected: the 4 new tests FAIL (nobody adds time together).

- [ ] **Step 3: Implement in `plugin/hooks/register.tsx`.**
  - Imports: from `'./save'` add `addTogether`.
  - Constants, under `SYNC_MS`:

```tsx
// How often time together is added, in every session; the shared stamp keeps two sessions from counting it twice.
const TOGETHER_EVERY_MS = 60_000
```

- After `retry`:

```tsx
// Time together for the party, then any evolution it (or the hour) has brought.
async function together($: EngineInterface) {
  if (save.isOff || !save.party.length) return
  const now = await $.clock.now()
  await mutate($, s => (s.isOff ? s : addTogether(s, now)))
  await learnEvolutions($)
}
```

- In `session.start`, after the `SYNC_MS` timer:

```tsx
$.clock.every(TOGETHER_EVERY_MS, () =>
  background(
    $,
    started.then(() => together($)),
  ),
)
```

- [ ] **Step 4: Run the whole suite and the types.** Expected: all pass, `tsc` clean. The heartbeat now writes
      `togetherAt` and `togetherMs` into the save every minute of fake time, so a test that advances the clock past
      60 s and then compares a whole save (`toEqual(save)`, `JSON.stringify(...)` equality) may differ by those two
      fields; compare the fields that test is about instead (e.g. `party.map(m => m.xp)`), or take the "before"
      snapshot after the advance. The fold test (`"an ended session's ledger is folded..."`, 15 minutes of clock)
      checks XP and fold marks only and must pass unchanged.

- [ ] **Step 5:** Prettier on `plugin/hooks plugin/tests`, run again. No commit.

---

### Task 8: The PokéMart and its button

**Files:**

- Create: `scripts/item-icons.mjs`, `plugin/hooks/item-icons.ts` (generated), `plugin/hooks/mart.tsx`,
  `plugin/hooks/shop.tsx`
- Modify: `plugin/hooks/register.tsx` (render hook, `ui.message` hook, a new `ui.scroll` hook, `tick`,
  `spawnWild`, `setOff`, `earn`, the `pokemon` command switch), `.prettierignore`
- Test: `plugin/tests/mart.test.tsx` (new), `plugin/tests/commands.test.tsx` (new tests; three expectations change)

**Interfaces:**

- Consumes:
  - Task 2: `forSale(): Item[]`, `ITEMS`, `TABS`, `MAX_BAG`.
  - Task 4: `balanceOf(save, cash): number`, `MONEY_PER_XP`, `Member.next: Stage[]`, `Save.bag`, `titleCase`.
  - Task 6: module-level `cash: number` in `register.tsx` (the ledgers' unfolded ₽, refreshed wherever `extra` is);
    `buyItem($, id: unknown, qty: unknown): Promise<{ text: string; isError: boolean }>`, which changes nothing and
    answers `isError: true` for an unknown or unsold id, or a quantity that isn't a whole number from 1 to
    `MAX_BAG`; `earn($, amount)` as today, adding `amount × MONEY_PER_XP` ₽.
  - `sprite.ts`: `type Pixels`, `CLEAR`, `type TextRun`, `textRows(pixels)`.
- Produces:
  - `item-icons.ts`: `ICONS: Record<string, Pixels>` (every item in `ITEMS`, at most 12×12).
  - `mart.tsx`: `type MartItem`, `type MartState = { tab; sel; top; qty }`, `type MartProps` (includes `state` and
    the selected item's `icon?: TextRun[][]`), `type Act`, `type Hit`, `START`, `KEYS`, `ICON_ROWS = 8`,
    `isAct(x): x is Act`, `listRows(p)`, `most(p, s)`, `martRows(p, s = p.state): { lines; hits }`,
    `act(p, s, a): { state; post? }`, default export the `Client` module (draws, and posts `{ act }`).
  - `shop.tsx`: `type ShopProps = { balance: number; plus: number }`, default export the button module.
  - `register.tsx`: `BUTTON_COLUMNS = 13`; `band` gains `total` (the band's whole width; `columns` is the scene's);
    `mart = { isOpen, message, isError, view: MartState }`; `openMart($)`, `closeMart($)`, `martProps()`,
    `martAct($, a)`, `buttonProps()`; `/pokemon mart`; the `ui.scroll` hook.

What is selected lives in the hooks module (`mart.view`), not in the `Client`: clicks, keys and the wheel all go
through `martAct`, and the `Client` only draws the props it gets and posts `{ act }`.

**After Task 1's probe:** if the side button stalled the band (answer 1 "no"), skip Step 9's `Box`/`shop` changes:
the scene keeps the whole width, `BUTTON_COLUMNS` is 0 and there is no `shop.tsx`; `/pokemon mart` is the only way
in, and Step 10's mounted tests open the Mart with the command instead of a click. If keys never reached a `Client`
(answer 3 "no"), keep the key handler anyway; Task 11 leaves keys out of the README. Answer 4 "no" (a `Client` can't
import): nothing changes, `mart.tsx` and `shop.tsx` import types only and the hooks module passes the icon in props.

- [ ] **Step 1: Write `scripts/item-icons.mjs`:**

```js
#!/usr/bin/env node
// Writes plugin/hooks/item-icons.ts: a picture of every item in plugin/hooks/items.ts, at most 12×12 pixels, from
// PokeAPI's item sprites, else Pokémon Showdown's item sheet, else a plain Bag. Run when items.ts changes:
//   node scripts/item-icons.mjs
import { readFile, writeFile } from 'node:fs/promises'
import { inflateSync } from 'node:zlib'

const POKEAPI = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items'
const SHOWDOWN = 'https://play.pokemonshowdown.com'
const SIZE = 12
const CELL = 24
const PER_ROW = 16
const CLEAR = -1
const deadline = Date.now() + 5 * 60_000

async function get(url) {
  if (Date.now() > deadline) throw new Error('took longer than 5 minutes')
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  return res.ok ? Buffer.from(await res.arrayBuffer()) : null
}

// A PNG as { width, height, rgba }: 8-bit, not interlaced, truecolour (2), palette (3) or truecolour + alpha (6).
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG')
  let width = 0
  let height = 0
  let type = 0
  let palette = null
  let alpha = null
  const idat = []
  for (let at = 8; at < buf.length;) {
    const len = buf.readUInt32BE(at)
    const kind = buf.toString('latin1', at + 4, at + 8)
    const data = buf.subarray(at + 8, at + 8 + len)
    if (kind === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      type = data[9]
      if (data[8] !== 8 || data[12] !== 0 || ![2, 3, 6].includes(type))
        throw new Error(`unsupported PNG: depth ${data[8]}, colour type ${type}, interlace ${data[12]}`)
    } else if (kind === 'PLTE') palette = data
    else if (kind === 'tRNS') alpha = data
    else if (kind === 'IDAT') idat.push(data)
    else if (kind === 'IEND') break
    at += 12 + len
  }
  const bpp = { 2: 3, 3: 1, 6: 4 }[type]
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * bpp
  const out = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0
      const b = y ? out[(y - 1) * stride + x] : 0
      const c = x >= bpp && y ? out[(y - 1) * stride + x - bpp] : 0
      const p = a + b - c
      const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)]
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      out[y * stride + x] = (line[x] + [0, a, b, (a + b) >> 1, paeth][filter]) & 0xff
    }
  }
  const rgba = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    if (type === 3) {
      const k = out[i]
      rgba.set(
        [palette[k * 3], palette[k * 3 + 1], palette[k * 3 + 2], alpha && k < alpha.length ? alpha[k] : 255],
        i * 4,
      )
    } else if (type === 2) rgba.set([out[i * 3], out[i * 3 + 1], out[i * 3 + 2], 255], i * 4)
    else rgba.set(out.subarray(i * 4, i * 4 + 4), i * 4)
  }
  return { width, height, rgba }
}

const crop = (img, x0, y0, w, h) => {
  const rgba = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++)
    rgba.set(img.rgba.subarray(((y0 + y) * img.width + x0) * 4, ((y0 + y) * img.width + x0 + w) * 4), y * w * 4)
  return { width: w, height: h, rgba }
}

const isSolid = (img, x, y) => img.rgba[(y * img.width + x) * 4 + 3] >= 128

// The image cut to its opaque pixels, or null when it has none.
function trim(img) {
  let [x0, y0, x1, y1] = [img.width, img.height, -1, -1]
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++)
      if (isSolid(img, x, y)) [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)]
  return x1 < 0 ? null : crop(img, x0, y0, x1 - x0 + 1, y1 - y0 + 1)
}

// Pixels (0xRRGGBB, CLEAR) scaled down to fit SIZE×SIZE: each one the average of the opaque pixels it covers, clear
// when fewer than half are opaque.
function toPixels(img) {
  const f = Math.min(1, SIZE / Math.max(img.width, img.height))
  const width = Math.max(1, Math.round(img.width * f))
  const height = Math.max(1, Math.round(img.height * f))
  const pixels = []
  for (let ty = 0; ty < height; ty++)
    for (let tx = 0; tx < width; tx++) {
      const [sx0, sx1] = [Math.floor((tx * img.width) / width), Math.ceil(((tx + 1) * img.width) / width)]
      const [sy0, sy1] = [Math.floor((ty * img.height) / height), Math.ceil(((ty + 1) * img.height) / height)]
      let [r, g, b, n, all] = [0, 0, 0, 0, 0]
      for (let y = sy0; y < sy1; y++)
        for (let x = sx0; x < sx1; x++) {
          all++
          if (!isSolid(img, x, y)) continue
          const i = (y * img.width + x) * 4
          ;[r, g, b, n] = [r + img.rgba[i], g + img.rgba[i + 1], b + img.rgba[i + 2], n + 1]
        }
      pixels.push(n * 2 < all ? CLEAR : (Math.round(r / n) << 16) | (Math.round(g / n) << 8) | Math.round(b / n))
    }
  return { width, height, pixels }
}

// The plain Bag for items neither source draws.
const BAG_ART = [
  '...dddd...',
  '..d....d..',
  '.bbbbbbbb.',
  'bbbyyyybbb',
  'bbbbyybbbb',
  'bbbbbbbbbb',
  'bbbbbbbbbb',
  'bbbbbbbbbb',
  '.bbbbbbbb.',
]
const BAG_COLORS = { b: 0x9a6b3f, d: 0x5a3a1f, y: 0xf0c040 }
const BAG = {
  width: BAG_ART[0].length,
  height: BAG_ART.length,
  pixels: BAG_ART.join('')
    .split('')
    .map(c => BAG_COLORS[c] ?? CLEAR),
}

const ids = [
  ...(await readFile(new URL('../plugin/hooks/items.ts', import.meta.url), 'utf8')).matchAll(/id: '([a-z-]+)'/g),
].map(m => m[1])
const items = (await get(`${SHOWDOWN}/data/items.js`))?.toString('utf8') ?? ''
const sheetPng = await get(`${SHOWDOWN}/sprites/itemicons-sheet.png`)
const sheet = sheetPng && decodePng(sheetPng)
const icons = {}
const from = { pokeapi: [], showdown: [], bag: [] }
for (const id of ids) {
  const png = await get(`${POKEAPI}/${id}.png`)
  let img = png && trim(decodePng(png))
  let source = 'pokeapi'
  if (!img && sheet) {
    const num = new RegExp(`[{,]${id.replace(/-/g, '')}:\\{name:"[^"]*",spritenum:(\\d+)`).exec(items)?.[1]
    if (num !== undefined) {
      const n = Number(num)
      img = trim(crop(sheet, (n % PER_ROW) * CELL, Math.floor(n / PER_ROW) * CELL, CELL, CELL))
      source = 'showdown'
    }
  }
  icons[id] = img ? toPixels(img) : BAG
  from[img ? source : 'bag'].push(id)
}
const body = Object.entries(icons)
  .map(([id, p]) => `  '${id}': { width: ${p.width}, height: ${p.height}, pixels: [${p.pixels.join(',')}] },`)
  .join('\n')
await writeFile(
  new URL('../plugin/hooks/item-icons.ts', import.meta.url),
  `// Generated by scripts/item-icons.mjs: don't edit by hand.\nimport type { Pixels } from './sprite'\n\n` +
    `export const ICONS: Record<string, Pixels> = {\n${body}\n}\n`,
)
for (const [source, list] of Object.entries(from)) console.log(`${source}: ${list.length} ${list.join(' ')}`)
```

- [ ] **Step 2: Run it** from the repo root: `node scripts/item-icons.mjs`. Expected: three lines, about
      `pokeapi: 30 ...`, `showdown: 11 ...` (the newer items), `bag: 1 ...` or fewer; every id of `items.ts` in one of
      them. Add a line `plugin/hooks/item-icons.ts` to `.prettierignore`. Open `plugin/hooks/item-icons.ts` and check
      a few entries have `width` and `height` at most 12 and `width * height` pixels. If the sheet fails to decode
      (an unsupported PNG), the script throws with its depth and colour type: then drop the Showdown step (those items
      get the Bag) and say so in the Task 11 CHANGELOG's known limitations.

- [ ] **Step 3: Write the failing pure tests** `plugin/tests/mart.test.tsx`:

```tsx
import { expect, test } from 'claude-code/testing'

import { act, ICON_ROWS, isAct, KEYS, listRows, martRows, most, START } from '../hooks/mart'
import type { Act, MartProps, MartState } from '../hooks/mart'
import { ICONS } from '../hooks/item-icons'
import { forSale, ITEMS, TABS } from '../hooks/items'
import { CLEAR, textRows } from '../hooks/sprite'

const props = (extra: Partial<MartProps> = {}): MartProps => ({
  items: forSale().map(({ id, name, tab, price, color, text }) => ({ id, name, tab, price, color, text })),
  tabs: TABS,
  balance: 12400,
  bag: {},
  message: '',
  isError: false,
  columns: 80,
  rows: 7,
  state: START,
  ...extra,
})
const text = (runs: [string, string, string][]) => runs.map(r => r[0]).join('')
const lines = (p: MartProps, s: MartState = p.state) => martRows(p, s).lines.map(text)
const hitAt = (p: MartProps, s: MartState, a: unknown) =>
  martRows(p, s).hits.find(h => JSON.stringify(h.act) === JSON.stringify(a))
// The state after acting on `acts` one after another.
const after = (p: MartProps, ...acts: Act[]) => acts.reduce((s, a) => act(p, s, a).state, START)
const left = Math.floor(80 * 0.44)

test('every item has a picture of at most 12×12 pixels', () => {
  for (const { id } of ITEMS) {
    const icon = ICONS[id]
    expect(icon).toBeDefined()
    expect(icon!.width).toBeLessThanOrEqual(12)
    expect(icon!.height).toBeLessThanOrEqual(12)
    expect(icon!.pixels).toHaveLength(icon!.width * icon!.height)
    for (const px of icon!.pixels) expect(px === CLEAR || (Number.isInteger(px) && px >= 0 && px <= 0xffffff)).toBe(true)
  }
})

test('every line is exactly the band wide, one per row; title, tabs, list, details, actions', () => {
  const p = props()
  const drawn = lines(p)
  expect(drawn).toHaveLength(7)
  for (const line of drawn) expect([...line].length).toBe(80)
  expect(drawn[0]).toMatch(/^ POKé MART .* ₽ 12,400 ✕ $/)
  for (const tab of [' Stones 10 ', ' Hold items 18 ', ' Special 11 ', ' Other 3 ']) expect(drawn[1]).toContain(tab)
  // The list: 44% of the width, the price on the right; the details beside it.
  expect(drawn[2]?.slice(0, left)).toMatch(/^▶ Fire Stone +₽3,000 $/)
  expect(drawn[3]?.slice(0, left)).toMatch(/^  Water Stone +₽3,000 $/)
  expect(drawn[2]?.slice(left)).toMatch(/^│ ◆ Fire Stone · in bag: 0 +$/)
  expect(drawn[3]?.slice(left + 1)).toMatch(/^ {2}A peculiar stone/)
  expect(drawn[6]?.slice(0, left)).toMatch(/^ +▼ 6 more $/)
  expect(drawn[6]?.slice(left)).toMatch(/^│ {2}◀ ×1 ▶ Max {2}Buy ₽3,000 +$/)
})

test('a band of 8 rows or more shows the item's picture left of the details; a shorter one the ◆', () => {
  const icon = textRows(ICONS['fire-stone']!)
  const tall = props({ rows: ICON_ROWS + 1, icon })
  const drawn = martRows(tall, START).lines
  expect(drawn).toHaveLength(9)
  for (const line of drawn) expect([...text(line)].length).toBe(80)
  // The picture's own colours, in the 12 columns after `│ `.
  const pictured = drawn.slice(2, 2 + icon.length).map(runs => text(runs).slice(left + 2, left + 14))
  expect(pictured.some(row => /[▀▄]/.test(row))).toBe(true)
  expect(text(drawn[2]!).slice(left + 14)).toMatch(/^ {2}Fire Stone · in bag: 0/)
  expect(text(drawn[8]!).slice(left + 14)).toMatch(/^ {2}◀ ×1 ▶ Max {2}Buy ₽3,000/)
  expect(lines(props({ rows: ICON_ROWS - 1, icon }))[2]).toContain('◆ Fire Stone')
})

test('the description wraps to at most 3 lines, and a party line shows when an item would evolve one', () => {
  const p = props({
    rows: 9,
    items: props().items.map(i => (i.id === 'fire-stone' ? { ...i, party: 'Eevee → Flareon' } : i)),
  })
  const drawn = lines(p).map(l => l.slice(left + 2).trim())
  expect(drawn.slice(3, 7).filter(l => l && !l.startsWith('Your party')).length).toBeLessThanOrEqual(3)
  expect(drawn).toContain('Your party: Eevee → Flareon')
  expect(lines(props()).join('\n')).not.toContain('Your party')
})

test('the selected tab is drawn in blue; the bag count and the message show', () => {
  const s = after(props(), 'right')
  const runs = martRows(props(), s).lines[1] ?? []
  expect(runs.find(r => r[0].includes('Hold items'))?.[2]).toBe('#3a6ea5')
  expect(runs.find(r => r[0].includes('Stones'))?.[2]).not.toBe('#3a6ea5')
  expect(lines(props(), s)[2]).toContain('▶ Metal Coat')
  const owned = lines(props({ bag: { 'fire-stone': 2 }, message: 'Bought 2 × Fire Stone!' }))
  expect(owned[0]).toContain('Bought 2 × Fire Stone!')
  expect(owned[2]).toContain('▶ Fire Stone ×2')
  expect(owned[2]).toContain('in bag: 2')
})

test('scrolling: the list follows the selection, the edges say what is past them, the wheel moves it too', () => {
  const p = props()
  expect(listRows(p)).toBe(4)
  const s = after(p, 'down', 'down', 'down', 'down')
  expect(s).toEqual({ tab: 0, sel: 4, top: 1, qty: 1 })
  expect(lines(p, s)[6]).toMatch(/^▲ 1 above +▼ 5 more │/)
  expect(after(p, 'up')).toEqual(START)
  expect(after(p, ...Array<Act>(20).fill('down')).sel).toBe(9)
  // ▲ and ▼ scroll as ↑ and ↓ do; a wheel tick is one row, a page at most a screenful, never past the ends.
  expect(hitAt(p, s, 'up')?.y).toBe(6)
  expect(hitAt(p, s, 'down')?.y).toBe(6)
  expect(after(p, { wheel: 1 }, { wheel: 1 })).toEqual(after(p, 'down', 'down'))
  expect(after(p, { wheel: 50 }).sel).toBe(4)
  expect(after(p, { wheel: -3 })).toEqual(START)
})

test('quantity: 1 at least, the room in the Bag at most; Max is what the wallet buys; a new pick starts at 1', () => {
  const p = props()
  expect(after(p, 'less').qty).toBe(1)
  expect(after(p, 'more', 'more').qty).toBe(3)
  expect(most(p, START)).toBe(4)
  expect(after(p, 'max').qty).toBe(4)
  expect(most(props({ bag: { 'fire-stone': 997 } }), START)).toBe(2)
  expect(after(props({ bag: { 'fire-stone': 998 } }), 'more', 'more').qty).toBe(1)
  expect(most(props({ balance: 0 }), START)).toBe(1)
  expect(after(p, 'more', 'down').qty).toBe(1)
  expect(after(p, 'more', 'right')).toEqual({ tab: 1, sel: 0, top: 0, qty: 1 })
  expect(after(p, 'left').tab).toBe(3)
})

test('acting: Buy and ✕ say what to do; every control is a hit at its place; only real acts are acts', () => {
  const p = props()
  const s = after(p, 'more')
  expect(act(p, s, 'buy')).toEqual({ state: { ...s, qty: 1 }, post: { buy: { id: 'fire-stone', qty: 2 } } })
  expect(act(p, s, 'close').post).toEqual({ close: true })
  expect(act(p, s, { pick: 3 }).state).toEqual({ tab: 0, sel: 3, top: 0, qty: 1 })
  expect(act(p, s, { pick: 99 }).state.sel).toBe(9)
  expect(act(p, s, { tab: 2 }).state).toEqual({ tab: 2, sel: 0, top: 0, qty: 1 })
  const drawn = lines(p, s)
  const at = (a: unknown) => {
    const h = hitAt(p, s, a)
    return h ? (drawn[h.y] ?? '').slice(h.x0, h.x1) : null
  }
  expect(at('close')).toBe('✕')
  expect(at({ tab: 2 })).toContain('Special 11')
  expect(at({ pick: 1 })).toContain('Water Stone')
  expect(at('less')).toBe('◀')
  expect(at('more')).toBe('▶')
  expect(at('max')).toBe('Max')
  expect(at('buy')).toBe('Buy ₽6,000')
  expect(KEYS).toEqual({
    up: 'up',
    down: 'down',
    left: 'left',
    right: 'right',
    '-': 'less',
    '+': 'more',
    '=': 'more',
    return: 'buy',
    x: 'close',
  })
  for (const good of ['buy', 'close', { tab: 1 }, { pick: 0 }, { wheel: -2 }]) expect(isAct(good)).toBe(true)
  for (const bad of ['teleport', { pick: -1 }, { pick: 1.5 }, { tab: '2' }, { wheel: 0.5 }, { buy: 'x' }, null, 7])
    expect(isAct(bad)).toBe(false)
})

test('a short band (small sprites) still fits: fewer list rows, the actions on the last row', () => {
  const p = props({ rows: 6, columns: 60 })
  const drawn = lines(p)
  expect(drawn).toHaveLength(6)
  for (const line of drawn) expect([...line].length).toBe(60)
  expect(listRows(p)).toBe(3)
  expect(drawn[5]).toContain('Buy ₽3,000')
  // Too narrow for every control: cut at the edge, never wider than the band.
  for (const line of lines(props({ columns: 40 }))) expect([...line].length).toBe(40)
})
```

- [ ] **Step 4: Run `mart.test.tsx` alone.** Expected: FAIL, the file does not load (`../hooks/mart` missing).

- [ ] **Step 5: Write `plugin/hooks/mart.tsx`:**

```tsx
import type { ClientModule } from 'claude-code'

import type { TextRun } from './sprite'

// The PokéMart, drawn in the band while it's open. The hooks module keeps what is selected (`state`) and does the
// buying; this draws the props it gets and posts `{ act }` for a click or a key.
export type MartItem = {
  id: string
  name: string
  tab: string
  price: number
  color: string
  text: string
  party?: string
}
// `top`: the first list row shown.
export type MartState = { tab: number; sel: number; top: number; qty: number }
export type MartProps = {
  items: MartItem[]
  tabs: string[]
  balance: number
  bag: Record<string, number>
  message: string
  isError: boolean
  columns: number
  rows: number
  state: MartState
  // The selected item's picture, as `textRows` draws it.
  icon?: TextRun[][]
}
export type Act =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'less'
  | 'more'
  | 'max'
  | 'buy'
  | 'close'
  | { tab: number }
  | { pick: number }
  | { wheel: number }
export type MartPost = { buy: { id: string; qty: number } } | { close: true }
// A control: row `y`, columns `x0` to `x1` (exclusive).
export type Hit = { y: number; x0: number; x1: number; act: Act }

export const START: MartState = { tab: 0, sel: 0, top: 0, qty: 1 }
// Keys while the Mart has the focus. Escape never arrives: it gives the focus back to the prompt.
export const KEYS: Record<string, Act> = {
  up: 'up',
  down: 'down',
  left: 'left',
  right: 'right',
  '-': 'less',
  '+': 'more',
  '=': 'more',
  return: 'buy',
  x: 'close',
}
// Bands this tall show the item's picture; shorter ones a ◆.
export const ICON_ROWS = 8
const ICON_COLUMNS = 12

const MAX_BAG = 999
const BLUE = '#3a6ea5'
const PAPER = '#f4f1e6'
const INK = '#222222'
const PICKED = '#ffe28a'
const RED = '#e3350d'
const GREY = '#888888'
const WHITE = '#ffffff'
const NAMES = ['up', 'down', 'left', 'right', 'less', 'more', 'max', 'buy', 'close']

const fmt = (n: number) => n.toLocaleString('en-US')
const width = (text: string) => [...text].length
// Padded to `w`, or cut with … when longer.
const fit = (text: string, w: number) =>
  width(text) > w
    ? [...text].slice(0, Math.max(0, w - 1)).join('') + (w > 0 ? '…' : '')
    : text + ' '.repeat(w - width(text))

export function isAct(a: unknown): a is Act {
  if (typeof a === 'string') return NAMES.includes(a)
  if (typeof a !== 'object' || a === null) return false
  const [key, n] = Object.entries(a)[0] ?? []
  return (
    Object.keys(a).length === 1 &&
    ['tab', 'pick', 'wheel'].includes(key ?? '') &&
    Number.isInteger(n) &&
    (key === 'wheel' || (n as number) >= 0)
  )
}

const inTab = (p: MartProps, s: MartState) => p.items.filter(i => i.tab === p.tabs[s.tab])
const picked = (p: MartProps, s: MartState) => inTab(p, s)[s.sel]
// List rows that fit: the band less the title, the tabs and the ▲ ▼ row.
export const listRows = (p: MartProps) => Math.max(1, p.rows - 3)

// The most one buy can take: what the Bag has room for and the wallet pays for, at least 1.
export function most(p: MartProps, s: MartState): number {
  const item = picked(p, s)
  if (!item) return 1
  return Math.max(1, Math.min(MAX_BAG - (p.bag[item.id] ?? 0), Math.floor(p.balance / item.price)))
}

const room = (p: MartProps, s: MartState) => {
  const item = picked(p, s)
  return Math.max(1, MAX_BAG - (item ? (p.bag[item.id] ?? 0) : 0))
}

// The state after `a`, and what the hooks module is to do: buy, or close.
export function act(p: MartProps, s: MartState, a: Act): { state: MartState; post?: MartPost } {
  const count = inTab(p, s).length
  const select = (sel: number) => {
    const at = Math.max(0, Math.min(count - 1, sel))
    const rows = listRows(p)
    const top = at < s.top ? at : at >= s.top + rows ? at - rows + 1 : s.top
    return { state: { ...s, sel: at, top, qty: at === s.sel ? s.qty : 1 } }
  }
  const tab = (t: number) => ({ state: { tab: (t + p.tabs.length) % p.tabs.length, sel: 0, top: 0, qty: 1 } })
  if (typeof a === 'object') {
    if ('tab' in a) return tab(a.tab)
    if ('pick' in a) return select(a.pick)
    // A wheel tick is a row; a page at most a screenful.
    return select(s.sel + Math.max(-listRows(p), Math.min(listRows(p), a.wheel)))
  }
  if (a === 'up' || a === 'down') return select(s.sel + (a === 'up' ? -1 : 1))
  if (a === 'left' || a === 'right') return tab(s.tab + (a === 'left' ? -1 : 1))
  if (a === 'less') return { state: { ...s, qty: Math.max(1, s.qty - 1) } }
  if (a === 'more') return { state: { ...s, qty: Math.min(room(p, s), s.qty + 1) } }
  if (a === 'max') return { state: { ...s, qty: most(p, s) } }
  if (a === 'close') return { state: s, post: { close: true } }
  const item = picked(p, s)
  return item ? { state: { ...s, qty: 1 }, post: { buy: { id: item.id, qty: s.qty } } } : { state: s }
}

// Words of `text` in lines at most `w` wide.
function wrap(text: string, w: number): string[] {
  const out: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && width(line) + 1 + width(word) > w) {
      out.push(line)
      line = word
    } else line = line ? `${line} ${word}` : word
  }
  if (line) out.push(line)
  return out
}

// The Mart as coloured text, a row per band row, each exactly `columns` wide, and where its controls are.
export function martRows(p: MartProps, s: MartState = p.state): { lines: TextRun[][]; hits: Hit[] } {
  const hits: Hit[] = []
  const lines: TextRun[][] = []
  // One row: `put` adds a run, cut at the band's edge, and a control where it lands whole; `pad` fills to a column.
  const row = (y: number) => {
    const runs: TextRun[] = []
    let x = 0
    const put = (text: string, fg: string, bg: string, a?: Act) => {
      const room = p.columns - x
      if (!text || room <= 0) return
      const shown = width(text) > room ? [...text].slice(0, room).join('') : text
      if (a && shown === text) hits.push({ y, x0: x, x1: x + width(text), act: a })
      runs.push([shown, fg, bg])
      x += width(shown)
    }
    const pad = (to: number, bg: string) => put(' '.repeat(Math.max(0, to - x)), INK, bg)
    return { runs, put, pad, at: () => x }
  }

  // Title: the name, the last message, the wallet and ✕.
  const title = row(0)
  const wallet = ` ₽ ${fmt(p.balance)} `
  title.put(' POKé MART ', WHITE, BLUE)
  title.put(
    fit(` ${p.message}`, Math.max(0, p.columns - width(' POKé MART ') - width(wallet) - 2)),
    p.isError ? '#ffd0c8' : '#d8ffd8',
    BLUE,
  )
  title.put(wallet, WHITE, BLUE)
  title.put('✕', WHITE, BLUE, 'close')
  title.put(' ', WHITE, BLUE)
  lines.push(title.runs)

  // Tabs, each with how many it sells.
  const tabs = row(1)
  tabs.put(' ', BLUE, PAPER)
  p.tabs.forEach((name, t) => {
    const label = ` ${name} ${p.items.filter(i => i.tab === name).length} `
    tabs.put(label, t === s.tab ? WHITE : BLUE, t === s.tab ? BLUE : PAPER, { tab: t })
  })
  tabs.pad(p.columns, PAPER)
  lines.push(tabs.runs)

  const items = inTab(p, s)
  const item = items[s.sel]
  const left = Math.floor(p.columns * 0.44)
  const body = p.rows - 2
  const list = listRows(p)
  // The details column: the picture (tall bands) or a ◆, then name, description, party line; actions last.
  const icon = p.rows >= ICON_ROWS && p.icon ? p.icon : null
  const textWidth = Math.max(1, p.columns - left - 1 - (icon ? ICON_COLUMNS + 2 : 0) - 2)
  const have = item ? (p.bag[item.id] ?? 0) : 0
  const party = item?.party ? fit(`Your party: ${item.party}`, textWidth) : null
  const textRows = Math.max(1, Math.min(3, body - 2 - (party ? 1 : 0)))
  const details: TextRun[][] = item
    ? [
        icon
          ? [[`  ${fit(`${item.name} · in bag: ${have}`, textWidth)}`, INK, PAPER]]
          : [
              [' ◆ ', item.color, PAPER],
              [fit(`${item.name} · in bag: ${have}`, textWidth - 1), INK, PAPER],
            ],
        ...wrap(item.text, textWidth)
          .slice(0, textRows)
          .map((l): TextRun[] => [[`  ${fit(l, textWidth)}`, INK, PAPER]]),
        ...(party ? [[[`  ${party}`, BLUE, PAPER]] as TextRun[]] : []),
      ]
    : []

  for (let i = 0; i < body; i++) {
    const r = row(2 + i)
    const isLast = i === body - 1
    if (!isLast) {
      // A list row: ▶ on the selection, how many you have, the price on the right.
      const at = s.top + i
      const it = i < list ? items[at] : undefined
      if (it) {
        const bg = at === s.sel ? PICKED : PAPER
        const price = `₽${fmt(it.price)} `
        const owned = p.bag[it.id] ? ` ×${p.bag[it.id]}` : ''
        r.put(fit(`${at === s.sel ? '▶' : ' '} ${it.name}${owned}`, left - width(price)), INK, bg, { pick: at })
        r.put(price, INK, bg)
      } else r.pad(left, PAPER)
    } else {
      // The ▲ ▼ row under the list.
      const below = Math.max(0, items.length - s.top - list)
      if (s.top) r.put(`▲ ${s.top} above`, GREY, PAPER, 'up')
      const more = below ? `▼ ${below} more ` : ''
      r.pad(left - width(more), PAPER)
      if (more) r.put(more, GREY, PAPER, 'down')
    }
    r.put('│', BLUE, PAPER)
    if (icon) {
      r.put(' ', INK, PAPER)
      for (const [t, fg, bg] of icon[i] ?? []) r.put(t, fg || PAPER, bg || PAPER)
      r.pad(left + 2 + ICON_COLUMNS, PAPER)
    }
    if (isLast && item) {
      r.put('  ', INK, PAPER)
      r.put('◀', BLUE, PAPER, 'less')
      r.put(` ×${s.qty} `, INK, PAPER)
      r.put('▶', BLUE, PAPER, 'more')
      r.put(' ', INK, PAPER)
      r.put('Max', BLUE, PAPER, 'max')
      r.put('  ', INK, PAPER)
      const canBuy = p.balance >= item.price * s.qty && have + s.qty <= MAX_BAG
      r.put(`Buy ₽${fmt(item.price * s.qty)}`, WHITE, canBuy ? RED : GREY, 'buy')
    } else for (const [t, fg, bg] of details[i] ?? []) r.put(t, fg, bg)
    r.pad(p.columns, PAPER)
    lines.push(r.runs)
  }
  return { lines, hits }
}

const Mart: ClientModule<MartProps, true> = (p, s) => {
  if (s.state === undefined) {
    s.setState(true)
  }
  // Set on every draw, so a click is judged on the props drawn now.
  s.onPointer(e => {
    if (e.type !== 'down' || e.button !== 'left') return
    const hit = martRows(p).hits.find(h => h.y === e.y && e.x >= h.x0 && e.x < h.x1)
    if (hit) s.post({ act: hit.act })
  })
  s.onKey(e => {
    const a = KEYS[e.key]
    if (a) s.post({ act: a })
  })
  const { Box, Text } = s.elements
  return (
    <Box flexDirection="column">
      {martRows(p).lines.map((runs, y) => (
        <Text key={`r${y}`}>
          {runs.map(([text, fg, bg], i) => (
            <Text key={`c${i}`} color={fg || undefined} backgroundColor={bg || undefined}>
              {text}
            </Text>
          ))}
        </Text>
      ))}
    </Box>
  )
}

export default Mart
```

    (Every glyph here is one column wide, so `[...text].length` is the width. `pick` hits stop at the list's right
    edge, so a click on the details never picks an item. Without a picture a details row is `│ ◆ Fire Stone...` or
    `│  A peculiar...` and the actions `│  ◀ ×1 ▶ Max  Buy ₽3,000`; with one, `│`, a space and 12 picture columns
    come first, then the same text.)

- [ ] **Step 6: Run `mart.test.tsx` alone.** Expected: 9 pass. If a row is one column off, fix the row in
      `martRows`, not the test: the tests' widths are the contract the click map depends on.

- [ ] **Step 7: Write `plugin/hooks/shop.tsx`:**

```tsx
import type { ClientModule } from 'claude-code'

// The band's corner button: the wallet, `+₽` for a moment after earning, and a click opens the PokéMart.
export type ShopProps = { balance: number; plus: number }

const Shop: ClientModule<ShopProps, true> = (p, s) => {
  if (s.state === undefined) {
    s.onPointer(e => {
      if (e.type === 'down' && e.button === 'left') s.post({ open: true })
    })
    s.setState(true)
  }
  const { Box, Text } = s.elements
  return (
    <Box flexDirection="column" alignItems="flex-end">
      <Text color="#ffd75e" backgroundColor="#1d2029">{` 🛒 ₽ ${p.balance.toLocaleString('en-US')} `}</Text>
      {p.plus ? (
        <Text color="#ffd75e" bold>
          {`+₽${p.plus} `}
        </Text>
      ) : null}
    </Box>
  )
}

export default Shop
```

- [ ] **Step 8: Write the failing mounted tests** in `plugin/tests/commands.test.tsx` (next to the other band
      tests; if Task 9 has moved the harness into `world.tsx`, import `mountBand` and friends from there). Add
      `import { martRows } from '../hooks/mart'` and `import type { MartProps } from '../hooks/mart'`:

```tsx
type Band = {
  pointer: (e: { type: 'down'; x: number; y: number; button: 'left'; in?: string }) => Promise<void>
  key: (e: { key: string; in?: string }) => Promise<void>
  post: (data: unknown, scope?: { in?: string }) => Promise<void>
  drawn: () => Promise<unknown>
  redraw: () => Promise<void>
}
// The props of the `Client` keyed `key` in the band as drawn afresh, or null when it isn't there.
async function clientProps<T>(band: Band, key: string): Promise<T | null> {
  await band.redraw()
  const find = (node: unknown): T | null => {
    if (typeof node !== 'object' || node === null) return null
    const n = node as { type?: string; props?: { key?: string; props?: T } }
    if (n.type === 'Client' && n.props?.key === key) return n.props.props ?? null
    for (const child of Object.values(node)) {
      const found = find(child)
      if (found) return found
    }
    return null
  }
  return find(await band.drawn())
}
const martOf = (band: Band) => clientProps<MartProps>(band, 'mart')
// Clicks the Mart's control for `act`, where the Mart draws it now.
async function clickMart(band: Band, act: unknown) {
  const p = await martOf(band)
  const hit = p && martRows(p).hits.find(h => JSON.stringify(h.act) === JSON.stringify(act))
  if (!hit) throw new Error(`no ${JSON.stringify(act)} in the Mart`)
  await band.pointer({ type: 'down', x: hit.x0, y: hit.y, button: 'left', in: 'mart' })
}
// A wheel tick over the band, as the engine raises it: `by` rows, negative toward the top.
const wheel = ($: { ui: { scroll: (e: never) => Promise<unknown> } }, by: number) =>
  $.ui.scroll({
    component: 'AbovePrompt',
    requestId: 'band',
    offset: 0,
    by,
    bodyRows: 9,
    contentRows: 9,
    origin: 'person',
  } as never)

test('the ₽ button opens the PokéMart; Buy takes ₽ and fills the Bag; not enough ₽ changes nothing; x closes it', async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu')] })
  await cmd($, 'pokemon', 'party')
  const band = (await mountBand($)) as Band
  expect(await clientProps(band, 'shop')).toEqual({ balance: 3000, plus: 0 })
  expect(await martOf(band)).toBeNull()
  await band.pointer({ type: 'down', x: 3, y: 0, button: 'left', in: 'shop' })
  expect(await martOf(band)).toMatchObject({ balance: 3000, state: { tab: 0, sel: 0, top: 0, qty: 1 } })
  expect((await martOf(band))?.icon?.length).toBeGreaterThan(0)
  await clickMart(band, 'buy')
  expect(w.saveNow().bag).toEqual({ 'fire-stone': 1 })
  expect(w.saveNow().spent).toBe(3000)
  expect(await martOf(band)).toMatchObject({ balance: 0, message: 'Bought a Fire Stone!', isError: false })
  await clickMart(band, 'buy')
  expect(w.saveNow().bag).toEqual({ 'fire-stone': 1 })
  expect(await martOf(band)).toMatchObject({ message: 'Not enough ₽: ₽3,000 more to go.', isError: true })
  await band.key({ key: 'down', in: 'mart' })
  await band.key({ key: '+', in: 'mart' })
  expect((await martOf(band))?.state).toEqual({ tab: 0, sel: 1, top: 0, qty: 2 })
  await band.key({ key: 'x', in: 'mart' })
  expect(await martOf(band)).toBeNull()
  expect(await clientProps(band, 'shop')).toEqual({ balance: 0, plus: 0 })
})

test('the mouse wheel over the open Mart moves its selection; with the Mart closed the band scrolls as before', async ($, on) => {
  // What the engine does with a scroll the plugin passes on.
  const passed: number[] = []
  on('ui.scroll', async (_$, e) => {
    passed.push((e as unknown as { by: number }).by)
    return {}
  })
  await begin($, on, { ...emptySave(), party: [member('pikachu')] })
  await cmd($, 'pokemon', 'party')
  const band = (await mountBand($)) as Band
  await wheel($ as never, 1)
  expect(passed).toEqual([1])
  await cmd($, 'pokemon', 'mart')
  await wheel($ as never, 1)
  await wheel($ as never, 1)
  expect(passed).toEqual([1])
  expect((await martOf(band))?.state).toMatchObject({ sel: 2 })
  await wheel($ as never, -40)
  expect((await martOf(band))?.state).toMatchObject({ sel: 0, top: 0 })
})

test('the Mart lists what would evolve your party', async ($, on) => {
  const stone = { species: 'raichu', way: { kind: 'item' as const, item: 'thunder-stone' } }
  await begin($, on, { ...emptySave(), party: [member('pikachu', { next: [stone], gender: 'male' })] })
  await cmd($, 'pokemon', 'party')
  const band = (await mountBand($)) as Band
  await cmd($, 'pokemon', 'mart')
  const p = await martOf(band)
  expect(p?.items.find(i => i.id === 'thunder-stone')?.party).toBe('Pikachu → Raichu')
  expect(p?.items.find(i => i.id === 'fire-stone')?.party).toBeUndefined()
})

test('the Mart takes only its own acts: raw buys of anything, bad picks and tabs change nothing', async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu')] })
  await cmd($, 'pokemon', 'party')
  const band = (await mountBand($)) as Band
  await cmd($, 'pokemon', 'mart')
  await band.redraw()
  for (const data of [
    { buy: { id: 'gimmighoul-coin', qty: 1 } },
    { buy: { id: 'everstone', qty: 1 } },
    { buy: { id: 'fire-stone', qty: 0 } },
    { buy: { id: 'fire-stone', qty: 1000 } },
    { buy: { id: 'fire-stone', qty: 1.5 } },
    { act: 'teleport' },
    { act: { pick: -1 } },
    { act: { pick: 1.5 } },
    { act: { tab: 'Other' } },
    'buy',
  ]) {
    await band.post(data, { in: 'mart' })
    expect(w.saveNow().bag).toBeUndefined()
    expect(w.saveNow().spent).toBeUndefined()
  }
  // `{ act: 'buy' }` with a stray field is still a buy of one Fire Stone: the Mart's own quantity counts.
  await band.post({ act: 'buy', qty: 1000 }, { in: 'mart' })
  expect(w.saveNow().bag).toEqual({ 'fire-stone': 1 })
  expect((await martOf(band))?.state).toEqual({ tab: 0, sel: 0, top: 0, qty: 1 })
})

test('/pokemon mart opens it in the band and says so without one; a wild Pokémon and /pokemon off close it', async ($, on) => {
  await begin($, on, { ...emptySave(), party: [member('pikachu')] }, TALL, undefined, throwNet())
  await cmd($, 'pokemon', 'party')
  expect(await cmd($, 'pokemon', 'mart')).toBe(
    "The PokéMart opens in the Pokémon band above the prompt, and it isn't showing here.",
  )
  const band = (await mountBand($)) as Band
  expect(await cmd($, 'pokemon', 'mart')).toMatch(/^The PokéMart is open above the prompt/)
  expect(await martOf(band)).not.toBeNull()
  expect(await cmd($, 'pokemon-play', 'wild caterpie')).toMatch(/wanders by/)
  expect(await martOf(band)).toBeNull()
  await cmd($, 'pokemon', 'mart')
  await cmd($, 'pokemon', 'off')
  await cmd($, 'pokemon', 'on')
  expect(await martOf(band)).toBeNull()
})

test('earning shows +₽ under the button for a moment', async ($, on) => {
  answerTools(on)
  const w = await begin($, on, { ...emptySave(), party: [member('pikachu')] })
  await cmd($, 'pokemon', 'party')
  const band = (await mountBand($)) as Band
  await $.tool.call(bash('git commit -m x') as never)
  expect(await clientProps(band, 'shop')).toEqual({ balance: 3100, plus: 100 })
  await w.clock.advance(1500)
  expect(await clientProps(band, 'shop')).toEqual({ balance: 3100, plus: 0 })
})
```

    The wheel test dispatches `ui.scroll` with the event's own fields, as the engine raises it, the same way other
    tests pass `as never` events. If the kit's `$.ui.scroll` only takes `{ to, in, block }` (`UiScrollArgs`), call
    `$.ui.scroll({ to: { key: 'mart' } } as never)` instead: then assert only the routing (`passed` stays `[1]`
    while the Mart is open, grows when it's closed) and move the selection checks to the pure `{ wheel }` test, which
    already covers them.

- [ ] **Step 9: Wire it into `plugin/hooks/register.tsx`.**
  - Imports: `import { ICONS } from './item-icons'`, `import { forSale, TABS } from './items'`,
    `import { act, isAct, START } from './mart'`, `import type { Act, MartProps } from './mart'`,
    `import type { ShopProps } from './shop'`; add `balanceOf`, `MONEY_PER_XP`, `titleCase` to the `./save` import
    if Task 6 hasn't. `textRows` is already imported from `./sprite`.
  - Module state, after `let pitch`:

```ts
// The band's corner button takes this many columns beside the scene.
const BUTTON_COLUMNS = 13
// The PokéMart: open in the band, the last thing it said, and what is selected in it.
let mart = { isOpen: false, message: '', isError: false, view: START }
// ₽ just earned, shown under the button for a moment.
let plus = 0
```

- `band`'s type gains the whole width: `let band: { requestId: string; columns: number; rows: number; total:
number } | null = null`.
- Add after `afterThrow`:

```ts
function openMart($: EngineInterface) {
  mart = { isOpen: true, message: '', isError: false, view: START }
  $.ui.invalidate('ui.render')
}

function closeMart($: EngineInterface) {
  if (!mart.isOpen) return
  mart = { ...mart, isOpen: false }
  $.ui.invalidate('ui.render')
}

// What the Mart shows: what's for sale, which party members each would evolve, and the selected item's picture.
function martProps(): MartProps {
  const party = view().party
  const items = forSale().map(i => {
    const uses = party.flatMap(m =>
      (m.next ?? [])
        .filter(st => (st.way.kind === 'item' || st.way.kind === 'hold') && st.way.item === i.id)
        .map(st => `${displayName(m.species, m.form)} → ${titleCase(st.species)}`),
    )
    const { id, name, tab, price, color, text } = i
    return { id, name, tab, price, color, text, ...(uses.length ? { party: [...new Set(uses)].join(', ') } : {}) }
  })
  const selected = items.filter(i => i.tab === TABS[mart.view.tab])[mart.view.sel]
  const icon = selected && ICONS[selected.id]
  return {
    items,
    tabs: TABS,
    balance: balanceOf(save, cash),
    bag: save.bag ?? {},
    message: mart.message,
    isError: mart.isError,
    columns: band?.total ?? 80,
    rows: band?.rows ?? 9,
    state: mart.view,
    ...(icon ? { icon: textRows(icon) } : {}),
  }
}

const buttonProps = (): ShopProps => ({ balance: balanceOf(save, cash), plus })

// A click, key or wheel tick in the Mart: the selection moves, a buy goes through, ✕ closes it. Answers the Mart's
// next props while it stays open.
async function martAct($: EngineInterface, a: Act): Promise<{ props: MartProps } | null> {
  const done = act(martProps(), mart.view, a)
  mart = { ...mart, view: done.state }
  if (done.post && 'close' in done.post) {
    closeMart($)
    return null
  }
  if (done.post && 'buy' in done.post) {
    const { text, isError } = await buyItem($, done.post.buy.id, done.post.buy.qty)
    mart = { ...mart, message: text, isError }
  }
  return { props: martProps() }
}

// `/pokemon mart`: the Mart opens in the band, when there is one.
function openMartCommand($: EngineInterface): string {
  if (!band || save.isOff) return "The PokéMart opens in the Pokémon band above the prompt, and it isn't showing here."
  openMart($)
  return 'The PokéMart is open above the prompt: click an item, then ↑ ↓ choose, ← → change tabs, - + set how many, Enter buys, x closes.'
}
```

- `earn`: set `let isEarned = false` before the `queued` block and `isEarned = true` inside it right after the
  `latest.isOff` early return; after the block (before `if (leveledUp)`):

```ts
if (isEarned) {
  plus = amount * MONEY_PER_XP
  $.ui.invalidate('ui.render')
  $.clock.after(1200, () => {
    plus = 0
    $.ui.invalidate('ui.render')
  })
}
```

- `spawnWild`: right after `status = startWild(status, band.columns, wild.left.width)` add `closeMart($)`.
- `setOff`: at the top, `if (isOff) closeMart($)`.
- `tick`: after the `if (status.mood?.kind !== 'evolve') evolveFrom = null` line add
  `if (mart.isOpen) return` (the scene keeps moving underneath; nothing is drawn over the Mart).
- `pokemon()` switch: `case 'mart': return openMartCommand($)`. Add `mart` to the `/pokemon` command
  description (`... · bag · give <item> <name> · mart · on/off`) if Task 6 didn't.
- `ui.message` hook becomes:

```tsx
on('ui.message', async ($, e, next) => {
  const click = e.element === 'aim' ? readClick(e.data) : null
  if (click) throwAt(click)
  if (e.element === 'shop' && (e.data as { open?: unknown } | null)?.open === true) openMart($)
  const posted = e.element === 'mart' && mart.isOpen ? (e.data as { act?: unknown } | null)?.act : undefined
  if (isAct(posted)) {
    const answer = await martAct($, posted)
    if (answer) return answer
  }
  return next(e)
})
```

- A new hook after it, for the wheel:

```tsx
// The wheel over the band moves the open Mart's selection instead of the band.
on('ui.scroll', async ($, e, next) => {
  if (e.component !== 'AbovePrompt' || !mart.isOpen || !e.by) return next(e)
  await martAct($, { wheel: Math.round(e.by) || Math.sign(e.by) })
  $.ui.invalidate('ui.render')
  return {}
})
```

- The `AbovePrompt` render hook: `const { Box, Client, Raster } = $.ui.resolve(e)`; replace
  `const columns = Math.min(512, e.props.bodyColumns)` with:

```tsx
// As wide as a Raster can be, less the button beside the scene.
const total = Math.min(512, e.props.bodyColumns)
const columns = total - BUTTON_COLUMNS
```

    set `band = { requestId: e.requestId, columns, rows, total }`, and replace the two final returns with:

```tsx
if (mart.isOpen) return <Client key="mart" module="./mart.tsx" width={total} height={rows} props={martProps()} />
const scene = isAiming ? (
  <Client key="aim" module="./aim.tsx" width={columns} height={rows} props={{ lines: textRows(img) }} />
) : (
  <Raster key="scene" columns={columns} rows={rows} cells={cells} />
)
return (
  <Box flexDirection="row">
    {scene}
    <Client key="shop" module="./shop.tsx" width={BUTTON_COLUMNS} height={rows} props={buttonProps()} />
  </Box>
)
```

- [ ] **Step 10: Fix the band tests the narrower scene changes** (the scene is now `bodyColumns - 13` wide):
  - `'the band draws the party, and size small makes it shorter'`: `toContain('"columns":80')` →
    `toContain('"columns":67')`.
  - `'another surface drawing at the same time...; wide bands are clipped to 512'`: `toContain('"columns":512')`
    → `toContain('"columns":499')`; the title's tail becomes `wide bands are clipped to 512, button included`.
  - The click-layer test that calls `cellOf(w.band.cells, 80, CYAN)` → `cellOf(w.band.cells, 67, CYAN)`.
  - `aimLines` finds the `aim` Client inside the new `Box` (it searches the whole tree); nothing else changes. Any
    other test pinning the band's columns gets `- 13` the same way.

- [ ] **Step 11: Run the whole suite and the type check** (Tests and Types commands from Global Constraints).
      Expected: every test passes, including the 9 in `mart.test.tsx` and the 6 new ones in `commands.test.tsx`;
      `tsc` clean. Then `npx --yes prettier@3.9.9 --write scripts/item-icons.mjs plugin/hooks/mart.tsx
plugin/hooks/shop.tsx plugin/hooks/register.tsx plugin/tests/mart.test.tsx plugin/tests/commands.test.tsx` and
      run both again.

- [ ] **Step 12:** No commit.

---

### Task 9: PokeAPI fixture, shared test world, coverage test

**Files:**

- Create: `scripts/evolution-fixture.mjs`, `plugin/tests/fixtures/evolutions.ts` (generated), `plugin/tests/world.tsx`,
  `plugin/tests/paths.ts`, `plugin/tests/coverage.test.ts`
- Modify: `plugin/tests/commands.test.tsx` (harness moves out), `.prettierignore`

**Interfaces:**

- Consumes: `nextStages`, `evolvedForm`, `pokeapiForm`, `wayOf`, `type ChainLink`, `type Stage`, `type Way`
  (Task 3); `itemById`, `isForSale` (Task 2); the `/pokemon/<name>` types endpoint the plugin fetches for
  `partyType` (Task 5); `Save.bag`, `Member.next`, `Member.heldItem`, `Member.togetherMs` (Task 4).
- Produces:
  - `fixtures/evolutions.ts`: `LIST: { name: string; forms: string[] }[]`, `CHAINS: unknown[]`,
    `CHAIN_OF: Record<string, number>` (-1: none), `GENDER_RATES: Record<string, number>`.
  - `world.tsx`: `ART`, `LIST`, `CHAINS`, `GENDER_RATES`, `CAPTURE_RATES`, `ok`, `member`, `lv`, `type Net`,
    `world`, `begin`, `cmd`, `bash`, `until`, `answerTools`, `mountBand`. `Net` gains optional `chains`,
    `genderRates`, `captureRates`, `types` (species → type names) and `now` (where the mock clock starts).
    Everything Task 5 added to the harness moves too: `hourAt`, `TYPES` and the real-shaped chains (`babies`,
    `fox`, `dog`, `panda`, `bug`, `ghost`, `kite`) with their `LIST` species.
  - `paths.ts`: `type PathKind`, `type Path`, `chainFor(species)`, `evolutionPaths(): Path[]`.

- [ ] **Step 1: Write the fixture script** `scripts/evolution-fixture.mjs`:

```js
// Writes plugin/tests/fixtures/evolutions.ts: the sprite list, and every PokeAPI evolution chain its species are in,
// trimmed to the fields the plugin reads. Run it when PokeAPI or the sprite list changes:
//   node scripts/evolution-fixture.mjs
import { writeFile } from 'node:fs/promises'

const LIST_URL = 'https://gitlab.com/phoneybadger/pokemon-colorscripts/-/raw/main/pokemon.json'
const API = 'https://pokeapi.co/api/v2'
const deadline = Date.now() + 5 * 60_000
const KEEP = [
  'trigger',
  'min_level',
  'gender',
  'item',
  'held_item',
  'trade_species',
  'min_happiness',
  'min_affection',
  'known_move',
  'known_move_type',
  'party_species',
  'party_type',
  'time_of_day',
  'required_pokemon_form',
  'evolved_pokemon_form',
]

async function get(url) {
  for (let tries = 1; ; tries++) {
    if (Date.now() > deadline) throw new Error('gave up after 5 minutes')
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
      return await res.json()
    } catch (err) {
      if (tries === 3) throw err
    }
  }
}

// `fn` over `items`, `size` at a time, results in order.
async function pool(items, size, fn) {
  const out = []
  let next = 0
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const at = next++
        out[at] = await fn(items[at])
      }
    }),
  )
  return out
}

const trimDetail = d =>
  Object.fromEntries(
    KEEP.flatMap(k => {
      const v = d[k]
      if (v === null || v === undefined || v === '' || v === false) return []
      return [[k, typeof v === 'object' && 'name' in v ? { name: v.name } : v]]
    }),
  )
const trim = link => ({
  species: { name: link.species.name },
  ...(link.evolution_details.length ? { evolution_details: link.evolution_details.map(trimDetail) } : {}),
  evolves_to: link.evolves_to.map(trim),
})

const list = (await get(LIST_URL)).map(p => ({ name: p.name, forms: p.forms }))
const species = await pool(list, 8, p => get(`${API}/pokemon-species/${p.name}`))
const urls = [...new Set(species.map(s => s.evolution_chain?.url).filter(Boolean))]
const chains = await pool(urls, 8, url => get(url).then(c => trim(c.chain)))
const chainOf = Object.fromEntries(list.map((p, i) => [p.name, urls.indexOf(species[i].evolution_chain?.url)]))
const genderRates = Object.fromEntries(list.map((p, i) => [p.name, species[i].gender_rate]))
const out = [
  "// Generated by scripts/evolution-fixture.mjs from PokeAPI and the sprite list: don't edit by hand.",
  `export const LIST: { name: string; forms: string[] }[] = ${JSON.stringify(list)}`,
  `export const CHAINS: unknown[] = ${JSON.stringify(chains)}`,
  "// Each species' chain, as an index into CHAINS (-1: none).",
  `export const CHAIN_OF: Record<string, number> = ${JSON.stringify(chainOf)}`,
  `export const GENDER_RATES: Record<string, number> = ${JSON.stringify(genderRates)}`,
  '',
].join('\n')
await writeFile(new URL('../plugin/tests/fixtures/evolutions.ts', import.meta.url), out)
console.log(`${list.length} species, ${chains.length} chains`)
```

- [ ] **Step 2: Generate it.** `mkdir -p plugin/tests/fixtures && node scripts/evolution-fixture.mjs`. Expected:
      `905 species, ~470 chains` in under 5 minutes. Then add two lines to `.prettierignore`:

```
plugin/tests/fixtures/
specs/evolution-coverage.md
```

      `npx --yes prettier@3.9.9 --check .` must not list the fixture.

- [ ] **Step 3: Move the harness into `plugin/tests/world.tsx`.** Cut from `commands.test.tsx`, verbatim, everything
      from the `ART` constant through `answerTools` (the imports it needs, `LIST`, `fire`, `electric`, `bees`,
      `cloaks`, the chain/rate tables, `ok`, `ids`, `member`, `Net`, `world`, `begin`, `cmd`, `bash`, `until`,
      `answerTools`) and `mountBand` (line ~475), paste them into `world.tsx` with `export` in front of each, and add
      the `lv` helper Task 5 introduced (`lv(species, level): Stage`) if it lives in `commands.test.tsx`. Rename the
      synthetic `GENDER_RATES` / `CAPTURE_RATES` / `CHAINS` exports as they are (the fixture module is imported under
      its own names in Tasks 9–10, so no clash). Then change three places in `world()`:

```tsx
// `chains`, `genderRates`, `captureRates`, `types`: PokeAPI as a test wants it, over the made-up defaults.
// `now`: where the clock starts.
export type Net = {
  isOnline: boolean
  list: string
  stall?: Promise<void>
  speciesStall?: Promise<void>
  isStoreBroken?: boolean
  cacheAgeMs?: number
  sprites?: Record<string, string>
  chains?: Record<string, unknown>
  genderRates?: Record<string, number>
  captureRates?: Record<string, number>
  types?: Record<string, string[]>
  now?: number
}
```

      `const clock = mock.clock(on)` becomes `const clock = mock.clock(on, { now: net.now ?? 0 })`, and the
      PokeAPI part of the `http.fetch` handler becomes:

```tsx
const rates = net.genderRates ?? GENDER_RATES
const captures = net.captureRates ?? CAPTURE_RATES
const species = /pokemon-species\/([a-z0-9-]+)/.exec(e.url)?.[1]
if (species && net.speciesStall) await net.speciesStall
if (species)
  return ok(
    JSON.stringify({
      evolution_chain: { url: `https://pokeapi.co/chain/${species}` },
      ...(species in rates ? { gender_rate: rates[species] } : {}),
      ...(species in captures ? { capture_rate: captures[species] } : {}),
    }),
  )
const chain = /chain\/([a-z0-9-]+)/.exec(e.url)?.[1]
if (chain)
  return ok(JSON.stringify({ chain: (net.chains ?? CHAINS)[chain] ?? { species: { name: chain }, evolves_to: [] } }))
const mon = /\/pokemon\/([a-z0-9-]+)$/.exec(e.url)?.[1]
if (mon) return ok(JSON.stringify({ types: (net.types?.[mon] ?? ['normal']).map(name => ({ type: { name } })) }))
```

      (If Task 5 already added the `/pokemon/<name>` branch with a `TYPES` table, keep its table as the default for
      `net.types`.) `commands.test.tsx` then starts with
      `import { answerTools, ART, bash, begin, CHAINS, cmd, LIST, lv, member, mountBand, ok, until, world } from './world'`
      plus `import type { Net } from './world'` (import only what it still uses; `tsc` flags the rest).

- [ ] **Step 4: Run the whole suite.** Expected: the same count as after Task 8, all pass. A move must change
      nothing.

- [ ] **Step 5: Write `plugin/tests/paths.ts`:**

```ts
import { evolvedForm, nextStages, pokeapiForm } from '../hooks/evolution'
import type { ChainLink, Stage } from '../hooks/evolution'
import { CHAIN_OF, CHAINS, LIST } from './fixtures/evolutions'

export type PathKind = 'level' | 'fallback' | 'item' | 'hold' | 'friendship' | 'party' | 'shed'
// One evolution between two species the plugin shows. `ties`: every `species:form` the same trigger can give (Wurmple
// becomes Silcoon or Cascoon). `siblingLevel`: for Shedinja, the level Nincada becomes Ninjask at.
export type Path = {
  kind: PathKind
  from: string
  fromForm: string
  gender?: 'female' | 'male'
  to: string
  toForm: string
  stage: Stage
  ties: string[]
  siblingLevel?: number
}

const FORMS = new Map(LIST.map(s => [s.name, s.forms]))

export const chainFor = (species: string): ChainLink | undefined => CHAINS[CHAIN_OF[species] ?? -1] as ChainLink

const find = (chain: ChainLink, name: string): ChainLink | undefined =>
  chain.species.name === name ? chain : chain.evolves_to.map(c => find(c, name)).find(Boolean)

const kindOf = (s: Stage): PathKind =>
  s.way.kind === 'level' && s.way.isFallback ? 'fallback' : (s.way.kind as PathKind)

// The way without its level's fallback mark: two stages with this key happen on the same trigger.
const triggerKey = (s: Stage) => JSON.stringify(s.way)

// Genders worth trying for `name`: both when a way out of it is for one gender only.
function gendersOf(chain: ChainLink, name: string): ('female' | 'male' | undefined)[] {
  const link = find(chain, name)
  const isSplit = (link?.evolves_to ?? []).some(c => (c.evolution_details ?? []).some(d => d.gender))
  return isSplit ? ['female', 'male'] : [undefined]
}

// Every evolution between two species in the sprite list, per starting form and gender that changes the outcome.
// Forms that evolve as the plain species (Gigantamax, Mega) are the same path and kept once.
export function evolutionPaths(): Path[] {
  const paths = new Map<string, Path>()
  for (const { name, forms } of LIST) {
    const chain = chainFor(name)
    if (!chain) continue
    const others = forms.filter(f => f !== 'regular')
    for (const form of forms)
      for (const gender of gendersOf(chain, name)) {
        const stages = nextStages(chain, name, pokeapiForm(name, form), gender ?? undefined, others).filter(s =>
          FORMS.has(s.species),
        )
        const formOf = (s: Stage) => evolvedForm(s, form, FORMS.get(s.species) ?? [])
        const level = stages.find(s => s.way.kind === 'level')
        for (const stage of stages) {
          const toForm = formOf(stage)
          const key = `${name}|${gender ?? ''}|${stage.species}|${toForm}|${triggerKey(stage)}`
          if (paths.has(key)) continue
          paths.set(key, {
            kind: kindOf(stage),
            from: name,
            fromForm: form,
            ...(gender ? { gender } : {}),
            to: stage.species,
            toForm,
            stage,
            ties: stages.filter(s => triggerKey(s) === triggerKey(stage)).map(s => `${s.species}:${formOf(s)}`),
            ...(stage.way.kind === 'shed' && level?.way.kind === 'level' ? { siblingLevel: level.way.level } : {}),
          })
        }
      }
  }
  return [...paths.values()]
}
```

- [ ] **Step 6: Write `plugin/tests/coverage.test.ts`:**

```ts
import { expect, test } from 'claude-code/testing'

import { nextStages } from '../hooks/evolution'
import type { ChainLink, Stage } from '../hooks/evolution'
import { isForSale, itemById } from '../hooks/items'
import { LIST } from './fixtures/evolutions'
import { chainFor, evolutionPaths } from './paths'

const PATHS = evolutionPaths()
const LISTED = new Set(LIST.map(s => s.name))
const path = (from: string, to: string, fromForm = 'regular', toForm?: string) =>
  PATHS.find(p => p.from === from && p.to === to && p.fromForm === fromForm && (!toForm || p.toForm === toForm))

test('every evolution between two plugin species has a rule the plugin can carry out', () => {
  expect(PATHS.length).toBeGreaterThan(450)
  for (const p of PATHS) {
    const w = p.stage.way
    if (w.kind === 'item' || w.kind === 'hold') expect(isForSale(itemById(w.item))).toBe(true)
  }
  // Every listed child of a listed species is reached some way, from some form.
  const walk = (link: ChainLink) => {
    for (const child of link.evolves_to) {
      if (LISTED.has(link.species.name) && LISTED.has(child.species.name))
        expect(PATHS.some(p => p.from === link.species.name && p.to === child.species.name)).toBe(true)
      walk(child)
    }
  }
  for (const name of new Set(LIST.map(s => s.name))) {
    const chain = chainFor(name)
    if (chain?.species.name === name) walk(chain)
  }
})

test('no Pokémon evolves twice in a row: a level way is always above the level its species is reached at', () => {
  for (const p of PATHS) {
    if (p.stage.way.kind !== 'level') continue
    const into = PATHS.filter(q => q.to === p.from && q.stage.way.kind === 'level')
    for (const q of into) if (q.stage.way.kind === 'level') expect(p.stage.way.level).toBeGreaterThan(q.stage.way.level)
  }
})

test('the evolutions named in the design follow the games', () => {
  const way = (from: string, to: string, fromForm?: string, toForm?: string): Stage['way'] | undefined =>
    path(from, to, fromForm, toForm)?.stage.way
  expect(way('dusclops', 'dusknoir')).toEqual({ kind: 'item', item: 'reaper-cloth' })
  expect(way('pikachu', 'raichu')).toEqual({ kind: 'item', item: 'thunder-stone' })
  expect(way('pichu', 'pikachu')).toEqual({ kind: 'friendship' })
  expect(way('piloswine', 'mamoswine')).toEqual({ kind: 'level', level: 43, isFallback: true })
  expect(way('rockruff', 'lycanroc', 'regular', 'midnight')).toEqual({ kind: 'level', level: 25, time: 'night' })
  expect(way('eevee', 'sylveon')).toEqual({ kind: 'level', level: 30, isFallback: true })
  expect(way('nincada', 'shedinja')).toEqual({ kind: 'shed' })
  expect(path('nincada', 'shedinja')?.siblingLevel).toBe(20)
  expect(way('mantyke', 'mantine')).toEqual({ kind: 'party', species: 'remoraid' })
  expect(way('pancham', 'pangoro')).toEqual({ kind: 'level', level: 32, partyType: 'dark' })
  expect(way('slowpoke', 'slowbro', 'galar', 'galar')).toEqual({ kind: 'item', item: 'galarica-cuff' })
  expect(path('milcery', 'alcremie')?.stage.way).toMatchObject({ kind: 'hold', item: 'strawberry-sweet' })
  expect(
    PATHS.some(
      p =>
        p.from === 'kubfu' &&
        p.to === 'urshifu' &&
        p.stage.way.kind === 'item' &&
        p.stage.way.item === 'scroll-of-waters',
    ),
  ).toBe(true)
  expect(nextStages(chainFor('caterpie') as ChainLink, 'caterpie')).toEqual([
    { species: 'metapod', way: { kind: 'level', level: 7 } },
  ])
})
```

- [ ] **Step 7: Run `coverage.test.ts` alone** (with `fixtures/`, `paths.ts`, `world.tsx` copied). Expected: 3 pass.
      If a named case fails, read that species' chain in `fixtures/evolutions.ts` and decide what the games do:
      when the games agree with the test, fix the rule in `evolution.ts` (and add a unit test for it in
      `evolution.test.ts`); change this test only when the fixture shows the design misread the games, and say so in
      the CHANGELOG's Known limitations. If the double-evolution test fails, list the offenders and fix the rule:
      the fallback must never land at or below the level its species is reached at.

- [ ] **Step 8: Whole suite and types.** Expected: all pass, `tsc` clean.

- [ ] **Step 9:** No commit.

---

### Task 10: Every Pokémon, end to end, and the checklist

**Files:**

- Create: `plugin/tests/every-evolution.test.tsx`, `scripts/evolution-coverage.mjs`
- Generated: `specs/evolution-coverage.md`

**Interfaces:**

- Consumes: `evolutionPaths`, `type Path` (Task 9); `begin`, `cmd`, `bash`, `until`, `answerTools`, `member`,
  `type Net` (Task 9 `world.tsx`); `FRIENDSHIP_MS` (Task 3); `emptySave`, `xpForLevel` (Task 4); `spell` from
  `lookup.ts`; `/pokemon give <item> <name>` (Task 6); the 60 s heartbeat (Task 7).
- Produces: one `COVERAGE-TOTAL|<n>` line and one
  `COVERAGE|<kind>|<from>|<fromForm>|<to>|<toForm>|<how>|<result>` line per path on the test runner's output;
  `specs/evolution-coverage.md`.

- [ ] **Step 1: Write `plugin/tests/every-evolution.test.tsx`:**

```tsx
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
```

      `until` runs `/pokemon party` up to 50 times, which also drives background work; the `advance` loop gives
      clock-driven paths (friendship, the heartbeat) 20 s more.

- [ ] **Step 2: Run it alone** (copy `fixtures/`, `paths.ts`, `world.tsx` too). Expected: about 500 tests, all
      pass, in a few minutes. For each failure, the `COVERAGE` line names what happened: fix the plugin (or the
      rule), never loosen the test, unless the path's own data is wrong (then fix `paths.ts`).

- [ ] **Step 3: Write `scripts/evolution-coverage.mjs`:**

```js
// Runs the plugin's tests and writes specs/evolution-coverage.md from the every-evolution test's report lines.
//   node scripts/evolution-coverage.mjs
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const copy = mkdtempSync(join(tmpdir(), 'pokemon-coverage-'))
cpSync(join(root, 'plugin'), copy, { recursive: true })
let output = ''
try {
  output = execFileSync('claude', ['plugin', 'test', copy], {
    encoding: 'utf8',
    maxBuffer: 64 << 20,
    timeout: 15 * 60_000,
  })
} catch (err) {
  // A failing test still printed its line.
  output = `${err.stdout ?? ''}${err.stderr ?? ''}`
} finally {
  rmSync(copy, { recursive: true, force: true })
}

const total = Number(/^COVERAGE-TOTAL\|(\d+)$/m.exec(output)?.[1])
const rows = [...output.matchAll(/^COVERAGE\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|(.*)$/gm)].map(m =>
  m.slice(1),
)
const name = (species, form) =>
  species
    .split('-')
    .map(w => w[0].toUpperCase() + w.slice(1))
    .join(' ') + (form === 'regular' ? '' : ` (${form})`)
const TITLES = {
  level: 'By level',
  fallback: 'By level, where the games need something the plugin has no way to do',
  item: 'Given an item',
  hold: 'Holding an item',
  friendship: 'Friendship (time together)',
  party: 'With a Pokémon in the party',
  shed: 'Shedinja',
}
const passed = rows.filter(r => r[6] === 'ok').length
const lines = [
  '# Evolution coverage',
  '',
  `Generated by \`node scripts/evolution-coverage.mjs\` on ${new Date().toISOString().slice(0, 10)} from the`,
  "every-evolution test, which plays each evolution through the plugin's own commands. Don't edit by hand.",
  '',
  `**${passed} of ${total} evolutions pass.**`,
]
for (const [kind, title] of Object.entries(TITLES)) {
  const mine = rows.filter(r => r[0] === kind)
  if (!mine.length) continue
  lines.push('', `## ${title} (${mine.length})`, '', '| From | To | How | Result |', '| :-- | :-- | :-- | :-- |')
  for (const [, from, fromForm, to, toForm, how, result] of mine)
    lines.push(
      `| ${name(from, fromForm)} | ${name(to, toForm)} | ${how} | ${result === 'ok' ? '✅' : `❌ ${result}`} |`,
    )
}
writeFileSync(join(root, 'specs/evolution-coverage.md'), `${lines.join('\n')}\n`)
console.log(`${rows.length} of ${total} reported, ${rows.length - passed} failed`)
if (!Number.isFinite(total) || rows.length !== total || passed !== total) process.exit(1)
```

- [ ] **Step 4: Run it.** `node scripts/evolution-coverage.mjs`. Expected: `N of N reported, 0 failed`, exit 0,
      and `specs/evolution-coverage.md` lists every path with ✅ (`grep -c '❌' specs/evolution-coverage.md` prints
      `0`). Spot-check five rows against the games: Charmander Lv 16, Dusclops + Reaper Cloth, Pichu friendship,
      Rockruff (night) → Lycanroc (midnight), Nincada → Shedinja.

- [ ] **Step 5: Whole suite and types.** Expected: all pass, `tsc` clean.

- [ ] **Step 6:** No commit.

---

### Task 11: Release 1.3.0: version, CHANGELOG, README, site, every CI check

**Files:**

- Modify: `plugin/.claude-plugin/plugin.json`, `CHANGELOG.md`, `README.md`, `docs/index.html`

- [ ] **Step 1:** `plugin/.claude-plugin/plugin.json`: `"version": "1.3.0"`.

- [ ] **Step 2:** `CHANGELOG.md`: insert above `## [1.2.0] - 2026-10-07`:

```markdown
## [1.3.0] - 2026-10-13

### Added: the PokéMart and Pokédollars

- You earn Pokédollars (₽) from the same work that earns XP, ten times over: ₽20 when Claude finishes a reply, ₽50
  when a test run passes, ₽100 for a commit. It's one wallet: ₽ is earned once per event, not per party member.
  Everyone starts with ₽3,000, as in Pokémon Red and Blue.
- A `🛒 ₽ 1,240` button sits in the band's top-right corner and shows `+₽20` as you earn. Click it to open the
  PokéMart inside the band: four tabs (Stones, Hold items, Special, Other), each item with its description from the
  games, and a "Your party:" line when it would evolve one of yours.
- In the Mart: click an item, then `↑` `↓` to choose, `←` `→` for tabs, `-` `+` or `◀` `▶` for how many, `Max`
  for as many as you can afford, `Enter` or `Buy` to buy, `x` or `✕` to close. `/pokemon mart` opens it too.
- Prices: evolution stones ₽3,000, hold and special items and the Linking Cord ₽5,000, Rare Candy ₽4,800, Soothe
  Bell ₽4,000, Lucky Egg ₽10,000. The Bag holds up to 999 of each.

### Added: the Bag and held items

- `/pokemon bag` lists your items by tab, your ₽, and who holds what.
- `/pokemon give <item> <pokemon>` (either order: `give pikachu thunder stone` works too). A stone, a trade item
  or the Linking Cord evolves the Pokémon at once and is used up. A hold item is held. A Rare Candy raises one
  level. An item that does nothing for that Pokémon is refused, and nothing is used up.
- One held item per Pokémon, as in the games: giving another puts the old one back in the Bag.
  `/pokemon take <pokemon>` puts it back by hand.
- Lucky Egg: its holder earns half as much XP again. Soothe Bell: its holder's time together counts 1.5 times.

### Added: friendship from time together

- Each party member counts the time it spends in your party while Claude Code is open. `/pokemon party` shows it
  (`together 2d 5h`). Friendship evolutions happen at 10 hours together: Pichu, Cleffa, Igglybuff, Togepi, Azurill,
  Budew, Chingling, Munchlax, Riolu, Golbat, Chansey, Buneary, Swadloon, Woobat, Snom, Type: Null, Alolan Meowth,
  and Eevee (Espeon by day, Umbreon by night).
- Time in the PC box, with the party off, or with Claude Code closed doesn't count, and two sessions open at once
  count each minute once.

### Changed

- Evolutions that need an item in the games need that item here: Pikachu a Thunder Stone, Haunter a Linking Cord,
  Onix a Metal Coat, Galarian Slowpoke a Galarica Cuff or Wreath, Sneasel a Razor Claw at night. They used to happen
  at Lv 30.
- The time of day matters where it does in the games: Rockruff becomes Midday Lycanroc by day and Midnight Lycanroc
  at night; Alolan Rattata and Cubone, Galarian Linoone, Amaura and Greavard evolve only at night; Yungoos, Fomantis
  and Tyrunt only by day. Pancham needs a Dark-type party member. Mantyke evolves with a Remoraid in the party, and
  Shedinja joins you when Nincada evolves (into the PC box if the party is full).
- `/pokemon party` says how each Pokémon evolves: `evolves at Lv 36`, `evolves with a Thunder Stone`,
  `evolves with friendship by day (♥ 67%, 3h 18m to go)`.
- The everstone is a held item now. `/pokemon everstone <name>` still gives (or takes back) a free one; giving
  another item replaces it.

### Fixed

- Dusclops, Rhydon, Lampent, Eelektrik, Doublade, Piloswine, Seadra and 10 others no longer evolve twice in a row.
  They reached their stage above Lv 30 and then hit the old Lv 30 rule straight away.
- Baby Pokémon (Pichu, Cleffa, Togepi...) no longer wait until Lv 30.

### Known limitations

- **Esc doesn't close the Mart:** Claude Code keeps Escape to give the keyboard back to the prompt. Use `x` or `✕`.
- **No mouse wheel in the Mart:** scroll with `↑` `↓` or click `▲` / `▼`.
- **17 evolutions keep a level**, because the games tie them to something the plugin has no way to do (a move,
  steps, a battle). They happen at Lv 30, or 10 levels after the Pokémon reached its stage when that's later:
  Mime Jr., Yanma, Piloswine (Lv 43), Aipom, Poipole, Steenee, Lickitung, Clobbopus, Tangela, Bonsly, Stantler,
  Meltan, White-Striped Basculin, Galarian Yamask, Galarian Farfetch'd, Hisuian Qwilfish, and Eevee into Sylveon.
- **Gen 9 items** (Gimmighoul Coin, Syrupy Apple, the Teacups, the Armors, Metal Alloy, Leader's Crest) aren't
  sold: the plugin's Pokémon end at Gen 8.
- Tyrogue's stats, Inkay's upside-down console and Sliggoo's rain are ignored: they evolve by level alone.
```

- [ ] **Step 3:** `README.md`:
  - In "Raise them into legends", replace the paragraph starting `They evolve **at the same level they do in the
games**` with:

```markdown
They evolve **the way they do in the games**: Charmander at Lv 16, Charmeleon at 36. Pikachu needs a Thunder Stone,
Haunter a Linking Cord, Onix a Metal Coat: buy them at the PokéMart and `/pokemon give` them. Pichu, Togepi and
other friendship evolutions come from time together: 10 hours in your party while Claude Code is open. Day and
night matter where they do in the games (Rockruff becomes Midnight Lycanroc at night), and regional forms evolve the
way their region does. You get the classic flashing-silhouette animation and a little _"What? Charmander evolved into
Charmeleon!"_.
```

    and the next paragraph's first sentence becomes `` `/pokemon party` shows how each one evolves, and how long it's
    been with you.``

- Add a section before `## Commands`:

````markdown
## Shop at the PokéMart

Your work earns Pokédollars too, ten for every XP point: **₽20** for a reply, **₽50** for a passing test run,
**₽100** for a commit. You start with ₽3,000. Click **🛒 ₽** in the band's top-right corner (or run
`/pokemon mart`) to open the PokéMart: evolution stones, trade items, the Linking Cord, Rare Candy, a Lucky Egg and
a Soothe Bell, each with its description from the games.

```text
/pokemon give thunder-stone pikachu   Pikachu evolved into Raichu!
/pokemon give lucky-egg eevee         Eevee is now holding a Lucky Egg.
/pokemon bag                          what you have, and who holds what
```
````

A Pokémon holds one item at a time, as in the games. A Lucky Egg earns its holder half as much XP again; a Soothe
Bell makes time together count one and a half times.

````

  - Commands table: add after the `/pokemon everstone` row:

```markdown
| `/pokemon mart`                         | Open the PokéMart in the band (or click 🛒 ₽ in its corner)                                                                                                                         |
| `/pokemon bag`                          | Your items by tab, your ₽, and who holds what                                                                                                                                       |
| `/pokemon give <item> <name>`           | Give an item: a stone or trade item evolves it, a hold item is held, a Rare Candy is one level                                                                                      |
| `/pokemon take <name>`                  | Put its held item back in your Bag                                                                                                                                                  |
````

    and the `/pokemon everstone` row's text becomes `Give (or take back) a free Everstone: it stops that Pokémon's
    evolution`.

- FAQ: add after "Where is my save?":

```markdown
<details>
<summary><b>Why didn't my Pokémon evolve at Lv 30?</b></summary>
<br>
Since 1.3.0, evolutions follow the games: a Pikachu needs a Thunder Stone, a Haunter a Linking Cord, a Pichu
friendship. <code>/pokemon party</code> says what each one needs. Seventeen evolutions that need a move, steps or a
battle in the games still happen by level, at Lv 30 or 10 levels after the Pokémon reached its stage.
</details>
```

- [ ] **Step 4:** `docs/index.html`:
  - In `<section id="levels">`, replace the paragraph `They evolve at the same level as in the games...` with:

```html
<p style="margin-top: 1.25rem">
  They evolve the way they do in the games: Charmander at Lv 16, Pikachu with a Thunder Stone, Pichu with friendship
  from time together, Rockruff into Midnight Lycanroc at night. Regional forms evolve the way their region does, and
  gender matters where it does in the games.
</p>
```

- Add a section between `</section>` of `levels` and `<section id="landscapes">`:

```html
<section id="mart">
  <div class="wrap">
    <h2>Shop at the PokéMart</h2>
    <p class="intro">
      Your work earns Pokédollars as well as XP: ₽20 a reply, ₽50 a passing test run, ₽100 a commit. Click
      <code>🛒 ₽</code> in the band's corner to buy evolution stones, trade items, Rare Candy and more, each with its
      description from the games, then <code>/pokemon give</code> them to your party.
    </p>
  </div>
</section>
```

- In `<ul class="menu">`, add after the `/pokemon everstone` item:

```html
<li><code>/pokemon mart</code><span>Open the PokéMart, or click 🛒 ₽ in the band</span></li>
<li><code>/pokemon bag</code><span>Your items, your ₽, and who holds what</span></li>
<li>
  <code>/pokemon give &lt;item&gt; &lt;name&gt;</code
  ><span>Evolve it with a stone, hold an item, or level up with a Rare Candy</span>
</li>
```

    and the everstone item's text becomes `Give a free Everstone, or take it back`.

- [ ] **Step 5: Every CI check, from the repo root:**

```bash
cd ~/Documents/claude-code-pokemon
npx --yes prettier@3.9.9 --write CHANGELOG.md README.md docs plugin/hooks plugin/tests scripts specs/2026-10-13-*.md
claude plugin validate .
claude plugin validate plugin/.claude-plugin/plugin.json --strict
npx --yes prettier@3.9.9 --check .
```

      then the Tests and Types commands. Expected: both validations pass with no errors, Prettier clean, every test
      passes (the count printed is the new baseline; write it here), `tsc` clean. `--strict` must accept
      `hooks/mart.tsx` and `hooks/shop.tsx` as surface modules; if it flags them, follow its message.

- [ ] **Step 6:** No commit (owner does git).

---

### Task 12: Sync and end-to-end verification (live)

**Files:** none in the repo. Writes `~/.claude/mods/pokemon` (the synced copy) and reads the save file
`~/.claude/plugins/store/pokemon_inline-698ba30487fd.json`.

- [ ] **Step 1: Back up the 1.2.0 save:**
      `cp ~/.claude/plugins/store/pokemon_inline-698ba30487fd.json $S/../pokemon_save_before_1.3.0.json`

- [ ] **Step 2: Sync:**
      `rsync -a --delete --exclude .claude-plugin/types --exclude tsconfig.json ~/Documents/claude-code-pokemon/plugin/ ~/.claude/mods/pokemon/`
      then `diff -rq --exclude=types --exclude=tsconfig.json ~/Documents/claude-code-pokemon/plugin ~/.claude/mods/pokemon`
      prints nothing. The interactive session reloads the mod by itself; `/pokemon party` must answer.

- [ ] **Step 3: Run the live list** in a terminal session with the band showing. Clicks go through computer use on
      the terminal or by the owner. After each case, check the save with `python3 -m json.tool` on the store file.
  1. The party, levels and Pokédex in `/pokemon party` and `/pokedex` match the backup from Step 1; a Pokémon that
     held an everstone shows `· everstone`; `/pokemon bag` shows `Bag · ₽3,000` plus whatever the ledgers earned.
  2. `🛒 ₽` sits in the band's top-right corner; a reply from Claude shows `+₽20` and the total goes up by 20.
  3. A click on the button opens the Mart: four tabs with counts `10 · 18 · 11 · 3`, descriptions from the games, a
     "Your party:" line on an item that evolves a party member. `↑` `↓`, `←` `→`, `-` `+`, `Max` and `▲` / `▼`
     work after a click in the Mart; `x` closes it. A wild Pokémon stepping out closes it too.
  4. Buy a stone the party can use with real ₽: the title bar says `Bought a ... !`, the total drops by ₽3,000,
     `/pokemon bag` lists it. Try to buy more than you can afford: `Not enough ₽: ... more to go.`, nothing
     changes.
  5. `/pokemon give <stone> <name>`: the evolution animation plays, the toast says it evolved, the stone is gone
     from the Bag. Giving the wrong stone is refused and keeps it.
  6. `/pokemon give soothe-bell <name>` then `/pokemon take <name>`: held, then back in the Bag. `/pokemon
everstone <name>` on a holder sends its item back to the Bag.
  7. After a few minutes with the party out, `/pokemon party` shows `together 4m` (or more) and, for a friendship
     Pokémon, its ♥ percentage.
  8. A second session sees the wallet: `claude -p "/pokemon bag"` from another directory shows the same ₽ and
     items.
- [ ] **Step 4:** Any failing case: fix in `~/Documents/claude-code-pokemon/plugin`, re-run Task 11 Step 5, re-sync,
      and run the whole list again.

- [ ] **Step 5: Restore what the checks changed** only if the owner asks: the backup from Step 1 holds the
      pre-1.3.0 save.

- [ ] **Step 6:** No commit (owner does git).
