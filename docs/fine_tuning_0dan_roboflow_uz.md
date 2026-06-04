# ASSBI fine-tuning 0 dan: 500 rasm, Roboflow, best.pt

## 1. 500 ta rasm yig'ish

Live yoki YouTube linkdan rasm yig'ish:

```bash
python scripts/collect_images.py \
  --source "YOUTUBE_YOKI_RTSP_LINK" \
  --count 500 \
  --interval 1 \
  --output datasets/raw/assbi_500/images \
  --prefix assbi
```

Saytning tayyor frame endpointidan yig'ish:

```bash
python scripts/collect_images.py \
  --source "https://normatov.uz/api/frame/CAMERA_ID" \
  --count 500 \
  --interval 1 \
  --output datasets/raw/assbi_500/images \
  --prefix assbi
```

Natija:

```text
datasets/raw/assbi_500/images/*.jpg
datasets/raw/assbi_500/metadata.jsonl
datasets/raw/assbi_500/collection_manifest.json
```

## 2. Roboflowga yuklash

1. Roboflowda Object Detection project oching.
2. `datasets/raw/assbi_500/images` ichidagi rasmlarni upload qiling.
3. Classlarni sodda boshlang:
   - `person`
   - `vehicle`
   - `object`
4. Split:
   - Train 70%
   - Valid 20%
   - Test 10%
5. Preprocessing:
   - Auto-orient: on
   - Resize: 640x640
6. Augmentation:
   - Blur: yengil
   - Brightness/Exposure: yengil
   - Noise: yengil
   - Juda og'ir crop yoki rotate qo'shmang.

## 3. Dataset export

Roboflowdan export qiling:

```text
Format: YOLOv11 / Ultralytics YOLO
```

ZIP ichida shunaqa fayllar bo'lishi kerak:

```text
data.yaml
train/images
train/labels
valid/images
valid/labels
test/images
test/labels
```

## 4. Sayt UI orqali train qilish

1. Saytda `Fine-tuning` sahifasiga kiring.
2. `Dataset ZIP upload` joyiga Roboflow export ZIPni yuklang.
3. Dataset statusi `Ready` bo'lishi kerak.
4. `Base model`:
   - tez test uchun `yolov8n.pt`
   - finalroq model uchun `yolo11m.pt`
5. `Image size`: `640`
6. `Epochs`: test uchun `10`, final uchun `80`
7. `Batch`: server kuchiga qarab `4` yoki `8`
8. `Train boshlash` bosing.

## 5. best.pt qayerda chiqadi

Training tugaganda asl model:

```text
training/runs/RUN_NAME/weights/best.pt
```

Sayt ishlatadigan nusxa:

```text
models/best.pt
```

Docker/AWS ichida shu yo'l:

```text
/app/models/best.pt
```

## 6. best.pt ni live detectionda ishlatish

Trainingdan keyin Fine-tuning sahifasida model ro'yxatida `best.pt` ko'rinadi.
Uni active model qilib tanlang. Keyin relay/detector restart bo'lganda YouTube, RTSP va MP4 detection shu model bilan ishlaydi.

## 7. 640x640 nima uchun

YOLO training va inference uchun `imgsz=640` ishlatiladi. Bu model rasmdagi obyektlarni 640 o'lchamli inputda ko'radi. ASSBI UI oqimi esa 640x360 qilib ko'rsatiladi, chunki video 16:9 formatda va browserga tezroq yetib boradi.
