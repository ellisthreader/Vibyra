#!/usr/bin/env python3
"""Provenance/tampering/traversal regressions for signing-only release admission."""
import copy
import hashlib
import importlib.util
import io
import tarfile
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("gate", Path(__file__).with_name("verify-notarized-updaters.py"))
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)


class Admission(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.manifest = {"sourceCommit": "a" * 40, "version": "0.8.16", "buildRunId": 123,
                         "archives": []}
        for arch in ["arm64", "x64"]:
            name = f"Vibyra-Desktop-0.8.16-macos-{arch}.app.tar.gz"
            data = arch.encode()
            (self.root / name).write_bytes(data)
            self.manifest["archives"].append({"architecture": arch, "filename": name,
                "sizeBytes": len(data), "sha256": hashlib.sha256(data).hexdigest()})

    def validate(self, manifest=None):
        return gate.validate_entries(manifest or self.manifest, self.root, "a" * 40, "0.8.16")

    def test_exact_two_archives_accepted(self):
        self.assertEqual(len(self.validate()), 2)

    def test_modified_archive_rejected(self):
        file = self.root / self.manifest["archives"][0]["filename"]
        file.write_bytes(b"xxxxx")
        with self.assertRaisesRegex(ValueError, "digest"):
            self.validate()

    def test_wrong_source_and_version_rejected(self):
        for key, value in [("sourceCommit", "b" * 40), ("version", "0.8.15"), ("buildRunId", 0)]:
            changed = copy.deepcopy(self.manifest)
            changed[key] = value
            with self.assertRaises(ValueError):
                self.validate(changed)

    def test_duplicate_architecture_rejected(self):
        changed = copy.deepcopy(self.manifest)
        changed["archives"][1] = changed["archives"][0]
        with self.assertRaises(ValueError):
            self.validate(changed)

    def test_unexpected_archive_rejected(self):
        (self.root / "unreviewed.app.tar.gz").write_bytes(b"x")
        with self.assertRaisesRegex(ValueError, "Unexpected"):
            self.validate()

    def test_symlink_source_rejected(self):
        file = self.root / self.manifest["archives"][0]["filename"]
        moved = file.with_suffix(".data")
        file.rename(moved)
        file.symlink_to(moved)
        with self.assertRaises(ValueError):
            self.validate()

    def test_archive_traversal_links_and_special_files_rejected(self):
        for name, kind, link in [("../escape", tarfile.REGTYPE, ""),
                ("Vibyra.app/link", tarfile.SYMTYPE, "../../escape"),
                ("Vibyra.app/socket", tarfile.FIFOTYPE, "")]:
            data = io.BytesIO()
            with tarfile.open(fileobj=data, mode="w") as archive:
                member = tarfile.TarInfo(name)
                member.type, member.linkname = kind, link
                archive.addfile(member)
            data.seek(0)
            with tarfile.open(fileobj=data) as archive, self.assertRaises(ValueError):
                gate.safe_members(archive)

    def test_internal_bundle_link_accepted(self):
        data = io.BytesIO()
        with tarfile.open(fileobj=data, mode="w") as archive:
            member = tarfile.TarInfo("Vibyra.app/Contents/link")
            member.type, member.linkname = tarfile.SYMTYPE, "MacOS/Vibyra"
            archive.addfile(member)
        data.seek(0)
        with tarfile.open(fileobj=data) as archive:
            self.assertEqual(len(gate.safe_members(archive)), 1)


if __name__ == "__main__":
    unittest.main()
