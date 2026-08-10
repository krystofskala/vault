import Foundation

/// Stitches way geometries (each an open or closed polyline) into closed
/// rings by matching endpoints. OSM administrative boundary relations are
/// usually made of several "outer" way members in mixed order and
/// direction; this reassembles them into the closed polygon(s) they
/// represent. Doesn't handle inner rings (holes) or genuinely malformed
/// input beyond dropping fragments it can't close.
enum RingAssembler {
    static func assembleClosedRings(from ways: [[Coordinate]], epsilonMeters: Double = 1.0) -> [[Coordinate]] {
        var remaining = ways.filter { $0.count >= 2 }
        var rings: [[Coordinate]] = []

        while !remaining.isEmpty {
            var ring = remaining.removeFirst()
            var progress = true

            while progress, !isClosed(ring, epsilonMeters: epsilonMeters) {
                guard let ringFirst = ring.first, let ringLast = ring.last else { break }
                progress = false

                for (index, candidate) in remaining.enumerated() {
                    guard let candFirst = candidate.first, let candLast = candidate.last else { continue }

                    if close(ringLast, candFirst, epsilonMeters) {
                        ring.append(contentsOf: candidate.dropFirst())
                    } else if close(ringLast, candLast, epsilonMeters) {
                        ring.append(contentsOf: candidate.reversed().dropFirst())
                    } else if close(ringFirst, candLast, epsilonMeters) {
                        ring.insert(contentsOf: candidate.dropLast(), at: 0)
                    } else if close(ringFirst, candFirst, epsilonMeters) {
                        ring.insert(contentsOf: candidate.reversed().dropLast(), at: 0)
                    } else {
                        continue
                    }

                    remaining.remove(at: index)
                    progress = true
                    break
                }
            }

            if isClosed(ring, epsilonMeters: epsilonMeters), ring.count >= 3 {
                rings.append(ring)
            }
            // An unclosable fragment is dropped rather than guessed at -
            // better to under-tag a district than misassemble geometry.
        }

        return rings
    }

    private static func isClosed(_ ring: [Coordinate], epsilonMeters: Double) -> Bool {
        guard let first = ring.first, let last = ring.last else { return false }
        return close(first, last, epsilonMeters)
    }

    private static func close(_ a: Coordinate, _ b: Coordinate, _ epsilonMeters: Double) -> Bool {
        Geo.distance(a, b) <= epsilonMeters
    }
}
