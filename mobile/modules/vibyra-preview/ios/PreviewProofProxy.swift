import Darwin
import Foundation

final class PreviewProofProxy {
  private let emit: (String, [String: Any]) -> Void
  private let lock = NSLock()
  private let requestGate = PreviewRequestGate()
  private lazy var server = PreviewProofServer { [weak self] fd in self?.serve(fd) }
  private var generation: String?
  private var secret: String?
  private var host: String?
  private var nextID: UInt64 = 0
  private var active: [String: ProxyReply] = [:]

  init(emit: @escaping (String, [String: Any]) -> Void) { self.emit = emit }

  func start(generation: String) throws -> String {
    guard let number = UInt64(generation), number > 0 else { throw ProxyError.invalid }
    lock.lock()
    guard self.generation == nil else { lock.unlock(); throw ProxyError.invalid }
    self.generation = generation
    lock.unlock()
    do {
      let base = try server.start()
      let secret = UUID().uuidString.replacingOccurrences(of: "-", with: "")
        + UUID().uuidString.replacingOccurrences(of: "-", with: "")
      lock.lock(); self.secret = secret; host = String(base.dropFirst("http://".count)); lock.unlock()
      requestGate.start(generation)
      return "\(base)/_vibyra_preview/\(secret)"
    }
    catch { lock.lock(); self.generation = nil; lock.unlock(); throw error }
  }

  func stop() {
    requestGate.stop()
    server.stop()
    lock.lock()
    let replies = Array(active.values)
    active.removeAll()
    generation = nil
    secret = nil
    host = nil
    lock.unlock()
    replies.forEach { $0.cancel() }
  }

  private func serve(_ fd: Int32) {
    guard let request = PreviewProofHTTP.readRequest(fd),
      request.path.hasPrefix("/"), !request.path.hasPrefix("//"),
      !request.path.contains("\\"), request.path.utf8.count <= 2048 else { return }
    lock.lock()
    guard let generation, let secret, let host, nextID < UInt64.max else { lock.unlock(); return }
    lock.unlock()
    guard request.headers["host"] == host else { forbidden(fd); return }
    let bootstrap = "/_vibyra_preview/\(secret)"
    if request.path == bootstrap || request.path.hasPrefix("\(bootstrap)?") {
      var startPath = "/"
      if request.path != bootstrap {
        guard let parts = URLComponents(string: "http://127.0.0.1\(request.path)"),
          let items = parts.queryItems, items.count == 1, items[0].name == "start",
          let value = items[0].value, value.utf8.count <= 2048,
          value.hasPrefix("/"), !value.hasPrefix("//"), !value.contains("\\"),
          !value.contains("#"), !value.unicodeScalars.contains(where: { $0.value < 32 || $0.value == 127 })
        else { forbidden(fd); return }
        startPath = value
      }
      let head = "HTTP/1.1 302 Found\r\nLocation: \(startPath)\r\nSet-Cookie: _vibyra_preview=\(secret); HttpOnly; SameSite=Strict; Path=/\r\nReferrer-Policy: no-referrer\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
      _ = PreviewProofHTTP.write(fd, Data(head.utf8))
      return
    }
    guard request.headers["cookie"]?.split(separator: ";").contains(where: {
      $0.trimmingCharacters(in: .whitespaces) == "_vibyra_preview=\(secret)"
    }) == true else { forbidden(fd); return }
    guard requestGate.acquire(generation) else { return }
    defer { requestGate.release(generation) }
    let upgrade = request.method == "GET"
      && request.headers["upgrade"]?.lowercased() == "websocket"
      && request.headers["connection"]?.lowercased().split(separator: ",")
        .contains(where: { $0.trimmingCharacters(in: .whitespaces) == "upgrade" }) == true
    lock.lock()
    guard self.generation == generation, self.secret == secret else { lock.unlock(); return }
    nextID += 1
    let id = String(nextID)
    let reply = ProxyReply(fd: fd)
    active[id] = reply
    lock.unlock()
    let excluded: Set<String> = upgrade ? ["host", "content-length", "transfer-encoding", "proxy-authorization"]
      : ["host", "connection", "content-length", "transfer-encoding", "upgrade", "proxy-authorization"]
    var headers = request.headers.filter { !excluded.contains($0.key) && $0.key.utf8.count <= 128 && $0.value.utf8.count <= 4096 }
    if let cookies = headers["cookie"] {
      headers["cookie"] = cookies.split(separator: ";").map { $0.trimmingCharacters(in: .whitespaces) }
        .filter { !$0.hasPrefix("_vibyra_preview=") }.joined(separator: "; ")
    }
    emit("onPreviewRequest", ["id": id, "generation": generation, "kind": upgrade ? "upgrade" : "http", "method": request.method,
      "path": request.path, "headers": headers])
    if upgrade {
      if reply.ready.wait(timeout: .now() + 30) == .success && reply.isRaw {
        readUpgrade(fd, id: id, reply: reply)
      }
    } else {
      for offset in stride(from: 0, to: request.body.count, by: 16 * 1024) {
        let part = request.body.subdata(in: offset..<min(offset + 16 * 1024, request.body.count))
        emit("onPreviewBody", ["id": id, "seq": offset / (16 * 1024) + 1, "dataBase64": part.base64EncodedString()])
      }
      emit("onPreviewEnd", ["id": id, "seq": (request.body.count + 16 * 1024 - 1) / (16 * 1024) + 1])
    }
    while reply.done.wait(timeout: .now() + 5) == .timedOut {
      if !reply.isIdle(for: 30) { continue }
      if !reply.started { try? reply.start(status: 504, headers: ["content-type": "text/plain"], setCookies: []) }
      try? reply.data(Data("Preview response timed out".utf8))
      try? reply.end()
      emit("onPreviewCancel", ["id": id])
      break
    }
    lock.lock(); active.removeValue(forKey: id); lock.unlock()
  }

