"""Reject code/geometry changes while allowing proven signature allocation only."""
import hashlib
import importlib.util
import struct
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("macho", Path(__file__).with_name("notarized-macho.py"))
macho = importlib.util.module_from_spec(spec)
spec.loader.exec_module(macho)


def segment(name, address, virtual, offset, size, protection):
    return struct.pack("<II16sQQQQiiII", 0x19, 72, name, address, virtual, offset,
                       size, protection, protection, 0, 0)


def fixture(signature_size=0x20000, cpu=0x100000C, padding=15):
    page, offset, code_size = macho.PAGES[cpu], 0x4000, 257
    signed_size = code_size + padding + signature_size
    virtual = ((signed_size + page - 1) // page) * page
    text = segment(b"__TEXT", 0x100000000, offset, 0, offset, 5)
    link = segment(b"__LINKEDIT", 0x100004000, virtual, offset, signed_size, 1)
    signature = struct.pack("<IIII", 0x1D, 16, offset + code_size + padding, signature_size)
    header = struct.pack("<IIIIIIII", 0xFEEDFACF, cpu, 0, 2, 3, 160, 0, 0)
    signed = (header + text + link + signature).ljust(offset, b"\0")
    signed += b"C" * code_size + b"\0" * padding + b"S" * signature_size
    header = struct.pack("<IIIIIIII", 0xFEEDFACF, cpu, 0, 2, 2, 144, 0, 0)
    link = segment(b"__LINKEDIT", 0x100004000, virtual, offset, code_size, 1)
    stripped = (header + text + link).ljust(offset, b"\0") + b"C" * code_size
    return signed, stripped


def changed(data, offset, value, kind="<Q"):
    result = bytearray(data)
    struct.pack_into(kind, result, offset, value)
    return bytes(result)


class MachO(unittest.TestCase):
    def test_only_signature_size_derived_allocation_changes_are_equal(self):
        for cpu in macho.PAGES:
            first, second = fixture(cpu=cpu), fixture(0x2000, cpu=cpu)
            self.assertEqual(macho.canonical_unsigned(*first), macho.canonical_unsigned(*second))

    def test_zero_alignment_padding_is_limited_to_fifteen_bytes(self):
        signed, stripped = fixture()
        macho.canonical_unsigned(signed, stripped)
        # The byte removed at the boundary was real program data, not alignment.
        with self.assertRaises(ValueError):
            macho.canonical_unsigned(signed, stripped[:-1])
        nonzero = bytearray(signed)
        nonzero[len(stripped)] = 1
        with self.assertRaisesRegex(ValueError, "padding"):
            macho.canonical_unsigned(bytes(nonzero), stripped)

    def test_arbitrary_signed_virtual_size_or_stripped_mutation_is_rejected(self):
        signed, stripped = fixture()
        field = macho.layout(signed, True)["field"]
        for malformed in [0, 1, 0x90000000]:
            with self.assertRaisesRegex(ValueError, "allocation"):
                macho.canonical_unsigned(changed(signed, field, malformed), stripped)
        with self.assertRaisesRegex(ValueError, "geometry"):
            macho.canonical_unsigned(signed, changed(stripped, field, 0x50000))

    def test_changed_program_bytes_remain_different_after_canonicalization(self):
        signed, stripped = fixture()
        tampered = bytearray(stripped)
        tampered[-1] ^= 1
        expected = hashlib.sha256(macho.canonical_unsigned(signed, stripped)).digest()
        actual = hashlib.sha256(macho.canonical_unsigned(signed, bytes(tampered))).digest()
        self.assertNotEqual(actual, expected)

    def test_other_header_and_segment_bytes_are_never_normalized(self):
        signed, stripped = fixture()
        expected = macho.canonical_unsigned(signed, stripped)
        # Header flags and TEXT protection are outside signature allocation.
        for offset, value, kind in [(24, 0x200000, "<I"), (88, 7, "<i")]:
            actual = macho.canonical_unsigned(changed(signed, offset, value, kind),
                                              changed(stripped, offset, value, kind))
            self.assertNotEqual(actual, expected)

    def test_allocation_uses_the_exact_architecture_page_size(self):
        for cpu, wrong_page in [(0x100000C, 4096), (0x1000007, 16384)]:
            signed, stripped = fixture(0x2000, cpu=cpu)
            metadata = macho.layout(signed, True)
            wrong_allocation = ((metadata["size"] + wrong_page - 1) // wrong_page) * wrong_page
            self.assertNotEqual(wrong_allocation, metadata["virtual"])
            with self.assertRaisesRegex(ValueError, "allocation"):
                macho.canonical_unsigned(changed(signed, metadata["field"], wrong_allocation), stripped)

    def test_linkedit_cannot_be_executable_or_contain_sections(self):
        signed, stripped = fixture()
        command = macho.layout(signed, True)["field"] - 32
        with self.assertRaisesRegex(ValueError, "read-only"):
            macho.canonical_unsigned(changed(signed, command + 56, 5, "<i"), stripped)
        with self.assertRaisesRegex(ValueError, "section"):
            macho.canonical_unsigned(changed(signed, command + 64, 1, "<I"), stripped)

    def test_wrong_signature_extent_alignment_or_extra_signature_is_rejected(self):
        signed, stripped = fixture()
        for offset, value in [(184, 1), (188, 1)]:
            with self.assertRaisesRegex(ValueError, "bounds"):
                macho.canonical_unsigned(changed(signed, offset, value, "<I"), stripped)
        duplicate = changed(changed(signed, 16, 4, "<I"), 20, 176, "<I")
        duplicate = duplicate[:192] + signed[176:192] + duplicate[208:]
        with self.assertRaisesRegex(ValueError, "one embedded signature"):
            macho.canonical_unsigned(duplicate, stripped)

    def test_header_segment_extent_and_remaining_signature_are_rejected(self):
        signed, stripped = fixture()
        for invalid in [signed[:20], changed(signed, 4, 123, "<I"),
                        changed(signed, 20, len(signed), "<I"),
                        changed(signed, 36, 80, "<I"),
                        changed(signed, 144, 1)]:
            with self.assertRaises(ValueError):
                macho.canonical_unsigned(invalid, stripped)
        with self.assertRaisesRegex(ValueError, "not removed"):
            macho.canonical_unsigned(signed, signed)


if __name__ == "__main__":
    unittest.main()
