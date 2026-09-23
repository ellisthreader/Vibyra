import CryptoKit
import Darwin
import Foundation

enum PreviewProofWebSocket {
  static func run(_ fd: Int32, key: String) {
    guard key.count <= 64, Data(base64Encoded: key)?.count == 16 else { return }
    let digest = Insecure.SHA1.hash(data: Data("\(key)258EAFA5-E914-47DA-95CA-C5AB0DC85B11".utf8))
    let accept = Data(digest).base64EncodedString()
    let head = "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: \(accept)\r\n\r\n"
    guard PreviewProofHTTP.write(fd, Data(head.utf8)) else { return }
    while let header = read(fd, count: 2) {
      let opcode = header[0] & 0x0F
      guard header[0] & 0x80 != 0, header[1] & 0x80 != 0 else { return }
      var length = Int(header[1] & 0x7F)
      if length == 126 {
        guard let extended = read(fd, count: 2) else { return }
        length = Int(extended[0]) << 8 | Int(extended[1])
      } else if length == 127 { return }
      guard length <= 64 * 1024, let mask = read(fd, count: 4),
        let payload = read(fd, count: length) else { return }
      let plain = Data(payload.enumerated().map { $0.element ^ mask[$0.offset % 4] })
      if opcode == 8 { _ = sendFrame(fd, opcode: 8, payload: Data()); return }
      if opcode == 9 { _ = sendFrame(fd, opcode: 10, payload: plain); continue }
      guard opcode == 1 || opcode == 2 else { return }
      guard sendFrame(fd, opcode: opcode, payload: plain) else { return }
    }
  }

  private static func sendFrame(_ fd: Int32, opcode: UInt8, payload: Data) -> Bool {
    var head = Data([0x80 | opcode])
    if payload.count < 126 { head.append(UInt8(payload.count)) }
    else {
      head.append(126)
      head.append(UInt8((payload.count >> 8) & 0xFF))
      head.append(UInt8(payload.count & 0xFF))
    }
    return PreviewProofHTTP.write(fd, head) && PreviewProofHTTP.write(fd, payload)
  }

  private static func read(_ fd: Int32, count: Int) -> [UInt8]? {
    var bytes = [UInt8](repeating: 0, count: count)
    var position = 0
    while position < count {
      let received = bytes.withUnsafeMutableBytes { raw in
        Darwin.recv(fd, raw.baseAddress!.advanced(by: position), count - position, 0)
      }
      if received <= 0 { return nil }
      position += received
    }
    return bytes
  }
}
