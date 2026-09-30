import Darwin
import Foundation

@main
struct PreviewProofAttachmentHarness {
  static func main() throws {
    let proxy = PreviewProofProxy { _, _ in }
    let bootstrap = try proxy.start(generation: "12")
    defer { proxy.stop() }
    let url = URL(string: bootstrap)!
    let port = UInt16(url.port!)
    let path = url.path
    let allowed = request(port: port, path: "\(path)?start=%2Fmenu%3Ftag%3Dsoy")
    precondition(allowed.contains("HTTP/1.1 302 Found\r\n"))
    precondition(allowed.contains("Location: /menu?tag=soy\r\n"))
    precondition(allowed.contains("Set-Cookie: _vibyra_preview="))
    let denied = request(port: port, path: "\(path)?start=%2F%2Fevil.invalid")
    precondition(denied.contains("HTTP/1.1 403 Forbidden\r\n"))
    print("PASS native Preview bootstrap opening path and off-origin denial")
  }

  private static func request(port: UInt16, path: String) -> String {
    let fd = socket(AF_INET, SOCK_STREAM, 0)
    precondition(fd >= 0)
    defer { close(fd) }
    var address = sockaddr_in()
    address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
    address.sin_family = sa_family_t(AF_INET)
    address.sin_port = port.bigEndian
    address.sin_addr = in_addr(s_addr: inet_addr("127.0.0.1"))
    let connected = withUnsafePointer(to: &address) { pointer in
      pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
        connect(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
      }
    }
    precondition(connected == 0)
    let wire = "GET \(path) HTTP/1.1\r\nHost: 127.0.0.1:\(port)\r\nConnection: close\r\n\r\n"
    _ = wire.withCString { send(fd, $0, strlen($0), 0) }
    var bytes = [UInt8](repeating: 0, count: 4096)
    let count = recv(fd, &bytes, bytes.count, 0)
    precondition(count > 0)
    return String(decoding: bytes[..<count], as: UTF8.self)
  }
}
