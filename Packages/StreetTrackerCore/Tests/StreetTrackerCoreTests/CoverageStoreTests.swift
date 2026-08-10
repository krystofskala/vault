import XCTest
@testable import StreetTrackerCore

final class CoverageStoreTests: XCTestCase {
    private func makeGraph() -> StreetGraph {
        let s1 = StreetSegment(id: "1", name: "A", points: [
            Coordinate(latitude: 50.08, longitude: 14.40),
            Coordinate(latitude: 50.081, longitude: 14.40)
        ], lengthMeters: 100, district: "Malá Strana")
        let s2 = StreetSegment(id: "2", name: "B", points: [
            Coordinate(latitude: 50.08, longitude: 14.41),
            Coordinate(latitude: 50.081, longitude: 14.41)
        ], lengthMeters: 300, district: "Malá Strana")
        let s3 = StreetSegment(id: "3", name: "C", points: [
            Coordinate(latitude: 50.09, longitude: 14.42),
            Coordinate(latitude: 50.091, longitude: 14.42)
        ], lengthMeters: 200, district: "Vinohrady")
        return StreetGraph(segments: ["1": s1, "2": s2, "3": s3])
    }

    func testCoverageFractionIsZeroInitially() {
        let store = CoverageStore()
        XCTAssertEqual(store.coverageFraction(graph: makeGraph()), 0)
    }

    func testCoverageFractionWeightsByLength() {
        let store = CoverageStore()
        store.recordPass(segmentID: "1") // 100m of 600m total
        XCTAssertEqual(store.coverageFraction(graph: makeGraph()), 100.0 / 600.0, accuracy: 0.0001)
    }

    func testRecordPassIncrementsCount() {
        let store = CoverageStore()
        store.recordPass(segmentID: "1")
        store.recordPass(segmentID: "1")
        XCTAssertEqual(store.passCount(for: "1"), 2)
        XCTAssertEqual(store.passCount(for: "unknown"), 0)
    }

    func testDistrictCoverageIsPerDistrict() {
        let store = CoverageStore()
        store.recordPass(segmentID: "1") // Malá Strana: 100 of 400
        let coverage = store.districtCoverage(graph: makeGraph())
        XCTAssertEqual(coverage["Malá Strana"] ?? -1, 100.0 / 400.0, accuracy: 0.0001)
        XCTAssertEqual(coverage["Vinohrady"] ?? -1, 0, accuracy: 0.0001)
    }
}
