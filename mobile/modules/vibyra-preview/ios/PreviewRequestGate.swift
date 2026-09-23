import Foundation

/// Keep excess browser sockets waiting locally until the Mac has stream room.
/// The loopback server bounds total sockets to 16, including these waiters.
final class PreviewRequestGate {
  private let condition = NSCondition()
  private var generation: String?
  private var active = 0
  private var waiting: [UUID] = []

  func start(_ generation: String) {
    condition.lock()
    self.generation = generation
    active = 0
    waiting.removeAll()
    condition.broadcast()
    condition.unlock()
  }

  func stop() {
    condition.lock()
    generation = nil
    active = 0
    waiting.removeAll()
    condition.broadcast()
    condition.unlock()
  }

  func acquire(_ generation: String) -> Bool {
    condition.lock()
    defer { condition.unlock() }
    guard self.generation == generation else { return false }
    let ticket = UUID()
    waiting.append(ticket)
    let deadline = Date().addingTimeInterval(30)
    while self.generation == generation {
      if waiting.first == ticket && active < 8 {
        waiting.removeFirst()
        active += 1
        return true
      }
      if !condition.wait(until: deadline) { break }
    }
    waiting.removeAll { $0 == ticket }
    condition.broadcast()
    return false
  }

  func release(_ generation: String) {
    condition.lock()
    if self.generation == generation {
      active -= 1
      condition.broadcast()
    }
    condition.unlock()
  }
}
