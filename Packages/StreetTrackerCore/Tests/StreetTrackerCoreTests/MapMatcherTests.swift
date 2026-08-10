import XCTest
@testable import StreetTrackerCore

final class MapMatcherTests: XCTestCase {
    /// Two short, parallel, north-south streets ~30m apart, plus one
    /// perpendicular cross street, roughly centered near Malostranské náměstí.
    private func makeTestGraph() -> StreetGraph {
        let streetA = StreetSegment(
            id: "A",
            name: "Ulice A",
            points: [
                Coordinate(latitude: 50.0880, longitude: 14.4030),
                Coordinate(latitude: 50.0885, longitude: 14.4030)
            ],
            lengthMeters: 55,
            district: "Malá Strana"
        )
        let streetB = StreetSegment(
            id: "B",
            name: "Ulice B",
            points: [
                Coordinate(latitude: 50.0880, longitude: 14.4034),
                Coordinate(latitude: 50.0885, longitude: 14.4034)
            ],
            lengthMeters: 55,
            district: "Malá Strana"
        )
        let cross = StreetSegment(
            id: "C",
            name: "Cross Street",
            points: [
                Coordinate(latitude: 50.0880, longitude: 14.4030),
                Coordinate(latitude: 50.0880, longitude: 14.4034)
            ],
            lengthMeters: 28,
            district: "Malá Strana"
        )
        return StreetGraph(segments: ["A": streetA, "B": streetB, "C": cross])
    }

    func testMatchesPointExactlyOnSegment() {
        let matcher = MapMatcher(graph: makeTestGraph())
        let onA = Coordinate(latitude: 50.0882, longitude: 14.4030)
        let result = matcher.match(onA)
        XCTAssertEqual(result?.segmentID, "A")
        XCTAssertLessThan(result?.distanceMeters ?? .infinity, 1.0)
    }

    func testMatchesNearbyPointToClosestSegment() {
        let matcher = MapMatcher(graph: makeTestGraph())
        // Slightly closer to B than A.
        let nearB = Coordinate(latitude: 50.0882, longitude: 14.4033)
        let result = matcher.match(nearB)
        XCTAssertEqual(result?.segmentID, "B")
    }

    func testReturnsNilWhenTooFarFromAnySegment() {
        let matcher = MapMatcher(graph: makeTestGraph(), maxMatchDistanceMeters: 25)
        let farAway = Coordinate(latitude: 50.1200, longitude: 14.5000)
        XCTAssertNil(matcher.match(farAway))
    }

    func testEmptyGraphNeverMatches() {
        let matcher = MapMatcher(graph: StreetGraph(segments: [:]))
        XCTAssertNil(matcher.match(Coordinate(latitude: 50.0882, longitude: 14.4030)))
    }
}
