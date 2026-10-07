# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

This file is the source of truth for what the plugin does. Every feature, fix and limitation goes here as it lands, so a release can be checked line by line before it ships.

## [1.2.0] - 2026-10-07

### Added: depositing into the PC box

- `/pokemon deposit <name>` moves a party member into the PC box, keeping its level and XP. Your lead can go too:
  the next member leads. The party can't be emptied, and a bare `deposit` asks which one.
- A full party's hint now offers `/pokemon deposit <name>` as well as `remove <name>`.

### Fixed

- A wild Pokémon whose sprite was still downloading when another stepped out no longer replaces it. Before, a ball
  thrown at the first could catch the second, and both were counted as seen.
- `/pokemon shiny <name>` brings a shiny Pokémon out of the PC box. It used to miss the box, catch a new one and send
  your lead back to the wild.
- A plain name in `/pokemon <name>` and `add <name>` no longer takes a regional form out of the PC box: with a plain
  Mr. Mime in the party, `/pokemon mr mime` picks that one, as it always should have.
- An everstone is honoured mid-evolution: one given while the evolution downloads stops it and stays, and a party
  reordered during an evolution animation no longer evolves the wrong member, everstone or not.
- After an evolution the band draws the new form, even when a party refresh was already under way.
- Galarian Darumaka evolves into Galarian Darmanitan, not the plain one.
- A save with more than 3 party members keeps them: the extras go into the PC box instead of being dropped.
- While you aim, every step a wild Pokémon takes is drawn, and a click is judged on the picture you see. Before,
  the band could lag up to a second behind, so a click on the Pokémon could miss.
- A wild Pokémon can be aimed at only once its catch rate has loaded, so a slow PokeAPI no longer turns a sure catch
  like Caterpie into a 1 in 6. The rate of 45 is used only when PokeAPI can't be reached.
- Clicking the "!" over your party is a miss, even where it covers the wild Pokémon.
- A wild Pokémon rustling in the grass on the right steps out at the band's edge after you resize the terminal.
  Before, it could appear mid-band, or vanish right after its toast.
- A `$(...)` inside double quotes no longer hides the rest of the command: `cd "$(git rev-parse --show-toplevel)" &&
pytest` and `echo "now: $(date)"; git commit -m x` react again.
- Test runs and commits inside `ssh`, `docker exec`/`run`, `docker compose run`/`exec`, `kubectl exec`,
  `nix develop -c` and `devbox run` are found after the wrapper's options and its host, container or service, also
  when given as one quoted string (`ssh host "cd app && pytest"`, `… --entrypoint bash app -lc "pytest -q"`). A
  command there that only mentions a test or commit (`docker exec app grep -rn pytest .`) no longer reacts.
- A commit message from a heredoc (`git commit -F - <<'EOF'`) or one mentioning `--dry-run` earns its XP again, and
  a heredoc's body is never read as commands.
- More test runs are recognised: in a subshell (`(cd plugin && npm test)`), behind `timeout 300`, by path
  (`.venv/bin/pytest`, `./node_modules/.bin/vitest`), after a quoted env value (`FOO="a b" pytest`), and as
  `test:*` scripts (`npm run test:unit`).
- Tests that passed before a later step failed (`npm test && git commit` stopped by a hook) no longer faint the party
  as a failed test run; that counts as a plain failure. Asking a runner for its version, help or test list
  (`pytest --version`, `--collect-only`, `jest --listTests`) no longer earns XP.

- Pokémon sharing an id across the party and the PC box (from an older or hand-edited save) are told apart, so a
  boxed Pokémon never earns XP.
- An id that is also a built-in name (`constructor`) no longer turns a Pokémon's XP into nonsense.
- XP a session earns in the moment its idle ledger is folded into the save is no longer lost: the save records what
  each fold added, and anything a ledger gains afterwards still counts.
- A form word no longer sends a lookup to the wrong species: `/pokemon mega taurso` says Tauros has no other forms,
  not Meganium.

### Known limitations

