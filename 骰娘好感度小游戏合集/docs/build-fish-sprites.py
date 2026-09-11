#!/usr/bin/env python3
"""Split the generated fish atlases into tightly fitted transparent sprites."""

from __future__ import annotations

import argparse
import importlib.util
from pathlib import Path

from PIL import Image, ImageDraw


def load_chroma_helper(path: Path):
    spec = importlib.util.spec_from_file_location("remove_chroma_key", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load chroma helper: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def alpha_bounds(image: Image.Image) -> tuple[int, int, int, int]:
    alpha = image.getchannel("A")
    bounds = alpha.point(lambda value: 255 if value > 8 else 0).getbbox()
    if bounds is None:
        raise RuntimeError("Sprite became fully transparent")
    return bounds


def retain_largest_alpha_component(image: Image.Image) -> None:
    alpha = image.getchannel("A")
    width, height = image.size
    alpha_values = alpha.get_flattened_data() if hasattr(alpha, "get_flattened_data") else alpha.getdata()
    visible = bytearray(1 if value > 8 else 0 for value in alpha_values)
    visited = bytearray(width * height)
    largest: list[int] = []

    for start in range(width * height):
        if not visible[start] or visited[start]:
            continue
        stack = [start]
        visited[start] = 1
        component: list[int] = []
        while stack:
            position = stack.pop()
            component.append(position)
            x = position % width
            y = position // width
            for neighbor in (
                position - 1 if x else -1,
                position + 1 if x + 1 < width else -1,
                position - width if y else -1,
                position + width if y + 1 < height else -1,
            ):
                if neighbor >= 0 and visible[neighbor] and not visited[neighbor]:
                    visited[neighbor] = 1
                    stack.append(neighbor)
        if len(component) > len(largest):
            largest = component

    keep = bytearray(width * height)
    for position in largest:
        keep[position] = 1
    pixels = image.load()
    for position in range(width * height):
        if not keep[position]:
            x = position % width
            y = position // width
            pixels[x, y] = (0, 0, 0, 0)


def split_atlases(atlas_dir: Path, output_dir: Path, helper_path: Path, padding: int) -> list[Path]:
    helper = load_chroma_helper(helper_path)
    output_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []

    for atlas_number in range(1, 7):
        atlas_path = atlas_dir / f"fish-atlas-{atlas_number:02d}.png"
        with Image.open(atlas_path) as source:
            atlas = source.convert("RGBA")
        width, height = atlas.size

        for cell in range(16):
            column = cell % 4
            row = cell // 4
            left = round(column * width / 4)
            top = round(row * height / 4)
            right = round((column + 1) * width / 4)
            bottom = round((row + 1) * height / 4)
            sprite = atlas.crop((left, top, right, bottom))
            key = helper._sample_border_key(sprite, "border")
            helper._apply_alpha_to_image(
                sprite,
                key=key,
                tolerance=12,
                spill_cleanup=True,
                soft_matte=True,
                transparent_threshold=10,
                opaque_threshold=55,
            )
            retain_largest_alpha_component(sprite)
            sprite = sprite.crop(alpha_bounds(sprite))
            padded = Image.new(
                "RGBA",
                (sprite.width + padding * 2, sprite.height + padding * 2),
                (0, 0, 0, 0),
            )
            padded.alpha_composite(sprite, (padding, padding))
            fish_number = (atlas_number - 1) * 16 + cell + 1
            output_path = output_dir / f"fish-{fish_number:03d}.png"
            padded.save(output_path, "PNG", optimize=True)
            written.append(output_path)

    return written


def make_contact_sheet(sprite_paths: list[Path], output_path: Path) -> None:
    columns = 8
    rows = 12
    cell_width = 190
    cell_height = 120
    sheet = Image.new("RGB", (columns * cell_width, rows * cell_height), "#d9d9d9")
    draw = ImageDraw.Draw(sheet)
    checker = 12
    for index, sprite_path in enumerate(sprite_paths):
        x = (index % columns) * cell_width
        y = (index // columns) * cell_height
        for check_y in range(y, y + cell_height, checker):
            for check_x in range(x, x + cell_width, checker):
                color = "#f4f4f4" if ((check_x - x) // checker + (check_y - y) // checker) % 2 == 0 else "#c8c8c8"
                draw.rectangle((check_x, check_y, check_x + checker - 1, check_y + checker - 1), fill=color)
        with Image.open(sprite_path) as source:
            sprite = source.convert("RGBA")
        available_width = cell_width - 18
        available_height = cell_height - 25
        scale = min(available_width / sprite.width, available_height / sprite.height)
        size = (max(1, round(sprite.width * scale)), max(1, round(sprite.height * scale)))
        sprite = sprite.resize(size, Image.Resampling.LANCZOS)
        sheet.paste(sprite, (x + (cell_width - size[0]) // 2, y + 3 + (available_height - size[1]) // 2), sprite)
        draw.rectangle((x, y, x + cell_width - 1, y + cell_height - 1), outline="#6d6d6d")
        draw.text((x + 6, y + cell_height - 18), sprite_path.stem, fill="#202020")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output_path, "PNG", optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--atlas-dir", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--chroma-helper", type=Path, required=True)
    parser.add_argument("--contact-sheet", type=Path)
    parser.add_argument("--padding", type=int, default=12)
    args = parser.parse_args()
    sprites = split_atlases(args.atlas_dir, args.out_dir, args.chroma_helper, max(0, args.padding))
    if args.contact_sheet:
        make_contact_sheet(sprites, args.contact_sheet)
    print(f"Wrote {len(sprites)} transparent fish sprites to {args.out_dir}")


if __name__ == "__main__":
    main()
