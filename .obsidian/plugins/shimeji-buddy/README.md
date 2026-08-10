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

Two ways to supply a character, both in **Settings → Shimeji Buddy →
Character source**:

- **Folder pack**: a folder with a `manifest.json` plus one sprite strip PNG
  per animation (uniform frame size). Drop it into `characters/` inside this
  plugin's folder and pick it from the dropdown - see
  `characters/example-pack/README.md` for the format.
- **Single spritesheet**: for sheets that *aren't* a tidy grid - frames of
  different sizes, packed irregularly, extra stuff mixed in (exactly what
  most fan-made/ripped sheets look like). Point at one image and slice it
  right there in settings: drag a box around each frame directly on the
  sheet (or type exact pixel coordinates), assign it to an animation, and
  add it - repeat in order for every frame you need. No manifest.json, no
  grid math.

The animation engine, idle behaviour, and event reactions work identically no
matter which one (or neither) is active.

## Features

- **Standby brain**: on a randomized timer, the buddy decides for itself
  whether to idle in place or roam to a random spot anywhere on screen,
  picking a walk, run, or jump gait each time - travel time scales with
  distance so it doesn't teleport or crawl.
- **Reacts to what you do**:
  - opening a note → wave/greet
  - creating a note → cheer
  - deleting a note → sad "poof"
  - editing a note → nod (debounced so it doesn't spam on every keystroke)
  - renaming a note → surprised
  - opening the search pane → thinking pose
- Falls asleep after a configurable period of vault inactivity, wakes back up
  on the next action or click.
- Draggable - click and drag to move it anywhere; position is remembered.
  Rescales and re-clamps on rotation/resize so it can't end up off-screen.
- Click it for a quick reaction and an optional speech-bubble line.
- **Responsive size**: the size setting is a baseline that scales with the
  screen's smaller dimension, so it looks proportionate on a phone, a tablet,
  and a huge monitor instead of the same fixed pixel count everywhere.
- **Mobile-aware touch**: on Obsidian mobile, dragging/poking can be
  restricted to reading view only (on by default), so it's not competing
  with your thumb while you're typing - the buddy still animates and reacts
  in edit view, it just won't take touch input there.
- Fully configurable from **Settings → Shimeji Buddy**: size, idle timing,
  sleep timeout, which event reactions are on, speech bubble on/off and its
  lines, click-through mode, mobile touch restriction, and the character
  source (built-in, a folder pack, or a freeform-sliced single spritesheet).
- Two commands (Command palette): "Poke the buddy" and "Toggle buddy
  visibility".

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
  events to reactions.
- `CharacterWidget.ts` - the floating DOM widget: placeholder character
  animation, sprite playback (folder pack or atlas), idle/standby brain,
  dragging, speech bubble.
- `spritePack.ts` - loads a folder pack (manifest.json + PNG strips) or an
  atlas (single image + explicit per-frame rectangles) into a common
  resolved-animation shape.
- `AtlasSlicer.ts` - the canvas-based drag-to-select tool used in settings to
  slice a freeform spritesheet into frames.
- `settingsTab.ts` - the settings UI.
- `settings.ts` - settings types and defaults.
