import Darwin
import Foundation

enum PreviewProofHTTP {
  private static let headerLimit = 16 * 1024
  private static let bodyLimit = 1024 * 1024

  static func configure(_ fd: Int32) {
    var timeout = timeval(tv_sec: 8, tv_usec: 0)
    withUnsafePointer(to: &timeout) {
      _ = setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, $0, socklen_t(MemoryLayout<timeval>.size))
      _ = setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, $0, socklen_t(MemoryLayout<timeval>.size))
    }
    var noSigPipe: Int32 = 1
    withUnsafePointer(to: &noSigPipe) {
      _ = setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, $0, socklen_t(MemoryLayout<Int32>.size))
    }
  }

  static func configureUpgradeRead(_ fd: Int32) {
    var timeout = timeval(tv_sec: 1, tv_usec: 0)
    withUnsafePointer(to: &timeout) {
      _ = setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, $0, socklen_t(MemoryLayout<timeval>.size))
    }
  }

  static func handle(_ fd: Int32) {
    guard let request = readRequest(fd) else { return }
    if request.path == "/ws" && request.headers["upgrade"]?.lowercased() == "websocket" {
      PreviewProofWebSocket.run(fd, key: request.headers["sec-websocket-key"] ?? "")
      return
    }
    switch (request.method, request.path) {
    case ("GET", "/"):
      respond(fd, 200, "text/html; charset=utf-8", Data(page.utf8))
    case ("GET", "/next"):
      respond(fd, 200, "text/html; charset=utf-8", Data("<h1 id='next'>Second page</h1>".utf8))
    case ("POST", "/form"):
      let text = String(data: request.body, encoding: .utf8) ?? ""
      let safe = text.replacingOccurrences(of: "<", with: "&lt;")
      respond(fd, 200, "text/html; charset=utf-8", Data("<h1 id='form'>\(safe)</h1>".utf8))
    case ("GET", "/cookie"):
      respond(fd, 200, "text/plain", Data("cookie set".utf8), extra: "Set-Cookie: proof=works; Path=/; SameSite=Lax\r\n")
    case ("GET", "/api"):
      let cookie = request.headers["cookie"] ?? ""
      let hasCookie = cookie.contains("proof=works") ? "true" : "false"
      respond(fd, 200, "application/json", Data("{\"cookie\":\(hasCookie)}".utf8))
    case ("GET", "/events"):
      let head = "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-cache\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n"
      _ = write(fd, Data(head.utf8))
      _ = write(fd, Data("data: live-event\n\n".utf8))
    case ("GET", "/asset"):
      let size = 10 * 1024 * 1024
      let head = "HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\nContent-Length: \(size)\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n"
      guard write(fd, Data(head.utf8)) else { return }
      let chunk = Data(repeating: 0x5A, count: 32 * 1024)
      for _ in 0..<(size / chunk.count) { if !write(fd, chunk) { break } }
    default:
      respond(fd, 404, "text/plain", Data("Not found".utf8))
    }
  }

  static func write(_ fd: Int32, _ data: Data) -> Bool {
    data.withUnsafeBytes { raw in
      guard let base = raw.baseAddress else { return data.isEmpty }
      var position = 0
      while position < data.count {
        let sent = Darwin.send(fd, base.advanced(by: position), data.count - position, 0)
        if sent <= 0 { return false }
        position += sent
      }
      return true
    }
  }

  private static func respond(_ fd: Int32, _ status: Int, _ mime: String, _ body: Data, extra: String = "") {
    let head = "HTTP/1.1 \(status) \(status == 200 ? "OK" : "Not Found")\r\nContent-Type: \(mime)\r\nContent-Length: \(body.count)\r\nCache-Control: no-store\r\n\(extra)Connection: close\r\n\r\n"
    if write(fd, Data(head.utf8)) { _ = write(fd, body) }
  }

  static func readRequest(_ fd: Int32) -> ProofRequest? {
    var buffer = Data()
    var scratch = [UInt8](repeating: 0, count: 4096)
    let separator = Data("\r\n\r\n".utf8)
    while buffer.range(of: separator) == nil && buffer.count <= headerLimit {
      let count = Darwin.recv(fd, &scratch, scratch.count, 0)
      if count <= 0 { return nil }
      buffer.append(contentsOf: scratch[..<count])
    }
    guard let boundary = buffer.range(of: separator), boundary.lowerBound <= headerLimit,
      let text = String(data: buffer[..<boundary.lowerBound], encoding: .utf8) else { return nil }
    let lines = text.components(separatedBy: "\r\n")
    let words = (lines.first ?? "").split(separator: " ")
    let methods: Set<String> = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]
    guard words.count == 3, methods.contains(String(words[0])) else { return nil }
    var headers: [String: String] = [:]
    for line in lines.dropFirst() {
      guard let index = line.firstIndex(of: ":") else { return nil }
      let key = line[..<index].lowercased()
      headers[key] = line[line.index(after: index)...].trimmingCharacters(in: .whitespaces)
    }
    guard let length = Int(headers["content-length"] ?? "0"), length >= 0, length <= bodyLimit else { return nil }
    var body = Data(buffer[boundary.upperBound...])
    while body.count < length {
      let count = Darwin.recv(fd, &scratch, min(scratch.count, length - body.count), 0)
      if count <= 0 { return nil }
      body.append(contentsOf: scratch[..<count])
    }
    return ProofRequest(method: String(words[0]), path: String(words[1]),
      headers: headers, body: Data(body.prefix(length)))
  }

  private static let page = """
    <!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Vibyra local Preview proof</title><h1 id="root">Local Preview proof</h1>
    <a id="next-link" href="/next">Next page</a>
    <form id="post-form" method="post" action="/form"><input name="value" value="saved"><button>Submit</button></form>
    """
}

struct ProofRequest {
  let method: String
  let path: String
  let headers: [String: String]
  let body: Data
}
