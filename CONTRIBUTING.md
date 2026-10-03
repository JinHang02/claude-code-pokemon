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

`/pokemon-play <animation>` plays any animation on demand (`hop`, `cheer`, `faint`, `sleep`, `squash`, `work`, `clones`, `evolve`, `wild`, `day`, `dusk`, `night`, `dawn`), which is the fastest way to check visual changes.

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

CI runs validation, the tests and the formatting check on every push and pull request.

## Where things live

| File                        | What it does                                                                        |
| :-------------------------- | :---------------------------------------------------------------------------------- |
| `plugin/hooks/register.tsx` | Wires Claude Code events to the scene: commands, reactions, saving, the frame timer |
| `plugin/hooks/scene.ts`     | The animation: roaming, moods, particles, clones, wild visitors, day and night      |
| `plugin/hooks/sprite.ts`    | Parses the ANSI sprites, scales them and turns pixels into terminal cells           |
| `plugin/hooks/save.ts`      | Party, levels, XP, the Pokédex and the saved settings                               |
| `plugin/hooks/reactions.ts` | Decides what counts as a passing test, a failure or a commit                        |
| `plugin/hooks/evolution.ts` | Reads evolution levels from PokeAPI's evolution chains                              |
| `plugin/hooks/lookup.ts`    | Finds a Pokémon and form from what you typed                                        |
| `plugin/hooks/backdrop.ts`  | The 20 landscapes and which one shows each hour                                     |
| `plugin/hooks/spinner.ts`   | The Pokémon spinner words and the closing line                                      |

## Guidelines

- **Keep it light.** The plugin draws 20 frames a second inside someone's coding session. Measure anything that runs per frame, and keep network work in the background.
- **Test behaviour, not pixels.** The scene functions are pure, so most changes can be tested by stepping the state and checking a few pixels. `plugin/tests/scene.test.ts` has plenty of examples.
- **Match the existing style.** Prettier handles formatting. Comments say what code can't: a constraint, a unit, a reason.
- **One change per pull request**, with a short description of what changed and why. For visual changes, a GIF or screenshot helps a lot.

## Reporting bugs

Open an issue with your Claude Code version (`claude --version`), your terminal, what you expected and what happened. A screenshot of the band is worth a thousand words.
