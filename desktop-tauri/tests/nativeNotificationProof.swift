import AppKit
import Foundation

// Isolated native delegate acceptance fixture. No Vibyra account, token or real task.
private let proofPath = "/private/tmp/vibyra-notification-proof.json"
private var callbacks: [[String: Any]] = []
private var status: NSTextField?
private var window: NSWindow?

private func received(_ raw: UnsafePointer<CChar>?) {
    guard let raw else { return }
    let value = String(cString: raw)
    let route = (try? JSONSerialization.jsonObject(with: Data(value.utf8))) as? [String: Any]
    DispatchQueue.main.async {
        let id = route?["runId"] as? String ?? "generic-open-app"
        callbacks.append(["runId": id, "at": ISO8601DateFormatter().string(from: Date())])
        let data = try? JSONSerialization.data(withJSONObject: ["callbacks": callbacks], options: [.prettyPrinted, .sortedKeys])
        try? data?.write(to: URL(fileURLWithPath: proofPath), options: .atomic)
        status?.stringValue = "Actual native callback: \(id)\nCallbacks: \(callbacks.count)"
        window?.makeKeyAndOrderFront(nil)
        NSApplication.shared.activate(ignoringOtherApps: true)
    }
}

private final class Delegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        notificationSetup(received)
        let view = NSView(frame: NSRect(x: 0, y: 0, width: 620, height: 260))
        window = NSWindow(contentRect: view.frame, styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
        window?.title = "Vibyra Notification Proof — isolated test"
        window?.contentView = view
        let title = NSTextField(labelWithString: "Tests the production macOS notification delegate.\nNo account data. Click a real system banner; ordinary focus must not add a callback.")
        title.frame = NSRect(x: 24, y: 175, width: 570, height: 60); view.addSubview(title)
        let send = NSButton(title: "Send two task test notifications", target: self, action: #selector(sendTasks))
        send.frame = NSRect(x: 24, y: 120, width: 280, height: 36); view.addSubview(send)
        let generic = NSButton(title: "Send generic test notification", target: self, action: #selector(sendGeneric))
        generic.frame = NSRect(x: 310, y: 120, width: 275, height: 36); view.addSubview(generic)
        status = NSTextField(labelWithString: "No native callback received.")
        status?.frame = NSRect(x: 24, y: 35, width: 570, height: 70); view.addSubview(status!)
        callbacks = []; try? Data("{\"callbacks\":[]}".utf8).write(to: URL(fileURLWithPath: proofPath), options: .atomic)
        window?.center(); window?.makeKeyAndOrderFront(nil); NSApplication.shared.activate(ignoringOtherApps: true)
    }

    @objc func sendTasks() { send([("Task Alpha", "11111111-1111-4111-8111-111111111111"), ("Task Beta", "22222222-2222-4222-8222-222222222222")]) }
    @objc func sendGeneric() { send([("Generic test", "")]) }
    private func send(_ tasks: [(String, String)]) {
        DispatchQueue.global().async {
            let permission = notificationPermission(true)
            guard permission == 1 else {
                DispatchQueue.main.async { status?.stringValue = "macOS notification permission: \(permission). No notifications sent." }; return
            }
            for (title, run) in tasks {
                let id = UUID().uuidString
                let object: [String: Any] = ["id": id, "owner": "fixture", "agentId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "runId": run, "issuedAt": Int(Date().timeIntervalSince1970)]
                let route = run.isEmpty ? "" : String(data: try! JSONSerialization.data(withJSONObject: object), encoding: .utf8)!
                let body = "Click this real banner to verify \(title)."
                let accepted = id.withCString { i in title.withCString { t in body.withCString { b in route.withCString { r in notificationShow(i, t, b, r) } } } }
                DispatchQueue.main.async { status?.stringValue = accepted ? "Submitted \(title). Waiting for actual banner click." : "macOS did not accept \(title)." }
            }
        }
    }
}

@main
struct NativeNotificationProof {
    static func main() {
        let app = NSApplication.shared
        let delegate = Delegate()
        app.setActivationPolicy(.regular); app.delegate = delegate
        withExtendedLifetime(delegate) { app.run() }
    }
}
