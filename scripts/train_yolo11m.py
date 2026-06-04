#!/usr/bin/env python3
"""Train YOLO11m on a Roboflow/Ultralytics dataset export.

Usage:
  python scripts/train_yolo11m.py --data /path/to/data.yaml --epochs 80 --imgsz 640 --batch 8

The final fine-tuned model will be copied to models/best.pt.
"""

import argparse
import shutil
import subprocess
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description="Fine-tune YOLO11m and save models/best.pt")
    parser.add_argument("--data", required=True, help="Roboflow exported data.yaml path")
    parser.add_argument("--model", default="yolo11m.pt")
    parser.add_argument("--epochs", type=int, default=80)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--batch", type=int, default=8)
    parser.add_argument("--project", default="training/runs")
    parser.add_argument("--name", default="assbi_yolo11m_finetune")
    args = parser.parse_args()

    data_path = Path(args.data)
    if not data_path.exists():
        raise SystemExit(f"data.yaml not found: {data_path}")

    cmd = [
        "yolo",
        "detect",
        "train",
        f"model={args.model}",
        f"data={data_path}",
        f"epochs={args.epochs}",
        f"imgsz={args.imgsz}",
        f"batch={args.batch}",
        f"project={args.project}",
        f"name={args.name}",
    ]
    print("Running:", " ".join(str(item) for item in cmd), flush=True)
    subprocess.run(cmd, check=True)

    run_dir = Path(args.project) / args.name
    best = run_dir / "weights" / "best.pt"
    if not best.exists():
        raise SystemExit(f"Training finished but best.pt was not found: {best}")

    models_dir = Path("models")
    models_dir.mkdir(exist_ok=True)
    target = models_dir / "best.pt"
    shutil.copy2(best, target)
    print(f"Saved fine-tuned model: {target}")


if __name__ == "__main__":
    main()
