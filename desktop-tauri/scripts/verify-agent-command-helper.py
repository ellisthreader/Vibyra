#!/usr/bin/env python3
"""Build the product XPC helper in a disposable app and prove its Mac boundary."""

import argparse
import base64
import json
import plistlib
import re
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


SOURCE = Path(__file__).resolve().parents[1] / "native/agent-command"


def run(*args, input=None, timeout=90):
    result = subprocess.run(args, input=input, capture_output=True, text=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError(f"{args[0]} failed: {result.stderr[-1_000:]}")
    return result.stdout


def plist(path, value):
    with path.open("wb") as output:
        plistlib.dump(value, output)


def build(root):
    app = root / "Vibyra Agent Command Probe.app"
    service = app / "Contents/XPCServices/AgentCommand.xpc"
    (app / "Contents/MacOS").mkdir(parents=True)
    (service / "Contents/MacOS").mkdir(parents=True)
    plist(app / "Contents/Info.plist", {
        "CFBundleIdentifier": "app.vibyra.desktop",
        "CFBundleExecutable": "AgentCommandClient",
        "CFBundlePackageType": "APPL",
    })
    plist(service / "Contents/Info.plist", {
        "CFBundleIdentifier": "app.vibyra.desktop.agent-command",
        "CFBundleExecutable": "AgentCommandService",
        "CFBundlePackageType": "XPC!",
        "XPCService": {"RunLoopType": "NSRunLoop"},
    })
    entitlements = root / "sandbox.plist"
    plist(entitlements, {"com.apple.security.app-sandbox": True})
    sources = [SOURCE / name for name in (
        "Protocol.swift", "Snapshot.swift", "CommandProcess.swift", "Service.swift")]
    run("swiftc", *sources, "-o", service / "Contents/MacOS/AgentCommandService")
    run("swiftc", SOURCE / "Protocol.swift", SOURCE / "Client.swift",
        "-o", app / "Contents/MacOS/AgentCommandClient")
    run("codesign", "--force", "--sign", "-", "--entitlements", entitlements, service)
    run("codesign", "--force", "--sign", "-", app)
    run("codesign", "--verify", "--deep", "--strict", app)
    return app / "Contents/MacOS/AgentCommandClient"


class LocalServer(BaseHTTPRequestHandler):
    def do_GET(self):
        self.server.hit = True
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"ok")

    def log_message(self, *_args):
        pass


def request(script, files=None, timeout=5, output=4096, identifier=None):
    return json.dumps({
        "id": identifier or str(uuid.uuid4()),
        "script": script,
        "files": {name: base64.b64encode(data).decode() for name, data in (files or {}).items()},
        "timeoutSeconds": timeout,
        "maxOutputBytes": output,
    })


def execute(client, body):
    return json.loads(run(client, input=body, timeout=40))


def verify(client, outside):
    server = ThreadingHTTPServer(("127.0.0.1", 0), LocalServer)
    server.hit = False
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    marker = outside.with_suffix(".write")
    script = "\n".join([
        'cat fixture.txt',
        f'if cat "{outside}" >/dev/null 2>&1; then echo outside-read=yes; else echo outside-read=no; fi',
        f'if touch "{marker}" 2>/dev/null; then echo outside-write=yes; else echo outside-write=no; fi',
        f'if /usr/bin/curl -sS --max-time 2 http://127.0.0.1:{server.server_port}/ >/dev/null 2>&1; then echo network=yes; else echo network=no; fi',
    ])
    try:
        result = execute(client, request(script, {"fixture.txt": b"approved fixture\n"}))
    finally:
        server.shutdown()
        server.server_close()
    assert result.get("exitCode") == 0 and result.get("stopped") is None, result
    for expected in ("approved fixture", "outside-read=no", "outside-write=no", "network=no"):
        assert expected in result["output"], result
    assert not marker.exists() and not server.hit

    bad = execute(client, request("echo unsafe", {"../escape": b"x"}))
    assert bad["error"] == "invalid snapshot", bad

    start = time.monotonic()
    timeout = execute(client, request("sleep 10 & wait", timeout=1))
    assert timeout["stopped"] == "deadline" and time.monotonic() - start < 4, timeout

    capped = execute(client, request("/usr/bin/yes output", output=128))
    assert capped["stopped"] == "output_limit", capped
    assert len(capped["output"].encode()) <= 128, capped

    identifier = str(uuid.uuid4())
    pending = subprocess.Popen([str(client)], stdin=subprocess.PIPE,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    pending.stdin.write(request("sleep 10 & wait", timeout=20, identifier=identifier) + "\n")
    pending.stdin.flush()
    time.sleep(0.4)
    pending.stdin.write("cancel\n")
    pending.stdin.flush()
    pending.stdin.close()
    response = pending.stdout.read()
    pending.wait(timeout=4)
    assert json.loads(response)["stopped"] == "cancelled", response


def main():
    if sys.platform != "darwin":
        raise SystemExit("This verification requires macOS")
    parser = argparse.ArgumentParser()
    parser.add_argument("--app", type=Path, help="Verify an already signed app bundle")
    args = parser.parse_args()
    cache = Path.home() / "Library/Caches"
    with tempfile.TemporaryDirectory(prefix="vibyra-command-") as build_root, \
         tempfile.TemporaryDirectory(prefix="vibyra-command-outside-", dir=cache) as private:
        app = args.app.resolve() if args.app else None
        client = app / "Contents/MacOS/AgentCommandClient" if app else build(Path(build_root))
        if app:
            run("codesign", "--verify", "--deep", "--strict", app)
            service = app / "Contents/XPCServices/AgentCommand.xpc"
            signed = subprocess.run(["codesign", "-d", "--entitlements", "-", "--xml", service],
                                    capture_output=True, check=True)
            assert plistlib.loads(signed.stdout)["com.apple.security.app-sandbox"] is True
            teams = []
            for item in (app, service, client):
                details = subprocess.run(["codesign", "-d", "--verbose=2", item],
                                         capture_output=True, text=True, check=True)
                teams.append(re.search(r"^TeamIdentifier=(.+)$", details.stderr, re.MULTILINE).group(1))
            assert len(set(teams)) == 1, f"App and helper signing teams differ: {teams}"
        outside = Path(private) / "private.txt"
        outside.write_text("outside fixture\n")
        verify(client, outside)
    print("Product Agent command helper passed signed XPC, limits and cancellation proof")


if __name__ == "__main__":
    main()
