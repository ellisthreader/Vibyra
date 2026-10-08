import AppKit
import Foundation
import ScreenCaptureKit
import Darwin

enum PreviewError: Error { case message(String) }
func fail(_ message: String) -> PreviewError { .message(message) }

func unlocked() -> Bool {
    guard let session = CGSessionCopyCurrentDictionary() as? [String: Any] else { return false }
    return session["CGSSessionScreenIsLocked"] as? Bool != true
        && session[kCGSessionOnConsoleKey as String] as? Bool == true
}

func windowInfo(_ id: UInt32) throws -> [String: Any] {
    guard unlocked() else { throw fail("Unlock your Mac to preview its windows.") }
    guard CGPreflightScreenCaptureAccess() else {
        throw fail("Allow Vibyra screen recording in Mac System Settings, then try again.")
    }
    guard let rows = CGWindowListCopyWindowInfo([.optionIncludingWindow], id) as? [[String: Any]],
          let row = rows.first,
          let pid = row[kCGWindowOwnerPID as String] as? Int32,
          row[kCGWindowLayer as String] as? Int == 0,
          let bounds = row[kCGWindowBounds as String] as? [String: Any],
          let rect = CGRect(dictionaryRepresentation: bounds as CFDictionary),
          rect.width >= 32, rect.height >= 32 else {
        throw fail("This application window closed or is unavailable. Select it again on your Mac.")
    }
    var process = proc_bsdinfo()
    guard proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, &process, Int32(MemoryLayout.size(ofValue: process))) == MemoryLayout.size(ofValue: process) else {
        throw fail("The window's process identity is unavailable.")
    }
    let name = NSRunningApplication(processIdentifier: pid)?.localizedName
        ?? row[kCGWindowOwnerName as String] as? String ?? "Application"
    return ["id": id, "pid": pid, "name": name,
            "title": row[kCGWindowName as String] as? String ?? "Untitled window",
            "fingerprint": "\(pid):\(process.pbi_start_tvsec):\(process.pbi_start_tvusec):\(id)",
            "x": Double(rect.minX), "y": Double(rect.minY), "width": Double(rect.width), "height": Double(rect.height)]
}

func inventory() throws -> [[String: Any]] {
    guard CGPreflightScreenCaptureAccess() else {
        throw fail("Allow Vibyra screen recording in Mac System Settings, then try again.")
    }
    guard unlocked() else { throw fail("Unlock your Mac to preview its windows.") }
    // Windows on another Space are still capturable by ScreenCaptureKit.
    let rows = CGWindowListCopyWindowInfo([.optionAll, .excludeDesktopElements], 0) as? [[String: Any]] ?? []
    return rows.prefix(256).compactMap { row in
        guard let id = row[kCGWindowNumber as String] as? UInt32 else { return nil }
        return try? windowInfo(id)
    }
}

func jsonBytes(_ value: Any) throws -> Data {
    try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
}

// Called on a Rust worker, never the AppKit main thread.
@available(macOS 12.3, *)
func shareableWindow(_ id: UInt32) throws -> SCWindow {
    let done = DispatchSemaphore(value: 0)
    var result: Result<SCWindow, Error> = .failure(fail("Window discovery timed out."))
    SCShareableContent.getExcludingDesktopWindows(true, onScreenWindowsOnly: false) { content, error in
        if let window = content?.windows.first(where: { $0.windowID == id }) {
            result = .success(window)
        } else { result = .failure(error ?? fail("Window is not available for capture.")) }
        done.signal()
    }
    guard done.wait(timeout: .now() + 8) == .success else { throw fail("Window discovery timed out.") }
    return try result.get()
}
