# Shimeji Buddy

A little animated desktop-mascot-style character that lives in the corner of
your Obsidian window - named after the classic [Shimeji](https://en.wikipedia.org/wiki/Shimeji_(software))
desktop pets, because like those, it's built to wear *any* character you give
it. It idles on its own - picking its own animations, occasionally running to
a new spot anywhere on screen - and reacts when you open, create, edit,
delete, rename or search notes. Works on desktop and mobile, scaling to stay
proportionate on anything from a phone to an ultrawide monitor.

## About the character

This plugin ships **no character artwork of its own** - just a small generic
placeholder drawn with plain CSS shapes, so it works immediately with zero
assets. Everything else is up to you: paste in sprites of your favorite
character from wherever you find them, in whatever shape they come in.
You're responsible for having the rights to use whatever art you bring in;
this plugin doesn't fetch, bundle, or redistribute any character's artwork
itself.

A character is one folder that can hold as many images as you want - clean
equal-frame strips, large messy sheets, whatever you've got (e.g. an
asset-pack export with a dozen separate PNGs). Build one entirely from
**Settings → Shimeji Buddy → Character**: create it, upload images (picked
from anywhere on your computer, multiple at once, not just the vault) or
point at a folder you've already dropped into the vault yourself, then hit
**"Edit frames…"** on an image to open a large dedicated editing window (as
close as a plugin can get to a separate window - Obsidian doesn't expose a
way to pop a settings panel into its own OS window, so this is a big modal
instead of the cramped settings-tab column). In there:

- Starts as an even grid (set Columns/Rows, and Gap X/Y if the sheet has
  padding between frames - excluded from each cell, shown as a shaded red
  band). **Click a cell** to select it (numbered in click order - that
  order becomes the animation's frame order); click again to deselect.
  **Drag a grid line** (hover shows a resize cursor) to move it, resizing
  its two neighboring cells, for sheets where frames aren't quite uniform;
  **double-click a line** to delete it, merging those cells back into one.
  Dragging snaps to whole source pixels, and to match another cell's width
  when you get close to one, so it's easy to land on a clean, consistent
  size. The slicer also magnifies small pixel-art sheets heavily (up to
  24x) so individual cells on a 16x16 or 32x32 sheet are still clickable.
- For a large, messy sheet where frames aren't laid out in any clean grid
  (a common shape for full-character sheets scraped from elsewhere), use
  **"Auto-detect frames"** instead: pick one or more background colors
  (defaults to the top-left corner's color; add more with the color picker
  if the background isn't perfectly uniform), a tolerance, a minimum area
  to ignore small noise/dithering specks, and a merge gap so a sprite whose
  limbs got separated by background gaps within its own silhouette still
  comes back together as one box. Hit **Detect frames** and it finds every
  separate sprite's bounding box on its own - click any of them (numbered,
  same as the grid) to build your selection. Switching back to a grid
  ("Apply grid") discards the detected boxes.
- Every animation built from that image is listed right there too - rename
  or delete any of them without leaving the window.

Got a sprite with a solid-color background instead of a transparent one
(common with low-res/scraped sheets, where a clean cutout is hard to find)?
Hit **"Remove background…"** next to an image in the Images list - it's
color-key transparency: pick (or click the live preview to sample - each
click adds another color, for backgrounds that aren't perfectly uniform)
the background color(s), adjust tolerance, and everything close to any of
them becomes transparent. Works regardless of the art's own resolution or
quality, since it's only matching colors, not detecting foreground vs
background - just don't set the tolerance so high it starts eating the
character too. Overwrites the image in place (same filename), so animations
already built from it keep working.

Add a new empty animation any time from the **Animations** list in the main
settings tab ("New animation" - pick a source image, it appears in the list
immediately, ready for "Edit frames…" to fill it in), and delete one via the
🗑 button next to its name. Trigger assignment, weight, loop/speed/enabled
stay in that same list. No file editing required, though the character
folder stays a plain, portable `character.json` + images if you'd rather
script one - see `characters/example-character/README.md` for that format.
Everything saves itself instantly to that character's `character.json` -
there's no separate save step.

Every animation and Sequence also has a **▶ Play** button right next to its
name, so you can preview exactly what it'll look like - movement, timing,
speech line and all - on the live buddy immediately, without needing to
actually trigger the real action or leave the settings tab. Works even
before it's enabled or assigned to anything (as long as it has frames), so
it's useful mid-edit too.

Next to Play is a **⧉ Duplicate** button - clones the animation/Sequence
(new id, "(copy)" appended to the name, everything else identical) and
drops the copy right below the original, ready to tweak into a variant
instead of rebuilding one from scratch.

The animation engine, idle behaviour, and reactions work identically whether
the built-in placeholder or a character you've built is active.

## Actions and the animation library

Everything Shimeji can react to - opening/creating/deleting/renaming/editing
a note, the search pane opening, being poked, falling asleep while idle, and
any Obsidian command you name by its command id - is listed in
**Settings → Shimeji Buddy → Reactions & actions → Full action reference &
custom commands**. An animation you
build isn't locked to one of these: assign it to as many as you like (a
"happy hop" could play for both creating a note *and* being poked), and each
action draws from a weighted pool of everything assigned to it, so several
variants can share one action for variety instead of always playing the same
clip. Nothing assigned to an action just falls back to whatever idle is
doing - never a hard failure.

The idle pool works the same way, plus one extra flag: an idle animation can
be marked to roam the buddy to a new spot on screen while it plays (like a
walk or run cycle) or to just play in place (like resting), so a single pool
can mix "walks around," "sits and looks around," "stretches," whatever you
build, each with its own odds.

## Mood

Always running in the background, recomputed every few seconds from how
you've been treating the buddy - it's just which trigger id "idle" resolves
to, so a custom character can assign its own animation to any of these the
same way it would to plain "idle" (see "Reactions & actions" above):

- **Happy** - energetic, from typing or otherwise using the vault recently.
  Runs the standby brain faster (acts sooner) too.
- **Bored** - long inactivity; this is what the old standalone "falling
  asleep" state is now, folded into the mood system (any character.json
  built before moods existed that already used the `sleep` trigger id still
  works). Runs the standby brain slower.
