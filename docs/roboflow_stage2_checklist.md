# Roboflow Stage 2 Checklist

## Project Setup

1. Open Roboflow and create a new Object Detection project.
2. Project name: `ASSBI Kabukicho Detection`.
3. Upload images from `datasets/raw/kabukicho_live/images/`.
4. Split dataset:
   - Train: 70%
   - Validate: 20%
   - Test: 10%

## Annotation Classes

Recommended first classes:

- `person`
- `vehicle`

Optional later classes:

- `bag`
- `phone`
- `laptop`

For speed and fewer false positives, start with only `person` and `vehicle`.

## Preprocessing / Augmentation

Use Roboflow preprocessing carefully:

- Auto-orient: on
- Resize: 640x640 stretch or fit, depending on Roboflow export
- Blur augmentation: low probability
- Brightness/Exposure: small variation
- Noise: low
- Avoid heavy crop if the camera angle is fixed

## Export

Export format: YOLOv11 / Ultralytics YOLO.

Download and unzip the dataset, then use its `data.yaml` with:

```bash
python scripts/train_yolo11m.py --data /path/to/data.yaml --epochs 80 --imgsz 640 --batch 8
```


## Faster Auto-label Upload Path

Instead of manually drawing every box, use the auto-labeled YOLO dataset zip:

```text
exports/kabukicho_yolo_autolabeled.zip
```

This zip already contains:

- `train/images` and `train/labels` - 210 images
- `valid/images` and `valid/labels` - 60 images
- `test/images` and `test/labels` - 30 images
- `data.yaml`

Auto-label classes:

- `0: person`
- `1: vehicle`

In Roboflow, upload this zip as an existing YOLO/Ultralytics dataset, then review and correct labels instead of labeling from zero.
