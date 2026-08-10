import Foundation
import CoreLocation
import Combine
import StreetTrackerCore

@MainActor
final class TrackingViewModel: ObservableObject {
    @Published private(set) var graph: StreetGraph
    @Published private(set) var passCounts: [String: Int] = [:]
    @Published private(set) var coverageFraction: Double = 0
    @Published private(set) var districtCoverage: [String: Double] = [:]
    @Published private(set) var isTracking = false
    @Published private(set) var authorizationStatus: CLAuthorizationStatus = .notDetermined

    private let coverageStore: CoverageStore
    private let matcher: MapMatcher
    private let locationTracker: LocationTracker
    private let persistence: CoveragePersistence
    private var cancellables: Set<AnyCancellable> = []

    init() {
        let loadedGraph = Self.loadBundledGraph()
        let persistence = CoveragePersistence()
        let savedCounts = persistence.loadPassCounts()

        self.graph = loadedGraph
        self.matcher = MapMatcher(graph: loadedGraph)
        self.persistence = persistence
        self.coverageStore = CoverageStore(passCounts: savedCounts)
        self.passCounts = savedCounts
        self.locationTracker = LocationTracker()

        recomputeCoverage()

        locationTracker.onLocation = { [weak self] location in
            self?.handle(location: location)
        }
        locationTracker.$authorizationStatus
            .receive(on: RunLoop.main)
            .sink { [weak self] status in
                self?.authorizationStatus = status
            }
            .store(in: &cancellables)
    }

    private static func loadBundledGraph() -> StreetGraph {
        guard
            let url = Bundle.main.url(forResource: "prague_streets", withExtension: "json"),
            let data = try? Data(contentsOf: url),
            let graph = try? OSMLoader.loadGraph(fromOverpassJSON: data)
        else {
            return StreetGraph(segments: [:])
        }
        return graph
    }

    func requestPermission() {
        locationTracker.requestAuthorization()
    }

    func toggleTracking() {
        if locationTracker.isTracking {
            locationTracker.stopTracking()
        } else {
            locationTracker.startTracking()
        }
        isTracking = locationTracker.isTracking
    }

    func nearestUnwalked(from location: Coordinate, limit: Int = 20) -> [UnwalkedSuggestion] {
        RouteSuggester.nearestUnwalked(from: location, graph: graph, coverage: coverageStore, limit: limit)
    }

    private func handle(location: CLLocation) {
        let coord = Coordinate(latitude: location.coordinate.latitude, longitude: location.coordinate.longitude)
        guard let match = matcher.match(coord) else { return }

        coverageStore.recordPass(segmentID: match.segmentID)
        passCounts = coverageStore.passCounts
        recomputeCoverage()
        persistence.savePassCounts(coverageStore.passCounts)
    }

    private func recomputeCoverage() {
        coverageFraction = coverageStore.coverageFraction(graph: graph)
        districtCoverage = coverageStore.districtCoverage(graph: graph)
    }
}
