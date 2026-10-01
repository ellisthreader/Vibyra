"""Compare exported notarized content with independently downloaded CI bytes."""
import hashlib
import importlib.util
import os
import plistlib
import shutil
import stat
import subprocess
import tempfile
from pathlib import Path

MAGICS = {bytes.fromhex(value) for value in [
    "feedface", "cefaedfe", "feedfacf", "cffaedfe",
    "cafebabe", "bebafeca", "cafebabf", "bfbafeca"]}


def run(*args):
    return subprocess.run(args, check=True, capture_output=True).stdout


def digest(path):
    result = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(block)
    return result.hexdigest()


def inventory(app):
    files, codes = {}, set()
    for path in [app, *sorted(app.rglob("*"))]:
        name = path.relative_to(app).as_posix()
        if path.is_symlink():
            files[name] = ("link", os.readlink(path))
        elif path.is_file():
            files[name] = ("file", digest(path), stat.S_IMODE(path.stat().st_mode))
            with path.open("rb") as stream:
                if stream.read(4) in MAGICS:
                    codes.add(name)
        elif path == app or path.suffix in {".app", ".framework", ".xpc", ".appex"}:
            codes.add(name)
    return files, codes


def entitlements(path):
    raw = run("codesign", "--display", "--entitlements", ":-", str(path))
    return plistlib.loads(raw) if raw else {}


def unsigned_code(path, directory):
    signed = path.read_bytes()
    target = directory / "unsigned-code"
    shutil.copy2(path, target)
    run("codesign", "--remove-signature", str(target))
    stripped = target.read_bytes()
    target.unlink()
    return signed, stripped


def canonical_code(signed, stripped):
    if signed[:4] == bytes.fromhex("cffaedfe"):
        spec = importlib.util.spec_from_file_location("macho", Path(__file__).with_name("notarized-macho.py"))
        macho = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(macho)
        stripped = macho.canonical_unsigned(signed, stripped)
    return stripped


def same_unsigned_code(source, exported, directory):
    original, final = unsigned_code(source, directory), unsigned_code(exported, directory)
    # Exact equality needs no assumptions about linker allocation geometry.
    if original[1] == final[1]:
        return True
    return canonical_code(*original) == canonical_code(*final)


def compare_apps(original, notarized):
    before, original_codes = inventory(original)
    after, final_codes = inventory(notarized)
    if original_codes != final_codes:
        raise ValueError("Notarized code inventory differs from the exact CI artifact")
    allowed = {"Contents/CodeResources"}
    for name in original_codes:
        path = original / name
        if path.is_file():
            allowed.add(name)
        else:
            for suffix in ["Contents/_CodeSignature/CodeResources", "_CodeSignature/CodeResources"]:
                signature = path / suffix
                if signature.is_file():
                    allowed.add(signature.relative_to(original).as_posix())
    ticket = notarized / "Contents/CodeResources"
    if ticket.is_symlink() and os.readlink(ticket) != "_CodeSignature/CodeResources":
        raise ValueError("Unexpected notarization ticket symlink")
    differences = {name for name in set(before) | set(after) if before.get(name) != after.get(name)}
    if differences - allowed:
        raise ValueError("Notarized resources differ from the exact CI artifact")
    with tempfile.TemporaryDirectory(prefix="vibyra-unsigned-comparison-") as folder:
        for name in sorted(original_codes):
            source, exported = original / name, notarized / name
            if source.is_file() != exported.is_file():
                raise ValueError("Signed object type changed")
            if source.is_file() and stat.S_IMODE(source.stat().st_mode) != stat.S_IMODE(exported.stat().st_mode):
                raise ValueError("Notarized executable mode differs from the exact CI artifact")
            if entitlements(source) != entitlements(exported):
                raise ValueError("Notarized entitlements differ from the exact CI artifact")
            if source.is_file() and not same_unsigned_code(source, exported, Path(folder)):
                raise ValueError("Notarized executable differs from the exact CI artifact")


def verify_signature(archive, signature, config):
    verifier = Path(__file__).with_name("minisign-verify.mjs").resolve().as_uri()
    program = ('import fs from "node:fs"; const [a,s,c,m]=process.argv.slice(1); '
               'const v=await import(m); v.verifyUpdateSignature(fs.readFileSync(a),'
               'fs.readFileSync(s,"utf8"),JSON.parse(fs.readFileSync(c)).plugins.updater.pubkey);')
    run("node", "--input-type=module", "-e", program, str(archive), str(signature), str(config), verifier)


def compare_archive_modes(original, notarized):
    # Python's safe extraction filter normalizes permissions; compare the headers first.
    if (set(original) ^ set(notarized)) - {"Vibyra.app/Contents/CodeResources"}:
        raise ValueError("Notarized archive object types differ from the exact CI artifact")
    if any(original[name] != notarized[name] for name in set(original) & set(notarized)):
        raise ValueError("Notarized archive modes/types differ from the exact CI artifact")
