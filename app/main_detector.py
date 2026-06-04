import argparse
import json
import os
import time
from datetime import datetime
from pathlib import Path

import cv2
import torch
from ultralytics import YOLO, RTDETR

from config import PERSON_CLASS_ID, VEHICLE_CLASS_IDS, OBJECT_CLASS_IDS
from database import (
    init_db,
    get_thresholds,
    insert_minute_analytics,
    insert_incident,
)
from modules.analytics import zone_name, crowd_level, risk_score, data_quality_score
from modules.privacy import blur_people_regions
from modules.abandoned import AbandonedObjectDetector
from modules.trails import TrailManager
from modules.suspicious_behavior import SuspiciousBehaviorDetector
from modules.advanced_ai import (
    weapon_detection_placeholder,
    fire_smoke_detection_placeholder,
    license_plate_recognition_placeholder,
    fight_aggression_detection_placeholder,
)
from utils_video import is_youtube_source, open_video_source, draw_zones, youtube_retry_sleep

BASE_DIR = Path(__file__).resolve().parent.parent
FRAMES_DIR = BASE_DIR / "frames"
FRAMES_DIR.mkdir(exist_ok=True)

os.environ.setdefault(
    "OPENCV_FFMPEG_CAPTURE_OPTIONS",
    "rtsp_transport;tcp|fflags;nobuffer|flags;low_delay|max_delay;500000",
)

DETECT_CLASSES = [0, 2, 3, 5, 7, 24, 26, 28, 63, 67]


def default_model_path():
    settings_path = BASE_DIR / "streams" / "settings.json"
    try:
        settings = json.loads(settings_path.read_text(encoding="utf-8"))
        model_name = Path(str(settings.get("detection_model", "yolov8n.pt"))).name
        custom_model = BASE_DIR / "models" / model_name
        if custom_model.exists():
            return str(custom_model)
        if model_name in {"yolov8n.pt", "yolov8s.pt"}:
            return model_name
    except Exception:
        pass

    deployed_model = BASE_DIR / "models" / "yolov8n.pt"
    if deployed_model.exists():
        return str(deployed_model)

    return "yolov8n.pt"


def is_local_video(url: str):
    return url.lower().endswith((".mp4", ".mov", ".avi", ".mkv"))


def parse_args():
    parser = argparse.ArgumentParser(description="ASSBI Ultra Live Detector")

    parser.add_argument("--url", required=True)
    parser.add_argument("--camera-id", default="cam_01")
    parser.add_argument("--site", default="Default Site")

    parser.add_argument("--model", default=default_model_path())
    parser.add_argument("--conf", type=float, default=0.12)

    parser.add_argument("--log-every", type=int, default=60)
    parser.add_argument("--detect-every", type=int, default=3)
    parser.add_argument("--max-lost-seconds", type=int, default=12)

    parser.add_argument("--privacy-blur", action="store_true")
    parser.add_argument("--show", action="store_true")
    parser.add_argument("--clean-ui", action="store_true")
    parser.add_argument("--save-alerts", action="store_true")
    parser.add_argument("--no-frame-output", action="store_true")

    parser.add_argument("--width", type=int, default=640)
    parser.add_argument("--height", type=int, default=640)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--crop-top-ratio", type=float, default=0.0)

    parser.add_argument("--fast-mode", action="store_true")
    parser.add_argument(
        "--speed-mode",
        default="normal",
        choices=["slow", "normal", "fast"],
    )

    parser.add_argument("--no-trails", action="store_true")
    parser.add_argument("--no-restricted-zone", action="store_true")

    return parser.parse_args()


def load_model(model_name):
    if "rtdetr" in model_name.lower():
        return RTDETR(model_name)
    return YOLO(model_name)


def open_source_with_low_latency(url):
    if is_local_video(url):
        return cv2.VideoCapture(url)

    cap = open_video_source(url)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    cap.set(cv2.CAP_PROP_FPS, 15)
    return cap


def open_source_with_retry(url: str, local_source: bool):
    while True:
        try:
            cap = open_source_with_low_latency(url)
        except Exception as exc:
            retry_sleep = youtube_retry_sleep(exc) if is_youtube_source(url) else 3
            print(f"ERROR: video stream cannot be opened, retrying in {retry_sleep}s: {exc}", flush=True)
            time.sleep(retry_sleep)
            continue

        if cap.isOpened():
            return cap

        retry_sleep = 60 if is_youtube_source(url) else 3
        print(f"ERROR: video stream cannot be opened, retrying in {retry_sleep}s.", flush=True)
        try:
            cap.release()
        except Exception:
            pass
        time.sleep(retry_sleep if not local_source else 1)


