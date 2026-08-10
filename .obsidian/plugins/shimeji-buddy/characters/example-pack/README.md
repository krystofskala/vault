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
uniform grid required.

## Layout

A folder pack is a folder containing:

- `manifest.json` - describes the character and its animations (see below)
- one PNG per animation, each a **horizontal strip** of equally-sized frames
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
    "idle": { "file": "idle.png", "frames": 4, "fps": 4, "loop": true },
    "walk": { "file": "walk.png", "frames": 6, "fps": 8, "loop": true }
  }
}
```

- `frameWidth` / `frameHeight` - the pixel size of a single frame. Every strip
  in the pack must use this same frame size (strip width = frameWidth * frame count).
- `animations` - a map keyed by the reaction names the plugin knows about.
  Any subset is fine; missing ones just fall back to `idle` (or the built-in
  placeholder if `idle` itself is missing).
- `loop` - `true` for animations that should play continuously (`idle`,
  `walk`, `run`, `jump`, `sleep` are the ones the plugin ever holds
  indefinitely), `false` for one-shot reactions that should play once and
  then return to idle.

## Recognised animation names

| Name        | Triggered by                                                |
| ----------- | ------------------------------------------------------------ |
| `idle`      | Standby, nothing going on                                    |
| `walk`      | Roaming to a new spot on its own, calm pace                  |
| `run`       | Roaming to a new spot on its own, fast pace                  |
| `jump`      | Roaming to a new spot on its own, hopping                    |
| `sleep`     | No vault activity for a while                                |
| `wave`      | Opening a note                                                |
| `cheer`     | Creating a note                                               |
| `poof`      | Deleting a note                                               |
| `nod`       | Editing a note (debounced)                                    |
| `surprised` | Renaming a note                                               |
| `think`     | Opening the search pane                                       |
| `poke`      | Clicking the buddy                                             |

`walk`/`run`/`jump` are all optional - define any subset and the buddy will
only pick between whichever ones your pack actually has when it roams (if
your pack defines none of the three, it just glides to the new spot with no
locomotion animation).

## Getting sprites

This plugin doesn't bundle or fetch any character artwork. Source sprite
sheets yourself from somewhere you have the rights to use them, slice/arrange
them into the strip format above (or use the single-spritesheet mode in
settings if they're not a uniform grid), and drop them in a folder next to a
`manifest.json` like this one.
