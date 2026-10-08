#!/usr/bin/env python3
"""Package verified exports with immutable originals' exact tar mode/type headers."""
import argparse
import copy
import importlib.util
import os
import stat
import tarfile
from pathlib import Path


def helper(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


gate = helper('verify-notarized-updaters')


class OriginalMode(tarfile.TarInfo):
    def tobuf(self, *args, **kwargs):
        # Python/BSD tar mask mode to 07777; Tauri archives may retain file type
        # bits there. Keep the exact original field and recompute its checksum.
        encoded = super().tobuf(*args, **kwargs)
        header = bytearray(encoded[-tarfile.BLOCKSIZE:])
        header[100:108] = f'{self.mode:07o}\0'.encode('ascii')
        header[148:156] = b'        '
        header[148:156] = f'{sum(header):06o}\0 '.encode('ascii')
        return encoded[:-tarfile.BLOCKSIZE] + header


def package(original, app, output):
    if original.is_symlink() or app.is_symlink() or app.name != 'Vibyra.app':
        raise ValueError('Regular original and exact exported app required')
    with tarfile.open(original, 'r:gz', tarinfo=OriginalMode) as source:
        members = gate.safe_members(source)
    names = {m.name.rstrip('/') for m in members}
    actual = {'Vibyra.app', *('Vibyra.app/' + p.relative_to(app).as_posix() for p in app.rglob('*'))}
    ticket = 'Vibyra.app/Contents/CodeResources'
    if (names ^ actual) - {ticket} or names - actual:
        raise ValueError('Exported path inventory differs from original')
    entries, total = [], 0
    for member in members:
        path = app.parent / member.name
        mode = path.lstat().st_mode
        if ((member.isfile() and not stat.S_ISREG(mode))
                or (member.isdir() and not stat.S_ISDIR(mode))
                or (member.issym() and not stat.S_ISLNK(mode))):
            raise ValueError('Exported object type differs from original')
        if stat.S_IMODE(mode) != stat.S_IMODE(member.mode):
            raise ValueError('Exported permissions differ from original')
        if member.issym() and os.readlink(path) != member.linkname:
            raise ValueError('Exported link target differs from original')
        info = copy.copy(member)
        info.pax_headers = dict(member.pax_headers)
        if member.isfile():
            info.size = path.stat().st_size
            info.pax_headers.pop('size', None)
            total += info.size
        entries.append((info, path))
    if total > 3 * 1024 ** 3:
        raise ValueError('Oversized exported app')
    # A stapled ticket alias may be new, but never grants a new regular resource.
    if ticket in actual - names:
        path = app / 'Contents/CodeResources'
        if not path.is_symlink() or os.readlink(path) != '_CodeSignature/CodeResources':
            raise ValueError('Unexpected new notarization ticket')
        info = OriginalMode(ticket)
        info.type, info.linkname, info.mode = tarfile.SYMTYPE, os.readlink(path), path.lstat().st_mode
        entries.append((info, path))
    with output.open('xb') as raw:
        with tarfile.open(fileobj=raw, mode='w:gz', format=tarfile.PAX_FORMAT) as result:
            for info, path in entries:
                if info.isfile():
                    with path.open('rb') as data:
                        result.addfile(info, data)
                else:
                    result.addfile(info)
    with tarfile.open(output, 'r:gz') as result:
        final = gate.safe_members(result)
    before = {m.name.rstrip('/'): (m.mode, m.type) for m in members if not m.issym()}
    after = {m.name.rstrip('/'): (m.mode, m.type) for m in final if not m.issym()}
    helper('notarized-identity').compare_archive_modes(before, after)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--original-archive', required=True, type=Path)
    parser.add_argument('--exported-app', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    package(args.original_archive, args.exported_app, args.output)
    print('Original mode/type headers preserved; full exact-source/Apple admission still required.')