def box_area(box):
    x1, y1, x2, y2 = box
    return max(0, x2 - x1) * max(0, y2 - y1)


def box_intersection_ratio(inner, outer):
    ix1 = max(inner[0], outer[0])
    iy1 = max(inner[1], outer[1])
    ix2 = min(inner[2], outer[2])
    iy2 = min(inner[3], outer[3])
    inter = box_area((ix1, iy1, ix2, iy2))
    area = max(box_area(inner), 1)
    return inter / area


def expand_box(box, frame_w, frame_h, ratio=0.08):
    x1, y1, x2, y2 = box
    pad_x = int((x2 - x1) * ratio)
    pad_y = int((y2 - y1) * ratio)
    return (
        max(0, x1 - pad_x),
        max(0, y1 - pad_y),
        min(frame_w - 1, x2 + pad_x),
        min(frame_h - 1, y2 + pad_y),
    )


def filter_person_attached_objects(boxes, frame_w, frame_h):
    person_boxes = [item["xyxy"] for item in boxes if item["cls_id"] == PERSON_CLASS_ID]
    if not person_boxes:
        return boxes

    filtered = []
    for item in boxes:
        cls_id = item["cls_id"]
        if cls_id not in OBJECT_CLASS_IDS:
            filtered.append(item)
            continue

        obj_box = item["xyxy"]
        conf = float(item.get("confidence", 0))
        obj_area = box_area(obj_box)
        attached_to_person = False

        for person_box in person_boxes:
            expanded_person = expand_box(person_box, frame_w, frame_h)
            person_area = max(box_area(person_box), 1)
            overlap = box_intersection_ratio(obj_box, expanded_person)
            area_ratio = obj_area / person_area
            if overlap >= 0.55 or (overlap >= 0.25 and area_ratio <= 0.35):
                attached_to_person = True
                break

        if attached_to_person and cls_id in {24, 26, 28}:
            continue
        if attached_to_person and cls_id in {63, 67} and conf < 0.55:
            continue

        filtered.append(item)

    return filtered


def save_latest_frame(frame, camera_id):
    final_path = FRAMES_DIR / f"{camera_id}.jpg"
    temp_path = FRAMES_DIR / f"{camera_id}_{os.getpid()}_tmp.jpg"

    ok = cv2.imwrite(str(temp_path), frame, [int(cv2.IMWRITE_JPEG_QUALITY), 78])

    if ok:
        temp_path.replace(final_path)


def save_latest_boxes(boxes, camera_id):
    final_path = FRAMES_DIR / f"{camera_id}_boxes.json"
    temp_path = FRAMES_DIR / f"{camera_id}_boxes_{os.getpid()}_tmp.json"
    payload = {
        "timestamp": time.time(),
        "boxes": [
            {
                "cls_id": int(item["cls_id"]),
                "confidence": float(item["confidence"]),
                "xyxy": [int(value) for value in item["xyxy"]],
                "track_id": item["track_id"],
            }
            for item in boxes
        ],
    }
    temp_path.write_text(json.dumps(payload), encoding="utf-8")
    temp_path.replace(final_path)


