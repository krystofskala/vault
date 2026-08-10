import Foundation

/// Tracks how many times each street segment has been walked.
///
/// Deliberately not an `ObservableObject` — this package has no Combine/UIKit
/// dependency so it stays testable on any platform. The app target wraps
/// this in its own `@Published` state where SwiftUI needs reactivity.
public final class CoverageStore {
    public private(set) var passCounts: [String: Int]

    public init(passCounts: [String: Int] = [:]) {
        self.passCounts = passCounts
    }

    public func recordPass(segmentID: String) {
        passCounts[segmentID, default: 0] += 1
    }

    public func passCount(for segmentID: String) -> Int {
        passCounts[segmentID] ?? 0
    }

    /// Fraction (0...1) of total street length that has been walked at least once.
    public func coverageFraction(graph: StreetGraph) -> Double {
        let totalLength = graph.totalLengthMeters
        guard totalLength > 0 else { return 0 }
        let walkedLength = graph.segments.values
            .filter { (passCounts[$0.id] ?? 0) > 0 }
            .reduce(0) { $0 + $1.lengthMeters }
        return walkedLength / totalLength
    }

    /// Coverage fraction per district (e.g. "Malá Strana" -> 0.42).
    /// Segments without a district are grouped under "Unknown".
    public func districtCoverage(graph: StreetGraph) -> [String: Double] {
        var totalByDistrict: [String: Double] = [:]
        var walkedByDistrict: [String: Double] = [:]

        for segment in graph.segments.values {
            let district = segment.district ?? "Unknown"
            totalByDistrict[district, default: 0] += segment.lengthMeters
            if (passCounts[segment.id] ?? 0) > 0 {
                walkedByDistrict[district, default: 0] += segment.lengthMeters
            }
        }

        var result: [String: Double] = [:]
        for (district, total) in totalByDistrict where total > 0 {
            result[district] = (walkedByDistrict[district] ?? 0) / total
        }
        return result
    }
}
