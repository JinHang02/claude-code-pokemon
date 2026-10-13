# PokéMart, items and evolutions that follow the games: design

Date: 2026-10-13 · Target release: 1.3.0 · Status: spec approved 2026-10-13

## Goal

Every evolution the plugin can show happens the way the games do it. Today 136 of the 510 evolution paths among the
plugin's 905 species have no level in the games, and the plugin puts all of them at Lv 30 (or at a sibling branch's
level). That makes 17 Pokémon evolve twice in a row (Dusclops is reached at Lv 37 and becomes Dusknoir at Lv 30),
and baby Pokémon wait until Lv 30.

The fix: you earn Pokédollars (₽) from your work, buy evolution items in a PokéMart opened from a button in the band,
and give them to your Pokémon. Friendship evolutions come from time spent together. The few evolutions the plugin
can't reproduce keep a level, chosen so that no Pokémon evolves twice in a row.

The evolution animation (a full-band "What? CHARMANDER is evolving!" scene) is a separate, later design. This
release keeps the current animation.

## Decisions (from the brainstorm)

| Question        | Decision                                                                                                                |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Currency        | Pokédollars, shown `₽`. Not "coins": in the games those are Game Corner tokens.                                         |
| Earning         | The events that give XP, ×10: reply ₽20, tests pass ₽50, commit ₽100. Once per event, into one wallet (not per member). |
| Starting money  | ₽3,000, as in Pokémon Red/Blue. Existing saves get it too.                                                              |
| Entry point     | A `🛒 ₽ 1,240` button in the band's top-right corner. A click opens the Mart inside the band.                           |
| Mart layout     | Classic PokéMart (mockup v4): tabs, item list on the left, details on the right, quantity picker, Buy.                  |
| Item text       | The games' own descriptions. A "Your party:" line only when the item would evolve a party member.                       |
| Quantity        | `◀ ×n ▶ Max`. The Bag holds at most 999 of an item, as in the games.                                                    |
| Commands        | `/pokemon bag`, `/pokemon give <item> <pokemon>` (either order), `/pokemon take <pokemon>`. No separate `use`.          |
| Held items      | One per Pokémon, as in the games. Giving another puts the old one back in the Bag.                                      |
| Friendship      | Time together: active time in the party while Claude Code is open. Evolves at 10 h. Soothe Bell: 1.5× faster.           |
| Extra items     | Rare Candy (+1 level), Lucky Egg (held: +50% XP), Soothe Bell (held: friendship time ×1.5).                             |
| Can't reproduce | A level: at least 10 above the level the Pokémon was reached at, and never below 30.                                    |
| Animation       | Unchanged in this release.                                                                                              |

## 1. Evolution rules

### 1.1 How each path evolves

The rules come from PokeAPI's `evolution_details` (already fetched and cached per chain). A path can have several
details (one per game); the plugin uses the first that matches in this order:

1. **Level** (`min_level` set): at that level, as today. Also honoured, newly:
   - `time_of_day`: the band's own phase (`backdrop.ts` `phaseAt`). Rockruff becomes Midday Lycanroc by day,
     Midnight by night and Dusk at dusk. Alolan Rattata, Cubone and Galarian Linoone evolve only at night; Yungoos,
     Fomantis and Tyrunt only by day; Amaura and Greavard only at night. Outside the window they wait, and evolve on
     the first check inside it.
   - `party_type`: Pancham needs a Dark-type party member.
   - Ignored as today: Tyrogue's stats, Inkay's upside-down console, Sliggoo's rain. They evolve by level alone.
2. **Item** (`use-item`, a `held_item`, or a trade): see 1.2.
3. **Friendship** (`min_happiness` / `min_affection`): see 1.3. `time_of_day` is honoured (Espeon by day, Umbreon by
   night).
4. **Special:**
   - Shedinja: when Nincada evolves into Ninjask and the party has room, a Shedinja joins the party; with no room it
     goes to the PC box. Poké Balls are unlimited in the plugin, so none is needed.
   - Mantyke: evolves at its next level-up with a Remoraid in the party.
5. **Level fallback** for the 17 paths with no workable mechanic: `max(30, reached + 10)`, where `reached` is the
   level at which the Pokémon's own species is reached: its pre-evolution's level, the fallback itself for a
   fallback, or 1 for a first stage. The 17 are 10 that need a known move (Mime Jr., Yanma, Piloswine, Aipom,
   Poipole, Steenee, Lickitung, Clobbopus, Tangela, Bonsly), plus Stantler, Meltan, White-Striped Basculin,
   Galarian Yamask, Galarian Farfetch'd, Hisuian Qwilfish, and Eevee → Sylveon. Sylveon also needs a Fairy-type move,
   so friendship alone can't pick it over Espeon or Umbreon.

