"""Run optimized real-GLib regressions on Linux without mutating pinned source."""
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("glib_proof", ROOT / "scripts/verify-glib-backport.py")
proof = importlib.util.module_from_spec(spec)
spec.loader.exec_module(proof)


def required_suite(command, environment, name, passed):
    receipts = ROOT / "validation"
    receipts.mkdir(exist_ok=True)
    result = subprocess.run(command, env=environment, capture_output=True, text=True)
    output = result.stdout + result.stderr
    print(output, end="", flush=True)
    (receipts / f"glib-{name}.log").write_text(output)
    result.check_returncode()
    if not re.search(rf"test result: ok\. {passed} passed; 0 failed; 0 ignored;", output):
        raise RuntimeError(f"Required optimized {name} test count was not observed")


def original_diagnostic(work, environment):
    original = work / "original-glib"
    shutil.copytree(proof.VENDOR, original)
    proof.verify(original)
    source = original / "src/variant_iter.rs"
    fixed = source.read_bytes()
    source.write_bytes(fixed.replace(b"let mut p: *mut libc::c_char", b"let p: *mut libc::c_char")
                      .replace(b"                &mut p,", b"                &p,"))
    shutil.copyfile(ROOT / "scripts/fixtures/glib-upstream-Cargo.lock", original / "Cargo.lock")
    # UB is optimizer-dependent: original code passing does not invalidate the
    # proven fix. A compile/setup error is never described as an observed crash.
    result = subprocess.run(["cargo", "test", "--manifest-path", str(original / "Cargo.toml"),
                             "--lib", "--release", "--locked", "variant_iter::tests::test_variant_str_iter"],
                            env=environment, capture_output=True, text=True)
    output = result.stdout + result.stderr
    outcome = ("passed" if result.returncode == 0 else
               "observed_sigsegv" if "signal: 11, SIGSEGV" in output else "failed_other")
    receipts = ROOT / "validation"
    receipts.mkdir(exist_ok=True)
    (receipts / "glib-original-diagnostic.log").write_text(output)
    (receipts / "glib-original-diagnostic.json").write_text(json.dumps(
        {"outcome": outcome, "returncode": result.returncode,
         "release_gate": False, "archive_sha256": proof.ARCHIVE_SHA}, indent=2) + "\n")
    print(f"Original GLib diagnostic only: {outcome}")


def main():
    if sys.platform != "linux":
        raise RuntimeError("Optimized GLib execution requires native Linux")
    proof.verify()
    proof.verify_resolution()
    with tempfile.TemporaryDirectory(prefix="vibyra-glib-regression-") as temporary:
        work = Path(temporary)
        copied = work / "glib"
        shutil.copytree(proof.VENDOR, copied)
        proof.verify(copied)
        # Cargo creates a lock beside the manifest. Only this disposable copy
        # receives it; the pinned vendor tree remains byte-for-byte immutable.
        shutil.copyfile(ROOT / "scripts/fixtures/glib-upstream-Cargo.lock", copied / "Cargo.lock")
        environment = dict(os.environ, CARGO_TARGET_DIR=str(work / "target"))
        required_suite(["cargo", "test", "--manifest-path", str(copied / "Cargo.toml"),
                        "--lib", "--release", "--locked", "variant_iter::tests::test_variant_str_iter"],
                       environment, "upstream-patched", 3)
        required_suite(["cargo", "test", "--manifest-path",
                        str(ROOT / "scripts/glib-iterator-regression/Cargo.toml"),
                        "--release", "--locked"], environment, "five-method-patched", 1)
        original_diagnostic(work, environment)
    proof.verify()


if __name__ == "__main__":
    main()
