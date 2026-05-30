import json
import time
from pathlib import Path

import cv2
import torch
from ultralytics import YOLO

from utils_video import open_video_source
from config import PERSON_CLASS_ID, OBJECT_CLASS_IDS, VEHICLE_CLASS_IDS

CONFIG = Path("streams/cameras.json")

WIDTH = 640
HEIGHT = 360
DETECT_EVERY = 3
CONF = 0.12
MODEL_NAME = "yolov8n.pt"

DETECT_CLASSES = [0, 2, 3, 5, 7, 24, 26, 28, 63, 67]


def draw_zones(frame):
    h, w = frame.shape[:2]
    x1 = w // 3
    x2 = x1 * 2

    cv2.line(frame, (x1, 0), (x1, h), (255, 255, 255), 2)
    cv2.line(frame, (x2, 0), (x2, h), (255, 255, 255), 2)

    cv2.putText(frame, "LEFT", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
    cv2.putText(frame, "CENTER", (x1 + 20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
    cv2.putText(frame, "RIGHT", (x2 + 20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)


def draw_panel(frame, camera_id, active, vehicles, objects, fps):
    h, w = frame.shape[:2]

    overlay = frame.copy()
    cv2.rectangle(overlay, (15, h - 135), (360, h - 20), (20, 20, 20), -1)
    frame = cv2.addWeighted(overlay, 0.55, frame, 0.45, 0)

    cv2.putText(frame, f"CAMERA: {camera_id}", (30, h - 100),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)

    cv2.putText(frame, f"ACTIVE: {active}", (30, h - 70),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2)

    cv2.putText(frame, f"VEHICLES: {vehicles}  OBJECTS: {objects}", (30, h - 43),
                cv2.FONT_HERSHEY_SIMPLEX, 0.50, (255, 255, 255), 1)

    cv2.putText(frame, f"FPS: {fps:.1f}", (30, h - 20),
                cv2.FONT_HERSHEY_SIMPLEX, 0.50, (0, 150, 255), 1)

    return frame


def process_frame(model, frame, camera_id, frame_i, device):
    frame = cv2.resize(frame, (WIDTH, HEIGHT))

    active = 0
    vehicles = 0
    objects = 0

    if frame_i % DETECT_EVERY == 0:
        results = model.track(
            frame,
            conf=CONF,
            iou=0.35,
            imgsz=640,
            persist=True,
            tracker="bytetrack.yaml",
            verbose=False,
            classes=DETECT_CLASSES,
            device=device,
        )

        for result in results:
            if result.boxes is None:
                continue

            for box in result.boxes:
                cls_id = int(box.cls[0])
                conf = float(box.conf[0])
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                tid = int(box.id[0]) if box.id is not None else None

                if cls_id == PERSON_CLASS_ID:
                    active += 1
                    color = (0, 255, 0)
                    label = f"ID:{tid}" if tid is not None else "Person"

                elif cls_id in VEHICLE_CLASS_IDS:
                    vehicles += 1
                    color = (255, 0, 255)
                    label = VEHICLE_CLASS_IDS[cls_id]

                elif cls_id in OBJECT_CLASS_IDS:
                    objects += 1
                    color = (0, 200, 255)
                    label = OBJECT_CLASS_IDS[cls_id]

                else:
                    continue

                cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                cv2.putText(frame, label, (x1, max(y1 - 8, 20)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1)

    draw_zones(frame)

    return frame, active, vehicles, objects


def main():
    if not CONFIG.exists():
        print("streams/cameras.json topilmadi.")
        return

    with open(CONFIG, "r") as f:
        cameras = json.load(f)

    if len(cameras) == 0:
        print("cameras.json bo‘sh.")
        return

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    print(f"Using device: {device}")

    model = YOLO(MODEL_NAME)

    caps = []

    for cam in cameras:
        print("Opening:", cam["camera_id"])
        cap = open_video_source(cam["url"])
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        caps.append({
            "camera": cam,
            "cap": cap,
            "frame_i": 0,
            "last_fps": time.time(),
            "fps": 0,
            "last_frame": None,
        })

    while True:
        frames = []

        for item in caps:
            cam = item["camera"]
            cap = item["cap"]

            ret, frame = cap.read()

            if not ret:
                print("Frame lost:", cam["camera_id"])
                frame = item["last_frame"]

                if frame is None:
                    frame = 255 * cv2.ones((HEIGHT, WIDTH, 3), dtype="uint8")
                    cv2.putText(frame, f"{cam['camera_id']} offline", (40, 180),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)
            else:
                item["last_frame"] = frame

            for _ in range(2):
                cap.grab()

            now = time.time()
            item["fps"] = 1 / max(now - item["last_fps"], 0.001)
            item["last_fps"] = now

            item["frame_i"] += 1

            processed, active, vehicles, objects = process_frame(
                model,
                frame,
                cam["camera_id"],
                item["frame_i"],
                device,
            )

            processed = draw_panel(
                processed,
                cam["camera_id"],
                active,
                vehicles,
                objects,
                item["fps"],
            )

            frames.append(processed)

        if len(frames) == 1:
            wall = frames[0]

        elif len(frames) == 2:
            wall = cv2.hconcat(frames)

        else:
            rows = []
            for i in range(0, len(frames), 2):
                row_items = frames[i:i + 2]

                if len(row_items) == 1:
                    blank = 255 * cv2.ones_like(row_items[0])
                    row_items.append(blank)

                rows.append(cv2.hconcat(row_items))

            wall = cv2.vconcat(rows)

        cv2.imshow("ASSBI Multi Camera Wall", wall)

        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    for item in caps:
        item["cap"].release()

    cv2.destroyAllWindows()


if __name__ == "__main__":
    import numpy as np
    main()