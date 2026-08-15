# The plant room's artwork

Drop the pictures in this folder and pick a room in the plugin's settings.

| Room | File to save here |
|---|---|
| **Apartment** — square studio flat | `room.png` |
| **Cellar** — timber grow-room | `room2.png` |
| **Plant nook** — drawn by the plugin | none needed |

`.webp`, `.jpg`, `.jpeg` and `.gif` work as well as `.png` — save whatever you already have.

Nothing else is needed: no import step, no path to type. If the chosen room's file is missing or
cannot be decoded, the pane says so and names the file it is waiting for, and shows the nook the
plugin draws itself in the meantime. Settings lists which rooms have their picture.

- **Never distorted.** Each room's box matches its artwork's own shape — the apartment is square,
  the cellar is landscape — and the picture is fitted into it, keeping its proportions at every
  sidebar width. The colour behind it is sampled from the artwork's own corner pixel, so the
  surround matches seamlessly. That surround is the only thing that stretches.
- **Any resolution.** The collision geometry is authored in percentages, so it holds whatever
  size the source is and whatever width the sidebar is dragged to.
- **After replacing it**, run **"Reload the plant room artwork"** from the command palette —
  the browser caches the old one otherwise.

## Making the shimeji stand on the furniture

The surfaces are authored in `src/room/apartment.ts` and `src/room/cellar.ts`, in percentages of
the room's width. They are the
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
