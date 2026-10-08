import AppKit

/// The keys the phone may press. Each is a layout-independent key code, never
/// a letter shortcut: on another keyboard layout a letter key code can be a
/// different letter, and Command with the wrong letter could quit or close
/// the application.
private let arrows: CGEventFlags = [.maskSecondaryFn, .maskNumericPad]
private let namedKeys: [String: (CGKeyCode, CGEventFlags)] = [
    "enter": (36, []), "tab": (48, []), "shiftTab": (48, .maskShift), "escape": (53, []),
    "backspace": (51, []), "delete": (117, .maskSecondaryFn), "left": (123, arrows), "right": (124, arrows),
    "down": (125, arrows), "up": (126, arrows), "pageUp": (116, .maskSecondaryFn), "pageDown": (121, .maskSecondaryFn),
]

enum KeyAction {
    case text(String)
    case key(String, Int)
}

/// Parses every action before any is sent, so a bad batch sends nothing.
func keyActions(_ request: [String: Any]) throws -> [KeyAction] {
    let kind = request["kind"] as? String
    let raw: [[String: Any]]
    switch kind {
    case "text": raw = [["text": request["text"] ?? ""]]
    case "key": raw = [["key": request["key"] ?? ""]]
    default: raw = request["actions"] as? [[String: Any]] ?? []
    }
    guard (1...64).contains(raw.count) else { throw fail("Send between 1 and 64 key actions at once.") }
    var units = 0
    return try raw.map { action in
        if let text = action["text"] as? String {
            units += text.utf16.count
            guard !text.isEmpty, units <= 512 else { throw fail("Enter at most 512 characters at once.") }
            return .text(text)
        }
        guard let name = action["key"] as? String, namedKeys[name] != nil else { throw fail("Unsupported key.") }
        let times = action["repeat"] as? Int ?? 1
        guard (1...200).contains(times) else { throw fail("Unsupported key repeat.") }
        return .key(name, times)
    }
}

/// Sends the actions in order, confirming before each one that the shared
/// window still has keyboard focus: keys never land in another application.
func send(_ actions: [KeyAction], authority: InputAuthority, focused: () -> Bool) throws {
    for action in actions {
        try authority.require()
        guard focused() else { throw fail("The shared window lost keyboard focus on your Mac. Tap into it, then type again.") }
        switch action {
        case .text(let text): try type(text, authority: authority, focused: focused)
        case .key(let name, let times): for _ in 0..<times { try authority.require(); guard focused() else { throw fail("The shared window lost keyboard focus on your Mac.") }
            try press(name, authority: authority) }
        }
    }
}

/// One character per event where that is short (some text fields read only
/// the first character of an event), otherwise runs of whole characters.
private func type(_ text: String, authority: InputAuthority, focused: () -> Bool) throws {
    // An empty piece stands for a line break, which is pressed as Return.
    var pieces: [[UniChar]] = []
    var run: [UniChar] = []
    for character in text {
        let units = Array(String(character).utf16)
        if character.isNewline || text.count <= 64 || run.count + units.count > 16 {
            if !run.isEmpty { pieces.append(run); run = [] }
        }
        if character.isNewline { pieces.append([]) } else if text.count <= 64 { pieces.append(units) } else { run += units }
    }
    if !run.isEmpty { pieces.append(run) }
    let source = CGEventSource(stateID: .hidSystemState)
    for piece in pieces {
        try authority.require()
        guard focused() else { throw fail("The shared window lost keyboard focus on your Mac.") }
        if piece.isEmpty { try press("enter", authority: authority); continue }
        let down = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: true)
        let up = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: false)
        piece.withUnsafeBufferPointer { buffer in
            down?.keyboardSetUnicodeString(stringLength: piece.count, unicodeString: buffer.baseAddress!)
            up?.keyboardSetUnicodeString(stringLength: piece.count, unicodeString: buffer.baseAddress!)
        }
        // Held modifiers on the Mac must not turn typing into shortcuts.
        down?.flags = []
        up?.flags = []
        guard let down, let up else { throw fail("macOS refused to create the input event.") }
        try authority.pair(down, up)
        usleep(piece.count > 2 ? 6_000 : 2_000)
    }
}

private func press(_ name: String, authority: InputAuthority) throws {
    guard let (key, flags) = namedKeys[name] else { throw fail("Unsupported key.") }
    let source = CGEventSource(stateID: .hidSystemState)
    let down = CGEvent(keyboardEventSource: source, virtualKey: key, keyDown: true)
    let up = CGEvent(keyboardEventSource: source, virtualKey: key, keyDown: false)
    down?.flags = flags
    up?.flags = flags
    guard let down, let up else { throw fail("macOS refused to create the input event.") }
    try authority.pair(down, up)
    usleep(2_000)
}
