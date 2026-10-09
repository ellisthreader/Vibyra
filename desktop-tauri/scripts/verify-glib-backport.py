"""Fail closed on every byte of the locally backported GLib crate."""
import hashlib
import io
import json
from pathlib import Path
import re
import tarfile

ROOT = Path(__file__).resolve().parents[1]
VENDOR = ROOT / "src-tauri/vendor/glib-0.18.5"
ARCHIVE = ROOT / "scripts/fixtures/glib-0.18.5.crate"
ARCHIVE_SHA = "233daaf6e83ae6a12a52055f568f9d7cf4671dabb78ff9560ab6da230ce00ee5"
COMMIT = "b5a4071e439bef2b5eea76c3aa25e5ae84839e34"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def verify(vendor=VENDOR, archive=ARCHIVE):
    if archive.is_symlink() or vendor.is_symlink():
        raise ValueError("GLib provenance paths must not be symlinks")
    data = archive.read_bytes()
    if digest(data) != ARCHIVE_SHA:
        raise ValueError("GLib registry archive checksum mismatch")
    expected = {}
    manifest = {}
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as source:
        for entry in source.getmembers():
            if not entry.isfile() or not entry.name.startswith("glib-0.18.5/"):
                raise ValueError("Unexpected GLib archive member")
            name = entry.name.removeprefix("glib-0.18.5/")
            if not name or ".." in Path(name).parts or name in expected:
                raise ValueError("Unsafe or duplicate GLib archive path")
            original = source.extractfile(entry).read()
            patched = original
            if name == "src/variant_iter.rs":
                old = b"let p: *mut libc::c_char = std::ptr::null_mut();"
                pointer = b"                &p,"
                if original.count(old) != 1 or original.count(pointer) != 1:
                    raise ValueError("Upstream GLib patch context changed")
                patched = original.replace(old, old.replace(b"let p", b"let mut p"))
                patched = patched.replace(pointer, b"                &mut p,")
            expected[name] = patched
            manifest[name] = {"upstream_sha256": digest(original),
                              "patched_sha256": digest(patched)}
    metadata = {
        "crate": "glib", "version": "0.18.5",
        "upstream_archive": "https://static.crates.io/crates/glib/glib-0.18.5.crate",
        "archive_sha256": ARCHIVE_SHA, "upstream_commit": COMMIT,
        "upstream_patch": "https://github.com/gtk-rs/gtk-rs-core/pull/1343.patch",
        "advisory": "RUSTSEC-2024-0429",
        "status": "locally backported; not an officially fixed published version",
        "files": manifest,
    }
    expected["VIBYRA-PATCH.json"] = (
        json.dumps(metadata, indent=2, sort_keys=True) + "\n").encode()
    actual = {}
    directories = {str(Path(name).parent).replace("\\", "/") for name in expected}
    directories |= {str(parent).replace("\\", "/") for name in expected
                    for parent in Path(name).parents}
    for path in vendor.rglob("*"):
        if path.is_symlink():
            raise ValueError("Symlinks are forbidden in pinned GLib source")
        if path.is_file():
            actual[path.relative_to(vendor).as_posix()] = path.read_bytes()
        elif not path.is_dir() or path.relative_to(vendor).as_posix() not in directories:
            raise ValueError("Unexpected entry in pinned GLib tree")
    if actual.keys() != expected.keys():
        raise ValueError("Pinned GLib file set changed")
    for name, contents in expected.items():
        if actual[name] != contents:
            raise ValueError(f"Pinned GLib source drift: {name}")
    print(f"GLib 0.18.5: verified {len(manifest)} upstream files; only PR1343 backported")


def verify_resolution():
    manifest = (ROOT / "src-tauri/Cargo.toml").read_text()
    patch = re.findall(r"(?ms)^\[patch\.crates-io\]\n([^\[]*)", manifest)
    if len(patch) != 1 or not re.search(
            r'(?m)^glib\s*=\s*\{\s*path\s*=\s*"vendor/glib-0\.18\.5"\s*\}\s*$', patch[0]):
        raise ValueError("GLib Cargo patch no longer selects the verified source")
    workspace = re.findall(r"(?ms)^\[workspace\]\n(.*?)(?=^\[|\Z)", manifest)
    if len(workspace) != 1 or not re.search(
            r'(?m)^exclude\s*=\s*\["vendor/glib-0\.18\.5"\]\s*$', workspace[0]):
        raise ValueError("Pinned GLib must remain outside the application workspace")
    for lock in [ROOT / "src-tauri/Cargo.lock",
                 ROOT / "scripts/glib-iterator-regression/Cargo.lock",
                 ROOT / "scripts/fixtures/glib-upstream-Cargo.lock"]:
        packages = re.findall(r"(?ms)^\[\[package\]\]\n(.*?)(?=^\[\[package\]\]|\Z)", lock.read_text())
        glib = [package for package in packages if re.search(r'(?m)^name = "glib"$', package)]
        if (len(glib) != 1 or not re.search(r'(?m)^version = "0\.18\.5"$', glib[0])
                or re.search(r"(?m)^(source|checksum)\s*=", glib[0])):
            raise ValueError(f"Unverified or duplicate GLib resolution: {lock}")


if __name__ == "__main__":
    verify()
    verify_resolution()
