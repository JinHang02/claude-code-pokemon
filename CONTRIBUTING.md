# Contributing

Thanks for wanting to make the journey better. Bug reports, ideas and pull requests are all welcome.

## Getting set up

You need Claude Code 2.1.287 or newer and Node.js (for formatting and type-checking).

```bash
git clone https://github.com/JinHang02/claude-code-pokemon
cd claude-code-pokemon
claude --plugin-dir plugin
```

That loads the plugin from your clone. In an interactive session Claude Code watches the folder and reloads the plugin whenever you save a file, so you see changes within a second.

`/pokemon-play <animation>` plays any animation on demand (`hop`, `cheer`, `faint`, `sleep`, `squash`, `work`, `clones`, `push`, `boulder`, `boxes`, `confused`, `evolve`, `wild`, `day`, `dusk`, `night`, `dawn`), which is the fastest way to check visual changes.

## Before you open a pull request

```bash
claude plugin validate plugin/.claude-plugin/plugin.json --strict   # manifest and hooks checks
claude plugin test plugin       # the test suite
npx prettier@3.9.9 --check .    # formatting (use --write to fix)
```

To type-check, load the plugin once with `claude --plugin-dir plugin` (Claude Code then writes its type definitions into `plugin/.claude-plugin/types/` and a `plugin/tsconfig.json`), then run:

```bash
npx -p typescript@5 tsc -p plugin
```

CI runs validation, the tests and the formatting check on every push and pull request. It doesn't type-check, so run `tsc` yourself.

## Where things live

| File                               | What it does                                                                                                                                                                                                                                              |
| :--------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plugin/hooks/register.tsx`        | Wires Claude Code events to everything else: the commands and their replies, reactions and XP, saving and syncing with other windows, wild visitors and Poké Balls, the PokéMart, giving items, evolutions and their screen, the frame timer and the band |
| `plugin/hooks/scene.ts`            | The animation: roaming, moods, particles, clones, wild visitors, day and night                                                                                                                                                                            |
| `plugin/hooks/moments.ts`          | The smaller reactions' pictures: the push's Pidgey and letter, the boulder, the boxes, the confused "?!"                                                                                                                                                  |
| `plugin/hooks/sprite.ts`           | Parses the ANSI sprites, scales them and turns pixels into terminal cells                                                                                                                                                                                 |
| `plugin/hooks/save.ts`             | The save's shape and loading, names as the games spell them, levels and XP, ₽ and the ledgers, the Pokédex, the Bag, time together; the text of `/pokemon party`, `box` (30 a page), `bag` and `/pokedex`, fitted to narrow terminals                     |
| `plugin/hooks/members.ts`          | Finds the party and PC box members a name fits (with `shiny`, `lv <n>` and a number), the numbered list among several and its ways to narrow it, and `box <name>`                                                                                         |
| `plugin/hooks/lookup.ts`           | Finds a Pokémon and form, or an item, from what you typed                                                                                                                                                                                                 |
| `plugin/hooks/evolution.ts`        | Reads every way to evolve from PokeAPI's evolution chains (level, stone, trade item, friendship, time of day, gender, party, Shedinja) and decides which is due                                                                                           |
| `plugin/hooks/evolution-screen.ts` | The evolution screen's frames: its phases over about ten seconds, the three styles, the text box and its message                                                                                                                                          |
| `plugin/hooks/evolution-style.ts`  | The three styles' names (`rays`, `white`, `gradient`), shared by the save, the commands and the screen                                                                                                                                                    |
| `plugin/hooks/reactions.ts`        | Decides what counts as a passing test, a failure, a commit, a push, an install or a merge conflict, from what Claude runs                                                                                                                                 |
| `plugin/hooks/backdrop.ts`         | The 20 landscapes and which one shows each hour                                                                                                                                                                                                           |
| `plugin/hooks/encounter.ts`        | Which wild Pokémon steps out: catch-rate odds, then landscape, hour and Pokédex weights; which forms never come wild                                                                                                                                      |
| `plugin/hooks/species-data.ts`     | Generated catch rates, stages and types per species (`node scripts/species-data.mjs`); don't edit by hand                                                                                                                                                 |
| `plugin/hooks/catch.ts`            | Throwing a Poké Ball: the arc, hit test, wobbles and the catch odds                                                                                                                                                                                       |
| `plugin/hooks/aim.tsx`             | The band drawn as clickable text while a wild Pokémon can be aimed at                                                                                                                                                                                     |
| `plugin/hooks/items.ts`            | The PokéMart's stock: item names, prices, descriptions and what each does                                                                                                                                                                                 |
| `plugin/hooks/item-icons.ts`       | Generated item pictures (`node scripts/item-icons.mjs`); don't edit by hand                                                                                                                                                                               |
| `plugin/hooks/mart.tsx`            | The PokéMart drawn in the band, its clicks and keys, fitted from 40 columns                                                                                                                                                                               |
| `plugin/hooks/shop.tsx`            | The band's corner wallet button that opens the PokéMart                                                                                                                                                                                                   |
| `plugin/hooks/spinner.ts`          | The Pokémon spinner words and the closing line                                                                                                                                                                                                            |
| `plugin/hooks/hooks.json`          | Lists the hooks module, `register.tsx`                                                                                                                                                                                                                    |
| `plugin/tests/world.tsx`           | The tests' fake engine, network and store; `KIT` is the timeout for a test that starts a session                                                                                                                                                          |
| `scripts/*.mjs`                    | Maintainer tools: regenerate the item pictures, species data, evolution fixture and coverage list                                                                                                                                                         |

Two rules in `register.tsx` to keep when you add a command or a change to the save:

- **Every save write goes through `mutate` (and its `writeSave`),** which reads the save again just before writing and makes the change again on what another window wrote meanwhile. So a change function must only read the save it's given and return a new one: it can run more than once, and anything else it does would happen twice.
- **Every command answers in time.** Claude Code gives a command ten seconds, then drops its answer, and after a few overruns it unloads the plugin. `promptly` wraps all three commands: one still busy after 6 s (`COMMAND_MS`) answers "Still working on it…" and toasts what it did later (a list toasts that it's ready to run again). That "run it again" is only for read-only commands, the lists: a command that changes the save must answer within the limit or, when late, say in one line what it did, so nobody repeats a change that already went through. A command that waits on an evolution also races it against 1 s (`ANSWER_MS`, in `answerSoon`), so it never sits behind screens and downloads. Keep a new command inside `promptly`.

The every-evolution test plays all 515 evolution paths; it prints its report lines only when `node scripts/evolution-coverage.mjs` runs it (through `plugin/tests/coverage-run.ts`).

## Guidelines

- **Keep it light.** The plugin draws 20 frames a second inside someone's coding session. Measure anything that runs per frame, and keep network work in the background.
- **Test behaviour, not pixels.** The scene functions are pure, so most changes can be tested by stepping the state and checking a few pixels. `plugin/tests/scene.test.ts` has plenty of examples.
- **Match the existing style.** Prettier handles formatting. Comments say what code can't: a constraint, a unit, a reason.
- **One change per pull request**, with a short description of what changed and why. For visual changes, a GIF or screenshot helps a lot.

## Reporting bugs

Open an issue with your Claude Code version (`claude --version`), your terminal, what you expected and what happened. A screenshot of the band is worth a thousand words.
