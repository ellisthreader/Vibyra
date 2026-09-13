import Foundation
import Network

/// Reports which networks this phone can actually search, so the search screen
/// can show every link it is covering — Wi-Fi, a VPN, a shared link, a wired
/// adapter and direct peer-to-peer — instead of implying a single Wi-Fi.
///
/// Bonjour is link-local by design: this enumerates the links that are present,
/// it does not reach past a router. Cellular is reported so the UI can say it is
/// not searched, because multicast discovery does not run there.
final class NetworkScope {
  struct Link {
    let id: String
    let kind: String
    let label: String
    let searched: Bool
  }

  private var monitor: NWPathMonitor?
  private(set) var links: [Link] = []
  var onChange: (() -> Void)?

  func start() {
    stop()
    let next = NWPathMonitor()
    monitor = next
    next.pathUpdateHandler = { [weak self, weak next] path in
      guard let self, let next, self.monitor === next else { return }
      self.accept(path.availableInterfaces)
    }
    next.start(queue: .main)
    accept(next.currentPath.availableInterfaces)
  }

  func stop() {
    let previous = monitor
    monitor = nil
    previous?.pathUpdateHandler = nil
    previous?.cancel()
  }

  var payload: [[String: Any]] {
    links.map { ["id": $0.id, "kind": $0.kind, "label": $0.label, "searched": $0.searched] }
  }

  /// One entry per kind: several `utun` tunnels are one VPN to the person
  /// reading the screen, and repeated chips would only add noise.
  private func accept(_ interfaces: [NWInterface]) {
    var seen = Set<String>()
    var next: [Link] = []
    for interface in interfaces {
      guard let link = Self.describe(interface), seen.insert(link.kind).inserted else { continue }
      next.append(link)
    }
    let ordered = next.sorted { Self.rank($0.kind) < Self.rank($1.kind) }
    guard ordered.map(\.kind) != links.map(\.kind) else { return }
    links = ordered
    onChange?()
  }

  private static func rank(_ kind: String) -> Int {
    ["wifi": 0, "direct": 1, "wired": 2, "shared": 3, "vpn": 4, "other": 5, "cellular": 6][kind] ?? 7
  }

  private static func describe(_ interface: NWInterface) -> Link? {
    let name = interface.name
    switch interface.type {
    case .loopback:
      return nil
    case .cellular:
      return Link(id: name, kind: "cellular", label: "Cellular", searched: false)
    case .wifi:
      // Apple's peer-to-peer links: a direct connection with no shared Wi-Fi.
      if name.hasPrefix("awdl") || name.hasPrefix("llw") {
        return Link(id: name, kind: "direct", label: "Direct", searched: true)
      }
      return Link(id: name, kind: "wifi", label: "Wi-Fi", searched: true)
    case .wiredEthernet:
      if name.hasPrefix("bridge") || name.hasPrefix("ap") {
        return Link(id: name, kind: "shared", label: "Shared", searched: true)
      }
      return Link(id: name, kind: "wired", label: "Ethernet", searched: true)
    case .other:
      if name.hasPrefix("utun") || name.hasPrefix("ipsec") || name.hasPrefix("ppp") {
        return Link(id: name, kind: "vpn", label: "VPN", searched: true)
      }
      return Link(id: name, kind: "other", label: "Other", searched: true)
    @unknown default:
      return Link(id: name, kind: "other", label: "Other", searched: true)
    }
  }

  /// The link a discovered service arrived on, for the tag on its card.
  static func kind(of interfaces: [NWInterface]) -> String? {
    interfaces.compactMap { describe($0)?.kind }.min { rank($0) < rank($1) }
  }
}
