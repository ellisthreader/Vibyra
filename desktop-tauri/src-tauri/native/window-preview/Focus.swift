import AppKit
import ApplicationServices

/// What the phone needs to show its own keyboard for the shared window: whether
/// keyboard focus is in a text field there, which keyboard suits it, where it
/// and its text cursor are, and a map of the other visible text fields.
/// Asked for with every frame of a controlled window; never reads field text.
@available(macOS 12.3, *)
final class FocusWatcher {
    private let lock = NSLock()
    private var element: AXUIElement?
    private var signature = ""
    private var serial = 0
    private var fields: [[Any]] = []
    private var scanned = Date.distantPast
    private var scanning = false
    private var changed = true
    private var asked: pid_t = 0
    private var chromium: pid_t = 0
    private var latest: [String: Any]?
    private var latestStarted = Date.distantPast
    private var reading = false
    private let scanner = DispatchQueue(label: "app.vibyra.window-fields", qos: .utility)
    private let reader = DispatchQueue(label: "app.vibyra.window-focus", qos: .userInitiated)

    /// New pixels arrived, so the text fields may have moved.
    func frameChanged() { lock.lock(); changed = true; lock.unlock() }

    /// The latest reading without waiting on the application, for each frame:
    /// a busy or hung app must never hold back the picture. A fresh reading
    /// starts in the background whenever this one is more than a tick old.
    func current(pid: pid_t, frame: CGRect) -> [String: Any] {
        if pid == getpid() { return measure(pid: pid, frame: frame) }
        lock.lock()
        let start = !reading && Date().timeIntervalSince(latestStarted) > 0.1
        if start { reading = true }
        var state = latest ?? ["v": 1, "access": true, "editable": false, "front": false, "serial": serial]
        state["fields"] = fields
        lock.unlock()
        if start {
            reader.async { [weak self] in
                guard let self else { return }
                _ = self.measure(pid: pid, frame: frame)
                self.lock.lock(); self.reading = false; self.lock.unlock()
            }
        }
        return state
    }

    /// Reads focus now, waiting on the application (at most a quarter second a request).
    func measure(pid: pid_t, frame: CGRect, rescan: Bool = false) -> [String: Any] {
        let started = Date()
        // A test fixture may inspect itself; everything else needs Accessibility.
        guard pid == getpid() || AXIsProcessTrusted() else {
            lock.lock(); defer { lock.unlock() }
            return ["v": 1, "access": false, "editable": false, "front": false, "serial": serial, "fields": []]
        }
        let app = AXUIElementCreateApplication(pid)
        AXUIElementSetMessagingTimeout(app, 0.25)
        exposeChromium(app, pid: pid)
        var value: CFTypeRef?
        AXUIElementCopyAttributeValue(app, kAXFocusedUIElementAttribute as CFString, &value)
        let focused = axElement(value)
        if let focused { AXUIElementSetMessagingTimeout(focused, 0.25) }
        let target = focused.flatMap { belongs($0, app: app, frame: frame) ? textTarget($0) : nil }
        var state: [String: Any] = ["v": 1, "access": true, "editable": target != nil, "kind": target?.kind ?? "text",
                                    "front": sharedWindowHasFocus(pid: pid, frame: frame)]
        if let target {
            state["label"] = target.label
            if let empty = target.empty { state["empty"] = empty }
            if let rect = target.rect, let field = windowFraction(rect, window: frame) { state["field"] = field }
            if let caret = focused.flatMap(caretRect), let spot = windowFraction(caret, window: frame) { state["caret"] = spot }
        }
        let signature = target.map { "\($0.kind)|\($0.label)" } ?? "none"
        lock.lock(); defer { lock.unlock() }
        let same = focused.flatMap { now in element.map { CFEqual(now, $0) } } ?? (focused == nil && element == nil)
        if !same || signature != self.signature {
            serial += 1; element = focused; self.signature = signature; changed = true
        }
        state["serial"] = serial
        state["fields"] = fields
        if started >= latestStarted { latest = state; latestStarted = started }
        let due = rescan || (changed && Date().timeIntervalSince(scanned) > 0.75)
        if due && !scanning && pid == getpid() {
            // A process inspecting itself must stay on its own thread (WebKit requires it).
            changed = false; scanned = Date(); fields = scanTextFields(pid: pid, frame: frame); state["fields"] = fields
        } else if due && !scanning {
            scanning = true; changed = false
            scanner.async { [weak self] in
                let found = scanTextFields(pid: pid, frame: frame)
                guard let self else { return }
                self.lock.lock(); self.fields = found; self.scanned = Date(); self.scanning = false; self.lock.unlock()
            }
        }
        return state
    }

    /// The state once a tap has had a moment to move keyboard focus.
    func settled(pid: pid_t, frame: CGRect, after serial: Int) -> [String: Any] {
        var state = measure(pid: pid, frame: frame, rescan: true)
        for _ in 0..<7 where state["serial"] as? Int == serial {
            usleep(30_000)
            state = measure(pid: pid, frame: frame)
        }
        return state
    }

    var currentSerial: Int { lock.lock(); defer { lock.unlock() }; return serial }

    /// Electron and Chromium apps only build their accessibility tree when an
    /// assistive app asks; switch it on while the phone controls the window.
    private func exposeChromium(_ app: AXUIElement, pid: pid_t) {
        lock.lock(); let first = asked != pid; asked = pid; lock.unlock()
        guard first, pid != getpid(),
              AXUIElementSetAttributeValue(app, "AXManualAccessibility" as CFString, kCFBooleanTrue) == .success
        else { return }
        lock.lock(); chromium = pid; lock.unlock()
    }

    /// Hand the application back as it was.
    func stop() {
        lock.lock(); let pid = chromium; chromium = 0; lock.unlock()
        guard pid > 0, pid != getpid() else { return }
        AXUIElementSetAttributeValue(AXUIElementCreateApplication(pid), "AXManualAccessibility" as CFString, kCFBooleanFalse)
    }
}

/// Keyboard focus counts only inside the window the phone is looking at, not
/// in another window or panel of the same application.
private func belongs(_ element: AXUIElement, app: AXUIElement, frame: CGRect) -> Bool {
    var window: CFTypeRef?
    if AXUIElementCopyAttributeValue(element, kAXWindowAttribute as CFString, &window) == .success,
       let owner = axElement(window as AnyObject?) {
        return axFrame(owner).map { sameFrame($0, frame) } ?? false
    }
    var focused: CFTypeRef?
    AXUIElementCopyAttributeValue(app, kAXFocusedWindowAttribute as CFString, &focused)
    return axElement(focused as AnyObject?).flatMap(axFrame).map { sameFrame($0, frame) } ?? false
}
