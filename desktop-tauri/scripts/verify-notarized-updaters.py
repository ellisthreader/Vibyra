#!/usr/bin/env python3
"""Validate final Apple-notarized bytes before the CI updater secret is exposed."""
import hashlib
import json
import os
import plistlib
import posixpath
import re
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path, PurePosixPath

TEAM = "6WXKN5P8K5"


def run(*args):
    result = subprocess.run(args, check=True, capture_output=True, text=True)
    return result.stdout + result.stderr


def validate_entries(manifest, directory, commit, version):
    if not re.fullmatch(r"[a-f0-9]{40}", commit) or manifest.get("sourceCommit") != commit:
        raise ValueError("Wrong source revision")
    if (manifest.get("version") != version or type(manifest.get("buildRunId")) is not int
            or manifest["buildRunId"] <= 0):
        raise ValueError("Wrong version or build provenance")
    entries = manifest.get("archives", [])
    if len(entries) != 2 or {e.get("architecture") for e in entries} != {"arm64", "x64"}:
        raise ValueError("Exactly two distinct architectures required")
    expected = set()
    for entry in entries:
        name = f"Vibyra-Desktop-{version}-macos-{entry['architecture']}.app.tar.gz"
        if entry.get("filename") != name or not re.fullmatch(r"[a-f0-9]{64}", entry.get("sha256", "")):
            raise ValueError("Invalid artifact name or digest")
        size = entry.get("sizeBytes")
        if type(size) is not int or not 0 < size <= 1024 ** 3:
            raise ValueError("Invalid artifact size")
        file = directory / name
        if file.is_symlink() or file.stat().st_size != size:
            raise ValueError("Artifact size mismatch")
        with file.open("rb") as stream:
            digest = hashlib.sha256()
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
        if digest.hexdigest() != entry["sha256"]:
            raise ValueError("Artifact digest mismatch")
        expected.add(name)
    if {p.name for p in directory.glob("*.app.tar.gz")} != expected:
        raise ValueError("Unexpected archive")
    return entries


def safe_members(archive):
    members = archive.getmembers()
    if len(members) > 10000 or sum(m.size for m in members) > 3 * 1024 ** 3:
        raise ValueError("Oversized archive")
    for member in members:
        path = PurePosixPath(member.name)
        if member.size < 0:
            raise ValueError("Invalid archive member size")
        if path.is_absolute() or ".." in path.parts or not path.parts or path.parts[0] != "Vibyra.app":
            raise ValueError("Archive path escapes app")
        if not (member.isfile() or member.isdir() or member.issym()):
            raise ValueError("Unsupported archive member")
        if member.issym():
            target = posixpath.normpath(posixpath.join(str(path.parent), member.linkname))
            if target != "Vibyra.app" and not target.startswith("Vibyra.app/"):
                raise ValueError("Archive link escapes app")
    return members


def verify_app(app, entry, version, build):
    with (app / "Contents/Info.plist").open("rb") as stream:
        info = plistlib.load(stream)
    if (info.get("CFBundleIdentifier"), info.get("CFBundleShortVersionString"), info.get("CFBundleVersion")) != (
            "app.vibyra.desktop", version, build):
        raise ValueError("Wrong app identity or version")
    run("codesign", "--verify", "--deep", "--strict", str(app))
    run("xcrun", "stapler", "validate", str(app))
    assessment = run("spctl", "--assess", "--type", "execute", "--verbose=2", str(app))
    if "Notarized Developer ID" not in assessment:
        raise ValueError("Notarized Gatekeeper acceptance required")
    objects = [app, app / "Contents/MacOS/Vibyra", app / "Contents/MacOS/AgentCommandClient",
               app / "Contents/XPCServices/AgentCommand.xpc"]
    for obj in objects:
        details = run("codesign", "--display", "--verbose=4", str(obj))
        if f"TeamIdentifier={TEAM}" not in details or "Authority=Developer ID Application:" not in details:
            raise ValueError("Wrong signing identity")
        if "(runtime)" not in details or "Timestamp=" not in details:
            raise ValueError("Runtime or secure timestamp missing")
    arch = "arm64" if entry["architecture"] == "arm64" else "x86_64"
    for obj in [app / "Contents/MacOS/Vibyra", app / "Contents/MacOS/AgentCommandClient",
                app / "Contents/XPCServices/AgentCommand.xpc/Contents/MacOS/AgentCommandService"]:
        if run("lipo", "-archs", str(obj)).strip() != arch:
            raise ValueError("Wrong executable architecture")


def verify_provenance(provenance, commit):
    if (provenance.get("headSha") != commit or provenance.get("status") != "completed"
            or provenance.get("conclusion") != "success"
            or provenance.get("workflowName") != "Rust desktop beta packages"):
        raise ValueError("Build gates have not passed for this exact source")
    jobs = {job["name"]: job for job in provenance.get("jobs", [])}
    for arch in ["arm64", "x64"]:
        job = jobs.get(f"macos / macOS-{arch} Rust package", {})
        steps = {s["name"]: s.get("conclusion") for s in job.get("steps", [])}
        required = ["Run release gates", "Verify native untrusted-frame IPC boundary",
                    "Verify encrypted embedded phone transport", "Build native package",
                    "Verify macOS code signature, microphone entitlement and launch"]
        if job.get("conclusion") != "success" or any(steps.get(step) != "success" for step in required):
            raise ValueError("Complete signed native build gates required for both architectures")


def main():
    directory = Path(sys.argv[1])
    manifest = json.loads((directory / "notarized-manifest.json").read_text())
    config = json.loads(Path("src-tauri/tauri.conf.json").read_text())
    mac = json.loads(Path("src-tauri/tauri.macos.conf.json").read_text())
    entries = validate_entries(manifest, directory, os.environ["GITHUB_SHA"], config["version"])
    provenance = json.loads(run("gh", "run", "view", str(manifest["buildRunId"]), "--repo",
                                os.environ["GITHUB_REPOSITORY"], "--json", "headSha,status,conclusion,jobs,workflowName"))
    verify_provenance(provenance, os.environ["GITHUB_SHA"])
    with tempfile.TemporaryDirectory(prefix="vibyra-notarized-ci-") as folder:
        for entry in entries:
            destination = Path(folder) / entry["architecture"]
            destination.mkdir()
            with tarfile.open(directory / entry["filename"], "r:gz") as archive:
                members = safe_members(archive)
                archive.extractall(destination, members=members, filter="data")
            verify_app(destination / "Vibyra.app", entry, config["version"], mac["bundle"]["macOS"]["bundleVersion"])
    print("Exact build provenance, both archives and Apple acceptance verified")


if __name__ == "__main__":
    main()
