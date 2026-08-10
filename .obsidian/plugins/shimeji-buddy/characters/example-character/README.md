# Character format

**You don't need to write this by hand.** A character is normally built
entirely from **Settings → Shimeji Buddy → Character**: create one, upload
images (a clean strip, a messy full sheet, whatever you've got), slice out
frames (drag a box, or use "Generate strip frames" for an evenly-spaced
strip), and assign each animation to whichever actions it belongs to. This
folder just documents the file it writes, for reference or if you'd rather
script one.

`character.json` (shown here) deliberately has no real images alongside it -
the `frames` numbers below are illustrative, not meant to be loaded as-is.

## Layout

A character is a folder containing:

- `character.json` - the character's name and its full animation list (see
  below); the settings UI reads and writes this file directly.
- any number of source images, in any mix of clean equal-frame strips or
  large/messy sheets - referenced by filename from individual animations.

Point the plugin at the folder via **Settings → Shimeji Buddy → Character
source**, or just create/manage it there directly rather than placing files
by hand.

## character.json

```json
{
  "name": "My character",
  "animations": [
    {
      "id": "idle-rest",
      "name": "Idle rest",
      "sourceImage": "idle.png",
      "triggers": ["idle"],
      "moves": false,
      "weight": 1,
      "enabled": true,
      "loop": true,
      "fps": 4,
      "frames": [
        { "x": 0, "y": 0, "w": 64, "h": 64 },
        { "x": 64, "y": 0, "w": 64, "h": 64 }
      ]
    }
  ]
}
```

Each entry in `animations`:

- `sourceImage` - filename (within this folder) the frames are cropped from.
  All of one animation's frames come from a single image.
- `frames` - explicit crop rectangles, in that image's pixel coordinates, in
  playback order. For an evenly-spaced strip these are just N equal-width
  boxes across the image - the settings UI's "Generate strip frames" does
  that math for you instead of typing it out.
- `triggers` - which action id(s) (see **Settings → Shimeji Buddy → Actions
  Shimeji can react to** for the full list, including any command triggers
  you've added) this animation is a candidate for. One animation can be
  assigned to several; one trigger can have several animations sharing it.
- `weight` - relative pick probability among other enabled animations
  sharing any of the same triggers.
- `moves` - only meaningful when `idle` is among `triggers`: `true` roams
  the buddy to a new spot on screen while playing (a walk/run cycle),
  `false` plays in place (resting, sitting, etc).
- `loop` - continuous for as long as it's showing (typically `idle`
  entries), or play once and return to idle (typically one-shot reactions).
- `enabled` - quick on/off without deleting it.

A trigger with no enabled animations assigned just falls back to whatever
`idle` is doing - never a hard failure.

## Getting sprites

This plugin doesn't bundle or fetch any character artwork. Source images
yourself from somewhere you have the rights to use them and upload them
through the settings UI (or drop them straight into this folder).
