"""Normalize only proven signature-derived LINKEDIT allocation in thin Mac code."""
import struct

PAGES = {0x1000007: 4096, 0x100000C: 16384}
MAGIC = b"\xcf\xfa\xed\xfe"


def layout(data, signed):
    if len(data) < 32 or data[:4] != MAGIC:
        raise ValueError("Expected little-endian thin 64-bit Mach-O")
    cpu, _, _, count, command_bytes = struct.unpack_from("<IIIII", data, 4)
    if cpu not in PAGES or not 0 < count <= 4096 or not count * 8 <= command_bytes <= len(data) - 32:
        raise ValueError("Invalid Mach-O architecture or command extent")
    end, offset, segments, signatures = 32 + command_bytes, 32, [], []
    for _ in range(count):
        if offset + 8 > end:
            raise ValueError("Truncated Mach-O command")
        command, size = struct.unpack_from("<II", data, offset)
        if size < 8 or size % 8 or offset + size > end:
            raise ValueError("Invalid Mach-O command size")
        if command == 0x19:
            if size < 72:
                raise ValueError("Truncated segment")
            name = data[offset + 8:offset + 24].rstrip(b"\0")
            address, virtual_size, file_offset, file_size, maximum, initial, sections, _ = struct.unpack_from(
                "<QQQQiiII", data, offset + 24)
            if size != 72 + 80 * sections:
                raise ValueError("Invalid segment section extent")
            segments.append((name, address, virtual_size, file_offset, file_size, offset, maximum, initial, sections))
        elif command == 0x1D:
            if size != 16:
                raise ValueError("Invalid signature command")
            signatures.append(struct.unpack_from("<II", data, offset + 8))
        offset += size
    if offset != end:
        raise ValueError("Mach-O command extent differs")
    links = [segment for segment in segments if segment[0] == b"__LINKEDIT"]
    if len(links) != 1:
        raise ValueError("Exactly one LINKEDIT segment required")
    _, address, virtual_size, file_offset, file_size, command, maximum, initial, sections = links[0]
    if sections or maximum != 1 or initial != 1:
        raise ValueError("LINKEDIT must contain no sections and be read-only")
    if file_offset < end or not file_size or file_offset + file_size != len(data):
        raise ValueError("LINKEDIT must terminate the file")
    for segment in segments:
        if segment[0] != b"__LINKEDIT" and (segment[3] + segment[4] > file_offset
                                          or segment[1] + segment[2] > address):
            raise ValueError("LINKEDIT overlaps another file or virtual segment")
    if signed:
        if len(signatures) != 1:
            raise ValueError("Exactly one embedded signature required")
        signature_offset, signature_size = signatures[0]
        if (not signature_size or signature_offset % 16 or signature_offset < file_offset
                or signature_offset + signature_size != len(data)):
            raise ValueError("Signature must terminate LINKEDIT with aligned bounds")
        page = PAGES[cpu]
        if virtual_size != ((file_size + page - 1) // page) * page:
            raise ValueError("LINKEDIT allocation is not derived from signed filesize")
    elif signatures:
        raise ValueError("Embedded signature was not removed")
    return {"cpu": cpu, "field": command + 32, "address": address, "virtual": virtual_size,
            "offset": file_offset, "size": file_size, "signatures": signatures,
            "count": count, "commandBytes": command_bytes}


def canonical_unsigned(signed, stripped):
    before, after = layout(signed, True), layout(stripped, False)
    signature_offset = before["signatures"][0][0]
    padding = signature_offset - len(stripped)
    if (not 0 <= padding < 16 or any(signed[len(stripped):signature_offset])
            or before["cpu"] != after["cpu"] or before["offset"] != after["offset"]
            or before["address"] != after["address"] or before["virtual"] != after["virtual"]
            or before["count"] != after["count"] + 1
            or before["commandBytes"] != after["commandBytes"] + 16):
        raise ValueError("Unexpected signature removal geometry or padding")
    if after["size"] != len(stripped) - after["offset"]:
        raise ValueError("Invalid stripped LINKEDIT extent")
    canonical = bytearray(stripped)
    page = PAGES[after["cpu"]]
    # No code, address, protection, load command or resource bytes are ignored.
    struct.pack_into("<Q", canonical, after["field"], ((after["size"] + page - 1) // page) * page)
    return bytes(canonical)
