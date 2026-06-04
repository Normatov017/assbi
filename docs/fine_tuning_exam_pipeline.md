# ASSBI Fine-tuning Exam Pipeline

## Stage 1 - Image Collection

Live source: YouTube/Kabukicho camera.

Command used:

```bash
python scripts/collect_images.py \
  --source https://normatov.uz/api/frame/youtube_youtube_camera \
  --output datasets/raw/kabukicho_live/images \
  --prefix kabukicho \
  --count 300 \
  --interval 1
```

Output:
- Raw images: `datasets/raw/kabukicho_live/images/`
- Metadata: `datasets/raw/kabukicho_live/metadata.jsonl`
- Manifest: `datasets/raw/kabukicho_live/collection_manifest.json`

## Stage 2 - Roboflow

1. Create a Roboflow object detection project.
2. Upload all collected images.
3. Split dataset: train 70%, validation 20%, test 10%.
4. Add preprocessing/augmentation such as blur, brightness, contrast, exposure, and noise.
5. Export in YOLOv11/Ultralytics format.

## Stage 3 - YOLO11m Fine-tuning

Train with Ultralytics YOLO11m. The final model is `best.pt` (`.pt`, not `.nt`).

Example:

```bash
yolo detect train model=yolo11m.pt data=data.yaml epochs=80 imgsz=640 batch=8
```

Save the output model as:

```text
models/best.pt
```

## Stage 4 - ASSBI App Integration

1. Upload `best.pt` from the Fine-tuning page.
2. Select it as the active detection model.
3. Restart camera detector.
4. Use teacher ChatGPT API key in Settings for AI chatbot.
