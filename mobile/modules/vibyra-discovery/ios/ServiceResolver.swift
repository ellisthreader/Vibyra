import Foundation
import Network

/// Turns one discovered Bonjour service into a concrete address and port so the
/// phone can open its encrypted connection without a pairing code.
///
/// Apple performs the resolution: `NWConnection` reaches `.ready` only once the
/// service resolved and the Host actually accepted a LAN connection, and its
/// `currentPath` carries the Local Network privacy verdict when the person
/// refused the consent alert. Nothing is written to the socket and no address
/// range is probed; each attempt is bounded and cancelled as soon as it answers.
final class ServiceResolver {
  struct Address {
    let host: String
    let port: UInt16
  }

  private var attempts: [String: NWConnection] = [:]
  private var deadlines: [String: DispatchWorkItem] = [:]
  private var addresses: [String: Address] = [:]
  private var endpoints: [String: NWEndpoint] = [:]
  private var lastAttempts: [String: Date] = [:]
  var onChange: (() -> Void)?
  var onDenied: (() -> Void)?

  func address(for id: String) -> Address? { addresses[id] }

  /// Called on Bonjour updates and once per second during the search. Failed
  /// resolutions retry even when the service list never changes. Oldest-first
  /// scheduling lets all 16 candidates use the eight available slots.
  func update(_ current: [String: NWEndpoint]) {
    for (id, endpoint) in endpoints where current[id] != endpoint {
      finish(id)
      addresses.removeValue(forKey: id)
      lastAttempts.removeValue(forKey: id)
    }
    endpoints = current
    let oldest = Date.distantPast
    for id in current.keys.sorted(by: { (lastAttempts[$0] ?? oldest) < (lastAttempts[$1] ?? oldest) }) {
      guard Date().timeIntervalSince(lastAttempts[id] ?? oldest) >= 2,
            let endpoint = current[id] else { continue }
      resolve(id: id, endpoint: endpoint)
    }
  }

  private func resolve(id: String, endpoint: NWEndpoint) {
    guard addresses[id] == nil, attempts[id] == nil, attempts.count < 8 else { return }
    lastAttempts[id] = Date()
    let connection = NWConnection(to: endpoint, using: Self.parameters())
    attempts[id] = connection
    let timeout = DispatchWorkItem { [weak self] in self?.finish(id) }
    deadlines[id] = timeout
    DispatchQueue.main.asyncAfter(deadline: .now() + 6, execute: timeout)
    connection.stateUpdateHandler = { [weak self, weak connection] state in
      guard let self, let connection, self.attempts[id] === connection else { return }
      switch state {
      case .ready:
        let resolved = Self.address(of: connection.currentPath?.remoteEndpoint)
        self.finish(id)
        guard let resolved else { return }
        self.addresses[id] = resolved
        self.onChange?()
      case .waiting:
        // Apple's authoritative Local Network verdict for this activity.
        if connection.currentPath?.unsatisfiedReason == .localNetworkDenied {
          self.finish(id)
          self.onDenied?()
        }
      case .failed:
        if connection.currentPath?.unsatisfiedReason == .localNetworkDenied {
          self.finish(id)
          self.onDenied?()
        } else {
          self.finish(id)
        }
      case .cancelled:
        self.finish(id)
      default:
        break
      }
    }
    connection.start(queue: .main)
  }

  func stop() {
    for (_, deadline) in deadlines { deadline.cancel() }
    deadlines.removeAll()
    for (_, connection) in attempts {
      connection.stateUpdateHandler = nil
      connection.cancel()
    }
    attempts.removeAll()
  }

  func reset() {
    stop()
    addresses.removeAll()
    endpoints.removeAll()
    lastAttempts.removeAll()
  }

  private func finish(_ id: String) {
    deadlines.removeValue(forKey: id)?.cancel()
    guard let connection = attempts.removeValue(forKey: id) else { return }
    connection.stateUpdateHandler = nil
    connection.cancel()
  }

  private static func parameters() -> NWParameters {
    let tcp = NWProtocolTCP.Options()
    tcp.connectionTimeout = 5
    tcp.noDelay = true
    let parameters = NWParameters(tls: nil, tcp: tcp)
    parameters.includePeerToPeer = true
    parameters.prohibitedInterfaceTypes = [.cellular]
    return parameters
  }

  /// Only addresses a WebSocket URL can carry are accepted. Link-local IPv6
  /// needs a scope zone a URL cannot express, so it is skipped rather than
  /// handed to the client as a broken endpoint.
  private static func address(of endpoint: NWEndpoint?) -> Address? {
    guard case let .hostPort(host, port) = endpoint, port.rawValue > 0 else { return nil }
    switch host {
    case let .ipv4(value):
      guard !value.isLoopback, !value.isLinkLocal, !value.isMulticast else { return nil }
      return Address(host: literal(value.debugDescription), port: port.rawValue)
    case let .ipv6(value):
      if let mapped = value.asIPv4 {
        guard !mapped.isLoopback, !mapped.isLinkLocal, !mapped.isMulticast else { return nil }
        return Address(host: literal(mapped.debugDescription), port: port.rawValue)
      }
      guard !value.isLoopback, !value.isLinkLocal, !value.isMulticast else { return nil }
      return Address(host: "[\(literal(value.debugDescription))]", port: port.rawValue)
    case let .name(value, _):
      let name = literal(value)
      guard !name.isEmpty, name.count <= 253 else { return nil }
      return Address(host: name, port: port.rawValue)
    @unknown default:
      return nil
    }
  }

  /// `debugDescription` appends `%interface` for scoped addresses.
  private static func literal(_ value: String) -> String {
    String(value.split(separator: "%", maxSplits: 1).first ?? "")
  }
}
