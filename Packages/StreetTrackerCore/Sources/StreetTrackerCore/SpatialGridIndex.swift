import Foundation

/// Uniform grid over lat/lon used to avoid scanning every segment on each
/// GPS fix. Prague's full walkable network is tens of thousands of ways;
/// a linear scan per location update would not keep up in real time.
final class SpatialGridIndex {
    private struct GridKey: Hashable {
        let x: Int
        let y: Int
    }

    private let cellSizeDegrees: Double
    private var cells: [GridKey: Set<String>] = [:]

    /// ~0.002 degrees is roughly 150-220m at Prague's latitude — small
    /// enough that a 3x3 cell search comfortably covers GPS noise.
    init(graph: StreetGraph, cellSizeDegrees: Double = 0.002) {
        self.cellSizeDegrees = cellSizeDegrees
        for (id, segment) in graph.segments {
            for point in segment.points {
                let key = Self.key(for: point, cellSize: cellSizeDegrees)
                cells[key, default: []].insert(id)
            }
        }
    }

    private static func key(for coord: Coordinate, cellSize: Double) -> GridKey {
        GridKey(x: Int(floor(coord.longitude / cellSize)), y: Int(floor(coord.latitude / cellSize)))
    }

    func candidateSegmentIDs(near coord: Coordinate, radiusCells: Int = 1) -> Set<String> {
        let center = Self.key(for: coord, cellSize: cellSizeDegrees)
        var result: Set<String> = []
        for dx in -radiusCells...radiusCells {
            for dy in -radiusCells...radiusCells {
                let key = GridKey(x: center.x + dx, y: center.y + dy)
                if let ids = cells[key] {
                    result.formUnion(ids)
                }
            }
        }
        return result
    }
}
