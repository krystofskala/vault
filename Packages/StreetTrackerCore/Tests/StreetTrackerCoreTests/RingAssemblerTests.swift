import XCTest
@testable import StreetTrackerCore

final class RingAssemblerTests: XCTestCase {
    func testAssemblesTwoWaysIntoOneClosedRing() {
        // A square split into two "L" shaped ways, in mixed direction.
        let wayA = [
            Coordinate(latitude: 50.000, longitude: 14.000),
            Coordinate(latitude: 50.010, longitude: 14.000),
            Coordinate(latitude: 50.010, longitude: 14.010)
        ]
        let wayB = [
            Coordinate(latitude: 50.000, longitude: 14.000),
            Coordinate(latitude: 50.000, longitude: 14.010),
            Coordinate(latitude: 50.010, longitude: 14.010)
        ]

        let rings = RingAssembler.assembleClosedRings(from: [wayA, wayB])

        XCTAssertEqual(rings.count, 1)
        XCTAssertEqual(rings.first?.count, 5) // 3 + 3 - 1 shared endpoint pair collapsed once
    }

    func testSingleAlreadyClosedWayIsARing() {
        let square = [
            Coordinate(latitude: 50.000, longitude: 14.000),
            Coordinate(latitude: 50.000, longitude: 14.010),
            Coordinate(latitude: 50.010, longitude: 14.010),
            Coordinate(latitude: 50.010, longitude: 14.000),
            Coordinate(latitude: 50.000, longitude: 14.000)
        ]

        let rings = RingAssembler.assembleClosedRings(from: [square])

        XCTAssertEqual(rings.count, 1)
        XCTAssertEqual(rings.first?.count, 5)
    }

    func testUnclosableFragmentIsDropped() {
        let danglingWay = [
            Coordinate(latitude: 50.000, longitude: 14.000),
            Coordinate(latitude: 50.010, longitude: 14.010)
        ]

        let rings = RingAssembler.assembleClosedRings(from: [danglingWay])

        XCTAssertTrue(rings.isEmpty)
    }
}
