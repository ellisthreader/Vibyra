"""Verify that the source gate rejects edits, additions, deletions and symlinks."""
import importlib.util
from pathlib import Path
import os
import shutil
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("glib_proof", HERE / "verify-glib-backport.py")
proof = importlib.util.module_from_spec(spec)
spec.loader.exec_module(proof)


class PinnedSourceTests(unittest.TestCase):
    def test_manifest_and_each_locked_resolution_are_required(self):
        with tempfile.TemporaryDirectory(prefix="vibyra-glib-resolution-") as temporary:
            owned = Path(temporary)
            paths = ["src-tauri/Cargo.toml", "src-tauri/Cargo.lock",
                     "scripts/glib-iterator-regression/Cargo.lock",
                     "scripts/fixtures/glib-upstream-Cargo.lock"]
            for name in paths:
                target = owned / name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(proof.ROOT / name, target)
            original_root = proof.ROOT
            proof.ROOT = owned
            try:
                proof.verify_resolution()
                manifest = owned / paths[0]
                original = manifest.read_text()
                manifest.write_text(original.replace(
                    'glib = { path = "vendor/glib-0.18.5" }',
                    'glib = { path = "vendor/unreviewed" }'))
                with self.assertRaises(ValueError):
                    proof.verify_resolution()
                manifest.write_text(original)
                for name in paths[1:]:
                    lock = owned / name
                    original = lock.read_text()
                    changed = original.replace('name = "glib"\n',
                        'name = "glib"\nsource = "registry+https://github.com/rust-lang/crates.io-index"\n')
                    lock.write_text(changed)
                    with self.assertRaises(ValueError):
                        proof.verify_resolution()
                    lock.write_text(original + '\n[[package]]\nname = "glib"\nversion = "0.18.5"\n')
                    with self.assertRaises(ValueError):
                        proof.verify_resolution()
                    lock.write_text(original)
                proof.verify_resolution()
            finally:
                proof.ROOT = original_root

    def test_exact_source_and_rejected_drift(self):
        with tempfile.TemporaryDirectory(prefix="vibyra-glib-proof-") as temporary:
            copied = Path(temporary) / "glib"
            shutil.copytree(proof.VENDOR, copied)
            proof.verify(copied)
            target = copied / "src/variant_iter.rs"
            original = target.read_bytes()
            for contents in [original + b"\n", original.replace(b"&mut p,", b"&p,")]:
                target.write_bytes(contents)
                with self.assertRaises(ValueError):
                    proof.verify(copied)
            target.write_bytes(original)
            extra = copied / "extra.rs"
            extra.write_text("// unreviewed source\n")
            with self.assertRaises(ValueError):
                proof.verify(copied)

            extra.unlink()
            target.unlink()
            with self.assertRaises(ValueError):
                proof.verify(copied)
            target.write_bytes(original)
            manifest = copied / "VIBYRA-PATCH.json"
            manifest.write_text("{}")
            with self.assertRaises(ValueError):
                proof.verify(copied)

    @unittest.skipIf(os.name == "nt", "POSIX FIFO fixture requires mkfifo")
    def test_special_file_is_rejected(self):
        with tempfile.TemporaryDirectory(prefix="vibyra-glib-fifo-") as temporary:
            copied = Path(temporary) / "glib"
            shutil.copytree(proof.VENDOR, copied)
            os.mkfifo(copied / "unexpected.fifo")
            with self.assertRaises(ValueError):
                proof.verify(copied)

    def test_symlink_is_rejected(self):
        with tempfile.TemporaryDirectory(prefix="vibyra-glib-symlink-") as temporary:
            copied = Path(temporary) / "glib"
            shutil.copytree(proof.VENDOR, copied)
            target = copied / "src/variant_iter.rs"
            target.unlink()
            target.symlink_to(proof.VENDOR / "src/variant_iter.rs")
            with self.assertRaises(ValueError):
                proof.verify(copied)
            target.unlink()
            directory = copied / "src"
            shutil.rmtree(directory)
            directory.symlink_to(proof.VENDOR / "src", target_is_directory=True)
            with self.assertRaises(ValueError):
                proof.verify(copied)

    def test_archive_checksum_is_required(self):
        with tempfile.TemporaryDirectory(prefix="vibyra-glib-archive-") as temporary:
            archive = Path(temporary) / "source.crate"
            archive.write_bytes(proof.ARCHIVE.read_bytes() + b"unreviewed")
            with self.assertRaises(ValueError):
                proof.verify(archive=archive)


if __name__ == "__main__":
    unittest.main()
