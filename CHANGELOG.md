# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

This file is the source of truth for what the plugin does. Every feature, fix and limitation goes here as it lands, so a release can be checked line by line before it ships.

## [Unreleased]

### Fixed: lighter on the CPU, the same party

- Each frame of the band is packed for the terminal about thirty times faster: the cells are written in place and
  base64-encoded by the platform where it can. The picture is the same, cell for cell.
- A background subagent no longer leaves the party "working" after the main turn ends: they doze off after five
  quiet minutes as usual, instead of thinking and drawing at the full frame rate for hours.
- A Pokémon that fell asleep halfway through a skip no longer keeps the band drawing at the full rate all night.
- Asleep, the band wakes the plugin once per frame it draws instead of twenty times a second; anything that stirs
  the party wakes it at once. Frames don't pile up behind a slow terminal either: one tick runs at a time.

### Changed: regional forms are yours to ask for

- A Pokémon evolving by itself, or by a stone or trade item you give it, keeps to its own region's form when it has
  another branch: a Thunder Stone makes a Pikachu a Raichu, Koffing at Lv 35 a Weezing, Quilava at Lv 36 a
  Typhlosion. Before, about half of them became Alolan, Galarian or Hisuian with no say, and that can't be undone.
  Name the branch to take it: `/pokemon give thunder-stone pikachu alolan raichu`,
  `/pokemon evolve koffing galarian weezing`. One whose only branch is regional still takes it (Cubone at night), and
  looks such as Vivillon's patterns are rolled as before.

### Fixed: what an audit of the whole plugin found

- A window whose first read of the save was refused (another window holding the store) caught a random first
  Pokémon and pushed your lead into the PC box. It now leaves your party alone.
- After the clocks went back, a session left open across the change ran an hour fast all winter (dusk read as
  night, for evolutions and the sky). The hour follows daylight saving as it changes.
- `/pokemon evolve lv 16` evolves the one at that level, as promised; `release shiny` and other commands given only
  a level or `shiny` list who fits instead of saying there is no one.
- A sentence pasted after a command answered after seconds (up to 20 s for 80 words) and held the band still
  meanwhile. Lookups stop at the longest name, and over 12 words is no name.
- Full-width letters and digits (`ｅｅｖｅｅ ２`, `buy fire stone ３`) read as the plain ones.
- `/pokemon buy` and `/pokemon bag` wrap their lists to the terminal instead of running hundreds of columns wide.
- The typeahead goes on past a space inside a name: `tapu k`, `buy fire s`, `wild tapu b`, `give pikachu fi`.
- No false faints: a test run that finds nothing to run (pytest's exit 5), a passing run whose log mentions errors
  before its summary, or a command you interrupted. The last summary line of a test run decides.
- No XP for `git commit --amend` or `--allow-empty`, nor for `npm run testdb:seed` (`npm run test:unit` still counts);
  a commit piped into `tail` counts when git printed its summary.
- Ending sessions are folded into the save in one write per round, not one per session, so many short sessions no
  longer set off bursts of writes in every window.
- The save carries a version: a window still running an older release refuses to write over a save a newer one
  wrote (it says so and changes nothing), instead of dropping what it doesn't know.
- A purchase checks the wallet against session earnings read in the same write, so a fold landing first can't be
  counted twice.
- A species PokeAPI doesn't have is looked up once, not every minute; a sprite cut short by a crash is fetched again.
- Sprite art with 256-colour codes or other escapes keeps its pixels.
- The status line drops control characters from Claude Code's fields: a newline no longer empties the line, and an
  escape in a folder name no longer reaches the terminal.
- `scripts/evolution-coverage.mjs` works from a folder with spaces in its path, and on Windows.
- CI pins the Claude Code version its tests run on.

## [1.7.0] - 2026-10-25

### Added: `/pokemon-help` and a typeahead that previews every command

- `/pokemon-help` lists every command of the plugin and every word each one takes (`/pokemon`, `/pokemon-play`,
  `/pokedex`), one a line and no wider than 60 columns. `/pokemon help` still lists `/pokemon`'s own.
- While you type a Pokémon command, the typeahead previews what can go next. `/pokemon` alone lists every
  sub-command with how it's used (`give <item> <name>`, `box [name] [page]`); `/pokemon g` narrows that to
  `give <item> <name>`; `/pokemon give t` offers the items starting with it, the Bag's first with how many you have
  and the Mart's with how to buy them; `/pokemon give thunder-stone c` offers the party's Pokémon starting with `c`,
  with their level and where they are. Each word that names one of yours (`release`, `deposit`, `take`, `box`,
  `everstone`, `evolve`) offers just the ones it can reach; `size`, `evolution`, `evolve manual|auto` and `buy`
  offer their choices; `add`, a lead's name and `/pokemon-play wild` offer species once two letters say which.
  `/pokemon-play` previews its animations, then the other half of a time and place (`dusk` then `lake`).
- `/pokemon` and `/pokemon-play` have one short line each in the typeahead and `/help` again, instead of every word
  they take run together and cut off, and `/pokemon ` and `/pokemon-play ` show a dim hint of what follows.

### Changed: an evolution counts as caught

- The species a Pokémon evolves into counts as caught in the Pokédex, not just seen: every evolution, whichever way
  it comes (a level, a stone, a held item, friendship, `/pokemon evolve`, auto), and each stage of a Rare Candy
  chain. Nincada's evolution counts Ninjask and Shedinja both.
- ◓ still means a Pokémon came from a Poké Ball and stays through evolution; Shedinja now has it when Nincada did.
- An existing save counts each evolved species it still has in the party or PC box as caught, once, when it loads.
  Stages passed through on the way (Ivysaur, for a Venusaur) aren't in the save, so they stay seen.
- A Pokémon brought with `/pokemon <name>` or `/pokemon add` is still seen only until it evolves.

## [1.6.0] - 2026-10-23

### Added: you decide when they evolve

- Evolution is manual by default. A Pokémon that can evolve by itself (a level, friendship, the time of day, a held
  item, a party member) no longer does: six gold motes rise around it in the meadow, a toast says it's ready (once per
  Pokémon), and `/pokemon party` and `/pokedex` mark it `ready to evolve`.
