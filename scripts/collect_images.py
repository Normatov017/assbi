#!/usr/bin/env python3
"""Collect raw images from a live camera/source for YOLO fine-tuning.

Examples:
  python scripts/collect_images.py --source https://normatov.uz/api/frame/youtube_youtube_camera --count 300 --interval 1
  python scripts/collect_images.py --source "https://www.youtube.com/live/..." --count 300 --interval 1
  python scripts/collect_images.py --source rtsp://user:pass@host:554/stream1 --count 300 --interval 1
"""

import argparse
import hashlib
import json
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

import cv2
import requests

try:
    from app.utils_video import get_youtube_stream_url, is_youtube_source, youtube_retry_sleep
except ModuleNotFoundError:
    import sys
    sys.path.append(str(Path(__file__).resolve().parents[1] / "app"))
    from utils_video import get_youtube_stream_url, is_youtube_source, youtube_retry_sleep


VIDEO_SUFFIXES = (".mp4", ".mov", ".avi", ".mkv", ".webm")


def is_snapshot_source(source: str) -> bool:
    lowered = source.lower()
    parsed = urlparse(source)
    return (
        lowered.endswith((".jpg", ".jpeg", ".png"))
        or "/api/frame/" in parsed.path
        or "/snapshot/" in parsed.path
    )


def open_capture(source: str):
    if is_youtube_source(source):
        source = get_youtube_stream_url(source)
    return cv2.VideoCapture(source, cv2.CAP_FFMPEG)


def open_capture_with_retry(source: str):
    while True:
        try:
            cap = open_capture(source)
            if cap.isOpened():
                return cap
            try:
                cap.release()
            except Exception:
                pass
            retry_sleep = 60 if is_youtube_source(source) else 2
            print(f"source ochilmadi, {retry_sleep}s dan keyin qayta urinadi", flush=True)
            time.sleep(retry_sleep)
        except Exception as exc:
            retry_sleep = youtube_retry_sleep(exc) if is_youtube_source(source) else 2
            print(f"source ochilmadi, {retry_sleep}s kutadi: {exc}", flush=True)
            time.sleep(retry_sleep)


def fetch_snapshot(source: str, timeout: float = 8.0):
    parsed = urlparse(source)
    if parsed.scheme in {"", "file"}:
        path = Path(parsed.path if parsed.scheme == "file" else source)
        data = path.read_bytes()
    else:
        response = requests.get(source, timeout=timeout, headers={"Cache-Control": "no-cache"})
        response.raise_for_status()
        data = response.content

    array = cv2.imdecode(__import__("numpy").frombuffer(data, dtype=__import__("numpy").uint8), cv2.IMREAD_COLOR)
    if array is None:
        raise RuntimeError("Snapshot response is not an image")
    return array, data


def frame_hash(frame) -> str:
    small = cv2.resize(frame, (96, 54))
    return hashlib.sha1(small.tobytes()).hexdigest()


def save_frame(frame, raw_bytes: bytes | None, output_dir: Path, prefix: str, index: int, quality: int) -> Path:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]
    path = output_dir / f"{prefix}_{index:04d}_{timestamp}.jpg"
    if raw_bytes and path.suffix.lower() in {".jpg", ".jpeg"}:
        path.write_bytes(raw_bytes)
    else:
        ok = cv2.imwrite(str(path), frame, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
        if not ok:
            raise RuntimeError(f"Could not write {path}")
    return path


def main():
    parser = argparse.ArgumentParser(description="Collect raw images for YOLO/Roboflow dataset")
    parser.add_argument("--source", required=True, help="YouTube/RTSP/local video path or image snapshot URL")
    parser.add_argument("--output", default="datasets/raw/kabukicho_live/images", help="Output image directory")
    parser.add_argument("--prefix", default="kabukicho", help="Filename prefix")
    parser.add_argument("--count", type=int, default=300)
    parser.add_argument("--interval", type=float, default=1.0, help="Seconds between saved images")
    parser.add_argument("--quality", type=int, default=92)
    parser.add_argument("--dedupe-window", type=int, default=12, help="Skip frame hashes seen recently")
    parser.add_argument("--max-grabs", type=int, default=3, help="Drop buffered video frames before saving")
    args = parser.parse_args()

    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)
    metadata_path = output_dir.parent / "metadata.jsonl"
    manifest_path = output_dir.parent / "collection_manifest.json"

    manifest = {
        "source": args.source,
        "output_dir": str(output_dir),
        "target_count": args.count,
        "interval_seconds": args.interval,
        "started_at": datetime.now().isoformat(timespec="seconds"),
        "status": "running",
    }
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    snapshot_mode = is_snapshot_source(args.source)
    cap = None if snapshot_mode else open_capture_with_retry(args.source)

    saved = 0
    attempts = 0
    recent_hashes: list[str] = []
    started = time.time()

    try:
        while saved < args.count:
            attempts += 1
            raw_bytes = None

            if snapshot_mode:
                frame, raw_bytes = fetch_snapshot(args.source)
            else:
                for _ in range(max(0, args.max_grabs)):
                    cap.grab()
                ok, frame = cap.read()
                if not ok or frame is None:
                    if cap is not None:
                        cap.release()
                    cap = open_capture_with_retry(args.source)
                    continue

            digest = frame_hash(frame)
            if digest in recent_hashes:
                time.sleep(max(args.interval, 0.1))
                continue

            recent_hashes.append(digest)
            recent_hashes = recent_hashes[-max(1, args.dedupe_window):]

            saved += 1
            image_path = save_frame(frame, raw_bytes, output_dir, args.prefix, saved, args.quality)
            record = {
                "image": str(image_path),
                "source": args.source,
                "captured_at": datetime.now().isoformat(timespec="seconds"),
                "width": int(frame.shape[1]),
                "height": int(frame.shape[0]),
                "index": saved,
                "attempt": attempts,
                "sha1_small": digest,
            }
            with metadata_path.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(record, ensure_ascii=False) + "\n")
            print(f"saved {saved}/{args.count}: {image_path}", flush=True)
            time.sleep(max(args.interval, 0.1))
    finally:
        if cap is not None:
            cap.release()
        manifest.update({
            "status": "complete" if saved >= args.count else "stopped",
            "saved_count": saved,
            "attempts": attempts,
            "finished_at": datetime.now().isoformat(timespec="seconds"),
            "duration_seconds": round(time.time() - started, 2),
            "metadata": str(metadata_path),
        })
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
