import AppKit
import ApplicationServices

/// Input from the phone lands exactly where the phone user tapped in the
/// shared window: the window is brought forward if needed, the element under
/// the point must belong to it, and the events then go through the window
/// server like a real mouse or keyboard, which every framework (AppKit,
/// WebKit, Chromium, Qt) accepts. Nothing is posted if any check fails.
@available(macOS 12.3, *)
func windowInput(_ capture: WindowCapture, _ request: [String: Any]) throws {
    // Input must use the same geometry and live identity as the displayed frame.
    _ = try capture.frame()
    guard AXIsProcessTrusted() else {
        askForAccessibility()
        throw fail("On your Mac, choose Open System Settings in the Accessibility prompt and turn Vibyra on, then tap again.")
    }
    let info = try windowInfo(capture.id)
    guard info["fingerprint"] as? String == capture.fingerprint, let pid = info["pid"] as? Int32,
          let x = info["x"] as? Double, let y = info["y"] as? Double,
          let width = info["width"] as? Double, let height = info["height"] as? Double else {
        throw fail("The application restarted. Select its new window on your Mac.")
    }
    let frame = CGRect(x: x, y: y, width: width, height: height)
    let kind = request["kind"] as? String
    switch kind {
    case "click", "scroll":
        guard let nx = request["x"] as? Double, let ny = request["y"] as? Double,
              nx.isFinite, ny.isFinite, (0...1).contains(nx), (0...1).contains(ny) else {
            throw fail("Invalid window coordinates.")
        }
        guard let shown = revealPoint(pid: pid, frame: frame, nx: nx, ny: ny) else {
            throw fail("That part of the window is off your Mac's screen. Move the window onto the screen, then tap again.")
        }
        let point = CGPoint(x: shown.minX + nx * shown.width, y: shown.minY + ny * shown.height)
        guard bringToFront(pid: pid, frame: shown, until: { sharedWindowIsHit(at: point, pid: pid, frame: shown) }) else {
            throw fail("Another window, menu or dialog is over that spot on your Mac. Close it, then tap again.")
        }
        if kind == "scroll" {
            try scroll(at: point, delta: max(-600, min(600, request["delta"] as? Int32 ?? 0)))
        } else {
            try click(at: point, right: request["right"] as? Bool == true)
        }
    case "text", "key", "keys":
        let actions = try keyActions(request)
        guard bringToFront(pid: pid, frame: frame, until: { sharedWindowHasFocus(pid: pid, frame: frame) }) else {
            throw fail("The shared window does not have keyboard focus on your Mac. Tap into it first.")
        }
        try send(actions) { sharedWindowHasFocus(pid: pid, frame: frame) }
    default: throw fail("Unsupported window input.")
    }
}

private let promptLock = NSLock()
private var lastPrompt = Date.distantPast

/// A switch in System Settings only counts for the exact app macOS recorded.
/// Asking through the system prompt records this copy of Vibyra (its current
/// signature), so the owner's switch then applies to it. At most once a minute.
private func askForAccessibility() {
    promptLock.lock(); defer { promptLock.unlock() }
    guard Date().timeIntervalSince(lastPrompt) > 60 else { return }
    lastPrompt = Date()
    let key = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
    _ = AXIsProcessTrustedWithOptions([key: true] as CFDictionary)
}

private func post(_ event: CGEvent?) throws {
    guard let event else { throw fail("macOS refused to create the input event.") }
    event.post(tap: .cghidEventTap)
}

private func click(at point: CGPoint, right: Bool) throws {
    let source = CGEventSource(stateID: .hidSystemState)
    let (downType, upType, button): (CGEventType, CGEventType, CGMouseButton) =
        right ? (.rightMouseDown, .rightMouseUp, .right) : (.leftMouseDown, .leftMouseUp, .left)
    // Move first, so hover and pointer-enter handlers run as for a real mouse.
    try post(CGEvent(mouseEventSource: source, mouseType: .mouseMoved, mouseCursorPosition: point, mouseButton: button))
    usleep(12_000)
    let down = CGEvent(mouseEventSource: source, mouseType: downType, mouseCursorPosition: point, mouseButton: button)
    let up = CGEvent(mouseEventSource: source, mouseType: upType, mouseCursorPosition: point, mouseButton: button)
    // Web views ignore a press whose click count is zero.
    down?.setIntegerValueField(.mouseEventClickState, value: 1)
    up?.setIntegerValueField(.mouseEventClickState, value: 1)
    try post(down)
    usleep(30_000)
    try post(up)
}

private func scroll(at point: CGPoint, delta: Int32) throws {
    let source = CGEventSource(stateID: .hidSystemState)
    try post(CGEvent(mouseEventSource: source, mouseType: .mouseMoved, mouseCursorPosition: point, mouseButton: .left))
    let event = CGEvent(scrollWheelEvent2Source: source, units: .pixel, wheelCount: 1, wheel1: delta, wheel2: 0, wheel3: 0)
    event?.location = point
    try post(event)
}