- Wrapper options before the subcommand (`docker compose -f x.yaml run …`) hide the command inside, and so does a
  quoted remote script spread over several lines.
- A Pokémon held in a ball keeps its spot when the terminal narrows, even if that is now off the band.

## [1.1.0] - 2026-10-06

### Added: catching wild Pokémon

- Click a wild Pokémon in the band to throw a Poké Ball at it. The ball comes from just past the band's
  bottom-left corner, as in the GBA games, and arcs onto the spot you clicked in 0.6 s, spinning as it flies.
- The ball has to land on one of the Pokémon's own pixels: grass, a see-through gap in its sprite or your own
  party is a miss. A missed ball bounces once where it landed and blinks out; the Pokémon walks on.
- A hit stops the Pokémon. It turns white and shrinks into the ball, the ball drops to the ground and wobbles.
- The odds follow the games: each ball catches with the species' capture rate ÷ 255 (from PokeAPI), so a
  Caterpie always comes quietly, Pikachu 3 times in 4 and a legendary about 1 time in 100. When PokeAPI can't be
  reached a rate of 45 is used (about 1 in 6).
- Caught: three wobbles, a click with sparkles, `Gotcha! Caterpie was caught!` and your party cheers. It joins
  your party, or the PC box when your party is full or already has one of it. It starts at Lv 1.
- Broke free: up to two wobbles (more when it was close), then the ball bursts open and the Pokémon pops out with
  a hop. 1 time in 10 it then flees, dashing to the nearest edge and leaving a puff of dust; otherwise you can
  throw again, as often as you like while it's in view.
- One ball at a time: clicks while a ball is in the air or wobbling, while the Pokémon is still in the grass or
  fleeing, or with no wild Pokémon around do nothing.

### Added: the PC box

- `/pokemon box` lists the Pokémon in your PC box, with levels, as `/pokemon party` does.
- `/pokemon <name>` brings a Pokémon out of the box to lead; your old lead goes into the box. A name in both your
  party and the box picks the party one.
- `/pokemon add <name>` brings a Pokémon out of the box into your party when there's room.
- Pokémon in the box don't earn XP.
- `◓` after a name in `/pokemon party` and `/pokemon box` marks a Pokémon caught with a ball.
- `/pokedex` counts what you caught: `Pokédex: 71 / 905 seen · 3 caught · 6 shiny`.
- `/pokemon-play wild <name>` calls a particular wild Pokémon, for trying a throw at it.

### Known limitations

- **Throwing needs mouse clicks:** your terminal has to pass mouse clicks to Claude Code.
- **Pixel-exact aim** needs a terminal that reports where in a cell you clicked: kitty, Ghostty, iTerm2, WezTerm
  and foot do. Elsewhere, and through tmux, a click counts both pixels of the cell.
- **While a wild Pokémon can be aimed at, the band is drawn as coloured text at 10 frames a second:** a click layer
  laid over the pixel art stops Claude Code's display from updating. So for that half minute it moves a little less
  smoothly and costs more CPU (measured: about 20 to 35% against about 10%), back to pixel art once a ball is thrown
  or the Pokémon leaves.
- **A throw in progress is lost** when the plugin reloads (an update, a hot reload), as the wild visitor is.

## [1.0.0] - 2026-10-03

The first release, **Pokémon Journey for Claude Code**.

### Added: your party