  private func readUpgrade(_ fd: Int32, id: String, reply: ProxyReply) {
    PreviewProofHTTP.configureUpgradeRead(fd)
    var sequence = 1
    var scratch = [UInt8](repeating: 0, count: 16 * 1024)
    while !reply.isClosed {
      let allowed = reply.availableRead()
      if allowed == 0 { _ = reply.readReady.wait(timeout: .now() + 1); continue }
      let count = Darwin.recv(fd, &scratch, min(allowed, scratch.count), 0)
      if count > 0 {
        reply.consumedRead(count)
        emit("onPreviewBody", ["id": id, "seq": sequence,
          "dataBase64": Data(scratch[..<count]).base64EncodedString()])
        sequence += 1
      } else if count == 0 {
        emit("onPreviewEnd", ["id": id, "seq": sequence])
        return
      } else if errno != EAGAIN && errno != EWOULDBLOCK && errno != EINTR {
        emit("onPreviewCancel", ["id": id])
        return
      }
    }
  }

  private func forbidden(_ fd: Int32) {
    let head = "HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
    _ = PreviewProofHTTP.write(fd, Data(head.utf8))
  }

  private func reply(_ id: String) throws -> ProxyReply {
    lock.lock(); defer { lock.unlock() }
    guard let reply = active[id] else { throw ProxyError.stale }
    return reply
  }

  func responseStart(id: String, status: Int, headers: [String: String], setCookies: [String]) throws {
    try reply(id).start(status: status, headers: headers, setCookies: setCookies)
  }
  func responseData(id: String, dataBase64: String) throws {
    guard let bytes = Data(base64Encoded: dataBase64), !bytes.isEmpty, bytes.count <= 16 * 1024 else { throw ProxyError.invalid }
    try reply(id).data(bytes)
  }
  func allowRequestRead(id: String, bytes: Int) throws { try reply(id).allowRead(bytes) }
  func responseEnd(id: String) throws { try reply(id).end() }
  func responseCancel(id: String) { try? reply(id).cancel() }
}

enum ProxyError: Error { case invalid, stale, closed }
