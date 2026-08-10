// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "StreetTrackerCore",
    platforms: [.iOS(.v16), .macOS(.v13)],
    products: [
        .library(name: "StreetTrackerCore", targets: ["StreetTrackerCore"])
    ],
    targets: [
        .target(name: "StreetTrackerCore"),
        .testTarget(name: "StreetTrackerCoreTests", dependencies: ["StreetTrackerCore"])
    ]
)
