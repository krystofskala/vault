import SwiftUI
import StreetTrackerCore

struct SuggestionsView: View {
    let suggestions: [UnwalkedSuggestion]

    var body: some View {
        NavigationStack {
            List(suggestions, id: \.segmentID) { suggestion in
                VStack(alignment: .leading, spacing: 2) {
                    Text(suggestion.name ?? "Unnamed street")
                        .font(.body)
                    HStack {
                        if let district = suggestion.district {
                            Text(district)
                        }
                        Spacer()
                        Text(formattedDistance(suggestion.distanceMeters))
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }
            }
            .overlay {
                if suggestions.isEmpty {
                    VStack(spacing: 8) {
                        Image(systemName: "map")
                            .font(.largeTitle)
                            .foregroundStyle(.secondary)
                        Text("No suggestions yet")
                            .font(.headline)
                        Text("Start tracking to get a location fix, then try again.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 32)
                    }
                }
            }
            .navigationTitle("Nearby unwalked streets")
        }
    }

    private func formattedDistance(_ meters: Double) -> String {
        if meters < 1000 {
            return "\(Int(meters))m"
        }
        return String(format: "%.1fkm", meters / 1000)
    }
}