- `/pokemon evolve <name>` evolves it, on the evolution screen you have (`charmander 2` for a twin, as its toast
  says, or `charmander lv 36`). The reply is _"What? Charmander is evolving!"_, as for a stone, and if the evolution
  can't be worked out within a second (screens waiting their turn, a slow download), _"Evolving Charmander: what it
  comes to shows after the one on screen."_ One that could go more than one way lists them, forms of one species
  included (Koffing into Weezing or Galarian Weezing), and `/pokemon evolve eevee espeon` or
  `/pokemon evolve koffing galarian weezing` picks one. Not ready, a final form, holding an everstone or resting, it
  says why not; a branch that needs something else says what.
- An evolution under way stops if what it evolves by goes before it's saved (its held item taken, its partner put in
  the PC box), and a Pokémon another session evolved meanwhile isn't taken a stage further.
- `/pokemon evolve auto` brings back evolving by itself, each Pokémon taking its own branch as before, and evolves
  anyone already waiting. `/pokemon evolve manual` switches back, and `/pokemon evolve` alone says which you have.
  `/pokemon evolution` is still the screen's style. `/pokemon help` lists both.
- A stone or trade item from `/pokemon give` still evolves at once, in either mode. A Rare Candy or a held item that
  brings an evolution makes the Pokémon ready instead.
- Ready follows the conditions: one that needs a party member or a held item stops being ready as soon as it goes,
  here or in another session, and one that evolves only at night stops showing motes by day, within a minute.
- A Pokémon whose evolution screen is still to play (a wild visitor out, another screen first) isn't told ready in
  its new form until the screen has shown it, so the screen keeps the surprise.
- The motes move every 0.4 s, so a Pokémon waiting for days adds at most two or three frames a second to the band.
- Known limit: a Claude Code window still running a version without manual evolution (1.5.0 and before) evolves
  Pokémon by itself, and its saves drop the evolution setting and which Pokémon were announced. Restart other
  windows after updating.

### Added: caught in the Pokédex bars

- Each generation's bar in `/pokedex` shows how many you caught as well as saw: the caught part is green, over the
  seen part, and the line counts them with its shinies, as the Pokédex's first line does
  (`89/151 seen · 22 caught · 3 shiny`). Where there's no colour, the caught cells are `█` and the ones only seen `▓`.

## [1.5.0] - 2026-10-20

### Added: the evolution screen

- An evolution gets its own screen, as in the games. The band makes way for an evolution scene with a stage on top
  and a three-row text box below: _"What? EEVEE is evolving!"_ types out, the old form flashes in silhouette, then
  swaps with the new one, faster and faster (every 420 ms at first, every 40 ms at the end), a burst of light, and
  _"Congratulations! Your EEVEE evolved into VAPOREON!"_. About ten seconds, then the band is back with the new form
  walking where the old one stood. The message is real text in the terminal's font, so it stays crisp.
- Three styles, from three eras of the games:
  - `rays` (the default): a dark stage with light rays turning behind and twinkling sparkles (Gen 4–5).
  - `white`: a plain white screen, the two forms swapping as dark silhouettes (Gen 1–2).
  - `gradient`: a blue-to-purple glow with sparkles rising (Gen 3).
- `/pokemon evolution` shows the style you have and the three choices; `/pokemon evolution <rays|white|gradient>`
  picks one. It's saved, so every window uses it. A word it doesn't know answers with the choices, and a near miss
  gets a "Did you mean gradient?".
- `/pokemon-play evolve [style]` shows your lead's evolution on the screen you have, or on the style you name, once:
  _"Previewing Eevee evolving into Espeon in the rays style."_ Nothing is saved: the style stays as it was, and the
  lead walks on unchanged when the screen ends. With a wild Pokémon out, the reply says the preview plays once it has
  gone. With no room for the screen (a band under 8 rows), it plays in place and says so: _"No room for the white
  screen here."_ With the party off, it says there is nothing to show.
- Every real evolution gets the screen: by level, stone, trade item or Linking Cord, friendship, time of day, Rare
  Candy. When Nincada evolves, its screen shows Ninjask, and Shedinja joins when it ends, in the toast.
- The sprites are scaled down to fit the stage when they're taller, nearest-neighbour so the pixels stay sharp. A
  narrow band shortens the message from the front, keeping the new form's name.

