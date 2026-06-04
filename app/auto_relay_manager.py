import argparse
import json
import os
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

import requests


BASE_DIR = Path(__file__).resolve().parent.parent
FRAMES_DIR = BASE_DIR / "frames"
LOGS_DIR = BASE_DIR / "logs"
SETTINGS_FILE = BASE_DIR / "streams" / "settings.json"
MODELS_DIR = BASE_DIR / "models"

FRAMES_DIR.mkdir(exist_ok=True)
LOGS_DIR.mkdir(exist_ok=True)


class ManagedCamera:
    def __init__(self, key, procs, logs):
        self.key = key
        self.procs = procs
        self.logs = logs

    def alive(self):
        return all(proc.poll() is None for proc in self.procs)

    def stop(self):
        for proc in self.procs:
            if proc.poll() is None:
                proc.terminate()

        deadline = time.time() + 8
        for proc in self.procs:
            while proc.poll() is None and time.time() < deadline:
                time.sleep(0.1)
            if proc.poll() is None:
                proc.kill()

        for handle in self.logs:
            try:
                handle.close()
            except Exception:
                pass




def rtsp_reachable(url: str, timeout: float = 1.5) -> bool:
    try:
        parsed = urlparse(url)
        host = parsed.hostname
        port = parsed.port or 554
        if not host:
            return False
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def selected_model_path():
    try:
        settings = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
        model_name = Path(str(settings.get("detection_model", "yolov8n.pt"))).name
        custom_model = MODELS_DIR / model_name
        if custom_model.exists():
            return str(custom_model)
        if model_name in {"yolov8n.pt", "yolov8s.pt"}:
            return model_name
    except Exception:
        pass
    return "yolov8n.pt"


def source_supported(camera):
    url = str(camera.get("url") or "").strip()
    cam_type = str(camera.get("type") or "").lower()
    if not url:
        return False

    if "youtube" in cam_type or "youtube.com" in url or "youtu.be" in url:
        return True
    if url.startswith("rtsp://"):
        return rtsp_reachable(url)
    if url.startswith(("http://", "https://", "tcp://")):
        return True
    if url.lower().endswith((".mp4", ".mov", ".avi", ".mkv", ".webm")):
        return Path(url).exists()

    return False


def camera_key(camera):
    return "|".join(
        [
            str(camera.get("camera_id") or ""),
            str(camera.get("url") or ""),
            str(camera.get("site") or ""),
            str(camera.get("type") or ""),
        ]
    )


def cleanup_stale_files(camera_id):
    for suffix in [".jpg", "_boxes.json"]:
        try:
            (FRAMES_DIR / f"{camera_id}{suffix}").unlink(missing_ok=True)
        except Exception:
            pass


def open_log(camera_id, name):
    return open(LOGS_DIR / f"{camera_id}_{name}.log", "a", encoding="utf-8")


