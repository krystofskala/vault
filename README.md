# Prague Street Tracker

An iPhone app that tracks your walking, matches your route onto Prague's
street network, and draws walked streets on a map — with the line getting
thicker every time you walk a street again. Goal: walk every walkable street
in Prague and watch the map fill in.

**Privacy is a hard requirement, not a feature**: the app has no backend, no
analytics, no networking code at all. Location data is matched against a
locally-bundled street graph and persisted to a local JSON file on-device.
Nothing leaves the phone.

## Status

This is a from-scratch scaffold, not a finished app. The core matching/
coverage logic (`Packages/StreetTrackerCore`) is pure Swift with unit tests
and no Apple-framework dependencies. The app target (SwiftUI + MapKit +
CoreLocation) has not been compiled or run yet — it was written without
access to Xcode/a Swift toolchain in the environment that generated it, so
**the first thing to do is open it in Xcode and fix whatever doesn't
compile.** The architecture and logic should be sound; syntax slips are the
likely failure mode, not design mistakes.

## Setup

1. Install [XcodeGen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`).
2. From the repo root: `xcodegen generate` — this produces `PragueStreetTracker.xcodeproj`.
3. Open the generated `.xcodeproj` in Xcode.
4. Build & run on a physical device (the simulator can't produce real GPS
   walking tracks — use Xcode's location simulation or a real walk to test).
5. On first launch, grant "Always" location access when prompted — this is
   required for background tracking while the app isn't in the foreground.

The repo ships with a tiny **demo fixture** (`App/Resources/prague_streets.json`,
3 approximate streets near Malostranské náměstí) so the map isn't empty out
of the box. Replace it with real data:

```
./Scripts/fetch_prague_streets.sh
```

This queries the Overpass API for Prague's full walkable street network.
Run it from a machine with normal internet access — not from inside the app
or from a restricted CI/dev-container environment.

## How it works

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the map-matching
approach, data model, and a list of known MVP simplifications / what a v2
would tackle next (finer-grained segments, real route generation, SQLite
persistence, etc).

## Suggested way to actually walk all of Prague

Track progress **per cadastral district** (Malá Strana, Staré Město,
Josefov, Nové Město, Vinohrady, Žižkov, Vršovice, Smíchov, Karlín, Holešovice,
Nusle, Dejvice, ...) rather than city-wide — it's a more motivating unit
("87% of Vinohrady done") and each district is roughly a single 1-3 hour
walking outing. Start with the compact, dense historical core (Malá Strana,
Staré Město, Josefov) where a lot of streets fit into a short walk, then
expand outward to the larger residential districts.
