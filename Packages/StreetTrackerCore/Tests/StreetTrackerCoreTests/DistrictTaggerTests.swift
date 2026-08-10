import XCTest
@testable import StreetTrackerCore

final class DistrictTaggerTests: XCTestCase {
    private let sampleJSON = """
    {
      "elements": [
        {
          "type": "relation",
          "id": 9001,
          "tags": { "name": "Malá Strana" },
          "members": [
            {
              "type": "way",
              "ref": 1,
              "role": "outer",
              "geometry": [
                { "lat": 50.000, "lon": 14.000 },
                { "lat": 50.000, "lon": 14.010 },
                { "lat": 50.010, "lon": 14.010 },
                { "lat": 50.010, "lon": 14.000 },
                { "lat": 50.000, "lon": 14.000 }
              ]
            }
          ]
        }
      ]
    }
    """.data(using: .utf8)!

    func testLoadsBoundaryFromRelation() throws {
        let boundaries = try DistrictTagger.loadBoundaries(fromOverpassJSON: sampleJSON)
        XCTAssertEqual(boundaries.count, 1)
        XCTAssertEqual(boundaries.first?.name, "Malá Strana")
        XCTAssertEqual(boundaries.first?.rings.first?.count, 5)
    }

    func testPointInPolygonInsideAndOutside() throws {
        let boundaries = try DistrictTagger.loadBoundaries(fromOverpassJSON: sampleJSON)
        let ring = try XCTUnwrap(boundaries.first?.rings.first)

        let inside = Coordinate(latitude: 50.005, longitude: 14.005)
        let outside = Coordinate(latitude: 50.500, longitude: 14.500)

        XCTAssertTrue(DistrictTagger.pointInPolygon(inside, ring))
        XCTAssertFalse(DistrictTagger.pointInPolygon(outside, ring))
    }

    func testTagAssignsDistrictToSegmentsInsideBoundary() throws {
        let boundaries = try DistrictTagger.loadBoundaries(fromOverpassJSON: sampleJSON)

        let insideSegment = StreetSegment(
            id: "in",
            name: "Inside St",
            points: [
                Coordinate(latitude: 50.004, longitude: 14.004),
                Coordinate(latitude: 50.006, longitude: 14.006)
            ],
            lengthMeters: 100,
            district: nil
        )
        let outsideSegment = StreetSegment(
            id: "out",
            name: "Outside St",
            points: [
                Coordinate(latitude: 50.500, longitude: 14.500),
                Coordinate(latitude: 50.501, longitude: 14.501)
            ],
            lengthMeters: 100,
            district: nil
        )
        let graph = StreetGraph(segments: ["in": insideSegment, "out": outsideSegment])

        let tagged = DistrictTagger.tag(graph: graph, with: boundaries)

        XCTAssertEqual(tagged.segments["in"]?.district, "Malá Strana")
        XCTAssertNil(tagged.segments["out"]?.district)
    }
}
