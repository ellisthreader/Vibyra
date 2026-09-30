import AppKit

enum PreviewError: Error { case message(String) }
func fail(_ message: String) -> PreviewError { .message(message) }

@main
struct InputAuthorityTests {
    static func main() throws {
        // Exercise actual Keys.swift expansion with an injected event sink;
        // no test event is posted to macOS or the user's applications.
        var valid = true
        var downs = 0
        var ups = 0
        var effectsAfterRevoke = 0
        let authority = InputAuthority(valid: { valid }, emit: { event in
            if event.type == .keyDown {
                if !valid { effectsAfterRevoke += 1 }
                downs += 1
                if downs == 3 { valid = false }
            } else if event.type == .keyUp { ups += 1 }
        })
        do {
            try send([.key("left", 200), .text("must never arrive")], authority: authority, focused: { true })
            fatalError("Revoked batch was accepted")
        } catch PreviewError.message { }
        precondition(downs == 3 && ups == 3 && effectsAfterRevoke == 0)
        do {
            try send([.text("denied")], authority: authority, focused: { true })
            fatalError("Revoked text was accepted")
        } catch PreviewError.message { }
        precondition(downs == 3 && ups == 3)

        // A revoke during Unicode expansion stops the next whole text piece.
        valid = true; downs = 0; ups = 0
        do {
            try send([.text(String(repeating: "a", count: 64))], authority: authority, focused: { true })
            fatalError("Revoked Unicode batch was accepted")
        } catch PreviewError.message { }
        precondition(downs == 3 && ups == 3 && effectsAfterRevoke == 0)

        // Every repeat rechecks target focus; cleanup still releases its down.
        var focused = true
        var focusDowns = 0
        var focusUps = 0
        let local = InputAuthority(valid: { true }, emit: { event in
            if event.type == .keyDown { focusDowns += 1; focused = false }
            else if event.type == .keyUp { focusUps += 1 }
        })
        do {
            try send([.key("tab", 200)], authority: local, focused: { focused })
            fatalError("Unfocused batch was accepted")
        } catch PreviewError.message { }
        precondition(focusDowns == 1 && focusUps == 1)

        let source = CGEventSource(stateID: .hidSystemState)
        let down = CGEvent(mouseEventSource: source, mouseType: .leftMouseDown,
                           mouseCursorPosition: .zero, mouseButton: .left)!
        let up = CGEvent(mouseEventSource: source, mouseType: .leftMouseUp,
                         mouseCursorPosition: .zero, mouseButton: .left)!
        var mouseValid = true
        var mouseEffects: [CGEventType] = []
        let mouse = InputAuthority(valid: { mouseValid }, emit: { event in
            mouseEffects.append(event.type)
            if event.type == .leftMouseDown { mouseValid = false }
        })
        try mouse.pair(down, up)
        do { try mouse.pair(down, up); fatalError("Revoked click was accepted") }
        catch PreviewError.message { }
        precondition(mouseEffects == [.leftMouseDown, .leftMouseUp])
        for kind in [CGEventType.mouseMoved, .scrollWheel] {
            let event = CGEvent(source: source)!
            event.type = kind
            do { try mouse.post(event); fatalError("Revoked pointer/scroll was accepted") }
            catch PreviewError.message { }
        }
        precondition(mouseEffects == [.leftMouseDown, .leftMouseUp])
        print("Swift input authority: repeat/text/focus/revoke/paired cleanup passed")
    }
}
