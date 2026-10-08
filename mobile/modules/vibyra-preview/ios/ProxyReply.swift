import Foundation

final class ProxyReply {
  let done = DispatchSemaphore(value: 0)
  let ready = DispatchSemaphore(value: 0)
  let readReady = DispatchSemaphore(value: 0)
  private let fd: Int32
  private let lock = NSLock()
  private(set) var started = false
  private var closed = false
  private var raw = false
  private var readAllowance = 0
  private var lastActivity = ProcessInfo.processInfo.systemUptime

  init(fd: Int32) { self.fd = fd }

  func start(status: Int, headers: [String: String], setCookies: [String]) throws {
    lock.lock(); defer { lock.unlock() }
    guard !started, !closed, (100...599).contains(status) else { throw ProxyError.invalid }
    let upgrade = status == 101
    if upgrade && !headers.contains(where: {
      $0.key.lowercased() == "sec-websocket-accept" && !$0.value.isEmpty
    }) { throw ProxyError.invalid }
    let excluded: Set<String> = ["connection", "content-length", "transfer-encoding", "set-cookie", "upgrade"]
    var lines = upgrade ? "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n"
      : "HTTP/1.1 \(status) Response\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n"
    for (name, value) in headers {
      let normalized = name.lowercased()
      if upgrade && normalized == "connection" && value.lowercased() == "upgrade" { continue }
      if upgrade && normalized == "upgrade" && value.lowercased() == "websocket" { continue }
      guard !excluded.contains(normalized), !normalized.isEmpty, normalized.utf8.count <= 128,
        normalized.utf8.allSatisfy({ ($0 >= 97 && $0 <= 122) || ($0 >= 48 && $0 <= 57) || $0 == 45 }),
        value.utf8.count <= 4096, !value.contains("\r"), !value.contains("\n") else { throw ProxyError.invalid }
      lines += "\(normalized): \(value)\r\n"
    }
    guard setCookies.count <= 32 else { throw ProxyError.invalid }
    for cookie in setCookies {
      guard !cookie.isEmpty, cookie.utf8.count <= 4096,
        !cookie.utf8.contains(where: { $0 < 32 || $0 == 127 }) else { throw ProxyError.invalid }
      lines += "Set-Cookie: \(cookie)\r\n"
    }
    lines += "\r\n"
    guard PreviewProofHTTP.write(fd, Data(lines.utf8)) else { throw ProxyError.closed }
    started = true
    raw = upgrade
    lastActivity = ProcessInfo.processInfo.systemUptime
    ready.signal()
  }

  func data(_ bytes: Data) throws {
    lock.lock(); defer { lock.unlock() }
    guard started, !closed, !bytes.isEmpty, bytes.count <= 16 * 1024 else { throw ProxyError.invalid }
    let written: Bool
    if raw { written = PreviewProofHTTP.write(fd, bytes) }
    else {
      let head = Data("\(String(bytes.count, radix: 16))\r\n".utf8)
      written = PreviewProofHTTP.write(fd, head) && PreviewProofHTTP.write(fd, bytes)
        && PreviewProofHTTP.write(fd, Data("\r\n".utf8))
    }
    guard written else { throw ProxyError.closed }
    lastActivity = ProcessInfo.processInfo.systemUptime
  }

  func end() throws {
    lock.lock(); defer { lock.unlock() }
    guard started, !closed else { throw ProxyError.invalid }
    if !raw && !PreviewProofHTTP.write(fd, Data("0\r\n\r\n".utf8)) { throw ProxyError.closed }
    closed = true
    done.signal()
  }

  func cancel() {
    lock.lock(); defer { lock.unlock() }
    if !closed { closed = true; ready.signal(); readReady.signal(); done.signal() }
  }

  func isIdle(for seconds: TimeInterval) -> Bool {
    lock.lock(); defer { lock.unlock() }
    return !closed && ProcessInfo.processInfo.systemUptime - lastActivity >= seconds
  }

  var isRaw: Bool { lock.lock(); defer { lock.unlock() }; return raw }
  var isClosed: Bool { lock.lock(); defer { lock.unlock() }; return closed }

  func allowRead(_ bytes: Int) throws {
    lock.lock(); defer { lock.unlock() }
    guard !closed, bytes > 0, bytes <= 64 * 1024,
      readAllowance <= 64 * 1024 - bytes else { throw ProxyError.invalid }
    readAllowance += bytes
    readReady.signal()
  }

  func availableRead() -> Int {
    lock.lock(); defer { lock.unlock() }
    return readAllowance
  }

  func consumedRead(_ bytes: Int) {
    lock.lock(); defer { lock.unlock() }
    readAllowance -= bytes
    lastActivity = ProcessInfo.processInfo.systemUptime
  }
}
