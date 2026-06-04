# ASSBI Fine-tuning: person / vehicle / object

Bu qo‘llanma `datasets/custom_assbi_yolo` starter dataset papkasi uchun.

## 1. Dataset tayyorlash

Rasmlarni quyidagicha joylang:

```text
datasets/custom_assbi_yolo/train/images
datasets/custom_assbi_yolo/valid/images
datasets/custom_assbi_yolo/test/images
```

Label `.txt` fayllarni mos papkalarga qo‘ying:

```text
datasets/custom_assbi_yolo/train/labels
datasets/custom_assbi_yolo/valid/labels
datasets/custom_assbi_yolo/test/labels
```

## 2. Classlar

Default classlar:

```text
0 person
1 vehicle
2 object
```

Agar `car` alohida kerak bo‘lsa, `data.yaml`dagi names ro‘yxatini 4 classga o‘zgartiring va hamma label IDlarni shunga mos qiling.

## 3. Train qilish

```bash
.venv/bin/python scripts/train_yolo11m.py \
  --data datasets/custom_assbi_yolo/data.yaml \
  --model yolo11m.pt \
  --epochs 80 \
  --imgsz 640 \
  --batch 8 \
  --name assbi_custom_person_vehicle_object
```

## 4. Natija

Trainingdan keyin:

```text
models/best.pt
```

shu fayl fine-tuned model hisoblanadi.

## 5. Saytda ishlatish

Fine-tuning sahifasida `best.pt` upload/select qilinadi. Keyin detector restart qilinganda live/YouTube/RTSP/MP4 detection shu model bilan ishlaydi.