def draw_panel(
    frame,
    args,
    active_people,
    total_unique,
    laptop_count,
    phone_count,
    vehicle_count,
    object_count,
    risk,
    fps,
    quality,
    device,
):
    h, _ = frame.shape[:2]
    overlay = frame.copy()

    cv2.rectangle(overlay, (15, h - 245), (700, h - 20), (20, 20, 20), -1)
    frame = cv2.addWeighted(overlay, 0.55, frame, 0.45, 0)

    cv2.putText(frame, f"CAMERA: {args.camera_id}", (35, h - 205), cv2.FONT_HERSHEY_SIMPLEX, 0.66, (0, 255, 255), 2)
    cv2.putText(frame, f"ACTIVE: {active_people}  UNIQUE: {total_unique}", (35, h - 172), cv2.FONT_HERSHEY_SIMPLEX, 0.60, (255, 255, 255), 2)
    cv2.putText(frame, f"LAPTOPS: {laptop_count}  PHONES: {phone_count}", (35, h - 139), cv2.FONT_HERSHEY_SIMPLEX, 0.60, (255, 255, 255), 2)
    cv2.putText(frame, f"VEHICLES: {vehicle_count}  OBJECTS: {object_count}", (35, h - 106), cv2.FONT_HERSHEY_SIMPLEX, 0.60, (255, 255, 255), 2)
    cv2.putText(frame, f"RISK: {risk}%  FPS: {fps:.1f}  QUALITY: {quality}%", (35, h - 42), cv2.FONT_HERSHEY_SIMPLEX, 0.60, (0, 100, 255), 2)
    cv2.putText(frame, f"DEVICE: {device}  MODEL: {args.model}", (35, h - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (180, 180, 180), 1)

    return frame


def reset_local_video_clock():
    return time.time(), 0.0


def pace_local_video(cap, video_start_wall, video_start_msec, speed_mode):
    current_msec = cap.get(cv2.CAP_PROP_POS_MSEC)

    if current_msec < 0:
        return

    speed_multiplier = {
        "slow": 0.35,
        "normal": 1.0,
        "fast": 1.7,
    }.get(speed_mode, 1.0)

    expected_time = ((current_msec - video_start_msec) / 1000.0) / speed_multiplier
    actual_time = time.time() - video_start_wall
    sleep_time = expected_time - actual_time

    if 0 < sleep_time < 5:
        time.sleep(sleep_time)


def main():
    args = parse_args()
    local_source = is_local_video(args.url)

    if args.fast_mode and not local_source:
        args.model = "yolov8n.pt"
        args.detect_every = max(args.detect_every, 4)
        args.width = min(args.width, 640)
        args.height = min(args.height, 640)
        args.clean_ui = True
        args.no_trails = True

    if local_source:
        args.clean_ui = True
        args.detect_every = max(args.detect_every, 3)
        args.max_lost_seconds = min(args.max_lost_seconds, 8)

    init_db()
    thresholds = get_thresholds()

    cv2.setUseOptimized(True)

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    print(f"Using device: {device}")
    print(f"Source type: {'local video' if local_source else 'live/stream'}")
    print(f"Speed mode: {args.speed_mode}")

    model = load_model(args.model)
    try:
        model.fuse()
    except Exception:
        pass
    cap = open_source_with_retry(args.url, local_source)

    video_start_wall, video_start_msec = reset_local_video_clock()

    abandoned = AbandonedObjectDetector()
    trails = TrailManager()
    suspicious = SuspiciousBehaviorDetector(thresholds["suspicious_seconds"])

    frame_index = 0
    last_log = 0
    last_fps = time.time()

    latest_boxes = []
    active_tracks = {}

    total_unique_count = 0
    new_unique_count = 0

    print("ASSBI Ultra detector started. Press q to stop.")

    while True:
        if not local_source:
            for _ in range(3 if args.fast_mode else 1):
                cap.grab()

        ret, frame = cap.read()

        if not ret:
            print("Frame lost or video ended. Restarting source...")
            cap.release()

            if local_source:
                time.sleep(0.2)
                cap = cv2.VideoCapture(args.url)
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                video_start_wall, video_start_msec = reset_local_video_clock()
            else:
                cap = open_source_with_retry(args.url, local_source)

            continue

        if local_source:
            pace_local_video(
                cap,
                video_start_wall,
                video_start_msec,
                args.speed_mode,
            )

        if args.crop_top_ratio > 0:
            crop_pixels = int(frame.shape[0] * min(max(args.crop_top_ratio, 0.0), 0.4))
            if 0 < crop_pixels < frame.shape[0] - 40:
                frame = frame[crop_pixels:, :]

        frame = cv2.resize(frame, (args.width, args.height))

        now = time.time()
        dt = datetime.now()
        timestamp = dt.strftime("%Y-%m-%d %H:%M:%S")

        fps = 1 / max(now - last_fps, 0.001)
        last_fps = now

        h, w = frame.shape[:2]
        frame_index += 1

        vehicle_count = 0
        object_count = 0
        laptop_count = 0
        phone_count = 0

        left_zone = 0
        center_zone = 0
        right_zone = 0

        person_count = 0

        if frame_index % args.detect_every == 0:
            latest_boxes = []

            inference_args = {
                "conf": args.conf,
                "iou": 0.35,
                "imgsz": args.imgsz,
                "verbose": False,
                "classes": DETECT_CLASSES,
                "device": device,
            }
            if args.fast_mode:
                results = model.predict(frame, **inference_args)
            else:
                results = model.track(
                    frame,
                    persist=True,
                    tracker="bytetrack.yaml",
                    **inference_args,
                )

            for result in results:
                if result.boxes is None:
                    continue

                for box in result.boxes:
                    cls_id = int(box.cls[0])
                    conf = float(box.conf[0])
                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    track_id = int(box.id[0]) if box.id is not None else None
                    if track_id is None and cls_id == PERSON_CLASS_ID:
                        track_id = hash((round(x1 / 20), round(y1 / 20), round(x2 / 20), round(y2 / 20)))

                    latest_boxes.append({
                        "cls_id": cls_id,
                        "confidence": conf,
                        "xyxy": (x1, y1, x2, y2),
                        "track_id": track_id,
                    })

            latest_boxes = filter_person_attached_objects(latest_boxes, w, h)
            save_latest_boxes(latest_boxes, args.camera_id)

        active_tracks = {
            tid: seen_time
            for tid, seen_time in active_tracks.items()
            if tid is not None and now - seen_time <= args.max_lost_seconds
        }

        for item in latest_boxes:
            cls_id = item["cls_id"]
            x1, y1, x2, y2 = item["xyxy"]
            track_id = item["track_id"]

            cx = int((x1 + x2) / 2)
            zone = zone_name(cx, w)

            if cls_id == PERSON_CLASS_ID:
                person_count += 1
                if track_id is not None:
                    active_tracks[track_id] = now

                if zone == "LEFT":
                    left_zone += 1
                elif zone == "CENTER":
                    center_zone += 1
                else:
                    right_zone += 1

            elif cls_id in VEHICLE_CLASS_IDS:
                vehicle_count += 1

            elif cls_id in OBJECT_CLASS_IDS:
                object_count += 1

                if cls_id == 63:
                    laptop_count += 1
                elif cls_id == 67:
                    phone_count += 1

        # Keep live occupancy exact and grow visitor totals only when occupancy rises.
        active_people = person_count
        active_delta = max(0, active_people - total_unique_count)
        if active_delta:
            total_unique_count += active_delta
            new_unique_count += active_delta

        zone_peak = max(left_zone, center_zone, right_zone)
        level = crowd_level(active_people, thresholds)

        risk = risk_score(
            active_people,
            vehicle_count,
            object_count,
            zone_peak,
            thresholds,
        )

        quality = data_quality_score(True, fps, len(latest_boxes))

        for msg in abandoned.update([], now):
            insert_incident(timestamp, args.camera_id, args.site, "Abandoned Object", "HIGH", msg)

        for msg in weapon_detection_placeholder(latest_boxes):
            insert_incident(timestamp, args.camera_id, args.site, "Weapon Detection", "HIGH", msg)

        for msg in fire_smoke_detection_placeholder(frame):
            insert_incident(timestamp, args.camera_id, args.site, "Fire/Smoke", "HIGH", msg)

        for msg in fight_aggression_detection_placeholder(frame):
            insert_incident(timestamp, args.camera_id, args.site, "Aggression", "HIGH", msg)

        license_plate_recognition_placeholder(frame)

        if now - last_log >= args.log_every:
            row = {
                "timestamp": timestamp,
                "date": dt.strftime("%Y-%m-%d"),
                "hour": dt.hour,
                "minute": dt.minute,
                "camera_id": args.camera_id,
                "site": args.site,
                "active_people": active_people,
                "new_unique_people": new_unique_count,
                "total_unique_people": total_unique_count,
                "vehicle_count": vehicle_count,
                "object_count": object_count,
                "laptop_count": laptop_count,
                "phone_count": phone_count,
                "left_zone": left_zone,
                "center_zone": center_zone,
                "right_zone": right_zone,
                "standing_count": 0,
                "sitting_count": 0,
                "crowd_level": level,
                "risk_score": risk,
                "fps": round(fps, 2),
                "data_quality_score": quality,
            }

            insert_minute_analytics(row)

            print(
                f"[{timestamp}] "
                f"active={active_people}, "
                f"total={total_unique_count}, "
                f"risk={risk}, "
                f"fps={fps:.1f}, "
                f"speed={args.speed_mode}"
            )

            new_unique_count = 0
            last_log = now

        display_frame = frame.copy()

        if args.privacy_blur:
            display_frame = blur_people_regions(display_frame, latest_boxes)

        draw_zones(display_frame)

        for item in latest_boxes:
            x1, y1, x2, y2 = item["xyxy"]
            cls_id = item["cls_id"]

            color = (0, 255, 0)

            if cls_id in VEHICLE_CLASS_IDS:
                color = (255, 0, 255)
            elif cls_id in OBJECT_CLASS_IDS:
                color = (0, 200, 255)

            cv2.rectangle(display_frame, (x1, y1), (x2, y2), color, 2)

        if not args.clean_ui:
            display_frame = draw_panel(
                display_frame,
                args,
                active_people,
                total_unique_count,
                laptop_count,
                phone_count,
                vehicle_count,
                object_count,
                risk,
                fps,
                quality,
                device,
            )

        if not args.no_frame_output:
            save_latest_frame(display_frame, args.camera_id)

        if args.show:
            cv2.imshow("ASSBI Ultra", display_frame)

            if cv2.waitKey(1) & 0xFF == ord("q"):
                break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
