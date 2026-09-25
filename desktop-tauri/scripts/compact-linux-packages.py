"""Losslessly repack signed Linux candidates; signing happens after verification."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile


def run(*args):
    # unsquashfs otherwise masks archived modes with the runner's umask.
    return subprocess.check_output(args, text=True, umask=0).strip()


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def inventory(root):
    result = {}
    for path in sorted(root.rglob("*")):
        mode = path.lstat().st_mode
        payload = os.readlink(path) if path.is_symlink() else digest(path) if path.is_file() else ""
        result[str(path.relative_to(root))] = [stat.S_IFMT(mode), stat.S_IMODE(mode), payload]
    return result


def compare(old, new, label):
    differences = {name: [old.get(name), new.get(name)] for name in old.keys() | new.keys()
                   if old.get(name) != new.get(name)}
    assert not differences, f"{label}: {differences}"


source, destination = map(Path, sys.argv[1:])
destination.mkdir(parents=True, exist_ok=True)
report = []
for extension in ("AppImage", "deb"):
    candidates = list(source.glob(f"*.{extension}"))
    assert len(candidates) == 1, candidates
    original = candidates[0].resolve()
    expected = Path(str(original) + ".sha256").read_text().split()[0]
    assert digest(original) == expected, "Original checksum mismatch"
    target = (destination / original.name).resolve()
    with tempfile.TemporaryDirectory() as directory:
        work = Path(directory)
        before, after = work / "before", work / "after"
        if extension == "AppImage":
            original.chmod(original.stat().st_mode | 0o111)
            offset = int(run(str(original), "--appimage-offset"))
            run("unsquashfs", "-o", str(offset), "-d", str(before), str(original))
            squashfs = work / "payload.squashfs"
            run("mksquashfs", str(before), str(squashfs), "-noappend", "-comp", "zstd",
                "-Xcompression-level", "22", "-b", "1M", "-processors", "2")
            with target.open("wb") as output, original.open("rb") as runtime:
                output.write(runtime.read(offset))
                with squashfs.open("rb") as payload:
                    shutil.copyfileobj(payload, output)
            target.chmod(0o755)
            assert int(run(str(target), "--appimage-offset")) == offset
            run("unsquashfs", "-o", str(offset), "-d", str(after), str(target))
            compare(inventory(before), inventory(after), "SquashFS payload changed")
            # Also compare both through the retained runtime's own decompressor.
            # Its extracted modes can differ from unsquashfs's modes.
            runtime_payloads = []
            for index, package in enumerate((original, target)):
                extraction = work / f"runtime-{index}"
                extraction.mkdir()
                subprocess.run([str(package), "--appimage-extract"], cwd=extraction,
                               check=True, stdout=subprocess.DEVNULL, umask=0)
                runtime_payloads.append(inventory(extraction / "squashfs-root"))
            compare(*runtime_payloads, "Runtime extraction changed")
        else:
            run("dpkg-deb", "--raw-extract", str(original), str(before))
            run("dpkg-deb", "--root-owner-group", "-Zxz", "-z9", "--build", str(before), str(target))
            run("dpkg-deb", "--raw-extract", str(target), str(after))
        compare(inventory(before), inventory(after), f"Payload changed in {original.name}")
    checksum = digest(target)
    Path(str(target) + ".sha256").write_text(f"{checksum}  {target.name}\n")
    shutil.copyfile(str(original) + ".frontend.json", str(target) + ".frontend.json")
    report.append({"filename": target.name, "originalSha256": expected, "sha256": checksum,
                   "originalSize": original.stat().st_size, "size": target.stat().st_size,
                   "payloadIdentical": True})
(destination / "compression-proof.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report, indent=2))