- **Angry** - poked or thrown too much, too fast (5+ within 15 seconds).
- **Normal** - the rest of the time, between the happy window and the bored
  threshold.

## Movement

Every animation you build has a **Movement** picker (right below its trigger
chips) - a pre-scripted way of moving around the screen while it plays,
independent of what it looks like. Pick "Stay put" and it plays in place,
like today; pick anything else and it's tied to *that* animation regardless
of which action(s) it's assigned to - an angry-mood animation can stalk the
cursor, a bored one can idly follow it, a note-delete animation can vanish
off the nearest edge, all without needing anything beyond the picker:

- **Destinations** (travels there once, then stops): Random spot, Back to
  where it started, Move to an edge (a specific side, the nearest one, or a
  random one - stops touching it, still on-screen), Move to center, Move to
  a corner, Hide (same edge choices as "Move to an edge," but continues past
  it, off-screen), Peek from an edge (slides to just off that edge, leaving
  an adjustable amount visible - a percentage, since sprite height varies
  per character). Any of these can skip the travel animation and jump
  straight there ("Instant").
- **Move in** - a directional entrance in one step: teleports off-screen
  past a chosen edge (Top/Bottom/Left/Right/Nearest/Random, and which third
  along it - 1st/2nd/3rd), reveals, then walks/runs/falls/jumps in to a
  landing spot a little past that edge. Walking vs. running vs. falling vs.
  jumping in is entirely down to which edge you pick (top falls, bottom
  jumps, left/right walk or run in) and which animation you've paired with
  it - the engine doesn't tell those apart beyond that, so any look is just
  a matter of your own art. (The lower-level version of this - an instant
  Hide at a chosen edge, followed by a separate step tweening to a
  non-edge landing spot - still works too, useful when you want the
  hidden wait and the entrance to be two distinct beats, e.g. inside a
  Sequence; see "Sequences" below.)
- **Continuous** (keeps moving for as long as this reaction is active): Spin
  around center (facing outward, like a satellite), Walk around the window
  edges (facing the center - the same feet-on-the-boundary orientation
  "Along window edges" roaming already uses, just for any animation, not
  only idle), Pace back and forth along one edge, Follow the cursor (keeps
  a lazy distance - good for a bored mood), Stalk / block the cursor (gets
  right in the way - good for an angry mood), Avoid the cursor, Startle
  dash (a quick hop away, then settle).

Walk/run speed (px/sec) and the builtin placeholder's jump height are
configurable too - **Settings → Standby & idle behavior → Movement speeds**
- since they drive every destination/Move-in tween and gait, not just the
builtin placeholder's own idle roaming.

## Sequences

