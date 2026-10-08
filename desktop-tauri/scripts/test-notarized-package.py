"""Canonical headers survive packaging; no type/mode/link/inventory widening."""
import importlib.util
import io
import os
import tarfile
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('pack', Path(__file__).with_name('package-notarized-updater.py'))
pack = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pack)


class Packaging(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.app = self.root / 'Vibyra.app'
        (self.app / 'Contents/_CodeSignature').mkdir(parents=True)
        (self.app / 'Contents/_CodeSignature/CodeResources').write_bytes(b'signature')
        (self.app / 'Contents/main').write_bytes(b'code')
        self.original = self.root / 'original.tar.gz'
        with tarfile.open(self.original, 'w:gz', tarinfo=pack.OriginalMode) as archive:
            for path in [self.app, *self.app.rglob('*')]:
                info = archive.gettarinfo(str(path), path.relative_to(self.root).as_posix())
                info.mode = path.lstat().st_mode
                archive.addfile(info, io.BytesIO(path.read_bytes()) if path.is_file() else None)
        self.output = self.root / 'final.tar.gz'

    def modes(self, archive):
        with tarfile.open(archive, 'r:gz') as data:
            return {m.name: (m.mode, m.type) for m in data if not m.issym()}

    def test_preserves_original_type_bits_and_accepts_only_ticket_alias(self):
        (self.app / 'Contents/CodeResources').symlink_to('_CodeSignature/CodeResources')
        pack.package(self.original, self.app, self.output)
        self.assertEqual(self.modes(self.original), self.modes(self.output))
        self.assertGreater(self.modes(self.output)['Vibyra.app/Contents/main'][0], 0o7777)

    def test_standard_tar_masking_fails_existing_strict_admission(self):
        with tarfile.open(self.output, 'w:gz') as archive:
            archive.add(self.app, arcname='Vibyra.app')
        with self.assertRaisesRegex(ValueError, 'modes/types'):
            pack.helper('notarized-identity').compare_archive_modes(
                self.modes(self.original), self.modes(self.output))

    def test_changed_modes_or_types_are_rejected(self):
        os.chmod(self.app / 'Contents/main', 0o700)
        with self.assertRaisesRegex(ValueError, 'permissions'):
            pack.package(self.original, self.app, self.output)
        self.assertFalse(self.output.exists())

    def test_unexpected_resource_or_ticket_is_rejected(self):
        (self.app / 'Contents/CodeResources').write_bytes(b'not an alias')
        with self.assertRaisesRegex(ValueError, 'ticket'):
            pack.package(self.original, self.app, self.output)
        self.assertFalse(self.output.exists())

    def test_existing_output_is_never_overwritten(self):
        self.output.write_bytes(b'keep')
        with self.assertRaises(FileExistsError):
            pack.package(self.original, self.app, self.output)
        self.assertEqual(self.output.read_bytes(), b'keep')


if __name__ == '__main__':
    unittest.main()