def start_camera(camera, api_url, env):
    camera_id = str(camera.get("camera_id") or "").strip()
    site = str(camera.get("site") or camera_id).strip() or camera_id
    url = str(camera.get("url") or "").strip()
    cam_type = str(camera.get("type") or "relay").strip() or "relay"
    is_rtsp = url.lower().startswith("rtsp://")
    grabber_interval = "0.05" if is_rtsp else "0.08"
    grabber_width = "960" if is_rtsp else "640"
    grabber_height = "540" if is_rtsp else "360"
    relay_interval = "0.08" if is_rtsp else "0.12"
    detect_every = "8" if is_rtsp else "12"

    cleanup_stale_files(camera_id)

    detector_log = open_log(camera_id, "detector")
    grabber_log = open_log(camera_id, "grabber")
    relay_log = open_log(camera_id, "relay")

    detector_cmd = [
        sys.executable,
        str(BASE_DIR / "app" / "main_detector.py"),
        "--url",
        url,
        "--camera-id",
        camera_id,
        "--site",
        site,
        "--clean-ui",
        "--speed-mode",
        str(camera.get("speed_mode") or "normal"),
        "--model",
        selected_model_path(),
        "--conf",
        "0.05",
        "--width",
        "640",
        "--height",
        "360",
        "--imgsz",
        "640",
        "--detect-every",
        detect_every,
        "--log-every",
        "1",
        "--max-lost-seconds",
        "20",
    ]

    grabber_cmd = [
        sys.executable,
        str(BASE_DIR / "app" / "frame_grabber.py"),
        "--url",
        url,
        "--camera-id",
        camera_id,
        "--site",
        site,
        "--width",
        grabber_width,
        "--height",
        grabber_height,
        "--interval",
        grabber_interval,
    ]
    if is_rtsp:
        grabber_cmd.extend(["--crop-top-ratio", "0.20"])

    relay_cmd = [
        sys.executable,
        str(BASE_DIR / "app" / "relay_camera_to_api.py"),
        "--api-url",
        api_url,
        "--camera-id",
        camera_id,
        "--site",
        site,
        "--source-url",
        url,
        "--camera-type",
        cam_type,
        "--interval",
        relay_interval,
    ]

    procs = [
        subprocess.Popen(detector_cmd, cwd=str(BASE_DIR), env=env, stdout=detector_log, stderr=detector_log),
        subprocess.Popen(grabber_cmd, cwd=str(BASE_DIR), env=env, stdout=grabber_log, stderr=grabber_log),
        subprocess.Popen(relay_cmd, cwd=str(BASE_DIR), env=env, stdout=relay_log, stderr=relay_log),
    ]

    print(f"[ASSBI auto relay] started {camera_id}: {url}", flush=True)
    return ManagedCamera(camera_key(camera), procs, [detector_log, grabber_log, relay_log])


def fetch_cameras(api_url):
    response = requests.get(api_url.rstrip("/") + "/api/relay/cameras", timeout=10)
    if response.status_code == 404:
        response = requests.get(api_url.rstrip("/") + "/api/cameras", timeout=10)
    response.raise_for_status()
    return response.json()


def main():
    parser = argparse.ArgumentParser(description="Automatically relay configured cameras to ASSBI API")
    parser.add_argument("--api-url", default="http://13.60.80.234")
    parser.add_argument("--poll-interval", type=float, default=8.0)
    args = parser.parse_args()

    env = os.environ.copy()
    env.setdefault("MPLCONFIGDIR", "/private/tmp/matplotlib")
    env.setdefault("YOUTUBE_COOKIES_FILE", str(BASE_DIR / "streams" / "youtube_cookies.txt"))

    allowed_types_raw = os.getenv("ASSBI_RELAY_TYPES", "").strip()
    allowed_types = {item.strip().lower() for item in allowed_types_raw.split(",") if item.strip()}
    allowed_ids_raw = os.getenv("ASSBI_RELAY_CAMERA_IDS", "").strip()
    allowed_ids = {item.strip() for item in allowed_ids_raw.split(",") if item.strip()}

    managed = {}
    stopping = False

    def handle_stop(signum, frame):
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGINT, handle_stop)
    signal.signal(signal.SIGTERM, handle_stop)

    print(f"[ASSBI auto relay] watching {args.api_url}", flush=True)

    while not stopping:
        try:
            cameras = fetch_cameras(args.api_url)
            wanted = {}
            for camera in cameras:
                camera_id = str(camera.get("camera_id") or "").strip()
                camera_type = str(camera.get("type") or "").lower()
                if allowed_types and camera_type not in allowed_types:
                    continue
                if allowed_ids and camera_id not in allowed_ids:
                    continue
                if not camera_id or camera.get("enabled") is False or not source_supported(camera):
                    continue
                wanted[camera_id] = camera

            for camera_id, managed_camera in list(managed.items()):
                camera = wanted.get(camera_id)
                if not camera or managed_camera.key != camera_key(camera) or not managed_camera.alive():
                    managed_camera.stop()
                    managed.pop(camera_id, None)

            for camera_id, camera in wanted.items():
                if camera_id not in managed:
                    managed[camera_id] = start_camera(camera, args.api_url.rstrip("/"), env)

        except Exception as exc:
            print(f"[ASSBI auto relay] sync failed: {exc}", flush=True)

        time.sleep(args.poll_interval)

    for managed_camera in managed.values():
        managed_camera.stop()


if __name__ == "__main__":
    main()