- A party of up to three Pokémon living in a pixel world in the band above the Claude Code prompt, each roaming on its own, the lead drawn in front.
- 905 Pokémon (Bulbasaur to Enamorus) and 424 alternate forms (Mega, Gigantamax, Alolan, Galarian, Hisuian and more); a random roll uses an alternate form 1 time in 8.
- Shinies: 1 in 32 on any catch, or forced with `shiny` (`/pokemon shiny pikachu`).
- `/pokemon <name>` picks your lead. A Pokémon already in your party moves up with its level (no new sighting is recorded); a new one replaces the lead and the reply says who went back to the wild.
- `/pokemon add [name]` and `/pokemon remove [name]` (or `release`). With no name, `add` catches a random Pokémon and `remove` releases a random member, never the lead. The party can't be emptied. `remove vulpix` means the plain Vulpix when an Alolan one is in the party too (`remove alolan vulpix` for that one).
- Exact names only: a name, typo or partial form that isn't spelled right catches nothing and replies with a suggestion, for example `Did you mean Duskull? Run /pokemon duskull`. Correct spellings may put forms in any order (`mega charizard x`), use regional adjectives (`alolan vulpix`) and any capitals, accents or punctuation (`Mr. Mime`, `Flabébé`, `Nidoran♀`). A name made only of symbols or another script (`✨`, `ピカチュウ`) catches nothing.
- `/pokemon party` lists each member's level, XP to the next level and when it evolves, in lined-up columns (`evolves at Lv 16`, `final form`, `everstone`).

### Added: reactions to Claude's work

- Roaming in short, unpredictable strolls (0.6 to 2.5 s, each at its own pace): stopping, looking around, skipping, changing their minds mid-stroll, easing in and out of a walk, braking before an edge and never walking straight into a wall.
- Claude working: the party keeps strolling just as unpredictably but faster, with only brief pauses (under a second), a few electric sparks crackle around them, and the lead shows a thought bubble whose dots fill in one by one (none, `.`, `..`, `...`).
- A reply finishing: a double hop with a crouch, an arc and a squashed landing, spinning round on the second hop.
- Tests passing or a commit going through: the hop plus a burst of confetti from above their heads.
- A real failure: a battle-style faint (shudder, sink into the grass while dimming, a pause, back up with a bounce). Real failures are failing tests (`pytest`, `jest`, `vitest`, `go test`, `cargo test`, `npm test`, `make test`, `dotnet test`...), failing builds or lint (`tsc`, `ruff`, `eslint`, `make`, `docker build`...) and failed file edits. A plain command (a `grep` finding nothing) only counts on its third failure in a row.
- Test runs and commits are recognised as the command actually run, after `cd x &&`, `uv run`, `python -m`, `npx` and the like, inside `bash -c "..."`, and inside `docker compose run`, `docker exec`, `kubectl exec` or `ssh`. A command that only mentions one (`cat jest.config.js`, `pip install pytest`, `echo "git commit"`, `git commit --dry-run`) is a plain command, and a commit message or heredoc never confuses it.
- A test whose result a pipe, `;` or `||` hides (`pytest 2>&1 | tail -20`, `pytest || true`) is judged by the summary in its output: pytest, jest, vitest, mocha, rspec, unittest, go test, cargo test, dotnet test and npm's own failure line. When the summary is cut off (`| head`) it counts as a plain command.
- A test run started in the background reacts to nothing: it hasn't finished yet.
- A tool call refused before it ran (by a hook or a policy) counts for nothing.
- `/compact` or auto-compaction: squashed flat for as long as it runs, then springing back with an overshoot.
- Subagents: a half-size clone rises out of the grass for each running one (up to 3) and follows the lead's path; it vanishes in a puff of dust when its subagent finishes.
- 5 idle minutes: they doze off, breathing slowly, Zs drifting up; anything you do wakes them. Nobody dozes off while a wild Pokémon is around.
- Only the main conversation counts; a subagent's own tool calls never trigger anything.

### Added: wild Pokémon

- Every 10 to 20 minutes (not while asleep) a random wild Pokémon comes by.
- First the tall grass thrashes at the edge it's coming from for 2 seconds.
- As it steps out, the party jumps in surprise, turns to face it and shows a red "!" in a white speech bubble for 2.5 seconds. The thought bubble steps aside meanwhile and comes back afterwards if Claude is still working.
- A toast names it for 6 seconds: `A wild Bulbasaur appeared!` (with ✨ for a shiny).
- It walks across, stops halfway to look back, and leaves the other side. It's recorded in the Pokédex.
- A visitor taller than your tallest party member is scaled down to fit the band, so it's never cut off.

### Added: levels and evolution