### Changed

- When the screen plays, the command's reply is _"What? Eevee is evolving!"_, and the _"What? Eevee evolved into
  Vaporeon!"_ toast comes when the screen ends, so the screen keeps the surprise. Without the screen, the reply is
  _"Eevee evolved into Vaporeon!"_ and the toast comes with it, as before.
- The evolution itself is saved at once, as before. Only its screen can wait:
  - A wild Pokémon out (or a ball in flight): the screen waits until it has gone, caught, fled or let go. No new
    visitor comes while a screen plays; one that was due comes right after.
  - The PokéMart open: it closes when the screen starts, and stays shut until the screen ends ("An evolution is on
    screen: the PokéMart opens once it ends.").
  - Several evolutions at once (twins, a Rare Candy chain): one screen after another, never two at once.
- An evolution in another Claude Code window plays its screen here too, if it's less than 30 seconds old. A window
  opened later doesn't replay old evolutions. Each evolution now saves when it happened (`evolvedAt`) for this.
- A band under 8 rows tall keeps the in-place animation from 1.4.0: the Pokémon flashes between white silhouettes
  where it stands. A terminal made too short for the screen while it plays ends it there, with its toast, and the
  band goes on with the new form.
- With the party off (`/pokemon off`) or no band drawn, an evolution happens with its toast, and no screen shows
  later. Putting the party away while a screen plays or waits ends it, with its toast.
- There is no cancelling: a screen always finishes, unless the terminal gets too short for it. An Everstone is still
  the way to stop a Pokémon evolving by itself.
- The screen takes no keys or clicks: the prompt and commands work while it plays. A click on it does nothing. A
  command that evolves another Pokémon meanwhile (a twin's stone, a Rare Candy) answers at once, and its screen plays
  after the one playing now. When an evolution can't be worked out within a second (evolutions waiting their turn, a
  slow download), its command doesn't wait for it: _"Giving the Water Stone to Eevee: what it does shows after the one
  on screen."_ (or _"Previewing Eevee's evolution in the rays style after the one on screen."_), and a stone it can't
  use is told in a toast when its turn comes. A screen already playing finishes after a `/clear`; a reload or restart
  mid-screen doesn't bring it back (the evolution is saved either way).
- Releasing or depositing the evolving Pokémon mid-screen lets the screen finish; nothing is written back for it.

### Fixed

- `/pokemon give <item> <name> -1` (or `0`, `1.5`) gave the item to the first one: only a whole number from 1 picks,
  as in `release`, and anything else answers with the numbered list. A fraction is no pick anywhere now
  (`release eevee 1.5` no longer releases the 15th), and the answer quotes what you typed: _"No -1 in your party"_,
  where it said _"No 1"_.
- The numbered _"Which Eevee?"_ list was one long line, and with a full box of them a wall of text. Now it's one
  Pokémon per line, the first ten only, then _"… and 15 more"_ with how to narrow them down. Any number still picks.
  A level narrows a name in every command that takes one: `/pokemon release eevee lv 30` (or `lv30`, `level 30`),
  and a number then picks among those. A level none of yours is at never catches a new one.
- `/pokemon box` printed the whole box in one reply, up to 961 lines. It shows 30 to a page now, as a box in the
  games holds: _"Your PC box (76 / 960) · page 1 of 3"_, and the next page is `/pokemon box 2`. A name shows only
  those, each with its place in the box: `/pokemon box eevee`, `/pokemon box shiny`, `/pokemon box eevee lv 5`.
- `/pokemon bag` listed every holder, the PC box's too, on one unbroken line. It's one a line now: the party's, then
  ten of the box's and how many more.
- Claude Code renders a reply as Markdown, so the `/pokemon box` rows (`1.`, `2.` …) and a _"Which Eevee?"_ list
  became a numbered list: from `10.` on, the rows sat one column right of the first nine, and the _"Next page"_ or
  _"Add the number"_ line was indented under the last row. They're labelled `#1`, `#10` now and line up; the number
  you add is the same: `/pokemon release eevee 2`.
- In a narrow terminal, `/pokemon party`, `/pokemon box` and `/pokedex` broke their rows mid-column, leaving
  _"· final form"_ alone on a line. Where a row doesn't fit, its name and level now share a line, and the rest wraps
  beneath the name, without the XP to the next level when even that doesn't fit.
- XP kept raising the level past 100 (_"Lv 101 (794 xp to Lv 102)"_) while a Rare Candy said _"already Lv 100"_. The
  level stops at 100 everywhere now, shown as _"Lv 100 (max level)"_.
- Names lost their punctuation (_"Farfetchd"_, _"Mr Mime"_, _"Ho Oh"_, _"Nidoran F"_). They're written as in the
  games now: Farfetch'd, Sirfetch'd, Mr. Mime, Mime Jr., Mr. Rime, Nidoran♀, Nidoran♂, Ho-Oh, Porygon-Z,
  Type: Null, Jangmo-o, Hakamo-o, Kommo-o and Flabébé.
- `/pokemon-play wild` reads a name as `/pokemon` does: `wild porygon 2` brings Porygon2, `wild shiny pikachu` a shiny
  Pikachu, and `wild 🔥` answers _"No Pokémon called "🔥""_ instead of bringing a random visitor.
- With the PC box full, a misspelt `/pokemon <name>` gets its _"Did you mean …?"_ before the box-full refusal.
- `/pokemon release vulpix`, `take` and the like, with only an Alolan Vulpix in the PC box, said there was none. They
  ask _"Did you mean Vulpix (Alola)?"_ now. `/pokemon vulpix` and `add vulpix` still catch a plain one, as before.
- `/pokemon help` (or `--help`, `?`) answered _"No Pokémon called "help""_. It lists every sub-command now, and the
  command's one-line description names `remove` too.
- On a narrow band the evolution screen's message shortens from the front ("CHARMANDER evolved into CHARMELEON!",
  then "CHARMANDER → CHARMELEON!") instead of cutting the new form's name off with "…".
