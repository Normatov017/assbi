# Local YOLO Fine-tuning Without Roboflow

## 1. Check Auto-label Preview

Preview images with boxes are generated here:

```text
exports/label_previews/
```

Generate again:

```bash
.venv/bin/python scripts/preview_yolo_labels.py \
  --dataset datasets/autolabeled/kabukicho_yolo \
  --split train \
  --count 10 \
  --output exports/label_previews
```

Green boxes are `person`; purple boxes are `vehicle`.

## 2. Dataset Structure

The local YOLO dataset is here:

```text
datasets/autolabeled/kabukicho_yolo/
  data.yaml
  train/images
  train/labels
  valid/images
  valid/labels
  test/images
  test/labels
```

Split:

- train: 210 images
- valid: 60 images
- test: 30 images

## 3. Train Locally

If `yolo11m.pt` is available:

```bash
.venv/bin/python scripts/train_yolo11m.py \
  --data datasets/autolabeled/kabukicho_yolo/data.yaml \
  --model yolo11m.pt \
  --epochs 80 \
  --imgsz 640 \
  --batch 8
```

If `yolo11m.pt` is not available, use the local existing model for a smoke test:

```bash
.venv/bin/python scripts/train_yolo11m.py \
  --data datasets/autolabeled/kabukicho_yolo/data.yaml \
  --model yolov8s.pt \
  --epochs 5 \
  --imgsz 640 \
  --batch 4 \
  --name assbi_smoke_test
```

## 4. Output

Training output:

```text
training/runs/<run_name>/weights/best.pt
```

The script copies it to:

```text
models/best.pt
```

Upload/select `models/best.pt` in the ASSBI Fine-tuning page.