- XP for the whole party: +2 when Claude finishes a reply, +5 for a passing test run, +10 for a commit. No XP while the party is off.
- Levels: `1 + floor(sqrt(xp / 4))` (Lv 16 at 900 XP, Lv 36 at 4,900 XP).
- Each Pokémon has a gender from its species' ratio in the games (♂ or ♀ in `/pokemon party`; genderless species have none), looked up with its evolution data and kept when it evolves. Gender-only evolutions follow it: only a female Combee becomes Vespiquen, a female Burmy becomes Wormadam in its own cloak while a male one becomes Mothim, and only a male Kirlia can become Gallade.
- Evolution at each species' level from the games, read from PokeAPI's evolution chains (Charmander at 16, Charmeleon at 36, Wurmple at 7...). Evolutions by stone, trade, friendship or other conditions happen at Lv 30, or, when a sibling branch evolves by level, at that level, so neither shuts the other out (Slowpoke becomes Slowbro or Slowking at 37; Nincada becomes Ninjask or Shedinja at 20). Branching lines pick a branch at random among those the level allows.
- Regional forms evolve the way their region does, into the form the games give: Galarian Meowth becomes Perrserker, Alolan Meowth an Alolan Persian, Galarian Mr. Mime becomes Mr. Rime while a Kantonian Mr. Mime is a final form. Other forms (Gigantamax, caps) evolve as the plain species and keep their form only when the evolved species has it.
- The evolution animation: old and new forms swap as white silhouettes, faster and faster, then a flash; plus a toast `What? Charmander evolved into Charmeleon!`.
- Final stages are marked so they're never checked again.
- Two members evolving from the same XP evolve one after the other, each with its whole animation. Two members of the same species (an evolution can lead to one already in the party) are told apart, so the right one evolves.
- Nothing evolves while the party is off; whatever is due evolves after `/pokemon on`.
- `/pokemon everstone <name>` stops a Pokémon from evolving; run it again to allow it. A Pokémon past its level evolves as soon as it drops the everstone.

### Added: the Pokédex

- `/pokedex`: Pokémon seen out of 905, shinies seen, a progress bar per generation (1 to 8), the list of shinies and the 10 latest sightings, followed by your party.
- Every catch, evolution and wild visitor counts as seen.

### Added: the world

- 20 landscapes: meadow, hills, mountains, lake and forest, each at dawn, day, dusk and night.
- A new landscape every hour, the same in every session you have open.
- Day phases follow your local clock: dawn 5 to 7, day 7 to 17, dusk 17 to 19, night after that.
- Skies shade from top to horizon in each phase's colours. The sun rises low at dawn, sits high by day and sets low at dusk (behind hills, peaks or trees in some landscapes). Clouds drift by day, dawn and dusk. At night: twinkling stars, a crescent moon, fireflies, and the Pokémon a little dimmed.
- Landmarks per landscape: rolling hills in two layers; snow-capped peaks and pine trees; a lake with a far shore, reeds, a sun reflection and shimmering water; a tree line and mushrooms; flowers in the meadow.
- `/pokemon-play` shows any time and place for 15 seconds: `dusk lake`, `night forest`, `mountains`, `dawn`.

### Added: Claude Code's spinner line

- While Claude works, Claude Code still draws its own spinner (icon, timer, token count, effort, and under it the tip line, the task list and retry or compacting notes); the plugin only swaps the word. For example `✻ Searching tall grass… (17m 46s · ↓ 12.3k tokens)`.
- 32 Pokémon spinner words ("Searching tall grass", "Consulting Professor Oak", "Using Thunderbolt"...) in place of "Drizzling", "Sauteing" and the rest, staying the same for the whole turn. A status message Claude Code shows instead of the word (such as compacting) is kept as it is.
- The line that closes a turn becomes `◓ Caught for 1m 4s`, with a blank line above it: a red Poké Ball, the word in bold Pokémon yellow, the time in blue; 21 Pokémon past-tense words.
- Both go back to Claude's own with `/pokemon off`, and outside the terminal.

