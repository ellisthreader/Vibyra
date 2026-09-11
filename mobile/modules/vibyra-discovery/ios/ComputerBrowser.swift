import Foundation
import Network

// All access is serialized on the main queue. Bonjour identifies candidates,
// never trusted devices; the Host still authenticates every payload with Noise
// and requires an explicit local approval before a new phone is trusted.
final class ComputerBrowser {
  private static let service = "_vibyra-host._tcp"
  private static let searchSeconds = 30.0

  private var browser: NWBrowser?
  private var deadline: DispatchWorkItem?
  private var resolutionTimer: DispatchSourceTimer?
  private let resolver = ServiceResolver()
  private let scope = NetworkScope()
  private var found: [String: Candidate] = [:]
  private var status = "idle"
  var onUpdate: (([String: Any]) -> Void)?

  private struct Candidate {
    let id: String
    let name: String
    let hostId: String?
    let via: String?
    let endpoint: NWEndpoint
  }

  init() {
    resolver.onChange = { [weak self] in self?.emit() }
    resolver.onDenied = { [weak self] in self?.finish("denied") }
    scope.onChange = { [weak self] in self?.emit() }
  }

  func start() {
    stop()
    found = [:]
    resolver.reset()
    scope.start()
    let parameters = NWParameters.tcp
    // Include available local links. Peer-to-peer also requires a compatible
    // advertiser and usable endpoint; browsing alone cannot guarantee it.
    parameters.includePeerToPeer = true
    // The TXT record carries the Host identity, so browse with metadata.
    let descriptor = NWBrowser.Descriptor.bonjourWithTXTRecord(type: Self.service, domain: "local.")
    let next = NWBrowser(for: descriptor, using: parameters)
    browser = next
    next.stateUpdateHandler = { [weak self, weak next] state in
      guard let self, let next, self.browser === next else { return }
      switch state {
      case let .waiting(error), let .failed(error):
        // Apple's documented Bonjour policy-denied error. Do not treat an
        // empty result set or an offline network as permission denial.
        if case let .dns(code) = error, code == -65570 {
          self.finish("denied")
        } else if case .failed = state {
          self.finish("failed")
        }
      default: break
      }
    }
    next.browseResultsChangedHandler = { [weak self, weak next] results, _ in
      guard let self, let next, self.browser === next else { return }
      self.accept(results)
    }
    status = "searching"
    emit()
    // Starting this real service browse is what lets iOS request Local Network
    // permission. No synthetic permission probe or subnet sweep is performed.
    next.start(queue: .main)
    let retry = DispatchSource.makeTimerSource(queue: .main)
    retry.schedule(deadline: .now() + 1, repeating: 1)
    retry.setEventHandler { [weak self] in self?.resolveFound() }
    resolutionTimer = retry
    retry.resume()
    let timeout = DispatchWorkItem { [weak self] in self?.finish("finished") }
    deadline = timeout
    DispatchQueue.main.asyncAfter(deadline: .now() + Self.searchSeconds, execute: timeout)
  }

  func stop() {
    deadline?.cancel()
    deadline = nil
    resolutionTimer?.cancel()
    resolutionTimer = nil
    resolver.stop()
    scope.stop()
    let previous = browser
    browser = nil
    previous?.stateUpdateHandler = nil
    previous?.browseResultsChangedHandler = nil
    previous?.cancel()
  }

  func suspend() {
    guard browser != nil else { return }
    finish("finished")
  }

  private func accept(_ results: Set<NWBrowser.Result>) {
    var candidates: [String: Candidate] = [:]
    for result in results {
      guard case let .service(name, type, domain, _) = result.endpoint else { continue }
      let hostId = Self.hostId(from: result.metadata)
      let id = hostId ?? "\(name).\(type).\(domain)"
      // The same identity advertised on two links is one computer. Prefer the
      // existing endpoint so repeated updates cannot move a pending tap.
      if let existing = found[id], results.contains(where: { $0.endpoint == existing.endpoint }) {
        candidates[id] = existing
        continue
      }
      candidates[id] = Candidate(
        id: id,
        name: String(name.prefix(128)),
        hostId: hostId,
        via: NetworkScope.kind(of: result.interfaces),
        endpoint: result.endpoint
      )
    }
    // Keep the browse bounded and stable for the list the person is tapping.
    found = Dictionary(
      uniqueKeysWithValues: candidates.sorted { $0.key < $1.key }.prefix(16).map { ($0.key, $0.value) }
    )
    resolveFound()
    emit()
  }

  private func resolveFound() {
    resolver.update(Dictionary(uniqueKeysWithValues: found.values.map { ($0.id, $0.endpoint) }))
  }

  /// The Host advertises its static public key, which is also its `hostId`.
  /// Anything else is ignored, so a malformed or spoofed record cannot reach
  /// the pairing code path as a partly filled connection.
  private static func hostId(from metadata: NWBrowser.Result.Metadata) -> String? {
    guard case let .bonjour(record) = metadata,
          case let .string(value) = record.getEntry(for: "id"),
          value.count == 64,
          value.allSatisfy({ $0.isHexDigit && ($0.isNumber || $0.isLowercase) })
    else { return nil }
    return value
  }

  private func finish(_ status: String) {
    stop()
    self.status = status
    emit()
  }

  private func emit() {
    let computers: [[String: Any]] = found.values
      .sorted { $0.id < $1.id }
      .map { candidate in
        var value: [String: Any] = ["id": candidate.id, "name": candidate.name]
        if let hostId = candidate.hostId { value["hostId"] = hostId }
        if let via = candidate.via { value["via"] = via }
        if let address = resolver.address(for: candidate.id) {
          value["host"] = address.host
          value["port"] = Int(address.port)
        }
        return value
      }
    onUpdate?(["status": status, "computers": computers, "networks": scope.payload])
  }
}
