#!/usr/bin/env python3

import argparse
import json
import re
from pathlib import Path

from PIL import Image


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--expected", required=True, type=int)
    parser.add_argument("images", nargs="+")
    return parser.parse_args()


def main():
    args = parse_args()
    image_paths = [Path(value) for value in args.images]
    if len(image_paths) != args.expected:
        raise SystemExit(
            f"Expected {args.expected} PNGs, received {len(image_paths)}."
        )

    pages = []
    expected_size = (1440, 900)
    try:
        for image_path in image_paths:
            with Image.open(image_path) as source:
                source.load()
                if source.format != "PNG":
                    raise ValueError(f"{image_path} is not a PNG.")
                if source.size != expected_size:
                    raise ValueError(
                        f"{image_path} is {source.size}, expected {expected_size}."
                    )
                pages.append(source.convert("RGB"))

        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        pages[0].save(
            output_path,
            "PDF",
            resolution=144.0,
            save_all=True,
            append_images=pages[1:],
        )

        pdf_bytes = output_path.read_bytes()
        page_count = len(re.findall(rb"/Type\s*/Page\b", pdf_bytes))
        if page_count != args.expected:
            raise ValueError(
                f"PDF has {page_count} pages, expected {args.expected}."
            )

        print(json.dumps({
            "image_count": len(image_paths),
            "page_count": page_count,
            "output": str(output_path),
        }))
    finally:
        for page in pages:
            page.close()


if __name__ == "__main__":
    main()