### Added: commands and settings

- `/pokemon`, `/pokemon <name>`, `add [name]`, `remove [name]` (or `release`), `party`, `everstone <name>`, `size small|normal|auto`, `off`, `on`.
- `/pokedex`.
- `/pokemon-play <animation>`: `hop`, `cheer`, `faint`, `sleep`, `squash`, `work`, `clones`, `evolve` (a preview that changes back), `wild`, and any time of day and landscape.
- `/pokemon off` puts the party in their Poké Balls in every session (nothing drawn, no XP, no evolutions) until `/pokemon on`. XP stops at once even in a session that hasn't synced yet.
- `/pokemon size`: `normal` sprites up to 12 rows, `small` up to 6, `auto` (the default) goes small when Claude Code gives the band fewer than 20 rows (a short terminal). Saved.
- The band can be collapsed any time with Claude Code's `ctrl+x ctrl+a`.

### Added: display and performance

- Drawn as colored half-block cells, two pixels per cell, at 20 frames a second.
- Down to 5 frames a second when nothing moves, and unchanged frames are never sent.
- Sprites are scaled down only as much as the band needs, so evolved forms come out taller than their earlier stage.
- Showing a hidden or collapsed band again brings the animation back within a second.
- Each Pokémon keeps its place when the party changes: an evolving one stays where it stood, and reordering or releasing members moves no one else.
- A clone's dust puff rises where that clone walked.
- A space too short for the band (a few rows) shows Claude Code's own row instead of a band that scrolls.
- A sprite file cut off mid-way is drawn as far as it goes.

### Added: saving and reliability

- Party, levels, Pokédex and settings are saved in Claude Code's per-plugin store and follow you between sessions.
- Several Claude Code sessions at once: each session writes the XP it earns under its own key in the store (`xp:...`), so sessions running side by side never lose each other's XP, and each picks up the others' XP and changes within 10 seconds. A session's XP is folded into the shared save a day after it last wrote, then its key is removed, so the store doesn't grow. Party changes are applied to the latest save, and within a session save changes run one at a time.
- A missing or malformed save loads field by field: anything unusable (negative XP, a flag that isn't true or false, a name that isn't a plain name, a broken Pokédex entry) falls back to its default.
- Downloads (sprites, the species list, evolution data) are cached in `$XDG_CACHE_HOME`, `%LOCALAPPDATA%` on Windows, or `~/.cache`, under `claude-code-pokemon`. Sprites and evolution data are kept for good; the species list is refreshed every 30 days. Two requests for the species list at the same moment share one download. An unreadable cache, such as a network home folder, just means downloading again. A relative `$XDG_CACHE_HOME` is ignored, as the XDG spec asks.
- Downloads are checked before they're kept: a broken file (a crash mid-write, a Wi-Fi login page served instead) is never cached and a broken cached copy is downloaded again. A download gives up after 20 seconds. When the 30-day refresh of the species list fails, the old copy keeps serving.
- Names from the downloaded species list are used only if they're plain lowercase names, so the list can never point a cache file outside the cache folder.
- Offline, or a sprite missing: the party is drawn as soon as the network is back (retried every 10 seconds), and a first session started offline catches its first Pokémon then.
- Commands wait for the save to load, never for a download for more than 5 seconds.
- The time zone comes from the plugin's own clock, following daylight saving changes during a session. Only if that reports UTC does it ask the host: `date +%z` on macOS and Linux, a PowerShell time-zone query on Windows.
- Sprite files with Windows line endings are read correctly.
- Background work (frames, XP, visitors, evolutions, downloads) catches its own errors and shows each one once as a toast (`Pokémon: ...`), so they never break a session. A store that can't be read is reported and read again on the next change. `/pokedex` and `/pokemon-play` answer with the error instead of failing.
- Bands wider than 512 columns (the most a Raster takes) are drawn 512 wide; another surface drawing at the same time leaves the terminal band running.
- macOS, Linux and Windows.

### Added: project

