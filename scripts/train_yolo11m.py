#!/usr/bin/env python3
"""Train a YOLO detector on an Ultralytics dataset export.

Usage:
  python scripts/train_yolo11m.py --data /path/to/data.yaml --model yolov8n.pt --epochs 10 --imgsz 640 --batch 1

The final fine-tuned model will be copied to models/best.pt.
"""

import argparse
import shutil
import subprocess
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description="Fine-tune YOLO and save models/best.pt")
    parser.add_argument("--data", required=True, help="Ultralytics data.yaml path")
    parser.add_argument("--model", default="yolov8n.pt")
    parser.add_argument("--epochs", type=int, default=10)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--batch", type=int, default=1)
    parser.add_argument("--project", default="training/runs")
    parser.add_argument("--name", default="assbi_yolo_finetune")
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--workers", type=int, default=0)
    args = parser.parse_args()

    data_path = Path(args.data).resolve()
    if not data_path.exists():
        raise SystemExit(f"data.yaml not found: {data_path}")

    project_path = Path(args.project).resolve()
    project_path.mkdir(parents=True, exist_ok=True)

    cmd = [
        "yolo",
        "detect",
        "train",
        f"model={args.model}",
        f"data={data_path}",
        f"epochs={args.epochs}",
        f"imgsz={args.imgsz}",
        f"batch={args.batch}",
        f"project={project_path}",
        f"name={args.name}",
        f"device={args.device}",
        f"workers={args.workers}",
        "cache=False",
        "plots=False",
        "exist_ok=True",
    ]
    print("Running:", " ".join(str(item) for item in cmd), flush=True)
    subprocess.run(cmd, check=True)

    run_dir = project_path / args.name
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
