# ASSBI Custom YOLO Fine-tuning Dataset

Bu papka Roboflow ishlatmasdan YOLO fine-tuning qilish uchun tayyor starter.

## Classlar

Tavsiya qilingan classlar:

| ID | Class | Nimani label qilamiz |
|---:|---|---|
| 0 | person | Odamlar, piyodalar |
| 1 | vehicle | Car, bus, truck, motorbike, van kabi transportlar |
| 2 | object | Alohida kuzatiladigan umumiy obyektlar |

Nega `car` va `vehicle`ni birga qo‘ymadik? Chunki `car` ham `vehicle` ichiga kiradi. Agar bitta rasmda mashinani ba'zan `car`, ba'zan `vehicle` deb belgilasak, model chalkashadi. Agar ustoz `car` alohida bo‘lsin desa, `data.yaml`ni 4 class qilib o‘zgartiring:

```yaml
names:
  0: person
  1: car
  2: vehicle
  3: object
```

Bunda qoida shunday bo‘lsin: yengil mashina = `car`, bus/truck/motorbike = `vehicle`.

## Papka strukturasi

```text
datasets/custom_assbi_yolo/
  data.yaml
  classes.txt
  train/images
  train/labels
  valid/images
  valid/labels
  test/images
  test/labels
```

## Qanday image va label qo‘yiladi

Har bir rasm uchun shu nomdagi `.txt` label bo‘lishi kerak:

```text
train/images/frame_001.jpg
train/labels/frame_001.txt
```

YOLO label format:

```text
class_id x_center y_center width height
```

Qiymatlar 0 dan 1 gacha normalized bo‘ladi. Masalan:

```text
0 0.512 0.481 0.120 0.340
1 0.701 0.620 0.180 0.210
```

Bu yerda `0` = person, `1` = vehicle.

## Split

300 ta rasm bo‘lsa:

- train: 210 ta rasm
- valid: 60 ta rasm
- test: 30 ta rasm

## Training command

```bash
.venv/bin/python scripts/train_yolo11m.py \
  --data datasets/custom_assbi_yolo/data.yaml \
  --model yolo11m.pt \
  --epochs 80 \
  --imgsz 640 \
  --batch 8 \
  --name assbi_custom_person_vehicle_object
```

Agar Mac sekin bo‘lsa yoki smoke test kerak bo‘lsa:

```bash
.venv/bin/python scripts/train_yolo11m.py \
  --data datasets/custom_assbi_yolo/data.yaml \
  --model yolov8s.pt \
  --epochs 5 \
  --imgsz 640 \
  --batch 4 \
  --name assbi_custom_smoke_test
```

Training tugagandan keyin script `best.pt`ni avtomatik shu joyga copy qiladi:

```text
models/best.pt
```

Keyin saytga kirib:

1. Fine-tuning sahifasini oching.
2. `models/best.pt` faylni upload qiling.
3. Modelni active/select qiling.
4. Test image bilan tekshiring.
5. Detector/relay restart qiling.

## Muhim label qoidalari

- Odamni doim `person` deb belgilang, `people` deb boshqa class ochmang.
- Mashina, bus, truck, motorbike bir class bo‘lsa hammasini `vehicle` deb belgilang.
- Juda noaniq narsalarni ko‘p `object` qilish modelni chalkashtiradi; `object` faqat sizga kerak obyektlar uchun ishlasin.
- Bir xil narsani har doim bir xil class bilan label qiling.
- Juda blur, qorong‘i, uzoqdagi, qisman ko‘ringan obyektlardan ham namuna qo‘shing.
