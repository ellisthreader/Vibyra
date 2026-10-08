"""Reject relabeled old binaries, wrong artifacts and unsafe archive extraction."""
import copy
import importlib.util
import io
import json
import os
import plistlib
import shutil
import struct
import subprocess
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch
import zipfile
from pathlib import Path


def load(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


gate, originals, identity = [load(name) for name in
                             ["verify-notarized-updaters", "notarized-originals", "notarized-identity"]]


class Sources(unittest.TestCase):
    def test_only_one_exact_private_draft_can_be_selected(self):
        source = "a" * 40
        draft = {"tag_name": "remote-notarized-" + source, "draft": True}
        with patch.object(originals, "api", return_value=[{"tag_name": "other"}, draft]):
            self.assertEqual(originals.draft_release("owner/repo", source), draft)
        for response in [[], [draft, draft], [{**draft, "draft": False}],
                         [{**draft, "tag_name": "remote-notarized-" + "b" * 40}]]:
            with patch.object(originals, "api", return_value=response), self.assertRaises(ValueError):
                originals.draft_release("owner/repo", source)

    def test_release_manifest_cannot_override_exact_source_tag_and_target(self):
        source = "a" * 40
        valid = {"tag_name": "remote-notarized-" + source, "draft": True,
                 "target_commitish": source, "assets": [{"name": "manifest"}]}
        gate.verify_release(valid, source, {"manifest"})
        for key, value in [("tag_name", "remote-notarized-" + "b" * 40),
                           ("draft", False), ("target_commitish", "main")]:
            wrong = {**valid, key: value}
            with self.assertRaises(ValueError):
                gate.verify_release(wrong, source, {"manifest"})

    def test_wrong_run_fork_failed_run_or_wrong_workflow_is_rejected(self):
        source, repo = "a" * 40, "owner/Vibyra"
        run = {"id": 4, "head_sha": source, "head_repository": {"full_name": repo},
               "status": "completed", "conclusion": "success",
               "path": ".github/workflows/desktop-release.yml"}
        originals.validate_run(run, repo, source, 4)
        for key, value in [("id", 5), ("head_sha", "b" * 40),
                           ("head_repository", {"full_name": "fork/Vibyra"}),
                           ("conclusion", "failure"), ("path", "unreviewed.yml")]:
            with self.assertRaises(ValueError):
                originals.validate_run({**run, key: value}, repo, source, 4)

    def test_expired_duplicate_or_relabeled_artifact_is_rejected(self):
        source = "a" * 40
        artifact = {"id": 8, "name": f"vibyra-rust-beta-macOS-arm64-{source}",
                    "expired": False, "size_in_bytes": 12, "digest": "sha256:" + "b" * 64,
                    "workflow_run": {"id": 4, "head_sha": source}}
        response = {"total_count": 1, "artifacts": [artifact]}
        originals.select_artifact(response, source, 4, "arm64")
        for changes in [{"expired": True}, {"workflow_run": {"id": 3, "head_sha": source}},
                        {"workflow_run": {"id": 4, "head_sha": "c" * 40}}, {"digest": ""}]:
            with self.assertRaises(ValueError):
                originals.select_artifact({**response, "artifacts": [{**artifact, **changes}]}, source, 4, "arm64")
        with self.assertRaises(ValueError):
            originals.select_artifact({"total_count": 2, "artifacts": [artifact, artifact]}, source, 4, "arm64")

    def test_archive_cannot_write_through_symlink_or_repeat_member(self):
        for items in [[("Vibyra.app/link", "Contents"), ("Vibyra.app/link/escape", None)],
                      [("Vibyra.app/file", None), ("Vibyra.app/file", None)],
                      [("Vibyra.app//file", None)]]:
            data = io.BytesIO()
            with tarfile.open(fileobj=data, mode="w") as archive:
                for name, link in items:
                    member = tarfile.TarInfo(name)
                    if link:
                        member.type, member.linkname = tarfile.SYMTYPE, link
                    archive.addfile(member)
            data.seek(0)
            with tarfile.open(fileobj=data) as archive, self.assertRaises(ValueError):
                gate.safe_members(archive)

    def test_special_permission_bits_and_filter_normalization_cannot_hide_mode_changes(self):
        original = {"Vibyra.app/file": (0o644, tarfile.REGTYPE)}
        for changed in [0o444, 0o4755, 0o6755]:
            with self.assertRaisesRegex(ValueError, "modes/types"):
                identity.compare_archive_modes(original, {"Vibyra.app/file": (changed, tarfile.REGTYPE)})
        data = io.BytesIO()
        with tarfile.open(fileobj=data, mode="w") as archive:
            member = tarfile.TarInfo("Vibyra.app/file")
            member.mode = 0o4755
            archive.addfile(member)
        data.seek(0)
        with tarfile.open(fileobj=data) as archive, self.assertRaisesRegex(ValueError, "permission bits"):
            gate.safe_members(archive)

    def test_original_zip_cannot_escape_or_include_symlinks(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            stem = "Vibyra-Desktop-0.8.16-macos-arm64.app.tar.gz"
            for malicious in ["../escape", stem]:
                package = root / "artifact.zip"
                with zipfile.ZipFile(package, "w") as archive:
                    for name in [stem, stem + ".sig", stem + ".sha256", stem + ".frontend.json"]:
                        member = zipfile.ZipInfo(malicious if name == stem else name)
                        if malicious == stem and name == stem:
                            member.external_attr = (0o120777 << 16)
                        archive.writestr(member, b"fixture")
                with self.assertRaises(ValueError):
                    originals.extract_zip(package, root, stem)


@unittest.skipUnless(sys.platform == "darwin", "Real Mach-O/codesign regression requires macOS")
class RealApps(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def app(self, name, binary="/bin/echo", entitlement=None):
        app = self.root / name / "Vibyra.app"
        (app / "Contents/MacOS").mkdir(parents=True)
        (app / "Contents/Resources").mkdir()
        info = {"CFBundleIdentifier": "app.vibyra.desktop", "CFBundleExecutable": "Vibyra",
                "CFBundleShortVersionString": "0.8.16", "CFBundleVersion": "29"}
        (app / "Contents/Info.plist").write_bytes(plistlib.dumps(info))
        shutil.copyfile(binary, app / "Contents/MacOS/Vibyra")
        os.chmod(app / "Contents/MacOS/Vibyra", 0o755)
        (app / "Contents/Resources/page.html").write_text("approved resource")
        args = ["codesign", "--force", "--deep", "--sign", "-", "--timestamp=none"]
        if entitlement:
            file = app.parent / "entitlements.plist"
            file.write_bytes(plistlib.dumps(entitlement))
            args += ["--entitlements", str(file)]
        subprocess.run([*args, str(app)], check=True, capture_output=True)
        return app

    def test_same_version_build_old_code_cannot_be_relabeled_as_current_source(self):
        current, old = self.app("current"), self.app("old", "/bin/ls")
        with self.assertRaisesRegex(ValueError, "executable differs"):
            identity.compare_apps(current, old)

    def test_signature_representation_changes_preserve_identical_code(self):
        original, final = self.app("original"), self.app("final")
        subprocess.run(["codesign", "--force", "--deep", "--sign", "-", "--options", "runtime",
                        "--timestamp=none", str(final)], check=True, capture_output=True)
        identity.compare_apps(original, final)

    def test_malformed_signature_extent_fails_mandatory_apple_admission(self):
        binary = self.root / "intel-echo"
        subprocess.run(["lipo", "/bin/echo", "-thin", "x86_64", "-output", str(binary)],
                       check=True, capture_output=True)
        app = self.app("malformed", str(binary))
        executable = app / "Contents/MacOS/Vibyra"
        data = bytearray(executable.read_bytes())
        offset, found = 32, False
        for _ in range(struct.unpack_from("<I", data, 16)[0]):
            command, size = struct.unpack_from("<II", data, offset)
            if command == 0x1D:
                struct.pack_into("<I", data, offset + 12, 1)
                found = True
                break
            offset += size
        self.assertTrue(found)
        executable.write_bytes(data)
        with self.assertRaises(subprocess.CalledProcessError):
            gate.verify_app(app, {"architecture": "x64"}, "0.8.16", "29", notarized=False)

    def test_changed_resources_entitlements_or_executable_modes_are_rejected(self):
        original, resource = self.app("original"), self.app("resource")
        (resource / "Contents/Resources/page.html").write_text("unreviewed remote code")
        with self.assertRaisesRegex(ValueError, "resources differ"):
            identity.compare_apps(original, resource)
        entitlements = self.app("entitlements", entitlement={"com.apple.security.get-task-allow": True})
        with self.assertRaisesRegex(ValueError, "entitlements differ"):
            identity.compare_apps(original, entitlements)
        mode = self.app("mode")
        os.chmod(mode / "Contents/MacOS/Vibyra", 0o700)
        with self.assertRaisesRegex(ValueError, "mode differs"):
            identity.compare_apps(original, mode)


if __name__ == "__main__":
    unittest.main()
