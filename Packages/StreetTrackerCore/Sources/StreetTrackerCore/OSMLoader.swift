import Foundation

/// Parses the raw JSON returned by the Overpass API (`out:json`) directly —
/// no intermediate GeoJSON conversion step needed. See
/// Scripts/fetch_prague_streets.sh for the query used to produce this data.
public enum OSMLoader {
    public enum LoaderError: Error {
        case decodingFailed(Error)
    }

    public static func loadGraph(fromOverpassJSON data: Data) throws -> StreetGraph {
        let decoded: OverpassResponse
        do {
            decoded = try JSONDecoder().decode(OverpassResponse.self, from: data)
        } catch {
            throw LoaderError.decodingFailed(error)
        }

        var nodeCoords: [Int64: Coordinate] = [:]
        nodeCoords.reserveCapacity(decoded.elements.count)
        for element in decoded.elements where element.type == "node" {
            guard let id = element.id, let lat = element.lat, let lon = element.lon else { continue }
            nodeCoords[id] = Coordinate(latitude: lat, longitude: lon)
        }

        var segments: [String: StreetSegment] = [:]
        for element in decoded.elements where element.type == "way" {
            guard let wayID = element.id, let nodeIDs = element.nodes, nodeIDs.count >= 2 else { continue }
            let coords = nodeIDs.compactMap { nodeCoords[$0] }
            guard coords.count >= 2 else { continue }

            let name = element.tags?["name"]
            let length = Geo.polylineLength(coords)
            let segmentID = String(wayID)
            segments[segmentID] = StreetSegment(
                id: segmentID,
                name: name,
                points: coords,
                lengthMeters: length,
                district: nil
            )
        }

        return StreetGraph(segments: segments)
    }
}

struct OverpassResponse: Codable {
    let elements: [OverpassElement]
}

struct OverpassElement: Codable {
    let type: String
    let id: Int64?
    let lat: Double?
    let lon: Double?
    let nodes: [Int64]?
    let tags: [String: String]?
}