- README with a hero animation, 11 more animated previews, a gallery of all 20 landscapes, install, commands, terminal tips, FAQ, uninstall, credits and an unofficial-fan-project disclaimer.
- A 1280x640 social preview image.
- A landing page on GitHub Pages (`docs/`, https://jinhang02.github.io/claude-code-pokemon/): install commands with copy buttons, the reactions as Pokémon dialogue boxes, the 20 landscapes with a time-of-day switcher that opens on the visitor's own time, the commands as a start menu, an FAQ, and search and social-sharing metadata with a sitemap.
- A small install: the plugin lives in `plugin/`, the only folder copied as the plugin, and the README's images live on the repository's `assets` branch, which the marketplace clone of the main branch never fetches. An install downloads well under 1 MB instead of about 11 MB.
- An optional battle-HUD status line script, `extras/statusline.sh`, with a screenshot and setup steps in the README: the model as a nametag, project, git branch as the route, tokens in and out as EXP, the effort as a level in a colour per level (right-aligned), the context window left as an HP bar (green, yellow from 50% used, red from 80%) with tokens left over the window, and the session's running time as days, hours and minutes (`⌛ 0d:03h:10m`) from Claude Code's own session clock, resumes included. A context window of a million shows as `1M`.
- A README snippet for Pokémon tips under the spinner through Claude Code's own `spinnerTipsOverride` setting (plugins can't change that line), labelled "Oak's tip".
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, issue forms (bug report, feature idea), a pull request template.
- CI on every push and pull request: marketplace and strict plugin validation (manifest and hooks), the test suite and a Prettier formatting check.
- 122 tests: sprites, name lookup, save data, reactions, evolution chains, scene animation, landscapes, the spinner, and end-to-end command, screen-frame, offline and multi-session tests through the plugin engine.

### Known limitations

- **A Claude Code mod:** the plugin needs Claude Code 2.1.287 or newer, where mods are on by default. Mods don't load under `--safe-mode`, with `disableAllHooks` set, or where an organization stops user-installed mods, and Anthropic can switch installed mods off remotely.
- **The Tip line** under the spinner can't be changed by plugins; Claude Code's own `spinnerTipsOverride` setting can (see the README).
- **The status line** can't be set by plugins; the battle-HUD script in `extras/` is set up by hand and needs bash, jq and perl (Git Bash or WSL on Windows).
- **A piped test run whose summary is cut off** (`pytest | head`) doesn't react, since nothing says whether it passed.
- **Two sessions changing the party at the very same instant** (a catch in one, a release in the other) could still lose one of the two changes; XP is never lost this way.
- **A party member saved by an older version** looks up its gender (and evolution data) once, which needs the network.
- **Game-only rules aren't modelled:** the Let's Go starter Pikachu and Eevee evolve like any other, and evolutions by time of day, location or held item all happen at their level (or Lv 30).
- **Headless runs count:** a `claude -p` run earns XP and can evolve your party, though nothing is drawn.
- **Narrow bands:** near the band's edges the thought bubble can be cut off (often on a 40-column band), and the "!" bubble over the tallest member loses its top for the 0.4 s startled hop.
- **Drawn in the terminal only:** the band is made of terminal cells, so it shows in `claude` in a terminal (editors' integrated terminals included) but not in the Desktop app's Code tab, the VS Code extension's chat panel or the web. Those sessions still earn XP.
- **Hand-tested on macOS only.** Linux is covered by CI; Windows has had a code review, not a run.
- **macOS Terminal.app** draws block characters from the font, so the pixel art shows thin lines between rows and can look skewed for a frame while moving; iTerm2, Ghostty, kitty and WezTerm draw it crisp.
- **Colors:** the VS Code / Cursor terminal needs `"terminal.integrated.minimumContrastRatio": 1`, and the old Windows console can't show 24-bit color.
- **Sprites in the previews:** the plugin ships no Pokémon art, but the README's preview images (on the `assets` branch) show sprites as the plugin draws them.

[1.0.0]: https://github.com/JinHang02/claude-code-pokemon/releases/tag/v1.0.0
