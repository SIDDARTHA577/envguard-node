// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "HealthyIOSApp",
    platforms: [
        .iOS(.v16)
    ],
    products: [
        .library(name: "HealthyIOSApp", targets: ["HealthyIOSApp"])
    ],
    targets: [
        .target(name: "HealthyIOSApp"),
        .testTarget(name: "HealthyIOSAppTests", dependencies: ["HealthyIOSApp"])
    ]
)