- In the `white` style the burst of light now covers the whole dark silhouette; its head, tail and feet no longer
  stick out.
- A ball thrown at a visitor standing at the band's edge comes to rest inside the band, so the drop, wobbles and
  break-free can be seen.
- The "!" over the tallest party member is whole during its startled hop, not cut off at the top of the band.
- The PokéMart works from 40 columns: Buy, Max and the Other tab can be clicked and the price shows whole. Names get a
  gap before their price.
- An open PokéMart follows ₽ earned in another window: Max and the colour of Buy are right at once.
- A Lucky Egg gives exactly half again, rounded down (a test run's 5 XP is 7, a commit's 10 is 15).
- `npm test && git commit` in one call earns both: 5 XP and ₽50 for the test, 10 XP and ₽100 for the commit.
- Two Claude Code windows changing the save at the same moment no longer undo each other. A `/pokemon on` in one
  window could be reverted by a `/pokemon everstone` in the other, and a purchase, a catch or an evolution could be
  lost the same way. A window now reads the save again just before it writes, and makes its change on what another
  window wrote meanwhile. Two writes within the same few milliseconds can still lose one of the changes; none is ever
  made twice.
- A save write the store refuses (another window holding its lock) is no longer shown as done: the ₽, the Bag and the
  party drawn stay as stored, and the command says it couldn't reach the Pokémon.
- Every command answers within a few seconds, whatever it waits on. Commands queued behind evolutions or a stalled
  download could run past Claude Code's ten seconds for a command: their answers were lost, and after a few the plugin
  was unloaded until a restart, the band gone. A command still waiting after six seconds now answers _"Still working
  on it… What comes of it is told in a notification when it's done."_ What it then does comes as a toast, and a list
  (`/pokedex`, `/pokemon party`) says it's ready to be run again.
- An evolution while the party is off no longer plays its in-place animation when `/pokemon on` brings the party
  back: it comes back evolved, as the toast already said.
- `/pokemon-play evolve` while the party is off says there is nothing to show, instead of promising a preview that
  never came.
- A first start offline, then a slow network, catches one first Pokémon. Retries could overlap and catch two, the
  first going into the PC box unasked.

### Known limitations

- `/pokemon party`, `/pokedex` and other commands you run while a screen plays already show the new form: the save
  has it from the start. A command that names the Pokémon needs its new name too.

### Upgrading

