#!/usr/bin/env python3

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def generate(output: Path, width: int, height: int) -> None:
    image = Image.new("RGB", (width, height), (28, 31, 38))
    draw = ImageDraw.Draw(image, "RGBA")
    center_x = width // 2
    center_y = height // 2

    draw.rectangle((center_x, 0, width, center_y), fill=(55, 126, 255, 22))
    draw.rectangle((0, 0, center_x, center_y), fill=(193, 77, 255, 18))
    draw.rectangle((0, center_y, center_x, height), fill=(255, 93, 93, 18))
    draw.rectangle((center_x, center_y, width, height), fill=(40, 210, 145, 18))

    minor = max(8, width // 80)
    major = minor * 5
    for x in range(center_x % minor, width, minor):
        distance = abs(x - center_x)
        if distance % major == 0:
            draw.line((x, 0, x, height), fill=(184, 195, 218, 105), width=2)
        else:
            draw.line((x, 0, x, height), fill=(184, 195, 218, 35), width=1)
    for y in range(center_y % minor, height, minor):
        distance = abs(y - center_y)
        if distance % major == 0:
            draw.line((0, y, width, y), fill=(184, 195, 218, 105), width=2)
        else:
            draw.line((0, y, width, y), fill=(184, 195, 218, 35), width=1)

    draw.line((0, center_y, width, center_y), fill=(255, 88, 88, 255), width=4)
    draw.line((center_x, 0, center_x, height), fill=(74, 226, 146, 255), width=4)
    arrow = max(10, width // 80)
    draw.polygon(
        [(width - 2, center_y), (width - arrow * 2, center_y - arrow), (width - arrow * 2, center_y + arrow)],
        fill=(255, 88, 88, 255),
    )
    draw.polygon(
        [(center_x, 2), (center_x - arrow, arrow * 2), (center_x + arrow, arrow * 2)],
        fill=(74, 226, 146, 255),
    )

    font = ImageFont.load_default(size=max(14, width // 55))
    label_color = (244, 247, 255, 235)
    padding = max(12, width // 80)
    draw.text((center_x + padding, center_y + padding), "(0, 0)", fill=label_color, font=font)
    draw.text((width - padding * 6, center_y + padding), "+X", fill=(255, 150, 150, 255), font=font)
    draw.text((center_x + padding, padding), "+Y", fill=(142, 255, 194, 255), font=font)

    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, format="PNG", optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path("samples/xy-grid.png"))
    parser.add_argument("--width", type=int, default=1280)
    parser.add_argument("--height", type=int, default=720)
    args = parser.parse_args()
    generate(args.output, args.width, args.height)


if __name__ == "__main__":
    main()
