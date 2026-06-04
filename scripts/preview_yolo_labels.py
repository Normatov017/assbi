#!/usr/bin/env python3
"""Draw YOLO label boxes on sample images for local dataset QA."""

import argparse
import random
from pathlib import Path

import cv2

NAMES = {0: "person", 1: "vehicle"}
COLORS = {0: (0, 220, 0), 1: (255, 0, 255)}


def draw_label(image, line: str):
    parts = line.strip().split()
    if len(parts) != 5:
        return
    cls_id = int(float(parts[0]))
    cx, cy, bw, bh = [float(x) for x in parts[1:]]
    h, w = image.shape[:2]
    x1 = int((cx - bw / 2) * w)
    y1 = int((cy - bh / 2) * h)
    x2 = int((cx + bw / 2) * w)
    y2 = int((cy + bh / 2) * h)
    color = COLORS.get(cls_id, (0, 200, 255))
    name = NAMES.get(cls_id, str(cls_id))
    cv2.rectangle(image, (x1, y1), (x2, y2), color, 2)
    cv2.rectangle(image, (x1, max(0, y1 - 18)), (x1 + 86, y1), color, -1)
    cv2.putText(image, name, (x1 + 4, max(12, y1 - 5)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 0), 1)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", default="datasets/autolabeled/kabukicho_yolo")
    parser.add_argument("--split", default="train", choices=["train", "valid", "test"])
    parser.add_argument("--count", type=int, default=10)
    parser.add_argument("--output", default="exports/label_previews")
    parser.add_argument("--seed", type=int, default=7)
    args = parser.parse_args()

    root = Path(args.dataset)
    images = sorted((root / args.split / "images").glob("*.jpg"))
    if not images:
        raise SystemExit(f"No images found in {root / args.split / 'images'}")

    sample = images[:]
    random.Random(args.seed).shuffle(sample)
    sample = sample[: args.count]

    out_dir = Path(args.output)
    out_dir.mkdir(parents=True, exist_ok=True)
    written = []

    for image_path in sample:
        label_path = root / args.split / "labels" / f"{image_path.stem}.txt"
        image = cv2.imread(str(image_path))
        if image is None:
            continue
        if label_path.exists():
            for line in label_path.read_text().splitlines():
                draw_label(image, line)
        out_path = out_dir / f"preview_{args.split}_{image_path.name}"
        cv2.imwrite(str(out_path), image)
        written.append(out_path)

    for path in written:
        print(path)


if __name__ == "__main__":
    main()
