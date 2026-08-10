# Architecture

## Layers

```
Packages/StreetTrackerCore/   Pure Swift, no Apple frameworks. Testable
                               anywhere. Owns the domain logic.
  StreetGraph.swift              Segment + graph model
  OSMLoader.swift                Parses raw Overpass API JSON -> StreetGraph
  SpatialGridIndex.swift         Grid bucketing for fast nearest-segment lookup
  MapMatcher.swift               Snaps a GPS fix to the nearest segment
  CoverageStore.swift            Tracks pass counts, computes coverage %
  RouteSuggester.swift           Nearest-unwalked-street suggestions

App/                           SwiftUI + MapKit + CoreLocation. Thin glue
                               over StreetTrackerCore; no domain logic here.
  Location/LocationTracker.swift    CLLocationManager wrapper (background config)
  Persistence/CoveragePersistence.swift   Local JSON file, on-device only
  ViewModels/TrackingViewModel.swift      Wires location -> matcher -> coverage -> disk
  Views/MapView.swift                     MKMapView bridge, renders polylines by pass count
  Views/ContentView.swift                 Main screen
```

The split matters because `StreetTrackerCore` can be unit tested in
isolation (map matching correctness, coverage math, route suggestion
ordering) without needing a simulator or device — those are the parts most
likely to have subtle bugs, and the parts that are cheapest to get
confidence in via tests.

## Map matching

Raw GPS is noisy (typically 5-15m error, worse near tall buildings — which
much of central Prague has). You can't just draw a line through raw fixes;
you need to snap each fix onto the street it's actually on. The current
implementation (`MapMatcher`) does **nearest-segment matching**: for each
fix, find nearby segments via a spatial grid index, compute point-to-segment
distance for each, and pick the closest one within a threshold (25m
default).

This is a simplification of the "real" solution, which is a Hidden Markov
Model matcher that also considers transition probability between
consecutive fixes (i.e. penalizes jumping between unrelated streets, favors
paths that are actually connected in the graph — see OSRM's or Valhalla's
map-matching services for reference implementations). Nearest-segment
matching will occasionally mis-snap on tight parallel streets or at complex
intersections. Worth upgrading if that proves to matter in practice; not
worth the complexity for a first version.

## Street segments = whole OSM ways

Each segment in the graph is one OSM `way`, not split at intersections. A
very long street (e.g. several hundred meters) counts as "walked" the
moment you cover any part of it. This is simpler and enough to drive the
thickening-line visualization, but coarser than "have I walked every block."

v2 improvement: split ways into edges between consecutive intersection
nodes (nodes shared by 2+ ways), so coverage is block-by-block. This is a
graph preprocessing step in `OSMLoader`, not a change to `MapMatcher` or
`CoverageStore`.

## Coverage & districts

Coverage is computed as **length-weighted fraction walked**, not
segment-count fraction — a 300m street contributes more to "% walked" than
a 30m alley. District coverage requires each `StreetSegment.district` to be
populated; the current `OSMLoader` leaves it `nil` (Overpass doesn't tag
ways with cadastral district directly). Options to populate it:

- Query each of Prague's ~112 cadastral areas as a separate Overpass `area`
  and tag segments accordingly at fetch time (cleanest, more Overpass calls).
- Do a point-in-polygon check against a Prague cadastral-boundary GeoJSON
  (available from Prague's open data portal) as a local post-processing
  step after loading the graph.

## Route suggestion

`RouteSuggester.nearestUnwalked` returns the nearest *unwalked segments* to
a location, not a turn-by-turn route. Actually generating an efficient
covering route is the **route inspection / "Chinese Postman" problem**:
find the shortest walk that traverses every unwalked edge. Solving that
well needs:

- An actual routing graph (adjacency between segments, not just a flat list).
- A near-optimal Eulerian-path-style solver, or a simpler greedy
  nearest-unwalked-edge heuristic chained into a loop.

That's meaningfully more scope than the rest of this app and is the
natural "v2" — for now, the nearest-unwalked list plus per-district
coverage is enough to plan a walk by hand.

## Persistence

Pass counts are stored as a flat `[segmentID: Int]` dictionary, serialized
to JSON in Application Support. Fine for an MVP; if the full Prague graph
(tens of thousands of segments) makes JSON re-serialization on every step
noticeably slow, swap `CoveragePersistence` for SQLite (e.g. GRDB) — it's
the only file that touches disk, so this is a contained change.

## Things to sanity-check on a real device

- **Background behavior**: `allowsBackgroundLocationUpdates` + the
  `location` background mode should keep updates flowing with the screen
  off, but iOS will still throttle/kill apps that don't behave — watch for
  gaps in tracked streets after long backgrounded stretches and tune
  `distanceFilter` / consider `CLLocationManager`'s deferred updates if
  battery drain is too aggressive.
- **Activity filtering**: Core Motion (`CMMotionActivityManager`) isn't
  wired in yet. Without it, a bus or car ride will "complete" streets you
  didn't walk. Worth adding before relying on the data for real.
- **App Store review**: apps requesting "Always" location access need to
  justify it clearly in the review notes and in the usage-description
  strings (already drafted in `project.yml`) — background fitness tracking
  is a well-understood use case but reviewers still check.