- **Restart every open Claude Code window after installing 1.5.0.** Until it restarts, a window still running an
  older version writes the save its own way:
  - **1.2.0** (if you're upgrading straight from it): the first time it writes, which is as soon as it opens or
    resumes, or at its next level-up, catch or party change if it was already open, it erases your Bag, every held
    item (Everstones too), the ₽ you've spent and earned, and your evolution style. It also evolves Pokémon by its
    old rule: a Pokémon holding an Everstone, or one that now needs a stone or friendship (Pikachu, Eevee…),
    evolves at Lv 30, and that can't be undone. ₽ from sessions it tidies up is lost too, and it earns no ₽
    itself.
  - **1.3.0 or 1.4.0**: it resets your evolution style to `rays` and drops `evolvedAt`, so that evolution's
    screen then doesn't play in other windows. Nothing else is lost.

## [1.4.0] - 2026-10-19

### Added: wild Pokémon that fit the place and the hour

- Who wanders by follows the games' odds now, instead of all 905 being equally likely. Each species weighs the square
  root of its catch rate from the games, a first stage more than its evolutions, a baby less. Averaged over the
  twenty landscapes, a Pidgey turns up about once in 190 visits, an Eevee once in 970 and a Dratini once in 1,900:
  ten Pidgey for every Dratini.
- Legendaries, mythicals and Ultra Beasts come about once in 100 visits, a mythical half as often as a legendary.
- The landscape on screen matters: a Pokémon with a fitting type is 4 times as likely. Water, Ice, Flying and Bug by
  the lake; Rock, Ground, Steel, Ice, Dragon, Fighting and Flying in the mountains; Ground, Normal, Fighting, Fire,
  Rock and Flying on the hills; Bug, Grass, Poison, Fairy, Normal and Dark at the forest's edge; Normal, Grass, Bug,
  Electric, Fairy and Flying in the meadow.
- So does the time of day, twice as likely: Ghost, Dark, Poison, Psychic and Fairy at night; Flying and Psychic at
  dawn; Fire, Grass, Bug and Normal by day; Flying and Psychic at dusk, and Ghost 1.5 times. Place and time stack (up
  to 8 times). Any Pokémon can still turn up anywhere now and then.
- A Pokémon you've never seen is 2.5 times as likely to show up. The ones you've met keep coming too.
- A regional form counts its own types: an Alolan Vulpix is Ice, so it likes the mountains. Alternate forms share
  one in eight of their species' visits, as before.
- The odds need no download: the species data (catch rates, stages, the types of every form) ships with the plugin.
- `/pokemon-play wild` draws with these odds, for the place and time on screen (`/pokemon-play lake` first to try the
  lake). `/pokemon-play wild <name>` still brings exactly that one.

### Added: twins and a numbered pick

- Your party can hold two or three of the same Pokémon. A catch joins the party whenever it has room, twin or not,
  and `/pokemon add eevee` catches another Eevee even with one in the party. Twins walk as two, each evolves its own
  way, and each counts its own time together. The Mart's "Your party" line counts them: `Eevee ×2 → Vaporeon`.
- When a name fits more than one of yours, the command lists them, numbered, and does nothing:
  `Which Eevee? 1. Eevee ♀ Lv 24 (party) · 2. ✨ Eevee ♂ Lv 3 (PC box) — add the number: /pokemon release eevee 2`.
  Each line shows gender, shininess, level, held item and where it is: the party first, then the PC box. Add the
  number to pick one. A number past the end answers with the list again (a list of one too), unless the words are a
  name of their own: with two plain Zygarde, `zygarde 10` is still the 10% form. `shiny` can go anywhere
  (`release eevee 2 shiny`), and the list's hint keeps it.
- "Did you mean …?" only suggests one of yours it then finds: `release tyhlosion` with a Hisuian Typhlosion in the PC
  box suggests `release typhlosion hisui`. Asking for a shiny you don't have says so.
- Every command that names one of yours does this: `/pokemon <name>`, `add`, `deposit`, `release` (`remove`),
  `give` (Rare Candy too), `take` and `everstone`.
- A number that is part of a name stays part of it: `/pokemon porygon 2` is Porygon2 unless you have two Porygon
  (with just one, `porygon 1` picks it), and `zygarde 10` is Zygarde's 10% form.

### Added: release from the PC box

- `/pokemon release <name> [n]` (or `remove`) works on the party and the PC box, with no confirmation:
  _"Bye bye, ✨ Eevee ♂ (Lv 16, PC box)! It went back to the wild."_ It names the level and where it was, and ✨ and
  ♀/♂ as the numbered list does, so a slip shows at once.
- A held item goes back to the Bag. The free Everstone goes with the Pokémon (`/pokemon everstone` gives another).
  When the Bag already holds 999 of that item, the release is refused: "Your Bag can't hold another Fire Stone (999
  already)."
- Your only party member can't be released ("Pick a new lead first."); releasing the lead makes the next one lead.
  The Pokédex still counts it as seen and caught.
- Releasing or depositing a Pokémon while another evolves leaves the animation on the evolving one. Releasing the
  evolving one stops it.

### Changed

- A wild Pokémon is never a Mega, Gigantamax, Primal or other battle-only form (Zen Darmanitan, Ash-Greninja,
  Crowned Zacian...), a costume (Cosplay Pikachu, Pikachu in a cap), a Let's Go partner, a Hisuian noble, Shadow
  Lugia, an Arceus or Silvally type, a gift or event form (Spiky-eared Pichu, Dada Zarude, Original Color Magearna,
  Fancy and Poké Ball Vivillon, Eternal Floette) or a Furfrou trim. `/pokemon <name>` and `/pokemon-play wild <name>` still bring any of them.
- Plain `/pokemon release` (or `remove`) asks "Which one? /pokemon release <name>". It used to release a random
  member.
- `/pokemon vulpix` with only an Alolan Vulpix in your party makes that one lead. It used to catch a plain Vulpix.
  From the PC box a plain name never takes another form: with the Alolan one there, `/pokemon vulpix` still catches a
  plain one (`/pokemon alolan vulpix` brings it out). `/pokemon-play wild vulpix` still brings a plain one to catch.
- Wild odds are gentler on evolved and rare-catch-rate Pokémon: the catch rate counts by its square root, and a second
  stage is 0.75, a third 0.55 and a baby 0.4 as likely as a first.
- Forms that need an item or an event are never wild: Rotom's appliances, Deoxys' Attack, Defense and Speed, the
  Therian formes, the Origin formes of Giratina, Dialga and Palkia, Genesect's Drives, Sky Shaymin, Resolute Keldeo
  and Alcremie's sweets. Wormadam's cloaks still are. `/pokemon <name>` still brings any of them.
- `/pokemon-play wild <name>` takes everything after `wild` as the name, so `wild lycanroc dusk` brings Dusk Lycanroc
  instead of switching the scene to dusk. Asking again while a visitor is out answers "<Name> is still here."
- A wild Pokémon can be aimed at at once, offline too: its catch rate comes from the shipped table, not a download.
- `/pokemon <name>` for a Pokémon you don't own (and plain `/pokemon`) no longer sends your lead back to the wild: it
  goes into the PC box with its level and held item. _"A wild Charmander appeared! It's your new lead. Pikachu (Lv 12)
  went into the PC box."_ It used to be released, and its held item lost.
