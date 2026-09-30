import AppKit
import ApplicationServices

/// The shared window's own accessibility element, matched by its frame on
/// screen (never its title).
@available(macOS 12.3, *)
func sharedWindowElement(pid: Int32, frame: CGRect) -> AXUIElement? {
    var windows: CFTypeRef?
    AXUIElementCopyAttributeValue(AXUIElementCreateApplication(pid), kAXWindowsAttribute as CFString, &windows)
    return ((windows as? [AXUIElement]) ?? []).first { axFrame($0).map { sameFrame($0, frame) } ?? false }
}

func axFrame(_ element: AXUIElement) -> CGRect? {
    var positionValue: CFTypeRef?, sizeValue: CFTypeRef?
    AXUIElementCopyAttributeValue(element, kAXPositionAttribute as CFString, &positionValue)
    AXUIElementCopyAttributeValue(element, kAXSizeAttribute as CFString, &sizeValue)
    guard let positionValue, let sizeValue,
          CFGetTypeID(positionValue) == AXValueGetTypeID(), CFGetTypeID(sizeValue) == AXValueGetTypeID()
    else { return nil }
    var position = CGPoint.zero, size = CGSize.zero
    AXValueGetValue(unsafeBitCast(positionValue, to: AXValue.self), .cgPoint, &position)
    AXValueGetValue(unsafeBitCast(sizeValue, to: AXValue.self), .cgSize, &size)
    return CGRect(origin: position, size: size)
}

func sameFrame(_ left: CGRect, _ right: CGRect) -> Bool {
    abs(left.minX - right.minX) < 1 && abs(left.minY - right.minY) < 1
        && abs(left.width - right.width) < 1 && abs(left.height - right.height) < 1
}

/// What the owner would hit by clicking `point` right now: the element there
/// must belong to the shared window. This follows real event routing, so the
/// Dock's invisible full-screen layer or an app's helper panels elsewhere do
/// not count, while a menu, dialog or other app's window at that spot does.
@available(macOS 12.3, *)
func sharedWindowIsHit(at point: CGPoint, pid: Int32, frame: CGRect) -> Bool {
    var hit: AXUIElement?
    guard AXUIElementCopyElementAtPosition(AXUIElementCreateSystemWide(), Float(point.x), Float(point.y), &hit)
            == .success, let element = hit else { return false }
    var owner: pid_t = 0
    guard AXUIElementGetPid(element, &owner) == .success, owner == pid else { return false }
    var current: AXUIElement? = element
    for _ in 0..<64 {
        guard let node = current else { return false }
        var role: CFTypeRef?
        AXUIElementCopyAttributeValue(node, kAXRoleAttribute as CFString, &role)
        if role as? String == kAXWindowRole as String { return axFrame(node).map { sameFrame($0, frame) } ?? false }
        var window: CFTypeRef?
        if AXUIElementCopyAttributeValue(node, kAXWindowAttribute as CFString, &window) == .success,
           let window, CFGetTypeID(window) == AXUIElementGetTypeID() {
            return axFrame(unsafeBitCast(window, to: AXUIElement.self)).map { sameFrame($0, frame) } ?? false
        }
        var parent: CFTypeRef?
        guard AXUIElementCopyAttributeValue(node, kAXParentAttribute as CFString, &parent) == .success,
              let parent, CFGetTypeID(parent) == AXUIElementGetTypeID() else { return false }
        current = unsafeBitCast(parent, to: AXUIElement.self)
    }
    return false
}

/// Whether keystrokes would reach the shared window: its app is frontmost and
/// that window has keyboard focus.
@available(macOS 12.3, *)
func sharedWindowHasFocus(pid: Int32, frame: CGRect) -> Bool {
    guard NSWorkspace.shared.frontmostApplication?.processIdentifier == pid else { return false }
    var focused: CFTypeRef?
    guard AXUIElementCopyAttributeValue(AXUIElementCreateApplication(pid), kAXFocusedWindowAttribute as CFString,
                                        &focused) == .success,
          let focused, CFGetTypeID(focused) == AXUIElementGetTypeID() else { return false }
    return axFrame(unsafeBitCast(focused, to: AXUIElement.self)).map { sameFrame($0, frame) } ?? false
}

