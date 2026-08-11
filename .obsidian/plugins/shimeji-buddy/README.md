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
- Every animation built from that image is listed right there too - rename
  or delete any of them without leaving the window.

Got a sprite with a solid-color background instead of a transparent one
(common with low-res/scraped sheets, where a clean cutout is hard to find)?
Hit **"Remove background…"** next to an image in the Images list - it's
color-key transparency: pick (or click the live preview to sample) the
background color, adjust tolerance, and everything close to that color
becomes transparent. Works regardless of the art's own resolution or
quality, since it's only matching a color, not detecting foreground vs
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

The animation engine, idle behaviour, and reactions work identically whether
the built-in placeholder or a character you've built is active.

## Actions and the animation library

Everything Shimeji can react to - opening/creating/deleting/renaming/editing
a note, the search pane opening, being poked, falling asleep while idle, and
any Obsidian command you name by its command id - is listed in
**Settings → Shimeji Buddy → Actions Shimeji can react to**. An animation you
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
same way it would to plain "idle" (see "Actions Shimeji can react to"):

- **Happy** - energetic, from typing or otherwise using the vault recently.
  Runs the standby brain faster (acts sooner) too.
- **Bored** - long inactivity; this is what the old standalone "falling
  asleep" state is now, folded into the mood system (any character.json
  built before moods existed that already used the `sleep` trigger id still
  works). Runs the standby brain slower.
- **Angry** - poked or thrown too much, too fast (5+ within 15 seconds).
- **Normal** - the rest of the time, between the happy window and the bored
  threshold.

*Planned, not built yet:* scripted/idle speech lines beyond the current
simple per-action text pool.

## Features

- **Standby brain**: on a randomized timer, the buddy decides for itself
  whether to idle in place or roam - travel time scales with distance so it
  doesn't teleport or crawl. With a custom animation library it draws from
  whatever you've built (see "Actions and the animation library" above); with
  the built-in placeholder it picks from a configurable pool of gaits and
  poses (Settings → Standby behaviour → Idle behaviors) - walk/run/jump,
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
- Settings is organized into collapsible sections (General, Standby
  behaviour, React to vault actions, Actions reference, Speech bubble,
  Character) with inline tips/warnings, so it stays easy to navigate as it
  grows.
- Three commands (Command palette): "Poke the buddy", "Toggle buddy
  visibility", and "List all command IDs into current note" (browse every
  Obsidian command id, to add one as a custom trigger).

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
- `settingsTab.ts` - the settings UI, including the character editor.
- `settings.ts` - settings types and defaults.
