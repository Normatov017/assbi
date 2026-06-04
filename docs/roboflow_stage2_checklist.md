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
