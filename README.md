<div align="center">

<img src="https://raw.githubusercontent.com/JinHang02/claude-code-pokemon/assets/hero.gif" width="660" alt="Pikachu, Charmander and Squirtle journeying through a pixel world above the Claude Code prompt, running while Claude works and cheering with confetti">

# Pokémon Journey for Claude Code

**Gotta code 'em all.**

Your Pokémon journey through a tiny pixel world right above your Claude Code prompt.<br>
They run while Claude works, cheer when your tests pass, faint when they fail,<br>
and evolve as you ship.

[![Claude Code plugin](https://img.shields.io/badge/Claude_Code-plugin-d97757?style=flat-square)](https://code.claude.com/docs/en/plugins)
[![MIT license](https://img.shields.io/badge/license-MIT-3fd1ff?style=flat-square)](LICENSE)
[![CI](https://github.com/JinHang02/claude-code-pokemon/actions/workflows/ci.yml/badge.svg)](https://github.com/JinHang02/claude-code-pokemon/actions/workflows/ci.yml)
[![122 tests](https://img.shields.io/badge/tests-122_passing-27c93f?style=flat-square)](tests)
[![905 Pokémon](https://img.shields.io/badge/Pok%C3%A9mon-905-ffd23f?style=flat-square)](#gotta-see-em-all)

[Install](#install) · [What they do](#they-react-to-your-work) · [Level up & evolve](#raise-them-into-legends) · [Landscapes](#day-night-and-20-landscapes) · [Commands](#commands) · [FAQ](#faq)

</div>

---

## Install

Two commands inside Claude Code:

```text
/plugin marketplace add JinHang02/claude-code-pokemon
/plugin install pokemon@claude-code-pokemon
```

Start a new session and a wild Pokémon will be waiting above your prompt. Want a specific partner?

```text
/pokemon pikachu
```

> **Works on** macOS, Linux and Windows. **Needs** Claude Code **2.1.287 or newer** and a terminal with 24-bit color (iTerm2, Ghostty, kitty, WezTerm, Windows Terminal, the VS Code / Cursor terminal...). It's built on Claude Code's early-access plugin hooks, which Anthropic is still rolling out: if your party never shows up, they aren't switched on for you yet, and a future Claude Code update could change how it behaves.

---

## They react to your work

Nothing to configure. Your party watches what Claude is doing and reacts on its own.

<table>
<tr>
<td align="center" width="50%"><img src="https://raw.githubusercontent.com/JinHang02/claude-code-pokemon/assets/working.gif" width="360" alt="Pikachu running with a thought bubble"><br><b>Claude is working</b><br>A thought bubble pops up over your lead while the party hurries about.</td>
<td align="center" width="50%"><img src="https://raw.githubusercontent.com/JinHang02/claude-code-pokemon/assets/hop.gif" width="280" alt="Pikachu crouching and hopping"><br><b>Claude finishes a reply</b><br>A double hop with a spin. Your cue that it's your turn.</td>
</tr>
<tr>
<td align="center"><img src="https://raw.githubusercontent.com/JinHang02/claude-code-pokemon/assets/cheer.gif" width="280" alt="Pikachu hopping in a burst of confetti"><br><b>Tests pass · a commit lands</b><br>Confetti. Lots of it.</td>
<td align="center"><img src="https://raw.githubusercontent.com/JinHang02/claude-code-pokemon/assets/faint.gif" width="280" alt="Charmander shuddering and sinking into the grass"><br><b>Tests or a build fail</b><br>A battle-style faint: shudder, sink, a beat of silence, back up.</td>
</tr>
<tr>
<td align="center"><img src="https://raw.githubusercontent.com/JinHang02/claude-code-pokemon/assets/squash.gif" width="280" alt="Squirtle squashing flat and springing back"><br><b>Context gets compacted</b><br>Squashed flat for as long as <code>/compact</code> runs, then <i>boing</i>.</td>
<td align="center"><img src="https://raw.githubusercontent.com/JinHang02/claude-code-pokemon/assets/clones.gif" width="450" alt="Small Pikachu clones following the leader"><br><b>Claude launches subagents</b><br>A little clone pops out of the grass for each one and follows along.</td>
</tr>
<tr>
<td align="center" colspan="2"><img src="https://raw.githubusercontent.com/JinHang02/claude-code-pokemon/assets/sleep.gif" width="280" alt="Eevee dozing with floating Zs"><br><b>Nothing happens for 5 minutes</b><br>They doze off. Do anything and they wake right up.</td>
</tr>
</table>

Between all that they just live their lives: short strolls in any direction, stopping for a moment, looking around, changing their minds halfway, skipping in place.

Only real failures make them faint. A `grep` that finds nothing isn't a failure, so a plain command has to fail three times in a row before anyone keels over.

Even Claude Code's spinner joins in. While Claude works it says something Pokémon (its tip line, task list and token count stay just as they are), and the turn closes with a Poké Ball:

```text
✻ Searching tall grass… (17m 46s · ↓ 12.3k tokens · thinking with xhigh effort)
◓ Caught for 18m 2s
```

---

## Raise them into legends

Every Pokémon in your party earns experience from the work you and Claude get done:

| What happens                                                         |      XP |
| :------------------------------------------------------------------- | ------: |
| Claude finishes a reply                                              |  **+2** |
| A test run passes (`pytest`, `npm test`, `go test`, `cargo test`...) |  **+5** |
| A commit goes through                                                | **+10** |

<img src="https://raw.githubusercontent.com/JinHang02/claude-code-pokemon/assets/evolve.gif" width="280" align="right" alt="Charmander evolving into Charmeleon in flashing white silhouettes">

They evolve **at the same level they do in the games**: Charmander at 16, Charmeleon at 36, Dratini at 30, Larvitar at 30. Evolutions that need a stone, a trade or friendship (Pikachu, every Eevee evolution) happen at **Lv 30**, or alongside a branch that evolves by level (Slowpoke becomes Slowbro or Slowking at 37). Regional forms evolve the way their region does: a Galarian Meowth becomes Perrserker. You get the classic flashing-silhouette animation and a little _"What? Charmander evolved into Charmeleon!"_.

`/pokemon party` shows when each one evolves. Branching lines pick a branch for you, so your Eevee could become any of its eight evolutions.

Love your Pikachu just the way it is? Give it an everstone:

```text
/pokemon everstone pikachu
```

<br clear="right">

---

## Gotta see 'em all

**905 Pokémon**, Bulbasaur to Enamorus, plus **424 alternate forms**: Megas, Gigantamax, Alolan, Galarian, Hisuian and more. Any of them can show up **shiny** ✨ (1 in 32).

<img src="https://raw.githubusercontent.com/JinHang02/claude-code-pokemon/assets/wild.gif" width="400" alt="Tall grass rustles, a wild Bulbasaur steps out, and Pikachu and Eevee jump and turn to it with a red ! speech bubble">

Every 10 to 20 minutes **a wild Pokémon wanders through**. The tall grass rustles at the edge, your party jumps and turns to it with a red **!** speech bubble, and Claude Code tells you who it is: _"A wild Bulbasaur appeared!"_. It stops halfway to look around, then moves on. Everything you meet goes into your Pokédex:

```text
/pokedex

Pokédex: 37 / 905 seen · 2 shiny
  Gen 1  █░░░░░░░░░  21/151
  Gen 2  █░░░░░░░░░  9/100
  Gen 3  ░░░░░░░░░░  4/135
  ...
Shinies: Pikachu, Granbull
Recently seen: Bulbasaur, Golurk, Eevee, Charmander
```

Build a **party of up to three** and they'll travel together:

```text
/pokemon add charmander
/pokemon add alolan vulpix
/pokemon party
```

---

## Day, night and 20 landscapes

The meadow follows your local clock: a rising sun at dawn, drifting clouds by day, a setting sun at dusk, then stars, a crescent moon and fireflies after dark. And every hour your party wanders somewhere new: an open **meadow**, rolling **hills**, snowy **mountains**, a shimmering **lake** or the edge of a **forest**. Every session you have open shows the same place.

<p align="center">
<img src="https://raw.githubusercontent.com/JinHang02/claude-code-pokemon/assets/dusk.gif" width="400" alt="A shiny Pikachu and Charmander on the hills at dusk">
<img src="https://raw.githubusercontent.com/JinHang02/claude-code-pokemon/assets/night.gif" width="400" alt="Pikachu and Eevee by a moonlit lake with fireflies">
</p>

<table>
<tr><th></th><th>Meadow</th><th>Hills</th><th>Mountains</th><th>Lake</th><th>Forest</th></tr>
<tr><th>Dawn</th><td><img src="https://raw.githubusercontent.com/JinHang02/claude-code-pokemon/assets/landscapes/dawn-meadow.png" width="170" alt="Dawn meadow"></td><td><img src="https://raw.githubusercontent.com/JinHang02/claude-code-pokemon/assets/landscapes/dawn-hills.png" width="170" alt="Dawn hills"></td><td><img src="https://raw.githubusercontent.com/JinHang02/claude-code-pokemon/assets/landscapes/dawn-mountains.png" width="170" alt="Dawn mountains"></td><td><img src="https://raw.githubusercontent.com/JinHang02/claude-code-pokemon/assets/landscapes/dawn-lake.png" width="170" alt="Dawn lake"></td><td><img src="https://raw.githubusercontent.com/JinHang02/claude-code-pokemon/assets/landscapes/dawn-forest.png" width="170" alt="Dawn forest"></td></tr>
<tr><th>Day</th><td><img src="https://raw.githubusercontent.com/JinHang02/claude-code-pokemon/assets/landscapes/day-meadow.png" width="170" alt="Day meadow"></td><td><img src="https://raw.githubusercontent.com/JinHang02/claude-code-pokemon/assets/landscapes/day-hills.png" width="170" alt="Day hills"></td><td><img src="https://raw.githubusercontent.com/JinHang02/claude-code-pokemon/assets/landscapes/day-mountains.png" width="170" alt="Day mountains"></td><td><img src="https://raw.githubusercontent.com/JinHang02/claude-code-pokemon/assets/landscapes/day-lake.png" width="170" alt="Day lake"></td><td><img src="https://raw.githubusercontent.com/JinHang02/claude-code-pokemon/assets/landscapes/day-forest.png" width="170" alt="Day forest"></td></tr>
<tr><th>Dusk</th><td><img src="https://raw.githubusercontent.com/JinHang02/claude-code-pokemon/assets/landscapes/dusk-meadow.png" width="170" alt="Dusk meadow"></td><td><img src="https://raw.githubusercontent.com/JinHang02/claude-code-pokemon/assets/landscapes/dusk-hills.png" width="170" alt="Dusk hills"></td><td><img src="https://raw.githubusercontent.com/JinHang02/claude-code-pokemon/assets/landscapes/dusk-mountains.png" width="170" alt="Dusk mountains"></td><td><img src="https://raw.githubusercontent.com/JinHang02/claude-code-pokemon/assets/landscapes/dusk-lake.png" width="170" alt="Dusk lake"></td><td><img src="https://raw.githubusercontent.com/JinHang02/claude-code-pokemon/assets/landscapes/dusk-forest.png" width="170" alt="Dusk forest"></td></tr>
<tr><th>Night</th><td><img src="https://raw.githubusercontent.com/JinHang02/claude-code-pokemon/assets/landscapes/night-meadow.png" width="170" alt="Night meadow"></td><td><img src="https://raw.githubusercontent.com/JinHang02/claude-code-pokemon/assets/landscapes/night-hills.png" width="170" alt="Night hills"></td><td><img src="https://raw.githubusercontent.com/JinHang02/claude-code-pokemon/assets/landscapes/night-mountains.png" width="170" alt="Night mountains"></td><td><img src="https://raw.githubusercontent.com/JinHang02/claude-code-pokemon/assets/landscapes/night-lake.png" width="170" alt="Night lake"></td><td><img src="https://raw.githubusercontent.com/JinHang02/claude-code-pokemon/assets/landscapes/night-forest.png" width="170" alt="Night forest"></td></tr>
</table>

Can't wait an hour? `/pokemon-play dusk lake` (or any time and place) shows it for 15 seconds.

---

## Commands

| Command                                 | What it does                                                                                                                                                                 |
| :-------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/pokemon`                              | A random Pokémon becomes your lead                                                                                                                                           |
| `/pokemon <name>`                       | Pick your lead, spelled exactly; forms in any order: `charizard mega y`, `galarian mr mime`, `shiny gengar`. Close misses get a suggestion                                   |
| `/pokemon add [name]` / `remove [name]` | Grow or trim your party (up to 3). No name: a random catch, or a random release that never picks your lead                                                                   |
| `/pokemon party`                        | Levels, XP to go, and who evolves when                                                                                                                                       |
| `/pokemon everstone <name>`             | Stop (or allow again) that Pokémon's evolution                                                                                                                               |
| `/pokemon size small \| normal \| auto` | Sprite size. `auto` goes small on short terminals                                                                                                                            |
| `/pokemon off` / `on`                   | Put them in their Poké Balls (nothing drawn, no XP) or bring them back                                                                                                       |
| `/pokedex`                              | Everything you've seen, per generation, plus your shinies                                                                                                                    |
| `/pokemon-play <animation>`             | Watch any animation on demand: `hop`, `cheer`, `faint`, `sleep`, `squash`, `work`, `clones`, `evolve`, `wild`; or a time and place: `dusk lake`, `night forest`, `mountains` |

---

## Make it look sharp

Most terminals (iTerm2, Ghostty, kitty, WezTerm...) show the sprites perfectly out of the box. A few things to know:

- **VS Code / Cursor terminal:** set `"terminal.integrated.minimumContrastRatio": 1`. Their default of 4.5 "fixes" colors that sit close together, which turns pixel art into grey speckle. Also keep `"terminal.integrated.gpuAcceleration"` on `"auto"` so the blocks fill their cells exactly.
- **macOS Terminal.app** draws the half-block characters from the font rather than filling each cell exactly, so thin lines can show between rows and edges look a little jagged, and a moving Pokémon can look skewed for a frame while the screen redraws. It works, but iTerm2, Ghostty, kitty or WezTerm show the pixel art crisp and smooth.
- **A minimum-contrast setting you turned on yourself** (iTerm2's _Minimum contrast_ slider, Ghostty's `minimum-contrast`) has the same effect. Turn it back off if the sprites look speckled.
- **Fullscreen mode** gives your party the most room.
- **Short on space?** `/pokemon size small` halves the band, and you can collapse it any time with `ctrl+x ctrl+a`.

### Optional: a Pokémon status line

Plugins can't set Claude Code's status line, but there's a battle-HUD script in [`extras/statusline.sh`](extras/statusline.sh) you can point it at. Your model as a nametag, project and branch as the route, tokens as EXP, your effort as a level, the context window you have left as an HP bar that drains from green to yellow to red, and how long the session has run:

<img src="https://raw.githubusercontent.com/JinHang02/claude-code-pokemon/assets/statusline.png" alt="The Pokémon status line: OPUS 5.5 nametag, project, ROUTE main, EXP tokens, Lv.XHIGH effort, a green HP bar for the context left and the session time">

Download it:

```bash
curl -fsSL -o ~/.claude/pokemon-statusline.sh https://raw.githubusercontent.com/JinHang02/claude-code-pokemon/main/extras/statusline.sh
```

Then add this to `~/.claude/settings.json`:

```json
"statusLine": {
  "type": "command",
  "command": "bash ~/.claude/pokemon-statusline.sh"
}
```

It needs `bash`, `jq` and `perl` (macOS and most Linux have bash and perl; install `jq` with `brew install jq` or your package manager). On Windows, run Claude Code from Git Bash or WSL.

### Optional: Pokémon tips under the spinner

Plugins can't change the "Tip:" line under the spinner, but your own Claude Code settings can. Add this to `~/.claude/settings.json` and restart Claude Code:

```json
"spinnerTipsOverride": {
  "label": "Oak's tip",
  "excludeDefault": true,
  "tips": [
    "/pokemon-play wild calls a wild Pokémon out of the tall grass",
    "/pokemon everstone <name> keeps your partner just the way it is",
    "/pokedex shows every Pokémon you've seen, generation by generation",
    "Passing tests earn your party 5 XP, and a commit earns 10",
    "A wild Pokémon wanders by every 10 to 20 minutes. Watch the tall grass"
  ]
}
```

---

## FAQ

<details>
<summary><b>Does it slow Claude down?</b></summary>
<br>
No. A frame takes a few milliseconds to draw. When nothing is moving it drops from 20 to 5 frames a second and skips frames that haven't changed. Network work like evolutions happens in the background and never holds up Claude's tools.
</details>

<details>
<summary><b>Does it send my code or prompts anywhere?</b></summary>
<br>
No. It only <i>downloads</i>: sprites from <a href="https://gitlab.com/phoneybadger/pokemon-colorscripts">pokemon-colorscripts</a> and evolution data from <a href="https://pokeapi.co">PokeAPI</a>. Both are cached on your machine (<code>$XDG_CACHE_HOME/claude-code-pokemon</code> if you set it, otherwise <code>~/.cache/claude-code-pokemon</code> on macOS and Linux and <code>%LOCALAPPDATA%\claude-code-pokemon</code> on Windows), so after the first few sessions it barely touches the network. To decide how your party reacts, it looks at which tools Claude runs, the shell commands it runs (to spot test runs and commits) and whether they succeeded. None of that leaves your machine.
</details>

<details>
<summary><b>Where is my save?</b></summary>
<br>
In Claude Code's own per-plugin store under your Claude config directory. Your party, levels and Pokédex follow you from session to session.
</details>

<details>
<summary><b>Can I run several Claude Code sessions at once?</b></summary>
<br>
Yes. Every session shows the same party and they all earn XP for it, so working in three terminals levels your team three times as fast. Each session keeps the XP it earns under its own key, so no session ever overwrites another's XP, and sessions pick up each other's changes within about 10 seconds. Subagents don't earn XP of their own; they show up as clones instead.
</details>

<details>
<summary><b>How do I turn it off?</b></summary>
<br>
<code>/pokemon off</code> puts your party in their Poké Balls: nothing is drawn and no XP is earned, in every session, until <code>/pokemon on</code>. To just hide the band for a moment, collapse it with <code>ctrl+x ctrl+a</code>. To remove the plugin entirely, see <a href="#uninstall">Uninstall</a>.
</details>

<details>
<summary><b>Does it work on Windows and Linux?</b></summary>
<br>
Yes. Nothing in it is tied to an operating system: the drawing is plain colored text, downloads are cached in the usual place for each system, and the time of day comes from your local clock. On Windows, use Windows Terminal (the old console can't show 24-bit color). It's developed on macOS, and the test suite runs on Linux on every push.
</details>

<details>
<summary><b>Does it work in the Claude desktop or web app?</b></summary>
<br>
Not yet. The scene is drawn with terminal cells, so it lives in the Claude Code CLI.
</details>

<details>
<summary><b>What counts as a "test run" or a "commit"?</b></summary>
<br>
Commands Claude runs through its shell tool: test runners like <code>pytest</code>, <code>jest</code>, <code>vitest</code>, <code>go test</code>, <code>cargo test</code> or <code>npm test</code> (also inside <code>docker compose run</code>), and <code>git commit</code>. Commands you type in your own terminal aren't visible to the plugin.
</details>

---

## How it works

A Claude Code plugin built on [function hooks](https://code.claude.com/docs/en/plugins/components): TypeScript that runs inside Claude Code and can draw in its interface.

- **Rendering:** sprites arrive as truecolor ANSI art. They're parsed into a pixel grid, scaled to fit, and painted into a cell grid of `▀` half-blocks, two pixels per cell, 20 times a second.
- **Reactions:** hooks on `turn.start`, `turn.complete`, `tool.call` and `session.compact` feed a small state machine: moods, roaming with easing and braking, particles, clones following the leader's path.
- **Saving:** party, XP and Pokédex live in Claude Code's per-plugin store. Each session writes its XP under its own key and party changes re-read the latest save first, so parallel sessions add up rather than undo each other.
- **Layout:** the plugin is `plugin/` (all an install fetches): `hooks/register.tsx` (wiring), `hooks/scene.ts` (animation), `hooks/backdrop.ts` (landscapes), `hooks/sprite.ts` (sprites to cells), `hooks/save.ts` (party, XP, Pokédex), `hooks/reactions.ts` (what counts as a pass or a failure), `hooks/evolution.ts` (evolution chains), `hooks/lookup.ts` (names), `hooks/spinner.ts` (spinner words), and `tests/`. The README images live on the `assets` branch.

## Development

```bash
git clone https://github.com/JinHang02/claude-code-pokemon
cd claude-code-pokemon
claude --plugin-dir plugin       # run it from your clone, reloading as you edit
claude plugin test plugin        # 122 tests
claude plugin validate plugin/.claude-plugin/plugin.json --strict
```

Ideas, bug reports and pull requests are very welcome. [CONTRIBUTING.md](CONTRIBUTING.md) has the details.

## Uninstall

```text
/plugin uninstall pokemon@claude-code-pokemon
/plugin marketplace remove claude-code-pokemon
```

Then delete the download cache if you like: `$XDG_CACHE_HOME/claude-code-pokemon` if you set it, otherwise `~/.cache/claude-code-pokemon` on macOS and Linux and `%LOCALAPPDATA%\claude-code-pokemon` on Windows.

## Credits

- Sprites: [pokemon-colorscripts](https://gitlab.com/phoneybadger/pokemon-colorscripts) by phoneybadger, built from [PokéSprite](https://github.com/msikma/pokesprite)
- Evolution data: [PokeAPI](https://pokeapi.co)

## Disclaimer

This is an unofficial fan project. It's not affiliated with, endorsed or sponsored by Nintendo, Game Freak, Creatures Inc. or The Pokémon Company. Pokémon and all related names are trademarks of their respective owners. The plugin's code ships no sprites: they're downloaded at runtime from the projects above. The preview animations in this README (kept on the repository's `assets` branch, which an install never downloads) show those sprites as the plugin draws them.

The code is released under the [MIT license](LICENSE).