A single animation is one clip; a **Sequence** (Character → Sequences,
alongside Animations) is a scripted *timeline* of beats for when one clip
isn't enough - "vanish in a puff of smoke, wait 7 seconds, fall back in from
across the screen, say something." Assignable to actions and pooled/weighted
exactly like a plain animation, so the two mix freely in the same action's
pool (e.g. 70% of the time a note gets deleted it's just a quick poof, 30%
of the time it's the whole bit).

Each step in a sequence has its own:

- **Animation** - one of this character's own animations, or none at all
  (a pure wait/hidden beat).
- **Duration** - in ms, or 0 to use the animation's own natural length.
  Set it explicitly whenever you want exact timing (like "wait 7 seconds")
  or the animation loops, since a looping clip has no natural end of its own.
- **Hidden** - invisible for this step, however long it lasts.
- **Movement** - the exact same picker plain animations use (see
  "Movement" above) - so a step can vanish in place, travel somewhere,
  spin, follow the cursor, whatever fits that beat.
- **Say** - literal text shown the instant the step starts. Unlike normal
  reactions, this is exactly what you typed, not a random pick from the
  speech-lines file - a sequence is already a fully scripted moment.

Appearing or vanishing *in place* doesn't need anything beyond the above - a
plain animation (a puff of smoke, say) plus the Hidden checkbox on the step
before/after it. A *directional* entrance (walking, running, falling, or
jumping in) is exactly what "Move in" (see "Movement" above) is for - the
whole abayo bit is 3 steps:

1. **Poof** - your vanish animation, Movement: Stay put, Say: "Abayo!"
2. **Wait** - no animation, Hidden on, Duration: 7000
3. **Fall in** - your falling animation, Hidden off, Movement: Move in,
   Edge: Top - teleports off-screen above (still hidden from step 2, so no
   flash), reveals, and falls in to a landing spot below the top edge -
   Say: "JK, I'm back!"

Same recipe for walking/running in from a side (Edge: Left/Right) or
jumping in from the bottom (Edge: Bottom) - swap the edge and the paired
animation. For a directional *exit* instead (or when you want the hidden
wait and the entrance to be visibly two separate beats), drop to the
lower-level version: an instant Hide at a chosen edge, then a later step
tweening to a non-edge landing spot (or, for an exit, just Hide as the
final step with no landing needed).

## Speech

**Settings → Shimeji Buddy → Reactions & actions → Speech bubble** has two
independent things to configure:

- **Bubble style** - "Obsidian" (default) matches your theme's own colors;
  "Comic" is a fixed white bubble with a bold black ink outline and a
  stylized font, manga-panel style, the same in light or dark mode.
- **Speech lines file** - a markdown file, anywhere in your vault, of your
  own lines. Each plain line is one thing the buddy can say, tagged with `@`
  plus an action id to say when it's eligible - deliberately `@`, not `#`,
  since `#` already means something in Obsidian. A line can carry more than
  one tag (so it can play for several actions):

  ```markdown
  Hurá! @happy
  Zzzz... @bored @sleeping
  Grrr! @angry @poke
  Welcome back! @note:open
  ```

  A few friendly shortcuts are built in - `@happy`, `@bored`/`@sleeping`,
  `@angry`, `@normal`, `@poke`, `@idle` - for the moods and idle state, since
  their real action ids (`mood:happy`, etc.) are more technical. Anything
  else has to match an action id exactly from "Full action reference" in the
  same section, including `@note:open`/`@note:create`/etc. and
  `@command:your-command-id` for any custom command trigger you've added.

  **Structuring the file**: group lines under `##` headings however makes
  sense to you (by mood, by topic, whatever) - headings, `>` blockquotes/
  callouts, and `<!-- comments -->` are all "safe zones" the parser never
  reads as speech, *even if the text itself mentions an `@tag` as an
  example* (this isn't a full markdown parser, just a line scanner, so that
  distinction matters). That makes a permanent `> [!tip]` callout a good
  spot for your own tag cheat sheet, and an HTML comment a good spot for
  longer notes to yourself - Obsidian hides those in Reading view too, so
  they don't clutter what you actually see day to day. Hit **"Create (if
  needed) and open"** next to the file path to scaffold a starter file
  organized exactly this way, or **"Reload"** to re-parse on demand - though
  editing and saving the file in Obsidian itself already reloads it
  automatically. A trigger with lines in this file uses only those;
  anything not covered falls back to a small built-in default pool
  (covering opening/creating/deleting/editing/renaming a note, search, and
  poke) so reactions never go silent by default.

## Features

