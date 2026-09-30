import AppKit

/// Borrowed only by one synchronous Rust→Swift request. Never retain or enqueue
/// this authority; the opaque context disappears when that request returns.
struct InputAuthority {
    let valid: () -> Bool
    private let emit: (CGEvent) -> Void
    init(valid: @escaping () -> Bool, emit: @escaping (CGEvent) -> Void = { $0.post(tap: .cghidEventTap) }) {
        self.valid = valid; self.emit = emit
    }
    func require() throws {
        guard valid() else { throw fail("Window input authorization ended. Reconnect to control this window.") }
    }
    func post(_ event: CGEvent) throws {
        try require(); emit(event)
    }
    func pair(_ down: CGEvent, _ up: CGEvent, afterDown: () -> Void = {}) throws {
        let expected: CGEventType
        switch down.type {
        case .keyDown: expected = .keyUp
        case .leftMouseDown: expected = .leftMouseUp
        case .rightMouseDown: expected = .rightMouseUp
        default: throw fail("Unsupported paired input.")
        }
        guard up.type == expected else { throw fail("Mismatched input release.") }
        try post(down)
        // Only the release paired with this successfully emitted down survives revocation.
        defer { emit(up) }
        afterDown()
    }
}
