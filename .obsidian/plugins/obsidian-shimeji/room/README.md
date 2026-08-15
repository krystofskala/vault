# The plant room's artwork

Drop a square image in this folder named **`room.png`** and the plant room will use it.

Nothing else is needed — no settings, no import step. If the file is missing or cannot be
decoded, the room falls back to the small pixel-art nook the plugin draws itself.

- **Square (1:1).** The picture is fitted into the room's square without distortion, and the
  colour behind it is sampled from the artwork's own top-left pixel, so the surround matches
  seamlessly. That surround is the only thing that stretches.
- **Any resolution.** The collision geometry is authored in percentages, so it holds whatever
  size the source is and whatever width the sidebar is dragged to.
- **After replacing it**, run **"Reload the plant room artwork"** from the command palette —
  the browser caches the old one otherwise.

## Making the shimeji stand on the furniture

The surfaces are authored in `src/room/apartment.ts`, in percentages of the square. They are the
one part of the room that cannot be checked by reasoning: the plugin draws the painted room's
picture and its collision lines from a single declaration, so those cannot disagree, but an image
knows nothing about the lines placed on top of it.

So look at them instead. Run **"Show/hide what the shimeji can stand on in the plant room"** and
the surfaces are drawn over the artwork:

- **solid green** — floors, things it stands on
- **dashed amber** — ceilings, things it hangs from
- **blue** — walls, things it climbs

Then move whatever is in the wrong place; the numbers are percentages, read straight off the
picture.
