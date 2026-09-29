import Darwin
import Foundation

final class PreviewProofServer {
  private let handler: (Int32) -> Void
  private let lock = NSLock()
  private var listener: Int32 = -1
  private var clients = Set<Int32>()
  private let queue = DispatchQueue(label: "vibyra.preview.proof", qos: .userInitiated)

  init(handler: @escaping (Int32) -> Void = PreviewProofHTTP.handle) {
    self.handler = handler
  }

  func start() throws -> String {
    lock.lock()
    defer { lock.unlock() }
    if listener >= 0 { throw ProofError.alreadyRunning }
    let fd = socket(AF_INET, SOCK_STREAM, 0)
    guard fd >= 0 else { throw ProofError.socket }
    var address = sockaddr_in()
    address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
    address.sin_family = sa_family_t(AF_INET)
    address.sin_port = 0
    address.sin_addr = in_addr(s_addr: inet_addr("127.0.0.1"))
    let bound = withUnsafePointer(to: &address) { pointer in
      pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
        bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
      }
    }
    guard bound == 0, listen(fd, 16) == 0 else { close(fd); throw ProofError.bind }
    var length = socklen_t(MemoryLayout<sockaddr_in>.size)
    let named = withUnsafeMutablePointer(to: &address) { pointer in
      pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { getsockname(fd, $0, &length) }
    }
    guard named == 0 else { close(fd); throw ProofError.socket }
    listener = fd
    queue.async { [weak self] in self?.acceptLoop(fd) }
    return "http://127.0.0.1:\(UInt16(bigEndian: address.sin_port))"
  }

  func stop() {
    lock.lock()
    let fd = listener
    listener = -1
    let open = clients
    clients.removeAll()
    lock.unlock()
    if fd >= 0 { shutdown(fd, SHUT_RDWR); close(fd) }
    for client in open { shutdown(client, SHUT_RDWR); close(client) }
  }

  private func acceptLoop(_ fd: Int32) {
    while true {
      let client = accept(fd, nil, nil)
      if client < 0 { break }
      lock.lock()
      let allowed = listener == fd && clients.count < 16
      if allowed { clients.insert(client) }
      lock.unlock()
      if !allowed { close(client); continue }
      DispatchQueue.global(qos: .userInitiated).async { [weak self] in
        PreviewProofHTTP.configure(client)
        self?.handler(client)
        self?.lock.lock()
        let owned = self?.clients.remove(client) != nil
        self?.lock.unlock()
        if owned { close(client) }
      }
    }
  }
}

enum ProofError: Error {
  case alreadyRunning, socket, bind
}
