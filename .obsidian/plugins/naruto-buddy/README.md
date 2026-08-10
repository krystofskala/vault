# Naruto Buddy

A little animated ninja that lives in the corner of your Obsidian window. It
idles on its own - picking its own animations, occasionally wandering to a new
spot - and reacts when you open, create, edit, delete, rename or search notes.

## Copyright note

This plugin does **not** ship any Naruto artwork. Naruto is copyrighted by
Masashi Kishimoto / Shueisha / Studio Pierrot, and distributing character art
from it isn't something this plugin can do. Out of the box it draws a small
generic placeholder ninja with plain CSS shapes, so everything works
immediately with no assets required.

The character engine isn't tied to Naruto at all - it just plays whatever you
give it. Two ways to supply a character, both in **Settings → Naruto Buddy →
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
  whether to idle in place or wander to a new spot along the window edge.
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
- Click it for a quick reaction and an optional speech-bubble line.
- Fully configurable from **Settings → Naruto Buddy**: size, idle timing,
  sleep timeout, which event reactions are on, speech bubble on/off and its
  lines, click-through mode, and the character source (built-in, a folder
  pack, or a freeform-sliced single spritesheet).
- Two commands (Command palette): "Poke the buddy" and "Toggle buddy
  visibility".

## Installing / enabling

This plugin already lives inside this vault at
`.obsidian/plugins/naruto-buddy`. In Obsidian: **Settings → Community
plugins**, turn off Restricted mode if needed, and enable **Naruto Buddy** in
the list. `main.js`, `manifest.json` and `styles.css` are already built and
committed, so no build step is required to use it.

## Developing

```
cd .obsidian/plugins/naruto-buddy
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
