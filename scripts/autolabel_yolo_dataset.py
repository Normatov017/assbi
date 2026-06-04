#!/usr/bin/env python3
"""Auto-label collected images with YOLO and build a train/valid/test dataset zip.

This creates an Ultralytics/Roboflow-ready YOLO detection dataset:
  dataset/
    data.yaml
    train/images + train/labels
    valid/images + valid/labels
    test/images + test/labels

Default classes are person and vehicle.
"""

import argparse
import json
import random
import shutil
import zipfile
from collections import Counter
from datetime import datetime
from pathlib import Path

import cv2
from ultralytics import YOLO

PERSON_CLASS = 0
VEHICLE_CLASSES = {2, 3, 5, 7}
TARGET_NAMES = ["person", "vehicle"]


def clean_dir(path: Path):
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def yolo_line(cls_index: int, xyxy, width: int, height: int) -> str:
    x1, y1, x2, y2 = [float(v) for v in xyxy]
    x1 = max(0.0, min(x1, width - 1))
    x2 = max(0.0, min(x2, width - 1))
    y1 = max(0.0, min(y1, height - 1))
    y2 = max(0.0, min(y2, height - 1))
    bw = max(0.0, x2 - x1)
    bh = max(0.0, y2 - y1)
    cx = x1 + bw / 2
    cy = y1 + bh / 2
    return f"{cls_index} {cx / width:.6f} {cy / height:.6f} {bw / width:.6f} {bh / height:.6f}"


def split_images(images: list[Path], train_ratio: float, valid_ratio: float, seed: int):
    shuffled = images[:]
    random.Random(seed).shuffle(shuffled)
    total = len(shuffled)
    train_end = int(total * train_ratio)
    valid_end = train_end + int(total * valid_ratio)
    return {
        "train": shuffled[:train_end],
        "valid": shuffled[train_end:valid_end],
        "test": shuffled[valid_end:],
    }


def main():
    parser = argparse.ArgumentParser(description="Auto-label images with YOLO and package a dataset")
    parser.add_argument("--images", default="datasets/raw/kabukicho_live/images")
    parser.add_argument("--output", default="datasets/autolabeled/kabukicho_yolo")
    parser.add_argument("--zip", default="exports/kabukicho_yolo_autolabeled.zip")
    parser.add_argument("--model", default="yolov8s.pt")
    parser.add_argument("--conf", type=float, default=0.25)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--train", type=float, default=0.70)
    parser.add_argument("--valid", type=float, default=0.20)
    parser.add_argument("--include-empty", action="store_true", help="Keep images where YOLO found no target labels")
    args = parser.parse_args()

    image_dir = Path(args.images)
    output_dir = Path(args.output)
    zip_path = Path(args.zip)
    images = sorted([p for p in image_dir.glob("*") if p.suffix.lower() in {".jpg", ".jpeg", ".png"}])
    if not images:
        raise SystemExit(f"No images found in {image_dir}")

    clean_dir(output_dir)
    for split in ["train", "valid", "test"]:
        (output_dir / split / "images").mkdir(parents=True, exist_ok=True)
        (output_dir / split / "labels").mkdir(parents=True, exist_ok=True)

    model = YOLO(args.model)
    splits = split_images(images, args.train, args.valid, args.seed)
    stats = Counter()
    kept_by_split = Counter()
    skipped_empty = 0

    for split, paths in splits.items():
        for image_path in paths:
            frame = cv2.imread(str(image_path))
            if frame is None:
                stats["unreadable"] += 1
                continue
            height, width = frame.shape[:2]
            results = model.predict(
                str(image_path),
                conf=args.conf,
                imgsz=args.imgsz,
                classes=[PERSON_CLASS, *sorted(VEHICLE_CLASSES)],
                verbose=False,
            )
            lines = []
            for result in results:
                if result.boxes is None:
                    continue
                for box in result.boxes:
                    cls_id = int(box.cls[0])
                    if cls_id == PERSON_CLASS:
                        target_cls = 0
                        stats["person"] += 1
                    elif cls_id in VEHICLE_CLASSES:
                        target_cls = 1
                        stats["vehicle"] += 1
                    else:
                        continue
                    lines.append(yolo_line(target_cls, box.xyxy[0].tolist(), width, height))

            if not lines and not args.include_empty:
                skipped_empty += 1
                continue

            out_image = output_dir / split / "images" / image_path.name
            out_label = output_dir / split / "labels" / f"{image_path.stem}.txt"
            shutil.copy2(image_path, out_image)
            out_label.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")
            kept_by_split[split] += 1

    data_yaml = output_dir / "data.yaml"
    data_yaml.write_text(
        "path: .\n"
        "train: train/images\n"
        "val: valid/images\n"
        "test: test/images\n"
        "names:\n"
        "  0: person\n"
        "  1: vehicle\n",
        encoding="utf-8",
    )

    manifest = {
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "source_images": str(image_dir),
        "output": str(output_dir),
        "zip": str(zip_path),
        "model": args.model,
        "conf": args.conf,
        "imgsz": args.imgsz,
        "classes": TARGET_NAMES,
        "split_requested": {"train": args.train, "valid": args.valid, "test": round(1 - args.train - args.valid, 2)},
        "images_found": len(images),
        "images_kept": sum(kept_by_split.values()),
        "images_skipped_empty": skipped_empty,
        "kept_by_split": dict(kept_by_split),
        "labels": dict(stats),
    }
    (output_dir / "autolabel_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    zip_path.parent.mkdir(parents=True, exist_ok=True)
    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(output_dir.rglob("*")):
            if path.is_file():
                zf.write(path, path.relative_to(output_dir))

    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
