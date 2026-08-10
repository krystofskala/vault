import SwiftUI
import MapKit
import StreetTrackerCore

/// An `MKPolyline` subclass carrying its segment's walk count, so the
/// renderer can pick a line width without a separate lookup table.
final class StreetPolyline: MKPolyline {
    var passCount: Int = 0
}

struct MapView: UIViewRepresentable {
    let graph: StreetGraph
    let passCounts: [String: Int]

    func makeUIView(context: Context) -> MKMapView {
        let mapView = MKMapView()
        mapView.delegate = context.coordinator
        mapView.showsUserLocation = true
        centerOnPrague(mapView)
        return mapView
    }

    func updateUIView(_ mapView: MKMapView, context: Context) {
        // Simple full-refresh approach: fine for a few tens of thousands of
        // overlays redrawn only when passCounts changes (i.e. on each new
        // matched step), not on every map pan/zoom.
        mapView.removeOverlays(mapView.overlays)
        for segment in graph.segments.values {
            let coords = segment.points.map {
                CLLocationCoordinate2D(latitude: $0.latitude, longitude: $0.longitude)
            }
            guard coords.count >= 2 else { continue }
            let polyline = StreetPolyline(coordinates: coords, count: coords.count)
            polyline.passCount = passCounts[segment.id] ?? 0
            mapView.addOverlay(polyline)
        }
    }

    private func centerOnPrague(_ mapView: MKMapView) {
        let center = CLLocationCoordinate2D(latitude: 50.0755, longitude: 14.4378)
        let region = MKCoordinateRegion(center: center, latitudinalMeters: 3000, longitudinalMeters: 3000)
        mapView.setRegion(region, animated: false)
    }

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    final class Coordinator: NSObject, MKMapViewDelegate {
        func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
            guard let polyline = overlay as? StreetPolyline else {
                return MKOverlayRenderer(overlay: overlay)
            }
            let renderer = MKPolylineRenderer(polyline: polyline)
            if polyline.passCount == 0 {
                renderer.strokeColor = UIColor.systemGray3
                renderer.lineWidth = 1.5
            } else {
                renderer.strokeColor = UIColor.systemBlue
                // Thickens with each pass, capped so heavily-walked streets
                // don't swallow the map.
                renderer.lineWidth = min(2.0 + Double(polyline.passCount) * 1.5, 12.0)
            }
            return renderer
        }
    }
}
