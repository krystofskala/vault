import XCTest
@testable import StreetTrackerCore

final class OSMLoaderTests: XCTestCase {
    private let sampleJSON = """
    {
      "elements": [
        { "type": "node", "id": 1, "lat": 50.0880, "lon": 14.4030 },
        { "type": "node", "id": 2, "lat": 50.0885, "lon": 14.4030 },
        { "type": "node", "id": 3, "lat": 50.0890, "lon": 14.4032 },
        {
          "type": "way",
          "id": 100,
          "nodes": [1, 2, 3],
          "tags": { "highway": "residential", "name": "Nerudova" }
        },
        {
          "type": "way",
          "id": 101,
          "nodes": [1],
          "tags": { "highway": "footway" }
        }
      ]
    }
    """.data(using: .utf8)!

    func testParsesWaysIntoSegmentsWithResolvedCoordinates() throws {
        let graph = try OSMLoader.loadGraph(fromOverpassJSON: sampleJSON)

        XCTAssertEqual(graph.segments.count, 1, "the single-node way should be dropped")

        let segment = try XCTUnwrap(graph.segments["100"])
        XCTAssertEqual(segment.name, "Nerudova")
        XCTAssertEqual(segment.points.count, 3)
        XCTAssertEqual(segment.points.first?.latitude ?? 0, 50.0880, accuracy: 0.00001)
        XCTAssertGreaterThan(segment.lengthMeters, 0)
    }

    func testThrowsOnMalformedJSON() {
        let bad = "not json".data(using: .utf8)!
        XCTAssertThrowsError(try OSMLoader.loadGraph(fromOverpassJSON: bad))
    }
}
