#!/usr/bin/env python3
"""Compile the separately sandboxed macOS Agent command XPC bundle."""

import argparse
import base64
import os
import platform
import plistlib
import secrets
import shlex
import subprocess
import sys
import tempfile
from contextlib import contextmanager
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "native/agent-command"
DEFAULT_OUTPUT = ROOT / "src-tauri/target/agent-command-bundle"


def run(*args):
    subprocess.run(args, check=True)


def plist(path, data):
    with path.open("wb") as output:
        plistlib.dump(data, output)


@contextmanager
def signing_keychain(identity):
    if identity == "-" or identity in subprocess.check_output(
            ["security", "find-identity", "-v", "-p", "codesigning"], text=True):
        yield
        return
    certificate = os.environ.get("APPLE_CERTIFICATE")
    certificate_password = os.environ.get("APPLE_CERTIFICATE_PASSWORD")
    if not certificate or not certificate_password:
        raise RuntimeError("Agent helper signing identity is absent from the keychain")
    previous = shlex.split(subprocess.check_output(
        ["security", "list-keychains", "-d", "user"], text=True))
    with tempfile.TemporaryDirectory(prefix="vibyra-agent-signing-") as folder:
        root = Path(folder)
        keychain = root / "agent.keychain-db"
        package = root / "certificate.p12"
        package.write_bytes(base64.b64decode(certificate, validate=True))
        password = secrets.token_urlsafe(32)
        try:
            run("security", "create-keychain", "-p", password, keychain)
            run("security", "unlock-keychain", "-p", password, keychain)
            run("security", "import", package, "-k", keychain, "-P", certificate_password,
                "-T", "/usr/bin/codesign")
            run("security", "set-key-partition-list", "-S", "apple-tool:,apple:,codesign:",
                "-s", "-k", password, keychain)
            run("security", "list-keychains", "-d", "user", "-s", *previous, keychain)
            if identity not in subprocess.check_output(
                    ["security", "find-identity", "-v", "-p", "codesigning"], text=True):
                raise RuntimeError("Imported certificate does not match APPLE_SIGNING_IDENTITY")
            yield
        finally:
            run("security", "list-keychains", "-d", "user", "-s", *previous)
            subprocess.run(["security", "delete-keychain", keychain], check=False)


def build(output, identity):
    service = output / "AgentCommand.xpc"
    executable = service / "Contents/MacOS/AgentCommandService"
    sidecar = output / "AgentCommandClient"
    executable.parent.mkdir(parents=True, exist_ok=True)
    plist(service / "Contents/Info.plist", {
        "CFBundleIdentifier": "app.vibyra.desktop.agent-command",
        "CFBundleExecutable": "AgentCommandService",
        "CFBundlePackageType": "XPC!",
        "LSMinimumSystemVersion": "12.0",
        "XPCService": {"RunLoopType": "NSRunLoop"},
    })
    target = f"{platform.machine()}-apple-macosx12.0"
    run("swiftc", "-target", target, SOURCE / "Protocol.swift", SOURCE / "Snapshot.swift",
        SOURCE / "CommandProcess.swift", SOURCE / "Service.swift", "-o", executable)
    run("swiftc", "-target", target, SOURCE / "Protocol.swift", SOURCE / "Client.swift",
        "-o", sidecar)
    with signing_keychain(identity):
        run("codesign", "--force", "--sign", identity, "--entitlements",
            SOURCE / "Sandbox.entitlements", service)
        run("codesign", "--force", "--sign", identity, sidecar)
    run("codesign", "--verify", "--strict", service)
    run("codesign", "--verify", "--strict", sidecar)
    print(f"Built Agent command helper: {output}")


def main():
    if sys.platform != "darwin":
        raise SystemExit("Agent command helper requires macOS")
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--identity", default=os.environ.get("APPLE_SIGNING_IDENTITY", "-"))
    args = parser.parse_args()
    build(args.output.resolve(), args.identity)


if __name__ == "__main__":
    main()