/// The usable desktop (without menu bar and Dock) of every display, in the
/// window server's top-left coordinates used by window bounds and AX.
func visibleAreas() -> [CGRect] {
    // Read in place: waiting on the main thread could deadlock Vibyra.
    guard let top = NSScreen.screens.first?.frame.maxY else { return [] }
    return NSScreen.screens.map { screen in
        let area = screen.visibleFrame
        return CGRect(x: area.minX, y: top - area.maxY, width: area.width, height: area.height)
    }
}

/// A window partly off the screen cannot take a click there. Slide the shared
/// window just far enough onto the display it mostly occupies (never resizing
/// it) so the point at (`nx`, `ny`) of it is visible, and return its new frame.
@available(macOS 12.3, *)
func revealPoint(pid: Int32, frame: CGRect, nx: Double, ny: Double, authority: InputAuthority) throws -> CGRect? {
    let areas = visibleAreas()
    let point = CGPoint(x: frame.minX + nx * frame.width, y: frame.minY + ny * frame.height)
    if areas.contains(where: { $0.insetBy(dx: 2, dy: 2).contains(point) }) { return frame }
    guard let area = areas.max(by: { overlap($0, frame) < overlap($1, frame) }),
          let window = sharedWindowElement(pid: pid, frame: frame) else { return nil }
    func place(_ origin: CGFloat, _ size: CGFloat, _ low: CGFloat, _ high: CGFloat, _ at: Double) -> CGFloat {
        // Fit the whole window if it can; otherwise cover the display.
        let fitted = size <= high - low ? min(max(origin, low), high - size) : min(max(origin, high - size), low)
        let offset = CGFloat(at) * size
        return min(max(fitted, low + 8 - offset), high - 8 - offset)
    }
    var origin = CGPoint(x: place(frame.minX, frame.width, area.minX, area.maxX, nx),
                         y: place(frame.minY, frame.height, area.minY, area.maxY, ny))
    try authority.require()
    guard let value = AXValueCreate(.cgPoint, &origin),
          AXUIElementSetAttributeValue(window, kAXPositionAttribute as CFString, value) == .success else { return nil }
    for _ in 0..<20 {
        usleep(25_000)
        if let moved = axFrame(window), abs(moved.width - frame.width) < 1, abs(moved.height - frame.height) < 1,
           abs(moved.minX - frame.minX) >= 1 || abs(moved.minY - frame.minY) >= 1 {
            let visible = CGPoint(x: moved.minX + nx * moved.width, y: moved.minY + ny * moved.height)
            return areas.contains(where: { $0.contains(visible) }) ? moved : nil
        }
    }
    return nil
}

private func overlap(_ area: CGRect, _ frame: CGRect) -> CGFloat {
    let shared = area.intersection(frame)
    return shared.isNull ? 0 : shared.width * shared.height
}

/// A tap from the phone is meant for the shared window even while the owner
/// uses something else on the Mac: raise exactly that window and make its app
/// frontmost, then wait (briefly) until `ready` confirms it before any event.
@available(macOS 12.3, *)
func bringToFront(pid: Int32, frame: CGRect, authority: InputAuthority, until ready: () -> Bool) throws -> Bool {
    try authority.require()
    if ready() { return true }
    let app = AXUIElementCreateApplication(pid)
    if let window = sharedWindowElement(pid: pid, frame: frame) {
        try authority.require()
        AXUIElementPerformAction(window, kAXRaiseAction as CFString)
        try authority.require()
        AXUIElementSetAttributeValue(app, kAXMainWindowAttribute as CFString, window)
        try authority.require()
        AXUIElementSetAttributeValue(app, kAXFocusedWindowAttribute as CFString, window)
    }
    try authority.require()
    AXUIElementSetAttributeValue(app, kAXFrontmostAttribute as CFString, kCFBooleanTrue)
    let running = NSRunningApplication(processIdentifier: pid)
    try authority.require()
    running?.activate(options: [])
    for _ in 0..<20 {
        usleep(25_000)
        if ready() { return true }
    }
    return ready()
}