- `/pokemon shiny eevee` with no shiny Eevee of yours always brings a new shiny one to lead, however many plain ones
  you have (it used to depend on how many and where).
- `/pokemon take <name>` looks in the party and the PC box together, numbered party first. Of several, the only one
  holding an item is taken; when more than one holds something, it asks which.
- "Came out of the PC box", "went into the PC box", "leads the party again" and "joined your party" show ✨ and ♀/♂
  too. A Pokémon whose gender isn't known yet (one saved before genders, or not looked up yet) shows no sign.
- A full Bag says the same in every command (release, give, take, buy): "Your Bag can't hold another Fire Stone (999
  already)." Not enough ₽ shows the ₽: "Not enough ₽: ₽6,000 more to go."
- `/pokemon add` right after another session made room in the party adds at once, instead of saying the party is full
  until the next sync.
- The PC box holds 960 Pokémon, as the games' 32 boxes of 30, and `/pokemon box` shows how full it is
  (`Your PC box (40 / 960):`). When it's full, a new lead (or plain `/pokemon`) that would send the old one there and
  a `deposit` are refused with "There's no more room in your PC box!", and nothing changes. With the party full too, a
  click on a wild Pokémon throws no ball and says so; it stays out to catch once you release one. A catch whose box
  another session fills while the ball wobbles breaks free. Nincada still evolves, but Shedinja needs the room. An
  older save holding more keeps them all.
- `/pokemon party` and `box` put "together …" and "holds …" before "evolves …", and the evolves text, which can run
  long for a branching line, comes last. One long cell no longer pushes everyone else's columns off to the right.
- A wild Pokémon roams the whole band, the 🛒 ₽ label's corner included, while it is out (the party still keeps out of
  the corner). The label comes back once the visitor and its ball are gone.

### Fixed

- After a click in the PokéMart, typing a command no longer vanishes with every Enter a buy. Any key the Mart doesn't
  use (`/`, a letter other than `x`, a digit, a space) closes it, and what you type goes to the prompt. Enter right
  after a buy asks "Press Enter again to buy another Fire Stone." instead of buying again; a click on Buy still buys.
- In the Mart, a capital X is typed, never taken for `x` (close), wherever the terminal reports it as shift + x. When
  the prompt can't take what you typed (a dialog is open), a toast shows the text instead of dropping it.
- The open Mart's "in bag" counts follow every Bag change at once: a release or `take` from the PC box, a `give`, a
  `/pokemon buy`, another session's change.
- Two stones given one after the other no longer cut the first evolution short. Evolutions go one at a time, each with
  its whole animation: the second command answers once its own evolution has started.
- A stone given to a Pokémon that another session has just released or put in the PC box says "Eevee is no longer in
  your party. Your Water Stone is still in your Bag." It used to say "Eevee already evolved."
- An evolution that starts while a sprite is still downloading for another session's change (a release and a catch
  there) plays from the evolving Pokémon's own picture, never the released one's, and never shows it twice.
- An evolving Pokémon is drawn in front of the whole party for its animation, so one standing behind the lead no
  longer evolves out of sight. The lead is back in front once it's done.

### Upgrading

- **Restart every open Claude Code window after installing 1.4.0.** A window still running 1.3.0 reads names
  differently: its `remove` picks one at random, and its "Did you mean" hints release the first of two twins.

## [1.3.0] - 2026-10-13

### Added: the PokéMart and Pokédollars

