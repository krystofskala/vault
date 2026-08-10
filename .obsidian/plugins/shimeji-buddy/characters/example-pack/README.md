# Folder pack format

This folder is a **template**, not a ready-to-use character - it deliberately
ships without any images. Use it as a reference for building your own pack
from sprites of whatever character you like, however you found them, as long
as you have the rights to use them.

**Note:** this format requires every frame in a strip to be the same size,
laid out in a neat row. If your sheet is irregular instead - frames of
different sizes, packed by hand, extra non-sprite stuff mixed in (very
common on fan-made/ripped sheets) - use **Settings → Shimeji Buddy →
Character source → Single spritesheet** instead. That mode lets you
drag-select each frame's exact bounding box directly on the image, no
uniform grid required, and is generally the easier way to build a library
of many animations by hand.

## Layout

A folder pack is a folder containing:

- `manifest.json` - describes the character and its animations (see below)
- one PNG per pool entry, each a **horizontal strip** of equally-sized frames
  (frame 0 leftmost, reading left to right)

Point the plugin at the folder via **Settings → Shimeji Buddy → Character
source → Folder pack**, using a vault-relative path, e.g.:

```
.obsidian/plugins/shimeji-buddy/characters/my-character
```

## manifest.json

```json
{
  "name": "My character",
  "frameWidth": 128,
  "frameHeight": 128,
  "animations": {
    "idle": [
      { "file": "idle.png", "frames": 4, "fps": 4, "loop": true, "weight": 3, "moves": false },
      { "file": "walk.png", "frames": 6, "fps": 8, "loop": true, "weight": 1, "moves": true }
    ],
    "note:open": [
      { "file": "wave.png", "frames": 5, "fps": 8, "loop": false }
    ]
  }
}
```

- `frameWidth` / `frameHeight` - the pixel size of a single frame. Every
  strip in the pack must use this same frame size (strip width = frameWidth
  * frame count).
- `animations` - a map keyed by **trigger id** (see the full list of built-in
  ones, and how to add your own for any Obsidian command, in the plugin's
  own Settings tab under "Actions Shimeji can react to"). Each key's value
  is an array - a *pool* of candidate animations for that trigger. Multiple
  entries under one key are picked between at random, weighted, so e.g.
  `note:open` could have three different "wave" variants that show up with
  different odds instead of always playing the same one.
- `weight` - relative pick probability within its pool. Optional, defaults
  to `1`.
- `moves` - only meaningful under the `idle` key: `true` means this entry
  also roams the buddy to a new spot on screen while playing (like a walk or
  run cycle); `false` (the default) means it plays in place, like resting.
- `loop` - `true` for animations that should play continuously for as long
  as they're showing (typically everything under `idle` and `sleep`),
  `false` for one-shot reactions that play once and then return to idle.
- A key with no entries defined (or entirely absent) just falls back to the
  `idle` pool, or the built-in placeholder if that's empty too - same as an
  animation that's disabled or has no frames yet.

## Getting sprites

This plugin doesn't bundle or fetch any character artwork. Source sprite
sheets yourself from somewhere you have the rights to use them, slice/arrange
them into the strip format above (or use the single-spritesheet mode in
settings if they're not a uniform grid), and drop them in a folder next to a
`manifest.json` like this one.
