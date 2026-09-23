#!/usr/bin/env python3
"""Prove an ad-hoc signed macOS XPC child cannot escape a copied test folder."""

import plistlib
import shlex
import subprocess
import sys
import tempfile
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


PROTOCOL = """import Foundation
@objc protocol ProbeProtocol {
    func run(_ script: String, fixture: String, outside: String,
             withReply reply: @escaping (String) -> Void)
}
"""

SERVICE = PROTOCOL + """
final class Handler: NSObject, ProbeProtocol {
    func run(_ script: String, fixture: String, outside: String,
             withReply reply: @escaping (String) -> Void) {
        let directOutside = (try? Data(contentsOf: URL(fileURLWithPath: outside))) != nil
        let folder = FileManager.default.temporaryDirectory
            .appendingPathComponent("agent-sandbox-" + UUID().uuidString, isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            defer { try? FileManager.default.removeItem(at: folder) }
            try fixture.write(to: folder.appendingPathComponent("fixture.txt"),
                              atomically: true, encoding: .utf8)
            let test = folder.appendingPathComponent("test.sh")
            try script.write(to: test, atomically: true, encoding: .utf8)
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/bin/sh")
            process.arguments = [test.path]
            process.currentDirectoryURL = folder
            let stdout = Pipe()
            let stderr = Pipe()
            process.standardOutput = stdout
            process.standardError = stderr
            try process.run()
            process.waitUntilExit()
            let output = String(data: stdout.fileHandleForReading.readDataToEndOfFile(),
                                encoding: .utf8) ?? ""
            let error = String(data: stderr.fileHandleForReading.readDataToEndOfFile(),
                               encoding: .utf8) ?? ""
            reply("directOutside=\\(directOutside) status=\\(process.terminationStatus) " +
                  "output=\\(output) stderr=\\(error)")
        } catch { reply("error=\\(error)") }
    }
}
final class Delegate: NSObject, NSXPCListenerDelegate {
    let handler = Handler()
    func listener(_ listener: NSXPCListener,
                  shouldAcceptNewConnection connection: NSXPCConnection) -> Bool {
        connection.exportedInterface = NSXPCInterface(with: ProbeProtocol.self)
        connection.exportedObject = handler
        connection.resume()
        return true
    }
}
let delegate = Delegate()
let listener = NSXPCListener.service()
listener.delegate = delegate
listener.resume()
RunLoop.main.run()
"""

CLIENT = PROTOCOL + """
let connection = NSXPCConnection(serviceName: "SERVICE_ID")
connection.remoteObjectInterface = NSXPCInterface(with: ProbeProtocol.self)
connection.resume()
let semaphore = DispatchSemaphore(value: 0)
let proxy = connection.remoteObjectProxyWithErrorHandler { error in
    print("xpc-error=\\(error)")
    semaphore.signal()
} as! ProbeProtocol
proxy.run(CommandLine.arguments[1], fixture: CommandLine.arguments[2],
          outside: CommandLine.arguments[3]) { result in
    print(result)
    semaphore.signal()
}
if semaphore.wait(timeout: .now() + 12) == .timedOut { print("xpc-timeout") }
connection.invalidate()
"""


def command(*args):
    result = subprocess.run(args, capture_output=True, text=True, timeout=90)
    if result.returncode:
        raise RuntimeError(f"{args[0]} failed: {result.stderr[-900:]}")
    return result.stdout


def plist(path, content):
    with path.open("wb") as output:
        plistlib.dump(content, output)


class LocalServer(BaseHTTPRequestHandler):
    def do_GET(self):
        self.server.hit = True
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"ok")

    def log_message(self, *_args):
        pass


def verify(bundle, outside):
    server = ThreadingHTTPServer(("127.0.0.1", 0), LocalServer)
    server.hit = False
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    marker = outside.with_suffix(".write")
    script = "\n".join([
        'if [ "$(cat fixture.txt)" = "approved fixture" ]; then echo inside=yes; fi',
        f"if cat {shlex.quote(str(outside))} >/dev/null 2>&1; then echo outside-read=yes; else echo outside-read=no; fi",
        f"if touch {shlex.quote(str(marker))} 2>/dev/null; then echo outside-write=yes; else echo outside-write=no; fi",
        f"if /usr/bin/curl -sS --max-time 2 http://127.0.0.1:{server.server_port}/ >/dev/null 2>&1; then echo network=yes; else echo network=no; fi",
    ])
    try:
        output = command(bundle / "Contents/MacOS/ProbeSidecar", script,
                         "approved fixture\n", str(outside))
    finally:
        server.shutdown()
        server.server_close()
    for expected in ("directOutside=false", "status=0", "inside=yes",
                     "outside-read=no", "outside-write=no", "network=no"):
        if expected not in output:
            raise AssertionError(f"Missing {expected}: {output}")
    if marker.exists() or server.hit:
        raise AssertionError("The sandboxed test escaped its filesystem or network boundary")


def main():
    if sys.platform != "darwin":
        raise SystemExit("This verification requires macOS")
    with tempfile.TemporaryDirectory(prefix="vibyra-agent-xpc-") as temporary, \
         tempfile.TemporaryDirectory(prefix="vibyra-agent-outside-", dir=Path.home() / "Library/Caches") as private:
        root = Path(temporary)
        bundle = root / "Probe.app"
        service = bundle / "Contents/XPCServices/ProbeService.xpc"
        (bundle / "Contents/MacOS").mkdir(parents=True)
        (service / "Contents/MacOS").mkdir(parents=True)
        identity = f"app.vibyra.agentprobe.{uuid.uuid4().hex}"
        service_id = identity + ".service"
        source = root / "Service.swift"
        source.write_text(SERVICE)
        client = root / "Client.swift"
        client.write_text(CLIENT.replace("SERVICE_ID", service_id))
        plist(bundle / "Contents/Info.plist", {"CFBundleIdentifier": identity,
              "CFBundleExecutable": "ProbeClient", "CFBundlePackageType": "APPL"})
        plist(service / "Contents/Info.plist", {"CFBundleIdentifier": service_id,
              "CFBundleExecutable": "ProbeService", "CFBundlePackageType": "XPC!",
              "XPCService": {"RunLoopType": "NSRunLoop"}})
        entitlements = root / "Service.entitlements"
        plist(entitlements, {"com.apple.security.app-sandbox": True})
        command("swiftc", source, "-o", service / "Contents/MacOS/ProbeService")
        command("swiftc", client, "-o", bundle / "Contents/MacOS/ProbeClient")
        command("swiftc", client, "-o", bundle / "Contents/MacOS/ProbeSidecar")
        command("codesign", "--force", "--sign", "-", "--entitlements", entitlements, service)
        command("codesign", "--force", "--sign", "-", bundle / "Contents/MacOS/ProbeSidecar")
        command("codesign", "--force", "--sign", "-", bundle)
        command("codesign", "--verify", "--deep", "--strict", bundle)
        outside = Path(private) / "private.txt"
        outside.write_text("outside fixture\n")
        verify(bundle, outside)
    print("Agent command sandbox proof passed: copied file readable; outside files and localhost denied")


if __name__ == "__main__":
    main()