A path that is both item and level (e.g. regular Darumaka by level, Galarian by Ice Stone) is decided per form, as
today (`nextStages` already picks the ways for the member's form).

`OTHER_EVOLVE_LEVEL` and the "sibling branch's level" rule go away.

### 1.2 Items

| Kind                  | Examples                                                                                                                                                                    | What `give` does                                                                                              |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Evolution stones      | Fire, Water, Thunder, Leaf, Ice, Moon, Sun, Shiny, Dusk, Dawn                                                                                                               | Evolves now. The stone is used up. Refused if it does nothing for that Pokémon.                               |
| Used-up special items | Tart / Sweet Apple, Cracked / Chipped Pot, Galarica Cuff / Wreath, Scrolls, Peat Block, Black Augurite                                                                      | Same as stones. Peat Block only at night (Ursaluna).                                                          |
| Linking Cord          | (Legends: Arceus) stands in for a plain trade                                                                                                                               | Evolves now: Kadabra, Machoke, Graveler, Haunter, Boldore, Gurdurr, Phantump, Pumpkaboo, Karrablast, Shelmet. |
| Trade hold items      | Metal Coat, King's Rock, Dragon Scale, Up-Grade, Dubious Disc, Protector, Electirizer, Magmarizer, Reaper Cloth, Deep Sea Tooth / Scale, Prism Scale, Sachet, Whipped Dream | Evolves now, as if traded while holding it. The item is used up.                                              |
| Level-up hold items   | Razor Claw (night: Weavile; day: Hisuian Sneasel → Sneasler), Razor Fang (night), Oval Stone (day), Strawberry Sweet                                                        | Held. Evolves at its next level-up when the time of day matches. Then the item is used up.                    |
| Other hold items      | Everstone, Lucky Egg, Soothe Bell                                                                                                                                           | Held until taken back or replaced.                                                                            |
| Rare Candy            |                                                                                                                                                                             | +1 level (XP set to the next level's threshold), then the usual evolution check. Refused at Lv 100.           |

- A trade or stone item given to a Pokémon it does nothing for is refused, and nothing is used up: "Pikachu can't use
  a Fire Stone." A Pokémon given a level-up hold item it can't use just holds it, as in the games.
- An Everstone stops level, friendship and level-up-item evolutions. Stones, trade items and the Linking Cord still
  work while it holds one, as in the games: giving one is a deliberate choice.
- A branching Pokémon gets the branch for the item: Eevee + Thunder Stone → Jolteon, Gloom + Sun Stone → Bellossom.
- Regional forms follow `evolvedForm` as today: Alolan Vulpix + Ice Stone → Alolan Ninetales.

### 1.3 Friendship: time together

- Each party member has `togetherMs`: time spent in the party while at least one Claude Code session is open and the
  party is on (not `/pokemon off`). Time in the PC box doesn't count.
- Counting: every session adds time on a 60 s heartbeat, under the save lock, from a shared `togetherAt` stamp in the
  save: `add = min(now - togetherAt, 120 s)`, then `togetherAt = now`. Two open sessions share one stamp, so one real
  minute counts once. A session closed for the weekend adds nothing: the gap is capped.
- With a Soothe Bell held, that member's share counts ×1.5.
- A friendship evolution happens when `togetherMs ≥ 10 h` (36,000,000 ms), checked on the heartbeat, honouring
  `time_of_day`. It keeps counting after evolving: the time stays as a stat.
- `togetherMs` survives deposit and withdraw, and stays through evolution, like XP.
- Shown in `/pokemon party` from the largest non-zero unit: `together 1y 3d 2h 7m`, plus
  `♥ 67% to evolve (3h 17m left)` while a friendship evolution is pending.

### 1.4 What `/pokemon party` says about evolving

Each member's line names its next step instead of only a level: `evolves at Lv 36`, `evolves with a Thunder Stone`,
`♥ 67% to evolve`, `evolves at Lv 40 (night)`, `evolves at Lv 43`. The fallback isn't labelled as such.

## 2. Money and the Bag

### 2.1 Save changes (`save.ts`)

```ts
export type Member = {
  // ...as today, minus hasEverstone...
  heldItem?: ItemId
  togetherMs?: number
}
export type Save = {
  // ...as today...
  bag?: Partial<Record<ItemId, number>> // 1..999 each; absent means none
  spent?: number // ₽ spent, ever
  togetherAt?: number
}
```

- **₽ earned** goes through the same per-session ledger as XP (`Ledger` gains `money: number`), so two sessions never
  lose each other's earnings. Folding works as it does for XP.
- **Balance** = `3000 + earned (save + unfolded ledgers) - spent`. A purchase checks the balance and adds to `spent`
  and `bag` in one `mutate`, so two windows can't spend the same ₽ twice.
- **Migration on load:**
  - `hasEverstone: true` becomes `heldItem: 'everstone'`.
  - Every cached `evolveAt` is dropped once (a save without `rulesVersion: 2` gets it cleared), so members cached with
    the old Lv 30 fallback are looked up again.
  - Older saves start with ₽3,000 and an empty Bag.
- `loadSave` keeps its strictness: an unknown item id or a count outside 1..999 is dropped, never trusted.

### 2.2 Earning

`earn($, amount)` already runs per event. It also adds `amount × 10` ₽ to the session ledger, once per call (not per
member). The band's button briefly shows `+₽20`. A Lucky Egg adds 50% XP for its holder only; ₽ is unaffected.

### 2.3 Prices

| Item                                                       | Price               |
| ---------------------------------------------------------- | ------------------- |
| Evolution stones                                           | ₽3,000 (game price) |
| Trade and level-up hold items, special items, Linking Cord | ₽5,000              |
| Rare Candy                                                 | ₽4,800 (game price) |
| Soothe Bell                                                | ₽4,000              |
| Lucky Egg                                                  | ₽10,000             |

At the current pace (about 200–250 XP a day, so ₽2,000–2,500), a stone takes about a day and a half. No selling back.

## 3. The catalogue (`items.ts`, new)

A static, bundled table of the 42 items: id, game name, tab, price, kind (1.2), and the games' description. Nothing
is fetched at runtime: Serebii's text can't be fetched by the plugin, and the table must work offline.

| Tab        | Items                                                                                                                                                                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stones     | Fire, Water, Thunder, Leaf, Ice, Moon, Sun, Shiny, Dusk, Dawn Stone (10)                                                                                                                                                                       |
| Hold items | Metal Coat, King's Rock, Dragon Scale, Up-Grade, Dubious Disc, Protector, Electirizer, Magmarizer, Reaper Cloth, Deep Sea Tooth, Deep Sea Scale, Prism Scale, Sachet, Whipped Dream, Razor Claw, Razor Fang, Oval Stone, Strawberry Sweet (18) |
| Special    | Linking Cord, Tart Apple, Sweet Apple, Cracked Pot, Chipped Pot, Galarica Cuff, Galarica Wreath, Black Augurite, Peat Block, Scroll of Darkness, Scroll of Waters (11)                                                                         |
| Other      | Rare Candy, Lucky Egg, Soothe Bell (3) · Everstone is not sold: `/pokemon everstone` stays free                                                                                                                                                |

Descriptions: PokeAPI's latest English flavour text (Sword/Shield) where it has one, Serebii's (Scarlet/Violet,
Legends: Arceus) for the rest. Lucky Egg and Soothe Bell drop the words about battles: "earns the holder extra XP as
you work together", "making it friendly faster".

Left out because the plugin's species list ends at Gen 8 (905): Gimmighoul Coin, Syrupy Apple, both Teacups, both
Armors, Metal Alloy, Leader's Crest. Adding Gen 9 species later means adding these back.

Item icons: the PokeAPI item sprites (a 30×30 PNG each; 30 of the 42 exist) are converted to the plugin's pixel text
at build time and bundled. The 12 without one (Linking Cord, Strawberry Sweet, Tart and Sweet Apple, both Pots, both
Galarica items, Black Augurite, Peat Block, both Scrolls) show a generic Bag icon.

## 4. On screen

### 4.1 The button

- Drawn in the band's top-right corner: `🛒 ₽ 1,240`, gold on dark. On earning, `+₽20` shows under it for 1.2 s.
- Clickable. The catching design found that a click layer over the pixel art stalls the terminal, so the button is
  its own small `Client` element beside the `Raster`, not over it. **Task 1 of the plan is a 30-minute probe** that
  checks this in a real terminal. If the probe shows a stall, the fallback is `/pokemon mart`, which opens the same
  Mart, and the corner shows the balance without being clickable.
- Hidden while the party is off, and while a wild Pokémon can be aimed at (the band is a click layer then anyway).

### 4.2 The Mart

As mockup v4 (`.superpowers/brainstorm/.../mart-interactive-v4.html`):

- Replaces the band's scene while open, at the band's own height. Title bar: `POKé MART`, the last message, `₽` and `✕`.
- Tabs `Stones 10 · Hold items 18 · Special 11 · Other 3`.
- The list shows as many rows as fit, with `▲ n above` / `▼ n more`.
- Details: icon, name, `in bag: n`, the game description (at most 3 lines), `Your party: Pikachu → Raichu` when it
  applies, then `◀ ×n ▶ Max` and `Buy ₽n`.
- Messages: "Bought 3 × Fire Stone!", "Not enough ₽: 1,240 more to go.", "Your Bag can't hold more Rare Candy."
- Keys while open: `↑` `↓` select, `←` `→` tab, `-` `+` quantity, `Enter` buy, `Esc` close. The mouse wheel
  scrolls the list. A click works on every control. The quantity goes back to 1 when the selection changes.
- The Mart closes by itself when a wild Pokémon steps out, so it can't block a catch, and when the party goes off.

### 4.3 Commands

```
/pokemon bag                           the Bag by tab, ₽, and who holds what
/pokemon give <item> <pokemon>         either order; item names as the games spell them, spaces or hyphens
/pokemon take <pokemon>                its held item back to the Bag
/pokemon mart                          opens the Mart (also the fallback for 4.1)
/pokemon everstone <name>              unchanged for users: gives or takes back a free Everstone
```

A close miss gets a suggestion, as names do today. The help line and the README's command table list the new
commands.

## 5. Testing

### 5.1 Unit tests

- `evolution.test.ts`: every rule in 1.1, the fallback formula (Dusclops no longer evolves twice; Piloswine → Lv 43),
  time of day, Pancham's party type, Shedinja, Mantyke, item-by-branch (Eevee).
- `save.test.ts`: migration (everstone, `evolveAt` reset, ₽3,000), `bag` limits, ₽ ledgers across two sessions,
  `togetherMs` heartbeat capping and the no-double-count rule.
- `commands.test.tsx`: `bag`, `give` (both orders, refusals, held-item swap), `take`, `mart`, buying.

### 5.2 Coverage test

A test loads a fixture with every PokeAPI evolution chain and the plugin's species list
(`plugin/tests/fixtures/evolutions.json`, made by a script in `plugin/scripts/`, committed, refreshed when PokeAPI
changes), and fails if any path between two plugin species has no rule from 1.1. A new game's evolution fails the
build until someone decides how it works.

### 5.3 End-to-end: every Pokémon

After the implementation, one data-driven test runs the plugin as `commands.test.tsx` does (real hooks, mocked
network from the fixture, mocked clock) for **every species and form in the list that evolves**. For each path:

1. Summon the Pokémon in that form into the party (the right gender when the path needs one).
2. Trigger it the way 1.1 says: XP to the level (at the right time of day), `give` the item, advance time together
   to 10 h, or set up the party (Remoraid, a Dark type, room for Shedinja).
3. Assert the party member is the expected species and form, the item was used up or kept as 1.2 says, and the
   Pokédex counts the new species as seen.
4. For level paths, also assert it did **not** evolve one level earlier, and that no Pokémon evolves twice in one
   check.

### 5.4 The checklist file

The end-to-end run writes `specs/evolution-coverage.md`: one row per path, grouped by mechanism, with columns
`From (form) · To (form) · How · Result`. Every row must say ✅ before release. The coverage test compares the file's
rows with the fixture, so a Pokémon missing from the list fails the build. The file is regenerated, never edited by
hand.

## 6. Release (1.3.0)

- `CHANGELOG.md`: Added (Mart, ₽, Bag, `give`/`take`/`bag`/`mart`, friendship time), Changed (non-level evolutions,
  time of day), Fixed (Dusclops and the 16 other double evolutions, babies waiting until Lv 30).
- README: a "Shop at the PokéMart" section, the command table, the FAQ entry on evolution levels.
- `docs/index.html`: the Mart, as the catching release did.
- `plugin.json` and `marketplace.json`: 1.3.0.

## Out of scope

- The full-band evolution animation (next design).
- Gen 9 species and their items.
- Poké Ball types (Great Ball, Ultra Ball) and limited balls.
- Selling items, and Alcremie's other six Sweets (it becomes plain Alcremie).
- Moves, steps and battle events: the 17 fallback paths stay on a level.
