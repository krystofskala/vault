import Foundation

/// One OSM way, treated as a single walkable segment.
///
/// MVP simplification: a segment is a whole OSM way, not split at every
/// intersection. That's coarser than ideal (a very long street counts as
/// "walked" once you've covered any part of it) but is enough to drive the
/// thickening-line visualization and district coverage %. Splitting ways at
/// intersection nodes is a natural v2 improvement — see docs/ARCHITECTURE.md.
public struct StreetSegment: Codable, Identifiable, Sendable {
    public let id: String
    public let name: String?
    public let points: [Coordinate]
    public let lengthMeters: Double
    public let district: String?

    public init(id: String, name: String?, points: [Coordinate], lengthMeters: Double, district: String?) {
        self.id = id
        self.name = name
        self.points = points
        self.lengthMeters = lengthMeters
        self.district = district
    }
}

public struct StreetGraph: Codable, Sendable {
    public var segments: [String: StreetSegment]

    public init(segments: [String: StreetSegment]) {
        self.segments = segments
    }

    public var totalLengthMeters: Double {
        segments.values.reduce(0) { $0 + $1.lengthMeters }
    }
}
