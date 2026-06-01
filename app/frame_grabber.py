import argparse
import json
import os
import time
from datetime import datetime
from pathlib import Path

import cv2
import yt_dlp

from utils_video import youtube_cookie_options, youtube_extractor_args


BASE_DIR = Path(__file__).resolve().parent.parent
FRAMES_DIR = BASE_DIR / "frames"
FRAMES_DIR.mkdir(exist_ok=True)

PERSON_CLASS_ID = 0
VEHICLE_CLASS_IDS = {2, 3, 5, 7}
OBJECT_CLASS_IDS = {24, 26, 28, 63, 67}


def get_stream_url(url: str) -> str:
    if "youtube.com" not in url and "youtu.be" not in url:
        return url

    options = {
        "format": "best[ext=mp4]/best",
        "quiet": True,
        "no_warnings": True,
        "extractor_args": youtube_extractor_args(),
        **youtube_cookie_options(),
    }

    with yt_dlp.YoutubeDL(options) as ydl:
        info = ydl.extract_info(url, download=False)
        if info.get("url"):
            return info["url"]

        formats = [
            item
            for item in info.get("formats", [])
            if item.get("url") and item.get("vcodec") != "none"
        ]
        if not formats:
            raise RuntimeError("Stream URL not found")

        return formats[-1]["url"]


def save_frame(frame, camera_id: str) -> None:
    final_path = FRAMES_DIR / f"{camera_id}.jpg"
    temp_path = FRAMES_DIR / f"{camera_id}_{os.getpid()}_tmp.jpg"
    cv2.imwrite(str(temp_path), frame, [int(cv2.IMWRITE_JPEG_QUALITY), 82])
    temp_path.replace(final_path)


def load_recent_boxes(camera_id: str, max_age: float = 8.0):
    path = FRAMES_DIR / f"{camera_id}_boxes.json"
    if not path.exists():
        return []

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return []

    if time.time() - float(payload.get("timestamp", 0)) > max_age:
        return []

    return payload.get("boxes", [])


def draw_detection_boxes(frame, boxes):
    for item in boxes:
        try:
            x1, y1, x2, y2 = [int(value) for value in item["xyxy"]]
            cls_id = int(item.get("cls_id", -1))
            confidence = float(item.get("confidence", 0))
        except Exception:
            continue

        color = (0, 255, 0)
        label = "person"
        if cls_id in VEHICLE_CLASS_IDS:
            color = (255, 0, 255)
            label = "vehicle"
        elif cls_id in OBJECT_CLASS_IDS:
            color = (0, 200, 255)
            label = "object"

        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
        caption = f"{label} {confidence:.2f}"
        cv2.rectangle(frame, (x1, max(0, y1 - 24)), (x1 + 118, y1), color, -1)
        cv2.putText(
            frame,
            caption,
            (x1 + 5, max(16, y1 - 7)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (0, 0, 0),
            2,
        )

    return frame


def annotate(frame, camera_id: str, site: str):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cv2.rectangle(frame, (0, 0), (frame.shape[1], 48), (0, 0, 0), -1)
    cv2.putText(
        frame,
        f"{site or camera_id}  LIVE  {timestamp}",
        (16, 31),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.65,
        (255, 255, 255),
        2,
    )
    return frame


def main() -> None:
    parser = argparse.ArgumentParser(description="ASSBI lightweight frame grabber")
    parser.add_argument("--url", required=True)
    parser.add_argument("--camera-id", required=True)
    parser.add_argument("--site", default="")
    parser.add_argument("--width", type=int, default=640)
    parser.add_argument("--height", type=int, default=360)
    parser.add_argument("--interval", type=float, default=1.0)
    args = parser.parse_args()

    while True:
        try:
            stream_url = get_stream_url(args.url)
            cap = cv2.VideoCapture(stream_url)

            if not cap.isOpened():
                raise RuntimeError("Video source could not be opened")

            while True:
                ok, frame = cap.read()
                if not ok or frame is None:
                    raise RuntimeError("Video frame could not be read")

                frame = cv2.resize(frame, (args.width, args.height))
                frame = draw_detection_boxes(frame, load_recent_boxes(args.camera_id))
                save_frame(annotate(frame, args.camera_id, args.site), args.camera_id)
                time.sleep(args.interval)
        except Exception as exc:
            print(f"[ASSBI] frame_grabber retrying: {exc}", flush=True)
            time.sleep(10)
        finally:
            try:
                cap.release()
            except Exception:
                pass


if __name__ == "__main__":
    main()