- You earn Pokédollars (₽) from the same work that earns XP, ten times over: ₽20 when Claude finishes a reply, ₽50
  when a test run passes, ₽100 for a commit. It's one wallet: ₽ is earned once per event, not per party member.
  Everyone starts with ₽3,000, as in Pokémon Red and Blue: existing saves get ₽3,000 too, and ₽ is earned from this
  version on (earlier work isn't paid back).
- A `🛒 ₽ 1,240` button sits in the band's top-right corner and shows `+₽20` as you earn. Big balances show as
  `₽ 100k` or `₽ 1.2M`. Click it to open the PokéMart inside the band: four tabs (Stones, Hold items, Special,
  Other), each item with its description from the games, and a "Your party:" line when it would evolve one of yours.
  Item pictures show when the band is at least 8 rows tall, otherwise a coloured ◆.
- The Mart won't open while a wild Pokémon is out ("catch it or let it go first"), and the ₽ button hides until it
  has gone.
- In the Mart: click into it, then `↑` `↓` to choose, `←` `→` for tabs, `-` `+` or `◀` `▶` for how many, `Max`
  for as many as you can afford, `Enter` or `Buy` to buy, `x` or `✕` to close. `/pokemon mart` opens it too. A buy
  you can't afford says how much more you need and keeps the quantity you chose; `Max` says so when you can't afford
  even one.
- `/pokemon buy <item> [count]` shops by typing, for terminals that pass no clicks: `buy 3 fire stone`, `buy fire-stone 3`,
  `buy rare candy`. It refuses exactly as the Mart does and says what you have left; a close misspelling gets a suggestion.
  Plain `/pokemon buy` lists the Mart by tab with prices. `/pokemon mart` now ends with a reminder of it.
- Prices: Stones ₽3,000; Rare Candy ₽4,800; Soothe Bell ₽4,000; Lucky Egg ₽10,000; everything else ₽5,000. The Bag
  holds up to 999 of each.

### Added: the Bag and held items

- `/pokemon bag` lists your items by tab, your ₽, and who holds what, in the party and the PC box.
- `/pokemon give <item> <pokemon>` (either order, and item names work with spaces or hyphens: `give pikachu thunder stone` and
  `give thunder-stone pikachu` both work). A stone, a trade item
  or the Linking Cord evolves the Pokémon at once and is used up. A hold item is held. A Rare Candy raises one
  level. An item that does nothing for that Pokémon is refused, and nothing is used up. An item name a little off
  gets a suggestion: `Did you mean Thunder Stone? Run /pokemon give thunder-stone pikachu`.
- One held item per Pokémon, as in the games: giving another puts the old one back in the Bag.
  `/pokemon take <pokemon>` puts it back by hand, from a Pokémon in the PC box too.
- Lucky Egg: its holder earns half as much XP again. _(Changed in 1.5.0: rounded down, so a test run's 5 XP is 7.)_
  Soothe Bell: its holder's time together counts 1.5 times.

### Added: friendship from time together

- Each party member counts the time it spends in your party while Claude Code is open. `/pokemon party` shows it
  (`together 2d 5h`). Friendship evolutions happen at 10 hours together: Pichu, Cleffa, Igglybuff, Togepi, Azurill,
  Budew, Chingling, Munchlax, Riolu, Golbat, Chansey, Buneary, Swadloon, Woobat, Snom, Type: Null, Alolan Meowth,
  and Eevee (Espeon by day, Umbreon by night).
- Time in the PC box, with the party off, or with Claude Code closed doesn't count, and two sessions open at once
  count each minute once.

### Added: evolutions that follow the games

- A Pokémon that can branch takes the same branch every time, decided by that Pokémon as the games decide Wurmple's:
  one Wurmple always becomes Silcoon.
- Scatterbug and Spewpa evolve (Spewpa into one of 20 Vivillon patterns), and so does Sinistea.
- A test plays all 515 evolution paths end to end; the checklist is `specs/evolution-coverage.md`.

### Changed

- Evolutions that need an item in the games need that item here: Pikachu a Thunder Stone, Haunter a Linking Cord,
  Onix a Metal Coat, Galarian Slowpoke a Galarica Cuff or Wreath, Sneasel a Razor Claw at night. They used to happen
  at Lv 30.
- The time of day matters where it does in the games: Rockruff becomes Midday Lycanroc by day, Midnight Lycanroc at
  night and Dusk Lycanroc at dusk; Cubone at night becomes Alolan Marowak; Alolan Rattata, Galarian Linoone, Amaura
  and Greavard evolve only at night; Yungoos, Fomantis and Tyrunt only by day. Dartrix becomes plain or Hisuian
  Decidueye at Lv 34. Pancham needs a Dark-type party member. Mantyke evolves with a Remoraid in the party.
- Shedinja joins you when Nincada evolves (into the PC box if the party is full), counts as caught, and keeps
  Ninjask's level.
- Phione no longer "evolves" into Manaphy, which the games never do.
- `/pokemon party` says how each Pokémon evolves: `evolves at Lv 36`, `evolves with a Thunder Stone`,
  `evolves with friendship by day (♥ 67%, 3h 18m to go)`.
- The everstone is a held item now. `/pokemon everstone <name>` still gives (or takes back) a free one; giving
  another item replaces it.

### Fixed

- Dusclops, Rhydon, Lampent, Eelektrik, Doublade, Piloswine, Seadra and 10 others no longer evolve twice in a row.
  They reached their stage above Lv 30 and then hit the old Lv 30 rule straight away.
- Baby Pokémon (Pichu, Cleffa, Togepi...) no longer wait until Lv 30.
- After `/clear` the party comes back above the prompt by itself. It used to stay hidden until the party changed.
- While you aim at a wild Pokémon, the ₽ button's corner shows the landscape, and a click there throws a ball. It
  used to go blank.
- The Linking Cord's picture in the Mart is a grey coil with a plug at each end. It used to be a dark blob.

### Known limitations

- **Clicking needs Claude Code's fullscreen mode:** the ₽ button, the Mart and throwing Poké Balls (`/config`, or
  `"tui": "fullscreen"` in settings). Without it, use `/pokemon mart` to look and `/pokemon buy` to shop.
- **Close other Claude Code windows before upgrading:** a window still running 1.2.0 can write the save without the
  new Bag, ₽ and held items. _(It does, the first time it writes: 1.5.0's Upgrading note says what it erases.)_
- **Esc doesn't close the Mart:** Claude Code keeps Escape to give the keyboard back to the prompt. Use `x` or `✕`.
- **Click the Mart before using its keys,** after `/pokemon mart` too: Claude Code gives a plugin's band the keyboard
  only on a click.
- **The mouse wheel doesn't move the Mart's list:** Claude Code passes the wheel to the band only when it's taller
  than its space, which the Mart never is. Use `↑` `↓`, `▲` `▼` or a click.
- **17 evolutions keep a level**, because the games tie them to something the plugin has no way to do (a move,
  steps, a battle). They happen at Lv 30, or 10 levels after the Pokémon reached its stage when that's later:
  Mime Jr., Yanma, Piloswine (Lv 43), Aipom, Poipole, Steenee, Lickitung, Clobbopus, Tangela, Bonsly, Stantler,
  Meltan, White-Striped Basculin, Galarian Yamask, Galarian Farfetch'd, Hisuian Qwilfish, and Eevee into Sylveon.
- **Some evolutions come within a minute, not at the exact level-up:** a Pokémon holding a level-up item, and
  Mantyke, evolve within a minute once the condition holds.
- **Gen 9 Pokémon and items** (Gimmighoul Coin, Syrupy Apple, the Teacups, the Armors, Metal Alloy, Leader's Crest)
  aren't in the plugin: its Pokémon end at Gen 8.
- **Alcremie's cream follows the time of day**, and only the Strawberry Sweet is sold.
- **Spewpa can become event-only Vivillon patterns** (Fancy, Poké Ball).
- Tyrogue's stats, Inkay's upside-down console and Sliggoo's rain are ignored: they evolve by level alone.

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
  your party, or the PC box when your party is full or already has one of it. It starts at Lv 1. _(Changed in 1.4.0: twins are welcome, so only a full party sends a catch to the PC box.)_
- Broke free: up to two wobbles (more when it was close), then the ball bursts open and the Pokémon pops out with
  a hop. 1 time in 10 it then flees, dashing to the nearest edge and leaving a puff of dust; otherwise you can
  throw again, as often as you like while it's in view.
- One ball at a time: clicks while a ball is in the air or wobbling, while the Pokémon is still in the grass or
  fleeing, or with no wild Pokémon around do nothing.

### Added: the PC box

- `/pokemon box` lists the Pokémon in your PC box, with levels, as `/pokemon party` does.
- `/pokemon <name>` brings a Pokémon out of the box to lead; your old lead goes into the box. A name in both your
  party and the box picks the party one. _(Changed in 1.4.0: when a name fits both, the command lists them, numbered, and you pick.)_
- `/pokemon add <name>` brings a Pokémon out of the box into your party when there's room.
- Pokémon in the box don't earn XP.
- `◓` after a name in `/pokemon party` and `/pokemon box` marks a Pokémon caught with a ball.
- `/pokedex` counts what you caught: `Pokédex: 71 / 905 seen · 3 caught · 6 shiny`.
- `/pokemon-play wild <name>` calls a particular wild Pokémon, for trying a throw at it.

### Known limitations

- **Throwing needs mouse clicks:** your terminal has to pass mouse clicks to Claude Code, which it does only in
  its fullscreen mode (`/config`, or `"tui": "fullscreen"` in settings).
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
- `/pokemon <name>` picks your lead. A Pokémon already in your party moves up with its level (no new sighting is recorded); a new one replaces the lead and the reply says who went back to the wild. _(Changed in 1.4.0: the old lead goes into the PC box instead of back to the wild.)_
- `/pokemon add [name]` and `/pokemon remove [name]` (or `release`). With no name, `add` catches a random Pokémon and `remove` releases a random member, never the lead. The party can't be emptied. `remove vulpix` means the plain Vulpix when an Alolan one is in the party too (`remove alolan vulpix` for that one). _(Changed in 1.4.0: a bare `remove` asks "Which one?", and a name fitting several of yours lists them, numbered.)_
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
- **Game-only rules aren't modelled:** the Let's Go starter Pikachu and Eevee evolve like any other, and evolutions by time of day, location or held item all happen at their level (or Lv 30). _(Changed in 1.3.0: evolutions follow the games, by stone, trade item, friendship, time of day, gender and party; 17 that need a move, steps or a battle still go by level.)_
- **Headless runs count:** a `claude -p` run earns XP and can evolve your party, though nothing is drawn.
- **Narrow bands:** near the band's edges the thought bubble can be cut off (often on a 40-column band), and the "!" bubble over the tallest member loses its top for the 0.4 s startled hop.
- **Drawn in the terminal only:** the band is made of terminal cells, so it shows in `claude` in a terminal (editors' integrated terminals included) but not in the Desktop app's Code tab, the VS Code extension's chat panel or the web. Those sessions still earn XP.
- **Hand-tested on macOS only.** Linux is covered by CI; Windows has had a code review, not a run.
- **macOS Terminal.app** draws block characters from the font, so the pixel art shows thin lines between rows and can look skewed for a frame while moving; iTerm2, Ghostty, kitty and WezTerm draw it crisp.
- **Colors:** the VS Code / Cursor terminal needs `"terminal.integrated.minimumContrastRatio": 1`, and the old Windows console can't show 24-bit color.
- **Sprites in the previews:** the plugin ships no Pokémon art, but the README's preview images (on the `assets` branch) show sprites as the plugin draws them.

[Unreleased]: https://github.com/JinHang02/claude-code-pokemon/compare/v1.7.0...HEAD
[1.7.0]: https://github.com/JinHang02/claude-code-pokemon/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/JinHang02/claude-code-pokemon/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/JinHang02/claude-code-pokemon/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/JinHang02/claude-code-pokemon/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/JinHang02/claude-code-pokemon/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/JinHang02/claude-code-pokemon/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/JinHang02/claude-code-pokemon/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/JinHang02/claude-code-pokemon/releases/tag/v1.0.0
