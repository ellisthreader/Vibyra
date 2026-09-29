import AppKit
import Foundation

private let sessionsLock = NSLock()
private var pending = 0
@available(macOS 12.3, *) private var sessions: [String: WindowCapture] = [:]

@available(macOS 12.3, *)
func dispatch(_ request: [String: Any]) throws -> Data {
    switch request["op"] as? String {
    case "available": return try jsonBytes(["available": true])
    case "permission":
        return try jsonBytes(["allowed": CGRequestScreenCaptureAccess()])
    case "list": return try jsonBytes(inventory())
    case "info": return try jsonBytes(windowInfo(request["id"] as? UInt32 ?? 0))
    case "start":
        sessionsLock.lock(); let full = sessions.count + pending >= 4
        if !full { pending += 1 }
        sessionsLock.unlock()
        guard !full else { throw fail("Close another window Preview before opening this one.") }
        defer { sessionsLock.lock(); pending -= 1; sessionsLock.unlock() }
        let id = request["id"] as? UInt32 ?? 0
        let fingerprint = request["fingerprint"] as? String ?? ""
        guard try windowInfo(id)["fingerprint"] as? String == fingerprint else {
            throw fail("Window identity changed.")
        }
        let capture = WindowCapture(id: id, fingerprint: fingerprint)
        try capture.start()
        let token = UUID().uuidString
        sessionsLock.lock(); sessions[token] = capture; sessionsLock.unlock()
        return try jsonBytes(["session": token])
    case "frame", "stop", "input", "focus":
        let token = request["session"] as? String ?? ""
        sessionsLock.lock()
        let capture = sessions[token]
        if request["op"] as? String == "stop" { sessions.removeValue(forKey: token) }
        sessionsLock.unlock()
        guard let capture = capture else { throw fail("Window Preview ended.") }
        if request["op"] as? String == "stop" { capture.stop(); return Data() }
        if request["op"] as? String == "input" {
            // A tap may move keyboard focus: note where it was, then wait briefly for it to move.
            let click = request["kind"] as? String == "click"
            let before = click ? focusState(capture, settleAfter: nil, now: true)["serial"] as? Int : nil
            try windowInput(capture, request)
            return try jsonBytes(["ok": true, "focus": focusState(capture, settleAfter: before)])
        }
        if request["op"] as? String == "focus" { return try jsonBytes(focusState(capture, settleAfter: nil)) }
        return try capture.frame()
    default: throw fail("Unsupported window Preview operation.")
    }
}

/// Keyboard focus in the shared window as the phone viewer reads it.
@available(macOS 12.3, *)
private func focusState(_ capture: WindowCapture, settleAfter serial: Int?, now: Bool = false) -> [String: Any] {
    guard let info = try? windowInfo(capture.id), info["fingerprint"] as? String == capture.fingerprint,
          let pid = info["pid"] as? Int32, let x = info["x"] as? Double, let y = info["y"] as? Double,
          let width = info["width"] as? Double, let height = info["height"] as? Double
    else { return ["v": 1, "editable": false, "access": true, "front": false, "serial": capture.focus.currentSerial, "fields": []] }
    let frame = CGRect(x: x, y: y, width: width, height: height)
    if let serial { return capture.focus.settled(pid: pid, frame: frame, after: serial) }
    return now ? capture.focus.measure(pid: pid, frame: frame) : capture.focus.current(pid: pid, frame: frame)
}

@_cdecl("vibyra_window_request")
public func windowRequest(_ bytes: UnsafePointer<UInt8>, _ count: Int,
                          _ length: UnsafeMutablePointer<Int>, _ status: UnsafeMutablePointer<Int32>) -> UnsafeMutablePointer<UInt8>? {
    var output: Data
    do {
        guard count <= 16384,
              let request = try JSONSerialization.jsonObject(with: Data(bytes: bytes, count: count)) as? [String: Any]
        else { throw fail("Invalid window Preview request.") }
        if #available(macOS 12.3, *) { output = try dispatch(request) }
        else { throw fail("Native window Preview requires macOS 12.3 or newer.") }
        status.pointee = 0
    } catch {
        let message: String
        if case PreviewError.message(let detail) = error { message = detail }
        else { message = error.localizedDescription }
        output = Data(message.utf8); status.pointee = 1
    }
    length.pointee = output.count
    let pointer = UnsafeMutablePointer<UInt8>.allocate(capacity: max(1, output.count))
    output.copyBytes(to: pointer, count: output.count)
    return pointer
}

@_cdecl("vibyra_window_free")
public func windowFree(_ bytes: UnsafeMutablePointer<UInt8>) { bytes.deallocate() }