- **Standby brain**: on a randomized timer, the buddy decides for itself
  whether to idle in place or roam - travel time scales with distance so it
  doesn't teleport or crawl. With a custom animation library it draws from
  whatever you've built (see "Actions and the animation library" above); with
  the built-in placeholder it picks from a configurable pool of gaits and
  poses (Settings → Standby & idle behavior → Idle behaviors) - walk/run/jump,
  workout breaks (punches, push-ups, squats, a dumbbell lift with a
  puff-of-smoke prop), and three jutsus: **Multiplication Jutsu** (a couple
  of clone silhouettes pop in), **Transformation Jutsu** (a smoke puff and a
  sparkle-glam flourish), and **Shuriken Jutsu** (throws a shuriken at
  wherever your pointer last was). Each is individually enable/weight-able.
  "Roam style" picks anywhere-on-screen or patrolling the live boundaries of
  the sidebar(s)/main editor area - on the edges, the buddy rotates so its
  feet face the boundary it's walking, like a bug crawling around a picture
  frame.
- **Reacts to what you do** - opening/creating/deleting/renaming/editing a
  note, the search pane opening, being poked, falling asleep, and any
  Obsidian command you name (see below) - each with the built-in placeholder
  pose by default, or whatever you've assigned in your own library.
- Gets bored and falls asleep after a configurable period of vault
  inactivity (see "Mood" above), wakes back up on the next action or click.
- **Click counter mode** (Settings → General, or the "Toggle click counter
  mode" command - bind it a hotkey in Settings → Hotkeys for a quick
  on/off): while on, clicking the buddy tallies a running count in a
  speech bubble and hops it to a new nearby spot each click, instead of the
  normal poke reaction.
- **Triple-click to call over** (Settings → General → Interaction & touch,
  on by default) - triple-click anywhere outside a note's content (empty
  pane space, a sidebar, the tab bar) and the buddy runs over to that spot -
  the "Called over" action, assignable its own animation like any other.
  Never fires inside the editor or reading view, since triple-click is the
  standard "select this paragraph" gesture there.
- **Draggable on a leash** - click and drag to move it anywhere; it eases
  toward the pointer rather than snapping to it, so the further behind it's
  fallen the faster it catches up. Release mid-motion and it flies off with
  that momentum, bouncing off the screen edges until it runs out of speed.
  Position is remembered, and it rescales/re-clamps on rotation/resize so it
  can't end up off-screen.
- Click it for a quick reaction and an optional speech-bubble line.
- **Responsive size**: the size setting is a baseline that scales with the
  screen's smaller dimension, so it looks proportionate on a phone, a tablet,
  and a huge monitor instead of the same fixed pixel count everywhere.
- **Mobile-aware touch**: on Obsidian mobile, dragging/poking can be
  restricted to reading view only (on by default), so it's not competing
  with your thumb while you're typing - the buddy still animates and reacts
  in edit view, it just won't take touch input there.
- Settings is organized into four collapsible top-level sections - General,
  Standby & idle behavior, Reactions & actions, and Character - each with
  further nested collapsible sub-groups (e.g. Interaction & touch, Speech
  bubble, Images, Animations) and inline tips/warnings, so it stays easy to
  navigate as it grows.
- Commands (Command palette, each assignable its own hotkey via Settings →
  Hotkeys): "Poke the buddy", "Toggle buddy visibility", "Toggle click
  counter mode", "List all command IDs into current note" (browse every
  Obsidian command id, to add one as a custom trigger), and "Cycle to
  next/previous animation/sequence" - steps the live buddy through every
  animation and Sequence the active character has, in the order they're
  listed in Character → Animations/Sequences, wrapping around either
  direction. A quick way to page through everything a character has
  without opening settings at all - handy on mobile, or just bound to a
  key while you're building one.

## Installing / enabling

This plugin already lives inside this vault at
`.obsidian/plugins/shimeji-buddy`. In Obsidian: **Settings → Community
plugins**, turn off Restricted mode if needed, and enable **Shimeji Buddy**
in the list. `main.js`, `manifest.json` and `styles.css` are already built
and committed, so no build step is required to use it.

## Developing

```
cd .obsidian/plugins/shimeji-buddy
npm install
npm run dev     # watch mode
npm run build   # production build -> main.js
```

Source lives in `src/`:

- `main.ts` - plugin entry point, settings persistence, wiring vault/workspace
  events (and the command-id hook) to reactions.
- `CharacterWidget.ts` - the floating DOM widget: placeholder character
  animation, sprite playback, idle/standby brain, dragging, speech bubble.
- `spritePack.ts` - character folder I/O (character.json read/write, image
  upload/list/delete, character discovery) and resolves it all into a common
  trigger-id → weighted-animation-pool shape for CharacterWidget to play.
- `AtlasSlicer.ts` - the canvas-based drag-to-select tool used in settings to
  slice frames out of whichever image is being edited.
- `speechLines.ts` - parses the user's @tag-annotated speech-lines markdown
  file into a trigger-id → line-pool map.
- `settingsTab.ts` - the settings UI, including the character editor.
- `settings.ts` - settings types and defaults.
