import base64
import hashlib
import hmac
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import time
import zipfile
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import cv2
import numpy as np
import pandas as pd
from fastapi import FastAPI, File, Form, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse
from pydantic import BaseModel
from ultralytics import YOLO

from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.charts.piecharts import Pie
from reportlab.graphics.shapes import Drawing, String
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

try:
    from app.config import DB_PATH
    from app.database import init_db, get_thresholds, insert_minute_analytics, update_threshold, audit
except ModuleNotFoundError:
    from config import DB_PATH
    from database import init_db, get_thresholds, insert_minute_analytics, update_threshold, audit


BASE_DIR = Path(__file__).resolve().parent.parent
FRAMES_DIR = BASE_DIR / "frames"
STREAMS_DIR = BASE_DIR / "streams"
UPLOADS_DIR = STREAMS_DIR / "uploads"
EXPORTS_DIR = BASE_DIR / "exports"
LOGS_DIR = BASE_DIR / "logs"
CAMERAS_FILE = STREAMS_DIR / "cameras.json"
SETTINGS_FILE = STREAMS_DIR / "settings.json"
MODELS_DIR = BASE_DIR / "models"
TRAINING_DIR = BASE_DIR / "training"
CUSTOM_DATASET_DIR = BASE_DIR / "datasets" / "custom_assbi_yolo"
TRAINING_STATUS_FILE = TRAINING_DIR / "ui_training_status.json"
TRAINING_LOG_FILE = LOGS_DIR / "fine_tuning_train.log"
COLLECTION_DIR = BASE_DIR / "datasets" / "raw" / "ui_collection"
COLLECTION_IMAGES_DIR = COLLECTION_DIR / "images"
COLLECTION_STATUS_FILE = TRAINING_DIR / "ui_collection_status.json"
COLLECTION_LOG_FILE = LOGS_DIR / "fine_tuning_collect.log"
TEST_OUTPUT_DIR = EXPORTS_DIR / "fine_tuning_tests"
FRAME_STALE_SECONDS = 30

FRAMES_DIR.mkdir(exist_ok=True)
STREAMS_DIR.mkdir(exist_ok=True)
UPLOADS_DIR.mkdir(exist_ok=True)
EXPORTS_DIR.mkdir(exist_ok=True)
LOGS_DIR.mkdir(exist_ok=True)
MODELS_DIR.mkdir(exist_ok=True)
TRAINING_DIR.mkdir(exist_ok=True)
TEST_OUTPUT_DIR.mkdir(exist_ok=True)

app = FastAPI(title="ASSBI Ultra API", version="3.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

RUNNING_PROCESSES: dict[str, Any] = {}
LAST_INGEST_FRAME_AT: dict[str, float] = {}
LAST_INGEST_ANALYTICS_AT: dict[str, float] = {}
FINE_TUNING_TRAIN_PROCESS: Optional[subprocess.Popen] = None
FINE_TUNING_COLLECT_PROCESS: Optional[subprocess.Popen] = None

DEFAULT_SETTINGS = {
    "max_people": 50,
    "risk_threshold": 70,
    "detection_confidence": 0.5,
    "suspicious_seconds": 120,
    "auto_recording": True,
    "privacy_blur": False,
    "gdpr_mode": True,
    "face_blur": False,
    "two_factor": True,
    "ip_whitelist": False,
    "detection_model": "yolov8n",
    "openai_api_key": "",
}


class ChatRequest(BaseModel):
    message: str


class LoginRequest(BaseModel):
    email: str
    password: str
    role: Optional[str] = None
    remember_me: Optional[bool] = True


class CameraPayload(BaseModel):
    camera_id: Optional[str] = None
    site: Optional[str] = None
    url: str
    type: Optional[str] = "youtube"
    speed_mode: Optional[str] = "normal"
    enabled: Optional[bool] = True


class IncidentWorkflowPayload(BaseModel):
    status: Optional[str] = None
    assigned_to: Optional[str] = None
    operator_note: Optional[str] = None


class ModelSelectionPayload(BaseModel):
    model: str


class TrainingStartPayload(BaseModel):
    data: str = "datasets/custom_assbi_yolo/data.yaml"
    model: str = "yolov8n.pt"
    epochs: int = 10
    imgsz: int = 640
    batch: int = 1
    name: str = "assbi_custom_person_vehicle_object"


class ImageCollectionPayload(BaseModel):
    source: str
    count: int = 500
    interval: float = 1.0
    prefix: str = "assbi"


DEFAULT_USERS = {
    "admin@assbi.com": {
        "password": "admin123",
        "name": "Admin User",
        "role": "Administrator",
    },
    "security@assbi.com": {
        "password": "security123",
        "name": "Security Officer",
        "role": "Security Officer",
    },
    "analyst@assbi.com": {
        "password": "analyst123",
        "name": "BI Analyst",
        "role": "BI Analyst",
    },
    "manager@assbi.com": {
        "password": "manager123",
        "name": "Manager",
        "role": "Manager",
    },
}


ROLE_PERMISSIONS = {
    "Administrator": {"view", "manage_cameras", "manage_settings", "manage_incidents", "export", "audit", "compliance"},
    "Security Officer": {"view", "manage_cameras", "manage_incidents", "export", "audit", "compliance"},
    "BI Analyst": {"view", "export", "audit", "compliance"},
    "Manager": {"view", "export", "compliance"},
    "Viewer": {"view"},
    "User": {"view"},
}


SESSION_COOKIE = "assbi_session"
AUTH_SECRET = os.getenv("ASSBI_AUTH_SECRET", "assbi-local-session-secret-change-me")


def load_auth_users() -> dict[str, dict[str, str]]:
    raw_users = os.getenv("ASSBI_USERS_JSON", "")
    if not raw_users:
        return DEFAULT_USERS

    try:
        users = json.loads(raw_users)
        if isinstance(users, dict):
            return users
    except Exception:
        pass

    return DEFAULT_USERS


def b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def b64url_decode(data: str) -> bytes:
    padded = data + "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(padded.encode("ascii"))


def sign_payload(payload: str) -> str:
    digest = hmac.new(AUTH_SECRET.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).digest()
    return b64url_encode(digest)


def create_session_token(email: str, max_age_seconds: int) -> str:
    users = load_auth_users()
    user = users[email]
    payload = {
        "email": email,
        "name": user.get("name", email.split("@")[0]),
        "role": user.get("role", "User"),
        "exp": int(time.time()) + max_age_seconds,
    }
    encoded_payload = b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    return f"{encoded_payload}.{sign_payload(encoded_payload)}"


def verify_session_token(token: str) -> Optional[dict[str, Any]]:
    if not token or "." not in token:
        return None

    payload_part, signature = token.rsplit(".", 1)
    if not hmac.compare_digest(sign_payload(payload_part), signature):
        return None

    try:
        payload = json.loads(b64url_decode(payload_part).decode("utf-8"))
    except Exception:
        return None

    if safe_int(payload.get("exp", 0)) < int(time.time()):
        return None

    email = safe_str(payload.get("email", "")).lower()
    if email not in load_auth_users():
        return None

    return {
        "email": email,
        "name": safe_str(payload.get("name"), email.split("@")[0]),
        "role": safe_str(payload.get("role"), "User"),
    }


def request_user(request: Request) -> Optional[dict[str, Any]]:
    token = request.cookies.get(SESSION_COOKIE, "")
    auth_header = request.headers.get("authorization", "")

    if auth_header.lower().startswith("bearer "):
        token = auth_header.split(" ", 1)[1].strip()

    return verify_session_token(token)


def auth_required_response() -> JSONResponse:
    return JSONResponse({"ok": False, "message": "Authentication required"}, status_code=401)


def permission_denied_response(permission: str) -> JSONResponse:
    return JSONResponse(
        {"ok": False, "message": f"Permission required: {permission}"},
        status_code=403,
    )


def user_permissions(user: Optional[dict[str, Any]]) -> set[str]:
    role = safe_str((user or {}).get("role"), "User")
    return set(ROLE_PERMISSIONS.get(role, ROLE_PERMISSIONS["User"]))


def has_permission(user: Optional[dict[str, Any]], permission: str) -> bool:
    return permission in user_permissions(user)


def required_permission_for_request(method: str, path: str) -> str:
    if path.startswith("/api/reports/"):
        return "export"
    if path.startswith("/api/audit"):
        return "audit"
    if path.startswith("/api/compliance"):
        return "compliance"
    if path.startswith("/api/maintenance") or path.startswith("/api/cleanup"):
        return "manage_settings"
    if path.startswith("/api/settings") or path.startswith("/api/thresholds") or path.startswith("/api/fine-tuning"):
        return "manage_settings" if method in {"POST", "PUT", "PATCH", "DELETE"} else "view"
    if path.startswith("/api/incidents") and method in {"POST", "PATCH", "DELETE"}:
        return "manage_incidents"
    if path.startswith("/api/cameras") or path.startswith("/api/camera/") or path.startswith("/api/add_camera"):
        return "manage_cameras" if method in {"POST", "PUT", "PATCH", "DELETE"} else "view"
    return "view"


def audit_event(request_or_user: Any, action: str, details: str = "") -> None:
    try:
        if isinstance(request_or_user, dict):
            user = request_or_user
        else:
            user = getattr(request_or_user.state, "user", None) or request_user(request_or_user)
        username = safe_str((user or {}).get("email") or (user or {}).get("name"), "system")
        audit(username, action, details)
    except Exception:
        pass


def safe_int(value: Any, default: int = 0) -> int:
    try:
        if pd.isna(value):
            return default
        return int(float(value))
    except Exception:
        return default


def safe_float(value: Any, default: float = 0.0) -> float:
    try:
        if pd.isna(value):
            return default
        return float(value)
    except Exception:
        return default


def safe_bool(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "yes", "on", "enabled"}:
            return True
        if normalized in {"false", "0", "no", "off", "disabled"}:
            return False
    if value is None:
        return default
    return bool(value)


def safe_str(value: Any, default: str = "") -> str:
    try:
        if value is None or pd.isna(value):
            return default
        return str(value)
    except Exception:
        return default


def is_local_video(url: str) -> bool:
    return str(url).lower().endswith((".mp4", ".mov", ".avi", ".mkv", ".webm"))


def is_rtsp_source(url: str) -> bool:
    return str(url).lower().startswith("rtsp://")


def normalize_camera_id(value: str) -> str:
    clean = "".join(ch if ch.isalnum() else "_" for ch in value.lower().strip())
    while "__" in clean:
        clean = clean.replace("__", "_")
    return clean.strip("_")[:60] or f"cam_{int(time.time())}"


def json_safe_records(df: pd.DataFrame) -> list[dict[str, Any]]:
    if df.empty:
        return []
    clean = df.copy()
    for col in clean.columns:
        if pd.api.types.is_datetime64_any_dtype(clean[col]):
            clean[col] = clean[col].dt.strftime("%Y-%m-%d %H:%M:%S")
    clean = clean.where(pd.notnull(clean), None)
    return clean.to_dict(orient="records")


def read_table(table: str) -> pd.DataFrame:
    if not Path(DB_PATH).exists():
        return pd.DataFrame()

    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.execute("PRAGMA busy_timeout = 30000")
    try:
        return pd.read_sql_query(f"SELECT * FROM {table}", conn)
    except Exception:
        return pd.DataFrame()
    finally:
        conn.close()


def load_json_file(path: Path, default: Any) -> Any:
    if not path.exists():
        path.write_text(json.dumps(default, indent=2, ensure_ascii=False), encoding="utf-8")
        return default

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data
    except Exception:
        path.write_text(json.dumps(default, indent=2, ensure_ascii=False), encoding="utf-8")
        return default


def save_json_file(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def load_cameras() -> list[dict[str, Any]]:
    data = load_json_file(CAMERAS_FILE, [])
    return data if isinstance(data, list) else []


def save_cameras(cameras: list[dict[str, Any]]) -> None:
    save_json_file(CAMERAS_FILE, cameras)


def load_settings() -> dict[str, Any]:
    saved = load_json_file(SETTINGS_FILE, DEFAULT_SETTINGS.copy())
    if not isinstance(saved, dict):
        saved = {}
    merged = DEFAULT_SETTINGS.copy()
    merged.update(saved)

    try:
        db_thresholds = get_thresholds()
        if isinstance(db_thresholds, dict):
            merged.update(db_thresholds)
    except Exception:
        pass

    return merged


def save_settings(payload: dict[str, Any]) -> dict[str, Any]:
    current = load_settings()
    current.update(payload)
    save_json_file(SETTINGS_FILE, current)

    for key, value in payload.items():
        try:
            update_threshold(key, value)
        except Exception:
            pass

    return current


def available_detection_models() -> list[dict[str, Any]]:
    builtin = [
        {"id": "yolov8n.pt", "name": "YOLOv8 Nano", "type": "builtin", "path": "yolov8n.pt"},
        {"id": "yolov8s.pt", "name": "YOLOv8 Small", "type": "builtin", "path": "yolov8s.pt"},
    ]
    custom = []
    builtin_ids = {item["id"] for item in builtin}
    for path in sorted(MODELS_DIR.glob("*.pt")):
        if path.name in builtin_ids:
            continue
        custom.append({
            "id": path.name,
            "name": path.stem.replace("_", " "),
            "type": "custom",
            "path": str(path),
            "size_mb": round(path.stat().st_size / (1024 * 1024), 2),
            "updated_at": datetime.fromtimestamp(path.stat().st_mtime).strftime("%Y-%m-%d %H:%M:%S"),
        })
    return builtin + custom


def resolve_detection_model(model_id: str) -> str:
    clean = Path(str(model_id or "yolov8n.pt")).name
    custom_path = MODELS_DIR / clean
    if custom_path.exists():
        return str(custom_path)
    if clean in {"yolov8n.pt", "yolov8s.pt"}:
        return clean
    return "yolov8n.pt"


def auto_split_yolo_dataset(dataset_dir: Path = CUSTOM_DATASET_DIR) -> dict[str, Any]:
    train_images_dir = dataset_dir / "train" / "images"
    train_labels_dir = dataset_dir / "train" / "labels"
    valid_images_dir = dataset_dir / "valid" / "images"
    valid_labels_dir = dataset_dir / "valid" / "labels"
    test_images_dir = dataset_dir / "test" / "images"
    test_labels_dir = dataset_dir / "test" / "labels"

    for folder in (train_images_dir, train_labels_dir, valid_images_dir, valid_labels_dir, test_images_dir, test_labels_dir):
        folder.mkdir(parents=True, exist_ok=True)

    valid_images = [p for p in valid_images_dir.glob("*") if p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}]
    test_images = [p for p in test_images_dir.glob("*") if p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}]
    train_images = sorted([p for p in train_images_dir.glob("*") if p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}])

    if valid_images or len(train_images) < 3:
        return {"auto_split": False, "message": "Split tayyor yoki rasm juda kam."}

    labeled_images = []
    for image_path in train_images:
        label_path = train_labels_dir / f"{image_path.stem}.txt"
        if label_path.exists():
            labeled_images.append((image_path, label_path))

    if len(labeled_images) < 3:
        return {"auto_split": False, "message": "Auto split uchun labeli bor kamida 3 ta rasm kerak."}

    total = len(labeled_images)
    valid_count = max(1, round(total * 0.2))
    test_count = max(1, round(total * 0.1)) if total >= 10 else 0
    if total - valid_count - test_count < 1:
        test_count = 0

    moved_valid = labeled_images[-(valid_count + test_count): -test_count if test_count else None]
    moved_test = labeled_images[-test_count:] if test_count else []

    def move_pairs(pairs, image_dst, label_dst):
        moved = 0
        for image_path, label_path in pairs:
            image_target = image_dst / image_path.name
            label_target = label_dst / label_path.name
            image_path.replace(image_target)
            label_path.replace(label_target)
            moved += 1
        return moved

    valid_moved = move_pairs(moved_valid, valid_images_dir, valid_labels_dir)
    test_moved = move_pairs(moved_test, test_images_dir, test_labels_dir)
    return {
        "auto_split": True,
        "message": f"Dataset auto-split qilindi: valid={valid_moved}, test={test_moved}.",
        "valid_moved": valid_moved,
        "test_moved": test_moved,
    }


def yolo_dataset_status(dataset_dir: Path = CUSTOM_DATASET_DIR) -> dict[str, Any]:
    data_yaml = dataset_dir / "data.yaml"
    splits: dict[str, dict[str, int]] = {}
    total_images = 0
    total_labels = 0
    for split in ("train", "valid", "test"):
        image_dir = dataset_dir / split / "images"
        label_dir = dataset_dir / split / "labels"
        images = [p for p in image_dir.glob("*") if p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}]
        labels = [p for p in label_dir.glob("*.txt")]
        splits[split] = {"images": len(images), "labels": len(labels)}
        total_images += len(images)
        total_labels += len(labels)

    classes: list[str] = []
    classes_path = dataset_dir / "classes.txt"
    if classes_path.exists():
        classes = [line.strip() for line in classes_path.read_text(encoding="utf-8").splitlines() if line.strip()]

    return {
        "path": str(dataset_dir),
        "data_yaml": str(data_yaml),
        "exists": dataset_dir.exists(),
        "data_yaml_exists": data_yaml.exists(),
        "classes": classes,
        "splits": splits,
        "total_images": total_images,
        "total_labels": total_labels,
        "ready": data_yaml.exists() and splits["train"]["images"] > 0 and splits["valid"]["images"] > 0,
    }


def load_training_status() -> dict[str, Any]:
    return load_json_file(
        TRAINING_STATUS_FILE,
        {
            "running": False,
            "state": "idle",
            "message": "Training hali boshlanmagan.",
            "best_model": str(MODELS_DIR / "best.pt"),
            "log_file": str(TRAINING_LOG_FILE),
        },
    )


def save_training_status(payload: dict[str, Any]) -> dict[str, Any]:
    current = load_training_status()
    current.update(payload)
    current["updated_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    save_json_file(TRAINING_STATUS_FILE, current)
    return current


def refresh_training_process_status() -> dict[str, Any]:
    global FINE_TUNING_TRAIN_PROCESS
    status = load_training_status()
    best_path = MODELS_DIR / "best.pt"
    status["best_model"] = str(best_path)
    status["best_model_exists"] = best_path.exists()
    proc = FINE_TUNING_TRAIN_PROCESS
    if proc and proc.poll() is None:
        status.update({"running": True, "state": "running"})
        return status
    if proc and proc.poll() is not None:
        code = proc.returncode
        FINE_TUNING_TRAIN_PROCESS = None
        status = save_training_status(
            {
                "running": False,
                "state": "completed" if code == 0 and best_path.exists() else "failed",
                "return_code": code,
                "message": "Training tugadi. models/best.pt tayyor." if code == 0 and best_path.exists() else "Training tugadi, lekin best.pt topilmadi yoki xato bor. Logni tekshiring.",
                "best_model": str(best_path),
                "best_model_exists": best_path.exists(),
            }
        )
    return status


def tail_file(path: Path, max_lines: int = 80) -> str:
    if not path.exists():
        return ""
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    return "\n".join(lines[-max_lines:])


def collection_image_count() -> int:
    if not COLLECTION_IMAGES_DIR.exists():
        return 0
    return len([p for p in COLLECTION_IMAGES_DIR.glob("*") if p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}])


def resolve_collection_source(source: str) -> tuple[str, str]:
    clean = str(source or "").strip()
    if not clean:
        return clean, ""

    lowered = clean.lower()
    if "youtube.com" in lowered or "youtu.be" in lowered:
        for camera in load_cameras():
            camera_url = str(camera.get("url") or "").strip()
            camera_id = str(camera.get("camera_id") or "").strip()
            if camera_id and camera_url == clean:
                frame_path = FRAMES_DIR / f"{camera_id}.jpg"
                return str(frame_path), f"YouTube link projectdagi {camera_id} kameraga ulangan. Rasm YouTube'dan emas, tayyor frame fayldan yig'iladi: {frame_path}"

    return clean, ""


def load_collection_status() -> dict[str, Any]:
    return load_json_file(
        COLLECTION_STATUS_FILE,
        {
            "running": False,
            "state": "idle",
            "message": "Rasm yig'ish hali boshlanmagan.",
            "source": "",
            "target_count": 500,
            "saved_count": collection_image_count(),
            "images_dir": str(COLLECTION_IMAGES_DIR),
            "zip_ready": collection_image_count() > 0,
            "log_file": str(COLLECTION_LOG_FILE),
        },
    )


def save_collection_status(payload: dict[str, Any]) -> dict[str, Any]:
    current = load_collection_status()
    current.update(payload)
    current["saved_count"] = collection_image_count()
    current["zip_ready"] = current["saved_count"] > 0
    current["updated_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    save_json_file(COLLECTION_STATUS_FILE, current)
    return current


def refresh_collection_process_status() -> dict[str, Any]:
    global FINE_TUNING_COLLECT_PROCESS
    status = load_collection_status()
    status["saved_count"] = collection_image_count()
    status["zip_ready"] = status["saved_count"] > 0
    proc = FINE_TUNING_COLLECT_PROCESS
    if proc and proc.poll() is None:
        status.update({"running": True, "state": "running"})
        return status
    if proc and proc.poll() is not None:
        code = proc.returncode
        FINE_TUNING_COLLECT_PROCESS = None
        saved = collection_image_count()
        status = save_collection_status(
            {
                "running": False,
                "state": "completed" if code == 0 and saved > 0 else "failed",
                "return_code": code,
                "message": f"Rasm yig'ish tugadi: {saved} ta image." if code == 0 and saved > 0 else "Rasm yig'ish tugadi, lekin image topilmadi. Logni tekshiring.",
            }
        )
    return status


def draw_test_detection(frame, detections):
    colors = {
        "person": (0, 220, 0),
        "car": (255, 0, 255),
        "motorcycle": (255, 0, 255),
        "bus": (255, 0, 255),
        "truck": (255, 0, 255),
    }
    for item in detections:
        x1, y1, x2, y2 = item["xyxy"]
        label = item["label"]
        conf = item["confidence"]
        color = colors.get(label, (0, 200, 255))
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
        text = f"{label} {conf:.2f}"
        cv2.rectangle(frame, (x1, max(0, y1 - 20)), (min(frame.shape[1] - 1, x1 + 120), y1), color, -1)
        cv2.putText(frame, text, (x1 + 4, max(14, y1 - 5)), cv2.FONT_HERSHEY_SIMPLEX, 0.43, (0, 0, 0), 1)
    return frame


def latest_by_camera(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty or "camera_id" not in df.columns:
        return pd.DataFrame()

    work = df.copy()
    if "timestamp" in work.columns:
        work["timestamp"] = pd.to_datetime(work["timestamp"], errors="coerce")
        work = work.sort_values("timestamp")
    elif "id" in work.columns:
        work = work.sort_values("id")

    return work.groupby("camera_id", as_index=False).tail(1)


def estimate_unique_visitors(df: pd.DataFrame) -> int:
    if df.empty:
        return 0

    if "total_unique_people" not in df.columns:
        return safe_int(df.get("new_unique_people", pd.Series([0])).sum())

    work = df.copy()
    sort_cols = [col for col in ["camera_id", "timestamp", "id"] if col in work.columns]
    if "timestamp" in work.columns:
        work["timestamp"] = pd.to_datetime(work["timestamp"], errors="coerce")
    if sort_cols:
        work = work.sort_values(sort_cols)

    total = 0
    group_key = "camera_id" if "camera_id" in work.columns else None
    groups = work.groupby(group_key) if group_key else [(None, work)]

    for _, group in groups:
        previous: Optional[int] = None
        for raw_value in group["total_unique_people"].tolist():
            current = safe_int(raw_value, 0)
            if current <= 0:
                continue
            if previous is None:
                total += current
            elif current >= previous:
                total += current - previous
            else:
                total += current
            previous = current

    return safe_int(total)


def latest_total_unique(camera_id: str) -> int:
    try:
        conn = sqlite3.connect(DB_PATH, timeout=10)
        row = conn.execute(
            """
            SELECT total_unique_people
            FROM minute_analytics
            WHERE camera_id=?
            ORDER BY timestamp DESC, id DESC
            LIMIT 1
            """,
            (camera_id,),
        ).fetchone()
        conn.close()
        return safe_int(row[0] if row else 0)
    except Exception:
        return 0


def normalize_total_unique(camera_id: str, active_people: int, new_unique_people: int, total_unique_people: int) -> int:
    previous = latest_total_unique(camera_id)
    active = max(0, safe_int(active_people, 0))
    new_unique = max(0, safe_int(new_unique_people, 0))
    incoming = max(0, safe_int(total_unique_people, 0))

    if previous <= 0:
        return active

    return max(previous, active)


def current_day_df(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df

    today = pd.Timestamp.now().strftime("%Y-%m-%d")
    work = df.copy()

    if "date" in work.columns:
        return work[work["date"].astype(str) == today]

    if "timestamp" in work.columns:
        work["timestamp"] = pd.to_datetime(work["timestamp"], errors="coerce")
        return work[work["timestamp"].dt.strftime("%Y-%m-%d") == today]

    return work


def frame_is_fresh(frame_path: Path, max_age_seconds: int = FRAME_STALE_SECONDS) -> bool:
    if not frame_path.exists():
        return False
    try:
        return time.time() - frame_path.stat().st_mtime <= max_age_seconds
    except OSError:
        return False


def is_recent_camera_row(row: dict[str, Any], max_age_seconds: int = 15) -> bool:
    timestamp = safe_str(row.get("timestamp", ""))
    if not timestamp:
        return False

    parsed = pd.to_datetime(timestamp, errors="coerce")
    if pd.isna(parsed):
        return False

    if parsed.tzinfo is not None:
        parsed = parsed.tz_convert(None)

    return (pd.Timestamp.now() - parsed).total_seconds() <= max_age_seconds


def filter_df(
    df: pd.DataFrame,
    camera_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> pd.DataFrame:
    if df.empty:
        return df

    work = df.copy()

    if camera_id and camera_id != "all" and "camera_id" in work.columns:
        work = work[work["camera_id"].astype(str) == camera_id]

    date_col = None
    if "timestamp" in work.columns:
        date_col = "timestamp"
    elif "created_at" in work.columns:
        date_col = "created_at"
    elif "date" in work.columns:
        date_col = "date"

    if date_col:
        work[date_col] = pd.to_datetime(work[date_col], errors="coerce")

        if start_date:
            start = pd.to_datetime(f"{start_date} 00:00:00", errors="coerce")
            if not pd.isna(start):
                work = work[work[date_col] >= start]

        if end_date:
            end = pd.to_datetime(f"{end_date} 23:59:59", errors="coerce")
            if not pd.isna(end):
                work = work[work[date_col] <= end]

    return work


def process_list(processes: Any) -> list[subprocess.Popen]:
    if isinstance(processes, list):
        return processes
    return [processes] if processes else []


def processes_alive(processes: Any) -> bool:
    items = process_list(processes)
    return bool(items) and all(process.poll() is None for process in items)


def start_detector(camera_id: str, site: str, url: str, speed_mode: str = "normal") -> bool:
    if not url:
        return False

    existing = RUNNING_PROCESSES.get(camera_id)
    if existing and processes_alive(existing):
        return True

    if speed_mode not in ["slow", "normal", "fast"]:
        speed_mode = "normal"

    lightweight = os.getenv("ASSBI_LIGHTWEIGHT_DETECTOR", "0") == "1"
    grabber_path = BASE_DIR / "app" / "frame_grabber.py"
    detector_path = BASE_DIR / "app" / ("frame_grabber.py" if lightweight else "main_detector.py")
    if not detector_path.exists():
        return False

    def base_cmd(path: Path) -> list[str]:
        return [
            sys.executable,
            str(path),
            "--url",
            url,
            "--camera-id",
            camera_id,
            "--site",
            site,
        ]

    def spawn(cmd: list[str], suffix: str) -> subprocess.Popen:
        log_file = open(LOGS_DIR / f"{camera_id}_{suffix}.log", "a", encoding="utf-8")
        print("[ASSBI] Started detector:", " ".join(cmd))
        return subprocess.Popen(
            cmd,
            cwd=str(BASE_DIR),
            stdout=log_file,
            stderr=log_file,
        )

    if lightweight:
        cmd = base_cmd(detector_path)
        if is_rtsp_source(url):
            cmd.extend(["--width", "640", "--height", "640", "--interval", "0.05", "--crop-top-ratio", "0.20"])
        else:
            cmd.extend(["--width", "640", "--height", "640", "--interval", "0.06" if speed_mode == "fast" else "0.08"])
        RUNNING_PROCESSES[camera_id] = spawn(cmd, "grabber")
        return True

    live_source = not is_local_video(url)
    processes: list[subprocess.Popen] = []

    if live_source and grabber_path.exists():
        grabber_cmd = base_cmd(grabber_path)
        if is_rtsp_source(url):
            grabber_cmd.extend(["--width", "640", "--height", "640", "--interval", "0.05", "--crop-top-ratio", "0.20"])
        else:
            grabber_cmd.extend(["--width", "640", "--height", "640", "--interval", "0.06" if speed_mode == "fast" else "0.08"])
        processes.append(spawn(grabber_cmd, "grabber"))

    cmd = base_cmd(BASE_DIR / "app" / "main_detector.py")
    cmd.extend(["--clean-ui", "--speed-mode", speed_mode])

    if is_rtsp_source(url):
        cmd.extend([
            "--width", "640",
            "--height", "640",
            "--imgsz", "640",
            "--conf", "0.04",
            "--detect-every", "2" if speed_mode == "fast" else "3",
            "--log-every", "1",
            "--no-frame-output",
            "--frame-input",
            str(FRAMES_DIR / f"{camera_id}_raw.jpg"),
        ])
    elif is_local_video(url):
        cmd.extend(["--detect-every", "3", "--log-every", "5"])
    else:
        cmd.extend([
            "--fast-mode",
            "--imgsz", "640",
            "--detect-every", "2" if speed_mode == "fast" else "3",
            "--log-every", "1",
            "--no-frame-output",
            "--frame-input",
            str(FRAMES_DIR / f"{camera_id}_raw.jpg"),
        ])

    processes.append(spawn(cmd, "detector"))
    RUNNING_PROCESSES[camera_id] = processes if len(processes) > 1 else processes[0]

    return True


def stop_detector(camera_id: str) -> bool:
    stopped = False

    for process in process_list(RUNNING_PROCESSES.get(camera_id)):
        if process and process.poll() is None:
            process.terminate()
            stopped = True

            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()

    RUNNING_PROCESSES.pop(camera_id, None)
    return stopped


def auto_start_cameras() -> None:
    for cam in load_cameras():
        if cam.get("enabled", True) and cam.get("url"):
            start_detector(
                cam.get("camera_id", "cam"),
                cam.get("site", cam.get("camera_id", "Camera")),
                cam.get("url", ""),
                cam.get("speed_mode", "normal"),
            )


def restart_enabled_cameras() -> None:
    cameras = load_cameras()
    for cam in cameras:
        cam_id = safe_str(cam.get("camera_id", ""))
        if cam_id:
            stop_detector(cam_id)

    for cam in cameras:
        if cam.get("enabled", True) and cam.get("url"):
            start_detector(
                cam.get("camera_id", "cam"),
                cam.get("site", cam.get("camera_id", "Camera")),
                cam.get("url", ""),
                cam.get("speed_mode", "normal"),
            )


def camera_latest_map() -> dict[str, dict[str, Any]]:
    analytics_df = read_table("minute_analytics")
    latest_df = latest_by_camera(analytics_df)
    latest_map: dict[str, dict[str, Any]] = {}

    if not latest_df.empty:
        for _, row in latest_df.iterrows():
            latest_map[safe_str(row.get("camera_id"))] = row.to_dict()

    return latest_map


def build_cameras_response(
    camera_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> list[dict[str, Any]]:
    analytics_df = filter_df(read_table("minute_analytics"), camera_id, start_date, end_date)
    latest_df = latest_by_camera(analytics_df)
    latest_map: dict[str, dict[str, Any]] = {}

    if not latest_df.empty:
        for _, row in latest_df.iterrows():
            latest_map[safe_str(row.get("camera_id"))] = row.to_dict()

    today_df = current_day_df(read_table("minute_analytics"))
    today_visitors_map: dict[str, int] = {}
    if not today_df.empty and "camera_id" in today_df.columns:
        for cam_id, group in today_df.groupby("camera_id"):
            today_visitors_map[safe_str(cam_id)] = estimate_unique_visitors(group)

    config_cameras = load_cameras()
    if camera_id and camera_id != "all":
        config_cameras = [cam for cam in config_cameras if cam.get("camera_id") == camera_id]

    result = []

    for cam in config_cameras:
        cam_id = cam.get("camera_id")
        latest = latest_map.get(cam_id, {})
        process = RUNNING_PROCESSES.get(cam_id)
        running = processes_alive(process) or is_recent_camera_row(latest)
        frame_path = FRAMES_DIR / f"{cam_id}.jpg"
        has_frame = frame_is_fresh(frame_path)
        frame_updated_at = datetime.fromtimestamp(frame_path.stat().st_mtime).strftime("%Y-%m-%d %H:%M:%S") if frame_path.exists() else ""

        result.append(
            {
                "camera_id": cam_id,
                "site": cam.get("site", cam_id),
                "url": cam.get("url", ""),
                "type": cam.get("type", "unknown"),
                "speed_mode": cam.get("speed_mode", "normal"),
                "enabled": cam.get("enabled", True),
                "running": running,
                "active_people": safe_int(latest.get("active_people", 0)),
                "total_unique": safe_int(latest.get("total_unique_people", latest.get("total_unique", 0))),
                "today_visitors": today_visitors_map.get(cam_id, 0),
                "daily_visitors": today_visitors_map.get(cam_id, 0),
                "risk_score": safe_int(latest.get("risk_score", 0)),
                "fps": round(safe_float(latest.get("fps", 0)), 1),
                "quality": round(safe_float(latest.get("data_quality_score", latest.get("quality", 0))), 1),
                "laptops": safe_int(latest.get("laptop_count", latest.get("laptops", 0))),
                "phones": safe_int(latest.get("phone_count", latest.get("phones", 0))),
                "vehicles": safe_int(latest.get("vehicle_count", latest.get("vehicles", 0))),
                "objects": safe_int(latest.get("object_count", latest.get("objects", 0))),
                "created_at": safe_str(latest.get("timestamp", "")),
                "timestamp": safe_str(latest.get("timestamp", "")),
                "has_frame": has_frame,
                "frame_updated_at": frame_updated_at,
                "frame_url": f"/api/frame/{cam_id}",
                "stream_url": f"/api/stream/{cam_id}",
            }
        )

    return result


def build_summary(
    camera_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> dict[str, Any]:
    df = filter_df(read_table("minute_analytics"), camera_id, start_date, end_date)
    incidents_df = filter_df(read_table("incidents"), camera_id, start_date, end_date)

    empty = {
        "latest": {},
        "kpis": {
            "active_people": 0,
            "new_unique_today": 0,
            "today_visitors": 0,
            "daily_visitors": 0,
            "total_unique": 0,
            "risk_score": 0,
            "fps": 0,
            "quality": 0,
            "laptops": 0,
            "phones": 0,
            "vehicles": 0,
            "objects": 0,
            "incidents": safe_int(len(incidents_df)),
        },
        "trend": [],
        "zones": [],
        "incidents": json_safe_records(incidents_df.tail(20)),
        "cameras": build_cameras_response(camera_id, start_date, end_date),
    }

    if df.empty:
        return empty

    if "timestamp" in df.columns:
        df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
        df = df.sort_values("timestamp")
    elif "id" in df.columns:
        df = df.sort_values("id")

    latest = df.iloc[-1].to_dict()
    today = latest.get("date")
    day_df = df[df["date"] == today] if "date" in df.columns and today is not None else df
    today_visitors = estimate_unique_visitors(current_day_df(df))
    current_by_camera = latest_by_camera(df)

    def current_sum(column: str) -> int:
        if current_by_camera.empty or column not in current_by_camera.columns:
            return 0
        return safe_int(current_by_camera[column].fillna(0).sum())

    def current_average(column: str) -> float:
        if current_by_camera.empty or column not in current_by_camera.columns:
            return 0.0
        return safe_float(current_by_camera[column].fillna(0).mean())

    trend = []
    for _, row in df.tail(80).iterrows():
        ts = row.get("timestamp")
        trend.append(
            {
                "time": ts.strftime("%H:%M") if hasattr(ts, "strftime") else safe_str(row.get("time", "")),
                "camera_id": safe_str(row.get("camera_id", "")),
                "created_at": ts.strftime("%Y-%m-%d %H:%M:%S") if hasattr(ts, "strftime") else safe_str(row.get("created_at", "")),
                "timestamp": ts.strftime("%Y-%m-%d %H:%M:%S") if hasattr(ts, "strftime") else safe_str(row.get("timestamp", "")),
                "active": safe_int(row.get("active_people", row.get("people", 0))),
                "people": safe_int(row.get("active_people", row.get("people", 0))),
                "risk": safe_int(row.get("risk_score", row.get("risk", 0))),
                "quality": safe_float(row.get("data_quality_score", row.get("quality", 0))),
                "laptops": safe_int(row.get("laptop_count", row.get("laptops", 0))),
                "phones": safe_int(row.get("phone_count", row.get("phones", 0))),
                "vehicles": safe_int(row.get("vehicle_count", row.get("vehicles", 0))),
                "objects": safe_int(row.get("object_count", row.get("objects", 0))),
            }
        )

    zones = [
        {"zone": "Left", "value": safe_int(day_df.get("left_zone", pd.Series([0])).sum())},
        {"zone": "Center", "value": safe_int(day_df.get("center_zone", pd.Series([0])).sum())},
        {"zone": "Right", "value": safe_int(day_df.get("right_zone", pd.Series([0])).sum())},
    ]

    latest_clean = {
        key: value.isoformat() if hasattr(value, "isoformat") else value
        for key, value in latest.items()
    }

    return {
        "latest": latest_clean,
        "kpis": {
            "active_people": current_sum("active_people"),
            "new_unique_today": today_visitors,
            "today_visitors": today_visitors,
            "daily_visitors": today_visitors,
            "total_unique": current_sum("total_unique_people"),
            "risk_score": safe_int(round(current_average("risk_score"))),
            "fps": round(current_average("fps"), 1),
            "quality": round(current_average("data_quality_score"), 1),
            "laptops": current_sum("laptop_count"),
            "phones": current_sum("phone_count"),
            "vehicles": current_sum("vehicle_count"),
            "objects": current_sum("object_count"),
            "incidents": safe_int(len(incidents_df)),
        },
        "trend": trend,
        "zones": zones,
        "incidents": json_safe_records(incidents_df.tail(20).sort_values("id", ascending=False) if "id" in incidents_df.columns else incidents_df.tail(20)),
        "cameras": build_cameras_response(camera_id, start_date, end_date),
    }


def build_visitor_analytics(
    camera_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> dict[str, Any]:
    df = filter_df(read_table("minute_analytics"), camera_id, start_date, end_date)
    if df.empty:
        return {"summary": {"entries": 0, "exits": 0, "current_inside": 0, "peak_occupancy": 0}, "daily": [], "by_camera": []}

    work = df.copy()
    if "timestamp" in work.columns:
        work["timestamp"] = pd.to_datetime(work["timestamp"], errors="coerce")
        work = work.sort_values("timestamp")
    if "date" not in work.columns and "timestamp" in work.columns:
        work["date"] = work["timestamp"].dt.strftime("%Y-%m-%d")

    daily = []
    day_groups = work.groupby("date") if "date" in work.columns else [("Current", work)]
    for date, group in day_groups:
        entries = estimate_unique_visitors(group)
        current_inside = safe_int(group.tail(1).get("active_people", pd.Series([0])).iloc[-1])
        peak = safe_int(group.get("active_people", pd.Series([0])).max())
        exits = max(0, entries - current_inside)
        daily.append(
            {
                "date": safe_str(date),
                "entries": entries,
                "exits": exits,
                "current_inside": current_inside,
                "peak_occupancy": peak,
            }
        )

    by_camera = []
    if "camera_id" in work.columns:
        for cam_id, group in work.groupby("camera_id"):
            site = safe_str(group.tail(1).get("site", pd.Series([cam_id])).iloc[-1], safe_str(cam_id))
            entries = estimate_unique_visitors(group)
            current_inside = safe_int(group.tail(1).get("active_people", pd.Series([0])).iloc[-1])
            by_camera.append(
                {
                    "camera_id": safe_str(cam_id),
                    "site": site,
                    "entries": entries,
                    "exits": max(0, entries - current_inside),
                    "current_inside": current_inside,
                    "peak_occupancy": safe_int(group.get("active_people", pd.Series([0])).max()),
                }
            )

    summary = {
        "entries": safe_int(sum(item["entries"] for item in daily)),
        "exits": safe_int(sum(item["exits"] for item in daily)),
        "current_inside": safe_int(work.tail(1).get("active_people", pd.Series([0])).iloc[-1]),
        "peak_occupancy": safe_int(work.get("active_people", pd.Series([0])).max()),
    }

    return {"summary": summary, "daily": daily[-14:], "by_camera": by_camera}


def build_evaluation_report(
    camera_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> dict[str, Any]:
    df = filter_df(read_table("minute_analytics"), camera_id, start_date, end_date)
    incidents_df = filter_df(read_table("incidents"), camera_id, start_date, end_date)
    cameras_data = build_cameras_response(camera_id, start_date, end_date)

    if df.empty:
        return {
            "summary": {
                "records": 0,
                "estimated_precision": 0,
                "estimated_recall": 0,
                "data_quality": 0,
                "avg_fps": 0,
                "scalability_score": 0,
                "veracity_score": 0,
            },
            "metrics": [],
            "cameras": [],
            "recommendations": ["Start cameras to collect evaluation data."],
        }

    avg_quality = safe_float(df.get("data_quality_score", pd.Series([0])).mean())
    avg_fps = safe_float(df.get("fps", pd.Series([0])).mean())
    avg_risk = safe_float(df.get("risk_score", pd.Series([0])).mean())
    records = len(df)
    active_nonzero = safe_float((df.get("active_people", pd.Series([0])) > 0).mean() * 100)
    fps_efficiency = max(0, min(100, avg_fps * 5))
    estimated_precision = round(max(0, min(98, 55 + avg_quality * 0.35 + fps_efficiency * 0.18)), 1)
    estimated_recall = round(max(0, min(96, 50 + active_nonzero * 0.25 + avg_quality * 0.25)), 1)
    scalability_score = round(max(0, min(100, 100 - max(0, len(cameras_data) - 4) * 8 + min(20, avg_fps))), 1)
    veracity_score = round(max(0, min(100, avg_quality * 0.7 + (100 - avg_risk) * 0.15 + fps_efficiency * 0.15)), 1)

    camera_rows = []
    if not df.empty and "camera_id" in df.columns:
        for cam_id, group in df.groupby("camera_id"):
            latest = group.tail(1).iloc[0]
            camera_rows.append(
                {
                    "camera_id": safe_str(cam_id),
                    "site": safe_str(latest.get("site", cam_id), safe_str(cam_id)),
                    "records": len(group),
                    "avg_fps": round(safe_float(group.get("fps", pd.Series([0])).mean()), 1),
                    "avg_quality": round(safe_float(group.get("data_quality_score", pd.Series([0])).mean()), 1),
                    "avg_risk": round(safe_float(group.get("risk_score", pd.Series([0])).mean()), 1),
                    "estimated_accuracy": round(max(0, min(98, 50 + safe_float(group.get("data_quality_score", pd.Series([0])).mean()) * 0.4)), 1),
                }
            )

    recommendations = []
    if avg_fps < 6:
        recommendations.append("FPS is low. Use faster model mode, reduce resolution or increase detect interval.")
    if avg_quality < 60:
        recommendations.append("Data quality is low. Check stream source, lighting, network and camera angle.")
    if len(incidents_df) > 0:
        recommendations.append("Review incident workflow status and operator notes for unresolved alerts.")
    if not recommendations:
        recommendations.append("Evaluation indicators are stable. Continue normal monitoring and collect more labelled validation data.")

    return {
        "summary": {
            "records": records,
            "estimated_precision": estimated_precision,
            "estimated_recall": estimated_recall,
            "data_quality": round(avg_quality, 1),
            "avg_fps": round(avg_fps, 1),
            "scalability_score": scalability_score,
            "veracity_score": veracity_score,
        },
        "metrics": [
            {"name": "Volume", "value": records, "description": "Analytics rows processed by the BI pipeline."},
            {"name": "Variety", "value": len(cameras_data), "description": "Configured structured and unstructured camera sources."},
            {"name": "Velocity", "value": round(avg_fps, 1), "description": "Average real-time processing FPS."},
            {"name": "Veracity", "value": veracity_score, "description": "Estimated data trust score from quality, FPS and risk stability."},
        ],
        "cameras": camera_rows,
        "recommendations": recommendations,
    }


def build_pipeline_architecture() -> dict[str, Any]:
    return {
        "nodes": [
            {"id": "sources", "title": "Video Sources", "detail": "YouTube, RTSP, local video and webcam streams"},
            {"id": "capture", "title": "OpenCV Capture", "detail": "Low-latency frame capture, resizing and frame buffering"},
            {"id": "ai", "title": "YOLO AI Detection", "detail": "People, vehicle, laptop, phone and object detection"},
            {"id": "analytics", "title": "Analytics Engine", "detail": "Crowd count, zone, risk and quality scoring"},
            {"id": "storage", "title": "SQLite BI Storage", "detail": "Structured facts, incidents, audit log and settings"},
            {"id": "api", "title": "FastAPI Services", "detail": "Realtime JSON API, reports, auth and compliance endpoints"},
            {"id": "dashboard", "title": "BI Dashboards", "detail": "KPI cards, charts, reports, chatbot and operator workflows"},
        ],
        "data_model": [
            {"table": "minute_analytics", "type": "Fact", "purpose": "Per-camera BI metrics by minute"},
            {"table": "incidents", "type": "Fact/Workflow", "purpose": "Alert, anomaly and response workflow records"},
            {"table": "person_sessions", "type": "Session fact", "purpose": "Track-based visitor/session evidence"},
            {"table": "audit_log", "type": "Governance fact", "purpose": "User actions and compliance evidence"},
            {"table": "thresholds/settings", "type": "Configuration dimension", "purpose": "Detection, privacy and policy controls"},
            {"table": "cameras.json", "type": "Camera dimension", "purpose": "Camera source, site and stream metadata"},
        ],
        "storage_strategy": [
            {"class": "Structured", "examples": "KPIs, incidents, audit logs, thresholds", "storage": "SQLite tables"},
            {"class": "Semi-structured", "examples": "Camera configs and settings", "storage": "JSON files"},
            {"class": "Unstructured", "examples": "Video frames and snapshots", "storage": "Frame files / stream source"},
        ],
        "processing_strategy": [
            {"mode": "Real-time", "use": "Live detection, operator monitoring, alerts and FPS-sensitive dashboards"},
            {"mode": "Batch", "use": "Reports, exports, daily visitors, historical evaluation and compliance review"},
        ],
    }


def build_compliance_status() -> dict[str, Any]:
    settings = load_settings()
    sensitive_terms = ("key", "token", "secret", "password")
    public_settings = {
        key: ("***configured***" if any(term in key.lower() for term in sensitive_terms) and value else value)
        for key, value in settings.items()
    }
    audit_df = read_table("audit_log")
    analytics_df = read_table("minute_analytics")
    incidents_df = read_table("incidents")
    retention_days = safe_int(settings.get("data_retention_days", 31), 31)
    last_audit = {}
    if not audit_df.empty:
        last_audit = json_safe_records(audit_df.tail(1))[0]

    controls = [
        {"name": "Authentication", "enabled": True, "evidence": "Session cookie and role-based access middleware"},
        {"name": "Role-Based Access Control", "enabled": True, "evidence": "Admin, Security Officer, BI Analyst, Manager and Viewer permissions"},
        {"name": "GDPR Compliance Mode", "enabled": safe_bool(settings.get("gdpr_mode", True), True), "evidence": "Compliance mode setting"},
        {"name": "Privacy Blur", "enabled": safe_bool(settings.get("privacy_blur", False)) or safe_bool(settings.get("face_blur", False)), "evidence": "Face/person blur configuration"},
        {"name": "Data Retention", "enabled": retention_days > 0, "evidence": f"{retention_days} day retention policy"},
        {"name": "Audit Logging", "enabled": True, "evidence": f"{len(audit_df)} audit actions recorded"},
    ]

    return {
        "settings": public_settings,
        "controls": controls,
        "data_inventory": {
            "analytics_rows": len(analytics_df),
            "incident_rows": len(incidents_df),
            "audit_rows": len(audit_df),
            "configured_cameras": len(load_cameras()),
            "retention_days": retention_days,
        },
        "last_audit": last_audit,
        "legal_notes": [
            "Use privacy blur for public-facing deployments.",
            "Keep retention period aligned with institutional policy.",
            "Restrict camera management and report exports by role.",
            "Review unresolved incidents and audit logs regularly.",
        ],
    }


def export_df_response(df: pd.DataFrame, filename: str, file_type: str, sheet_name: str = "Data"):
    if df.empty:
        return JSONResponse({"ok": False, "message": "No data for selected filters"}, status_code=404)

    path = EXPORTS_DIR / filename

    if file_type == "csv":
        df.to_csv(path, index=False)
        return FileResponse(path, filename=filename, media_type="text/csv")

    with pd.ExcelWriter(path, engine="openpyxl") as writer:
        df.to_excel(writer, sheet_name=sheet_name[:31], index=False)

    return FileResponse(
        path,
        filename=filename,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


PUBLIC_API_PATHS = {
    "/api/health",
    "/api/auth/login",
    "/api/auth/logout",
    "/api/ingest/frame",
    "/api/relay/cameras",
}


@app.middleware("http")
async def require_api_session(request: Request, call_next):
    if request.method == "OPTIONS":
        return await call_next(request)

    path = request.url.path
    if path.startswith("/api/") and path not in PUBLIC_API_PATHS:
        user = request_user(request)
        if not user:
            return auth_required_response()
        permission = required_permission_for_request(request.method.upper(), path)
        if not has_permission(user, permission):
            return permission_denied_response(permission)
        request.state.user = user

    return await call_next(request)


@app.on_event("startup")
async def startup_event():
    auto_start_cameras()


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "version": "3.0.0",
        "database": str(DB_PATH),
        "frames_dir": str(FRAMES_DIR),
        "cameras_file": str(CAMERAS_FILE),
        "settings_file": str(SETTINGS_FILE),
        "running_detectors": list(RUNNING_PROCESSES.keys()),
    }


@app.post("/api/auth/login")
def login(req: LoginRequest):
    email = req.email.strip().lower()
    users = load_auth_users()
    user = users.get(email)

    if not user or not hmac.compare_digest(str(user.get("password", "")), req.password):
        return JSONResponse({"ok": False, "message": "Email yoki password noto'g'ri"}, status_code=401)

    max_age = 60 * 60 * 24 * 7 if req.remember_me else 60 * 60 * 12
    token = create_session_token(email, max_age)
    safe_user = {
        "email": email,
        "name": user.get("name", email.split("@")[0]),
        "role": user.get("role", "User"),
    }
    audit_event(safe_user, "auth.login", f"role={safe_user['role']}")
    response = JSONResponse({"ok": True, "token": token, "user": safe_user})
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=max_age,
        httponly=True,
        secure=os.getenv("ASSBI_COOKIE_SECURE", "0") == "1",
        samesite="lax",
        path="/",
    )
    return response


@app.get("/api/auth/me")
def auth_me(request: Request):
    user = getattr(request.state, "user", None) or request_user(request)
    if not user:
        return auth_required_response()
    return {"ok": True, "user": user}


@app.post("/api/auth/logout")
def logout():
    response = JSONResponse({"ok": True})
    response.delete_cookie(SESSION_COOKIE, path="/")
    return response


@app.get("/api/summary")
def summary(
    camera_id: Optional[str] = Query(default=None),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
):
    return build_summary(camera_id, start_date, end_date)


@app.get("/api/analytics")
def analytics(
    limit: int = 200,
    camera_id: Optional[str] = Query(default=None),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
):
    df = filter_df(read_table("minute_analytics"), camera_id, start_date, end_date)
    if df.empty:
        return []
    return json_safe_records(df.tail(limit))


@app.get("/api/incidents")
def incidents(
    limit: int = 100,
    camera_id: Optional[str] = Query(default=None),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
):
    df = filter_df(read_table("incidents"), camera_id, start_date, end_date)
    if df.empty:
        return []
    if "id" in df.columns:
        df = df.sort_values("id", ascending=False)
    return json_safe_records(df.tail(limit))


@app.patch("/api/incidents/{incident_id}")
def update_incident_workflow(incident_id: int, payload: IncidentWorkflowPayload, request: Request):
    init_db()
    allowed_status = {"Open", "Assigned", "Investigating", "Resolved", "Closed"}
    status = (payload.status or "").strip()
    if status and status not in allowed_status:
        return JSONResponse({"ok": False, "message": "Invalid incident status"}, status_code=400)

    updates = []
    values: list[Any] = []
    if status:
        updates.append("status=?")
        values.append(status)
        if status in {"Resolved", "Closed"}:
            updates.append("resolved_at=?")
            values.append(pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S"))
    if payload.assigned_to is not None:
        updates.append("assigned_to=?")
        values.append(payload.assigned_to.strip())
    if payload.operator_note is not None:
        updates.append("operator_note=?")
        values.append(payload.operator_note.strip())

    if not updates:
        return JSONResponse({"ok": False, "message": "No workflow fields supplied"}, status_code=400)

    values.append(incident_id)
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute(f"UPDATE incidents SET {', '.join(updates)} WHERE id=?", values)
    changed = cur.rowcount
    conn.commit()
    conn.close()

    if not changed:
        return JSONResponse({"ok": False, "message": "Incident not found"}, status_code=404)

    audit_event(request, "incident.workflow_update", f"incident_id={incident_id}; status={status or '-'}")
    return {"ok": True, "incident_id": incident_id}


@app.get("/api/cameras")
def cameras(
    camera_id: Optional[str] = Query(default=None),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
):
    return build_cameras_response(camera_id, start_date, end_date)


@app.get("/api/visitors")
def visitors(
    camera_id: Optional[str] = Query(default=None),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
):
    return build_visitor_analytics(camera_id, start_date, end_date)


@app.get("/api/evaluation")
def evaluation(
    camera_id: Optional[str] = Query(default=None),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
):
    return build_evaluation_report(camera_id, start_date, end_date)


@app.get("/api/pipeline")
def pipeline_architecture():
    return build_pipeline_architecture()


@app.get("/api/warehouse/schema")
def warehouse_schema():
    return {"ok": True, **build_pipeline_architecture()}


@app.get("/api/compliance")
def compliance_status():
    return build_compliance_status()


@app.get("/api/audit")
def audit_log(limit: int = 100):
    df = read_table("audit_log")
    if df.empty:
        return []
    if "id" in df.columns:
        df = df.sort_values("id", ascending=False)
    return json_safe_records(df.head(limit))


@app.get("/api/relay/cameras")
def relay_cameras():
    return build_cameras_response()


@app.post("/api/cameras")
@app.post("/api/cameras/add")
@app.post("/api/add_camera")
def add_camera(payload: CameraPayload, request: Request):
    cameras_data = load_cameras()

    camera_id = normalize_camera_id(payload.camera_id or f"cam_{len(cameras_data) + 1:02d}")
    site = (payload.site or camera_id).strip() or camera_id
    url = payload.url.strip()
    cam_type = (payload.type or "youtube").strip()
    speed_mode = (payload.speed_mode or "normal").strip()

    if speed_mode not in ["slow", "normal", "fast"]:
        speed_mode = "normal"

    if not url:
        return JSONResponse({"ok": False, "message": "URL is required"}, status_code=400)

    cameras_data = [cam for cam in cameras_data if cam.get("camera_id") != camera_id]

    new_camera = {
        "camera_id": camera_id,
        "site": site,
        "url": url,
        "type": cam_type,
        "speed_mode": speed_mode,
        "enabled": bool(payload.enabled),
    }

    cameras_data.append(new_camera)
    save_cameras(cameras_data)

    started = False
    if new_camera["enabled"]:
        started = start_detector(camera_id, site, url, speed_mode)
    audit_event(request, "camera.add", f"camera_id={camera_id}; site={site}; type={cam_type}; started={started}")

    return {
        "ok": True,
        "camera_id": camera_id,
        "started": started,
        "message": "Camera saved and detector start attempted",
        "cameras": cameras_data,
    }


@app.post("/api/cameras/upload-video")
async def upload_video_camera(
    request: Request,
    video: UploadFile = File(...),
    camera_id: str = Form(""),
    site: str = Form("Uploaded Video"),
    speed_mode: str = Form("normal"),
    enabled: bool = Form(True),
):
    original_name = Path(video.filename or "uploaded_video.mp4").name.replace(" ", "_")
    suffix = Path(original_name).suffix.lower()
    if suffix not in {".mp4", ".mov", ".avi", ".mkv", ".webm"}:
        return JSONResponse({"ok": False, "message": "Only .mp4, .mov, .avi, .mkv or .webm video files are supported."}, status_code=400)

    cameras_data = load_cameras()
    raw_id = camera_id.strip() or f"local_{Path(original_name).stem}"
    cam_id = normalize_camera_id(raw_id)
    if not cam_id:
        cam_id = f"local_video_{int(time.time())}"

    existing_ids = {safe_str(cam.get("camera_id")) for cam in cameras_data}
    base_id = cam_id
    counter = 1
    while cam_id in existing_ids:
        cam_id = f"{base_id}_{counter}"
        counter += 1

    stored_name = f"{cam_id}{suffix}"
    target = UPLOADS_DIR / stored_name
    with target.open("wb") as handle:
        while True:
            chunk = await video.read(1024 * 1024)
            if not chunk:
                break
            handle.write(chunk)

    clean_speed = speed_mode if speed_mode in {"slow", "normal", "fast"} else "normal"
    clean_site = site.strip() or cam_id
    new_camera = {
        "camera_id": cam_id,
        "site": clean_site,
        "url": str(target),
        "type": "local",
        "speed_mode": clean_speed,
        "enabled": bool(enabled),
    }

    cameras_data.append(new_camera)
    save_cameras(cameras_data)

    started = False
    if new_camera["enabled"]:
        started = start_detector(cam_id, clean_site, str(target), clean_speed)

    audit_event(request, "camera.upload_video", f"camera_id={cam_id}; file={stored_name}; started={started}")
    return {"ok": True, "camera": new_camera, "camera_id": cam_id, "started": started, "cameras": cameras_data}


@app.post("/api/cameras/{camera_id}/start")
def start_camera(camera_id: str, request: Request):
    cam = next((c for c in load_cameras() if c.get("camera_id") == camera_id), None)
    if not cam:
        return JSONResponse({"ok": False, "message": "Camera not found"}, status_code=404)

    started = start_detector(
        cam.get("camera_id"),
        cam.get("site", camera_id),
        cam.get("url", ""),
        cam.get("speed_mode", "normal"),
    )
    audit_event(request, "camera.start", f"camera_id={camera_id}; started={started}")
    return {"ok": True, "started": started}


@app.post("/api/cameras/{camera_id}/stop")
def stop_camera(camera_id: str, request: Request):
    stopped = stop_detector(camera_id)
    audit_event(request, "camera.stop", f"camera_id={camera_id}; stopped={stopped}")
    return {"ok": True, "stopped": stopped}


@app.post("/api/ingest/frame")
async def ingest_camera_frame(
    frame: UploadFile = File(...),
    camera_id: str = Form(...),
    site: str = Form("Remote Camera"),
    source_url: str = Form(""),
    camera_type: str = Form("relay"),
    timestamp: str = Form(""),
    active_people: int = Form(0),
    new_unique_people: int = Form(0),
    total_unique_people: int = Form(0),
    vehicle_count: int = Form(0),
    object_count: int = Form(0),
    laptop_count: int = Form(0),
    phone_count: int = Form(0),
    left_zone: int = Form(0),
    center_zone: int = Form(0),
    right_zone: int = Form(0),
    standing_count: int = Form(0),
    sitting_count: int = Form(0),
    crowd_level: str = Form("LOW"),
    risk_score: int = Form(0),
    fps: float = Form(0),
    data_quality_score: float = Form(0),
    allow_create: bool = Form(False),
):
    cam_id = normalize_camera_id(camera_id)
    monotonic_now = time.monotonic()
    now = pd.Timestamp.now()
    parsed = pd.to_datetime(timestamp, errors="coerce") if timestamp else now
    if pd.isna(parsed):
        parsed = now

    cameras_data = load_cameras()
    camera_exists = any(cam.get("camera_id") == cam_id for cam in cameras_data)
    if not camera_exists and not allow_create:
        return JSONResponse(
            {
                "ok": False,
                "camera_id": cam_id,
                "message": "Camera is not configured. Add it before ingesting frames.",
            },
            status_code=404,
        )

    should_write_frame = monotonic_now - LAST_INGEST_FRAME_AT.get(cam_id, 0.0) >= 0.2
    should_write_analytics = monotonic_now - LAST_INGEST_ANALYTICS_AT.get(cam_id, 0.0) >= 1.0

    if should_write_frame:
        final_path = FRAMES_DIR / f"{cam_id}.jpg"
        temp_path = FRAMES_DIR / f"{cam_id}_tmp.jpg"
        temp_path.write_bytes(await frame.read())
        temp_path.replace(final_path)
        LAST_INGEST_FRAME_AT[cam_id] = monotonic_now
    else:
        await frame.read()

    if not camera_exists:
        cameras_data.append(
            {
                "camera_id": cam_id,
                "site": site,
                "url": source_url,
                "type": camera_type,
                "speed_mode": "normal",
                "enabled": True,
            }
        )
        save_cameras(cameras_data)

    if should_write_analytics:
        normalized_total_unique = normalize_total_unique(
            cam_id,
            active_people,
            new_unique_people,
            total_unique_people,
        )
        insert_minute_analytics(
            {
                "timestamp": parsed.strftime("%Y-%m-%d %H:%M:%S"),
                "date": parsed.strftime("%Y-%m-%d"),
                "hour": int(parsed.hour),
                "minute": int(parsed.minute),
                "camera_id": cam_id,
                "site": site,
                "active_people": active_people,
                "new_unique_people": new_unique_people,
                "total_unique_people": normalized_total_unique,
                "vehicle_count": vehicle_count,
                "object_count": object_count,
                "laptop_count": laptop_count,
                "phone_count": phone_count,
                "left_zone": left_zone,
                "center_zone": center_zone,
                "right_zone": right_zone,
                "standing_count": 0,
                "sitting_count": 0,
                "crowd_level": crowd_level,
                "risk_score": risk_score,
                "fps": fps,
                "data_quality_score": data_quality_score,
            }
        )
        LAST_INGEST_ANALYTICS_AT[cam_id] = monotonic_now

    return {
        "ok": True,
        "camera_id": cam_id,
        "frame_saved": should_write_frame,
        "analytics_saved": should_write_analytics,
    }


@app.delete("/api/cameras/{camera_id}")
@app.delete("/api/camera/{camera_id}")
@app.delete("/api/cameras/{camera_id}/delete")
def delete_camera(camera_id: str, request: Request):
    stop_detector(camera_id)

    removed_camera = next((cam for cam in load_cameras() if cam.get("camera_id") == camera_id), None)
    cameras_data = [cam for cam in load_cameras() if cam.get("camera_id") != camera_id]
    save_cameras(cameras_data)

    for frame_path in [FRAMES_DIR / f"{camera_id}.jpg", FRAMES_DIR / f"{camera_id}_boxes.json"]:
        if frame_path.exists():
            frame_path.unlink()

    source_url = safe_str((removed_camera or {}).get("url"))
    try:
        source_path = Path(source_url)
        if source_path.exists() and UPLOADS_DIR in source_path.resolve().parents:
            source_path.unlink()
    except Exception:
        pass

    audit_event(request, "camera.delete", f"camera_id={camera_id}")
    return {"ok": True, "camera_id": camera_id, "cameras": cameras_data}


@app.get("/api/frame/{camera_id}")
def camera_frame(camera_id: str):
    frame_path = FRAMES_DIR / f"{camera_id}.jpg"
    if not frame_is_fresh(frame_path):
        return JSONResponse({"ok": False, "message": "No fresh frame available"}, status_code=404)

    return FileResponse(frame_path, media_type="image/jpeg", headers={"Cache-Control": "no-store"})


def mjpeg_generator(camera_id: str):
    frame_path = FRAMES_DIR / f"{camera_id}.jpg"
    last_mtime = 0.0
    last_frame = b""
    last_yield = 0.0

    while True:
        if frame_path.exists():
            try:
                current_mtime = frame_path.stat().st_mtime
                if current_mtime != last_mtime:
                    last_frame = frame_path.read_bytes()
                    yield b"--frame\r\n" b"Content-Type: image/jpeg\r\n\r\n" + last_frame + b"\r\n"
                    last_mtime = current_mtime
                    last_yield = time.time()
                elif last_frame and time.time() - last_yield >= 1.0:
                    yield b"--frame\r\n" b"Content-Type: image/jpeg\r\n\r\n" + last_frame + b"\r\n"
                    last_yield = time.time()
            except Exception:
                pass
        time.sleep(0.08)


@app.get("/api/stream/{camera_id}")
def stream_camera(camera_id: str):
    return StreamingResponse(
        mjpeg_generator(camera_id),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0", "Pragma": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/snapshot/{camera_id}")
@app.get("/api/cameras/{camera_id}/snapshot")
def export_snapshot(camera_id: str):
    frame_path = FRAMES_DIR / f"{camera_id}.jpg"
    if not frame_is_fresh(frame_path):
        return JSONResponse({"ok": False, "message": "No fresh frame available"}, status_code=404)

    snapshot_dir = EXPORTS_DIR / "snapshots"
    snapshot_dir.mkdir(parents=True, exist_ok=True)

    filename = f"{camera_id}_snapshot_{int(time.time())}.jpg"
    snapshot_path = snapshot_dir / filename
    snapshot_path.write_bytes(frame_path.read_bytes())

    return FileResponse(snapshot_path, filename=filename, media_type="image/jpeg")


@app.get("/api/fine-tuning/status")
def fine_tuning_status():
    auto_split_yolo_dataset()
    settings = load_settings()
    current = str(settings.get("detection_model", "yolov8n.pt"))
    return {
        "ok": True,
        "current_model": current,
        "resolved_model": resolve_detection_model(current),
        "models": available_detection_models(),
        "training_dir": str(TRAINING_DIR),
        "dataset": yolo_dataset_status(),
        "collection": refresh_collection_process_status(),
        "training": refresh_training_process_status(),
    }


@app.get("/api/fine-tuning/dataset")
def fine_tuning_dataset_status():
    split_result = auto_split_yolo_dataset()
    return {"ok": True, "split_result": split_result, **yolo_dataset_status()}


@app.get("/api/fine-tuning/dataset/template")
def download_fine_tuning_dataset_template():
    template_path = EXPORTS_DIR / "assbi_yolo_dataset_template.zip"
    template_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(template_path, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(
            "data.yaml",
            "path: .\ntrain: train/images\nval: valid/images\ntest: test/images\nnames:\n  0: person\n  1: vehicle\n  2: object\n",
        )
        archive.writestr("classes.txt", "person\nvehicle\nobject\n")
        archive.writestr("README.md", "ASSBI YOLO dataset template. Replace .gitkeep with real images and labels.\n")
        for split in ("train", "valid", "test"):
            archive.writestr(f"{split}/images/.gitkeep", "")
            archive.writestr(f"{split}/labels/.gitkeep", "")
    return FileResponse(
        template_path,
        filename="assbi_yolo_dataset_template.zip",
        media_type="application/zip",
    )


@app.get("/api/fine-tuning/dataset/download")
def download_current_fine_tuning_dataset():
    status = yolo_dataset_status()
    if not status.get("data_yaml_exists"):
        return JSONResponse({"ok": False, "message": "Dataset hali tayyor emas: data.yaml topilmadi."}, status_code=404)

    zip_path = EXPORTS_DIR / "assbi_current_yolo_dataset.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as archive:
        for name in ("data.yaml", "classes.txt", "README.md"):
            path = CUSTOM_DATASET_DIR / name
            if path.exists() and path.is_file():
                archive.write(path, name)
        for split in ("train", "valid", "test"):
            for kind in ("images", "labels"):
                folder = CUSTOM_DATASET_DIR / split / kind
                if not folder.exists():
                    continue
                for path in sorted(folder.iterdir()):
                    if path.is_file() and not path.name.startswith("._"):
                        archive.write(path, f"{split}/{kind}/{path.name}")
    return FileResponse(zip_path, filename="assbi_current_yolo_dataset.zip", media_type="application/zip")


@app.get("/api/fine-tuning/collect/status")
def fine_tuning_collect_status():
    status = refresh_collection_process_status()
    return {"ok": True, **status, "log_tail": tail_file(COLLECTION_LOG_FILE)}


@app.post("/api/fine-tuning/collect")
def start_fine_tuning_collection(payload: ImageCollectionPayload, request: Request):
    global FINE_TUNING_COLLECT_PROCESS
    refresh_collection_process_status()
    if FINE_TUNING_COLLECT_PROCESS and FINE_TUNING_COLLECT_PROCESS.poll() is None:
        return JSONResponse({"ok": False, "message": "Rasm yig'ish allaqachon ishlayapti."}, status_code=409)

    source = str(payload.source or "").strip()
    if not source:
        return JSONResponse({"ok": False, "message": "Source link kiriting."}, status_code=400)
    collection_source, source_note = resolve_collection_source(source)

    count = max(1, min(int(payload.count), 2000))
    interval = max(0.1, min(float(payload.interval), 10.0))
    prefix = normalize_camera_id(payload.prefix or "assbi")

    if COLLECTION_DIR.exists():
        shutil.rmtree(COLLECTION_DIR)
    COLLECTION_IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    COLLECTION_LOG_FILE.write_text("", encoding="utf-8")

    cmd = [
        sys.executable,
        str(BASE_DIR / "scripts" / "collect_images.py"),
        "--source",
        collection_source,
        "--count",
        str(count),
        "--interval",
        str(interval),
        "--output",
        str(COLLECTION_IMAGES_DIR),
        "--prefix",
        prefix,
    ]
    log_handle = COLLECTION_LOG_FILE.open("a", encoding="utf-8")
    log_handle.write("Running: " + " ".join(cmd) + "\n")
    log_handle.flush()
    try:
        FINE_TUNING_COLLECT_PROCESS = subprocess.Popen(
            cmd,
            cwd=str(BASE_DIR),
            stdout=log_handle,
            stderr=subprocess.STDOUT,
            text=True,
        )
    except Exception as exc:
        log_handle.close()
        return JSONResponse({"ok": False, "message": f"Rasm yig'ish boshlanmadi: {exc}"}, status_code=500)

    status = save_collection_status(
        {
            "running": True,
            "state": "running",
            "message": source_note or f"{count} ta image yig'ish boshlandi.",
            "source": source,
            "resolved_source": collection_source,
            "target_count": count,
            "interval": interval,
            "prefix": prefix,
            "images_dir": str(COLLECTION_IMAGES_DIR),
            "log_file": str(COLLECTION_LOG_FILE),
        }
    )
    audit_event(request, "fine_tuning.collect_start", f"count={count}; source={source}; resolved={collection_source}")
    return {"ok": True, **status}


@app.get("/api/fine-tuning/collect/download")
def download_collected_images_zip():
    if collection_image_count() <= 0:
        return JSONResponse({"ok": False, "message": "Hali yig'ilgan image yo'q."}, status_code=404)
    zip_path = EXPORTS_DIR / "assbi_collected_images.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as archive:
        for image_path in sorted(COLLECTION_IMAGES_DIR.glob("*")):
            if image_path.is_file() and image_path.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}:
                archive.write(image_path, f"images/{image_path.name}")
        metadata = COLLECTION_DIR / "metadata.jsonl"
        manifest = COLLECTION_DIR / "collection_manifest.json"
        if metadata.exists():
            archive.write(metadata, "metadata.jsonl")
        if manifest.exists():
            archive.write(manifest, "collection_manifest.json")
    return FileResponse(zip_path, filename="assbi_collected_images.zip", media_type="application/zip")


@app.post("/api/fine-tuning/dataset/upload")
async def upload_fine_tuning_dataset(request: Request, dataset: UploadFile = File(...)):
    filename = Path(dataset.filename or "dataset.zip").name
    if not filename.lower().endswith(".zip"):
        return JSONResponse({"ok": False, "message": "Faqat YOLO dataset .zip fayl yuklanadi."}, status_code=400)

    upload_path = UPLOADS_DIR / f"dataset_{int(time.time())}.zip"
    with upload_path.open("wb") as handle:
        while True:
            chunk = await dataset.read(1024 * 1024)
            if not chunk:
                break
            handle.write(chunk)

    tmp_dir = TRAINING_DIR / f"dataset_upload_{int(time.time())}"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    try:
        with zipfile.ZipFile(upload_path) as archive:
            for member in archive.infolist():
                member_path = Path(member.filename)
                if member_path.is_absolute() or ".." in member_path.parts:
                    return JSONResponse({"ok": False, "message": "ZIP ichida xavfsiz bo‘lmagan path bor."}, status_code=400)
            archive.extractall(tmp_dir)

        data_yaml_candidates = [
            path
            for path in tmp_dir.rglob("data.yaml")
            if "__MACOSX" not in path.parts and not any(part.startswith("._") for part in path.parts)
        ]
        source_root = next(
            (
                path.parent
                for path in data_yaml_candidates
                if (path.parent / "train").exists() or (path.parent / "valid").exists() or (path.parent / "test").exists()
            ),
            data_yaml_candidates[0].parent if data_yaml_candidates else None,
        )
        if source_root is None:
            return JSONResponse({"ok": False, "message": "ZIP ichida data.yaml topilmadi."}, status_code=400)

        CUSTOM_DATASET_DIR.mkdir(parents=True, exist_ok=True)
        for child in CUSTOM_DATASET_DIR.iterdir():
            if child.is_dir():
                shutil.rmtree(child)
            else:
                child.unlink(missing_ok=True)
        for name in ("data.yaml", "classes.txt", "README.md"):
            src = source_root / name
            if src.exists() and src.is_file():
                (CUSTOM_DATASET_DIR / name).write_bytes(src.read_bytes())
        for split in ("train", "valid", "test"):
            for kind in ("images", "labels"):
                src_dir = source_root / split / kind
                dst_dir = CUSTOM_DATASET_DIR / split / kind
                dst_dir.mkdir(parents=True, exist_ok=True)
                if not src_dir.exists():
                    continue
                for src in src_dir.iterdir():
                    if src.is_file() and not src.name.startswith("._") and src.parent.name != "__MACOSX":
                        (dst_dir / src.name).write_bytes(src.read_bytes())

        split_result = auto_split_yolo_dataset()
        status = yolo_dataset_status()
        audit_event(request, "fine_tuning.dataset_upload", f"file={filename}; images={status['total_images']}; split={split_result}")
        message = "Dataset yuklandi."
        if split_result.get("auto_split"):
            message += " " + str(split_result.get("message", ""))
        return {"ok": True, "message": message, "split_result": split_result, **status}
    finally:
        try:
            upload_path.unlink(missing_ok=True)
        except Exception:
            pass


@app.get("/api/fine-tuning/train/status")
def fine_tuning_train_status():
    status = refresh_training_process_status()
    return {
        "ok": True,
        **status,
        "log_tail": tail_file(TRAINING_LOG_FILE),
    }


@app.get("/api/fine-tuning/model/best")
def download_best_fine_tuned_model():
    best_path = MODELS_DIR / "best.pt"
    if not best_path.exists():
        return JSONResponse({"ok": False, "message": "best.pt hali tayyor emas. Avval trainingni tugating."}, status_code=404)
    return FileResponse(
        best_path,
        filename="best.pt",
        media_type="application/octet-stream",
    )


@app.post("/api/fine-tuning/train")
def start_fine_tuning_training(payload: TrainingStartPayload, request: Request):
    global FINE_TUNING_TRAIN_PROCESS
    refresh_training_process_status()
    if FINE_TUNING_TRAIN_PROCESS and FINE_TUNING_TRAIN_PROCESS.poll() is None:
        return JSONResponse({"ok": False, "message": "Training allaqachon ishlayapti."}, status_code=409)

    dataset_status = yolo_dataset_status()
    data_path = (BASE_DIR / payload.data).resolve() if not Path(payload.data).is_absolute() else Path(payload.data).resolve()
    if not data_path.exists():
        return JSONResponse({"ok": False, "message": f"data.yaml topilmadi: {data_path}"}, status_code=400)
    if not dataset_status.get("ready"):
        return JSONResponse({"ok": False, "message": "Dataset tayyor emas. Train va valid images/labels qo‘shing."}, status_code=400)

    epochs = max(1, min(int(payload.epochs), 300))
    imgsz = max(320, min(int(payload.imgsz), 1280))
    batch = max(1, min(int(payload.batch), 64))
    run_name = normalize_camera_id(payload.name or "assbi_custom_train")
    model_name = Path(payload.model or "yolov8n.pt").name

    cmd = [
        sys.executable,
        str(BASE_DIR / "scripts" / "train_yolo11m.py"),
        "--data",
        str(data_path),
        "--model",
        model_name,
        "--epochs",
        str(epochs),
        "--imgsz",
        str(imgsz),
        "--batch",
        str(batch),
        "--name",
        run_name,
    ]

    TRAINING_DIR.mkdir(exist_ok=True)
    LOGS_DIR.mkdir(exist_ok=True)
    TRAINING_LOG_FILE.write_text("", encoding="utf-8")
    log_handle = TRAINING_LOG_FILE.open("a", encoding="utf-8")
    log_handle.write("Running: " + " ".join(cmd) + "\n")
    log_handle.flush()
    try:
        FINE_TUNING_TRAIN_PROCESS = subprocess.Popen(
            cmd,
            cwd=str(BASE_DIR),
            stdout=log_handle,
            stderr=subprocess.STDOUT,
            text=True,
        )
    except Exception as exc:
        log_handle.close()
        return JSONResponse({"ok": False, "message": f"Training start bo‘lmadi: {exc}"}, status_code=500)

    status = save_training_status(
        {
            "running": True,
            "state": "running",
            "message": "Training boshlandi. Tugaganda models/best.pt chiqadi.",
            "command": cmd,
            "dataset": str(data_path),
            "model": model_name,
            "epochs": epochs,
            "imgsz": imgsz,
            "batch": batch,
            "run_name": run_name,
            "best_model": str(MODELS_DIR / "best.pt"),
            "best_model_exists": (MODELS_DIR / "best.pt").exists(),
            "log_file": str(TRAINING_LOG_FILE),
        }
    )
    audit_event(request, "fine_tuning.train_start", f"model={model_name}; data={data_path}; epochs={epochs}")
    return {"ok": True, **status}


@app.post("/api/fine-tuning/model")
async def upload_fine_tuned_model(request: Request, model: UploadFile = File(...)):
    filename = Path(model.filename or "custom_model.pt").name.replace(" ", "_")
    if not filename.endswith(".pt"):
        return JSONResponse({"ok": False, "message": "Only .pt YOLO model files are supported."}, status_code=400)

    target = MODELS_DIR / filename
    with target.open("wb") as handle:
        while True:
            chunk = await model.read(1024 * 1024)
            if not chunk:
                break
            handle.write(chunk)

    saved = save_settings({"detection_model": filename})
    audit_event(request, "fine_tuning.model_upload", filename)
    return {"ok": True, "model": filename, "settings": saved, "models": available_detection_models()}


@app.post("/api/fine-tuning/select")
def select_fine_tuned_model(payload: ModelSelectionPayload, request: Request):
    model_id = Path(payload.model).name
    available_ids = {item["id"] for item in available_detection_models()}
    if model_id not in available_ids:
        return JSONResponse({"ok": False, "message": "Model not found."}, status_code=404)

    saved = save_settings({"detection_model": model_id})
    audit_event(request, "fine_tuning.model_select", model_id)
    return {"ok": True, "current_model": model_id, "resolved_model": resolve_detection_model(model_id), "settings": saved}


@app.post("/api/fine-tuning/test-image")
async def test_fine_tuning_image(
    request: Request,
    image: UploadFile = File(...),
    conf: float = Form(0.25),
):
    filename = Path(image.filename or "test.jpg").name.replace(" ", "_")
    suffix = Path(filename).suffix.lower()
    if suffix not in {".jpg", ".jpeg", ".png", ".webp"}:
        return JSONResponse({"ok": False, "message": "Only JPG, PNG or WEBP images are supported."}, status_code=400)

    raw = await image.read()
    array = np.frombuffer(raw, dtype=np.uint8)
    frame = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if frame is None:
        return JSONResponse({"ok": False, "message": "Uploaded file is not a valid image."}, status_code=400)

    settings = load_settings()
    selected = str(settings.get("detection_model", "yolov8n.pt"))
    model_path = resolve_detection_model(selected)
    model = YOLO(model_path)
    results = model.predict(frame, conf=max(0.01, min(float(conf), 0.99)), imgsz=640, verbose=False)

    detections = []
    counts: dict[str, int] = {}
    names = getattr(model, "names", {}) or {}
    for result in results:
        if result.boxes is None:
            continue
        for box in result.boxes:
            cls_id = int(box.cls[0])
            label = str(names.get(cls_id, cls_id))
            confidence = float(box.conf[0])
            xyxy = [int(value) for value in box.xyxy[0].tolist()]
            detections.append({"class_id": cls_id, "label": label, "confidence": round(confidence, 4), "xyxy": xyxy})
            counts[label] = counts.get(label, 0) + 1

    annotated = draw_test_detection(frame.copy(), detections)
    output_name = f"test_{int(time.time())}_{Path(filename).stem}.jpg"
    output_path = TEST_OUTPUT_DIR / output_name
    cv2.imwrite(str(output_path), annotated, [int(cv2.IMWRITE_JPEG_QUALITY), 88])

    audit_event(request, "fine_tuning.test_image", f"file={filename}; detections={len(detections)}")
    return {
        "ok": True,
        "model": selected,
        "resolved_model": model_path,
        "detections": detections,
        "counts": counts,
        "total": len(detections),
        "annotated_url": f"/api/fine-tuning/test-image/{output_name}",
    }


@app.get("/api/fine-tuning/test-image/{filename}")
def fine_tuning_test_image(filename: str):
    safe_name = Path(filename).name
    path = TEST_OUTPUT_DIR / safe_name
    if not path.exists():
        return JSONResponse({"ok": False, "message": "Test image not found."}, status_code=404)
    return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "no-store"})


@app.get("/api/thresholds")
def thresholds():
    return load_settings()


@app.post("/api/thresholds")
@app.post("/api/settings")
def save_thresholds(payload: dict[str, Any], request: Request):
    saved = save_settings(payload)
    audit_event(request, "settings.update", ",".join(sorted(payload.keys())))
    return {"ok": True, "settings": saved, **saved}


@app.post("/api/thresholds/{key}")
def set_threshold(key: str, payload: dict[str, Any], request: Request):
    value = payload.get("value")
    saved = save_settings({key: value})
    audit_event(request, "settings.update_threshold", f"{key}={value}")
    return {"ok": True, "key": key, "value": value, "settings": saved}


@app.get("/api/predictive")
def predictive_analytics(
    camera_id: Optional[str] = Query(default=None),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
):
    df = filter_df(read_table("minute_analytics"), camera_id, start_date, end_date)

    if df.empty:
        return {
            "summary": {
                "peak_people": 0,
                "next_hour_people": 0,
                "confidence": 0,
                "risk_window": "No data",
                "forecast_horizon": "24h",
                "issue_probability": 0,
                "busiest_camera": "No data",
                "highest_risk_camera": "No data",
                "recommendation": "Start a camera to generate predictions.",
            },
            "forecast": [],
            "risk": [],
            "cameras": [],
            "camera_forecast": [],
            "insights": [],
        }

    if "timestamp" in df.columns:
        df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
        df = df.sort_values("timestamp")
    elif "id" in df.columns:
        df = df.sort_values("id")

    recent = df.tail(60).copy()
    latest = recent.iloc[-1]

    current_people = safe_int(latest.get("active_people", 0))
    current_risk = safe_int(latest.get("risk_score", 0))

    avg_people = safe_float(recent.get("active_people", pd.Series([0])).mean())
    avg_risk = safe_float(recent.get("risk_score", pd.Series([0])).mean())

    first_people_avg = safe_float(recent.get("active_people", pd.Series([0])).head(10).mean())
    last_people_avg = safe_float(recent.get("active_people", pd.Series([0])).tail(10).mean())
    first_risk_avg = safe_float(recent.get("risk_score", pd.Series([0])).head(10).mean())
    last_risk_avg = safe_float(recent.get("risk_score", pd.Series([0])).tail(10).mean())

    trend_people = last_people_avg - first_people_avg
    trend_risk = last_risk_avg - first_risk_avg

    latest_cam_df = latest_by_camera(df)
    camera_forecast = []
    busiest_camera = "Unknown"
    highest_risk_camera = "Unknown"
    max_people = -1
    max_risk = -1

    if not latest_cam_df.empty:
        for _, row in latest_cam_df.iterrows():
            cam_id = safe_str(row.get("camera_id", "unknown"))
            site = safe_str(row.get("site", cam_id), cam_id)
            people = safe_int(row.get("active_people", 0))
            risk = safe_int(row.get("risk_score", 0))
            fps = safe_float(row.get("fps", 0))

            if people > max_people:
                max_people = people
                busiest_camera = f"{site} ({cam_id})"

            if risk > max_risk:
                max_risk = risk
                highest_risk_camera = f"{site} ({cam_id})"

            predicted_people = max(0, round(people + trend_people * 0.25 + 2))
            predicted_risk = max(0, min(100, round(risk + trend_risk * 0.25 + 3)))
            issue_probability = max(0, min(100, predicted_risk + (15 if fps <= 1 else 0)))

            camera_forecast.append(
                {
                    "camera_id": cam_id,
                    "site": site,
                    "current_people": people,
                    "predicted_people": predicted_people,
                    "predicted_people_30m": predicted_people,
                    "current_risk": risk,
                    "predicted_risk": predicted_risk,
                    "predicted_risk_30m": predicted_risk,
                    "issue_probability": issue_probability,
                    "confidence": 95 if len(recent) >= 60 else 85 if len(recent) >= 20 else 70,
                    "fps": round(fps, 1),
                    "status": "High" if predicted_risk >= 70 else "Medium" if predicted_risk >= 35 else "Low",
                }
            )

    forecast = []
    risk_forecast = []

    for i in [0, 1, 2, 3, 4, 6, 12, 18, 24]:
        if i == 0:
            predicted_people = current_people
            predicted_risk = current_risk
        else:
            predicted_people = max(0, int(avg_people + trend_people * (i / 6) + i * 0.5))
            predicted_risk = max(0, min(100, int(avg_risk + trend_risk * (i / 6) + i * 0.4)))

        lower = max(0, predicted_people - max(2, int(predicted_people * 0.15)))
        upper = predicted_people + max(2, int(predicted_people * 0.15))
        confidence = max(55, 95 - i * 2)

        forecast.append(
            {
                "time": "Now" if i == 0 else f"+{i}h",
                "actual": current_people if i == 0 else None,
                "predicted": predicted_people,
                "lower": lower,
                "upper": upper,
                "risk": predicted_risk,
                "confidence": confidence,
            }
        )

        risk_forecast.append(
            {
                "time": "Now" if i == 0 else f"+{i}h",
                "risk": predicted_risk,
                "probability": max(0, min(100, predicted_risk * 0.9 + i)),
            }
        )

    peak_people = max(item["predicted"] for item in forecast)
    next_hour_people = next((item["predicted"] for item in forecast if item["time"] == "+1h"), current_people)
    peak_risk = max(item["risk"] for item in risk_forecast)
    issue_probability = max([item.get("issue_probability", 0) for item in camera_forecast] or [peak_risk])

    if peak_risk >= 70:
        recommendation = "High risk is predicted. Increase monitoring and prepare security response."
        risk_window = "Next 2-6 hours"
    elif peak_risk >= 35:
        recommendation = "Medium risk is predicted. Monitor busiest cameras and review incidents."
        risk_window = "Next 4-12 hours"
    else:
        recommendation = "Risk remains low. Continue normal monitoring."
        risk_window = "Stable"

    confidence = 95 if len(recent) >= 60 else 85 if len(recent) >= 20 else 70

    insights = [
        {
            "title": "Busiest Camera",
            "value": busiest_camera,
            "level": "info",
            "description": "This camera currently has the highest active people count.",
        },
        {
            "title": "Highest Risk Camera",
            "value": highest_risk_camera,
            "level": "warning" if max_risk >= 35 else "success",
            "description": "This camera currently has the highest risk score.",
        },
        {
            "title": "Trend Direction",
            "value": "Increasing" if trend_people > 0 else "Decreasing or Stable",
            "level": "warning" if trend_people > 0 else "success",
            "description": "Based on the recent analytics window.",
        },
    ]

    return {
        "summary": {
            "peak_people": peak_people,
            "next_hour_people": next_hour_people,
            "confidence": confidence,
            "risk_window": risk_window,
            "forecast_horizon": "24h",
            "issue_probability": round(issue_probability),
            "busiest_camera": busiest_camera,
            "highest_risk_camera": highest_risk_camera,
            "recommendation": recommendation,
        },
        "forecast": forecast,
        "risk": risk_forecast,
        "cameras": camera_forecast,
        "camera_forecast": camera_forecast,
        "insights": insights,
    }


@app.get("/api/reports/analytics/csv")
def export_analytics_csv(
    camera_id: Optional[str] = Query(default=None),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
    type: Optional[str] = Query(default=None),
):
    df = filter_df(read_table("minute_analytics"), camera_id, start_date, end_date)
    filename = f"analytics_report_{int(time.time())}.csv"
    return export_df_response(df, filename, "csv", "Analytics")


@app.get("/api/reports/incidents/csv")
def export_incidents_csv(
    camera_id: Optional[str] = Query(default=None),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
):
    df = filter_df(read_table("incidents"), camera_id, start_date, end_date)
    filename = f"incidents_report_{int(time.time())}.csv"
    return export_df_response(df, filename, "csv", "Incidents")


@app.get("/api/reports/analytics/excel")
@app.get("/api/reports/cameras/excel")
def export_analytics_excel(
    camera_id: Optional[str] = Query(default=None),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
    type: Optional[str] = Query(default=None),
):
    analytics_df = filter_df(read_table("minute_analytics"), camera_id, start_date, end_date)
    incidents_df = filter_df(read_table("incidents"), camera_id, start_date, end_date)
    cameras_df = pd.DataFrame(build_cameras_response(camera_id, start_date, end_date))
    summary_data = build_summary(camera_id, start_date, end_date)
    summary_df = pd.DataFrame([summary_data.get("kpis", {})])

    if analytics_df.empty and incidents_df.empty and cameras_df.empty:
        return JSONResponse({"ok": False, "message": "No data for selected filters"}, status_code=404)

    path = EXPORTS_DIR / f"filtered_bi_report_{int(time.time())}.xlsx"

    with pd.ExcelWriter(path, engine="openpyxl") as writer:
        summary_df.to_excel(writer, sheet_name="KPI Summary", index=False)
        if not analytics_df.empty:
            analytics_df.to_excel(writer, sheet_name="Analytics", index=False)
        if not cameras_df.empty:
            cameras_df.to_excel(writer, sheet_name="Cameras", index=False)
        if not incidents_df.empty:
            incidents_df.to_excel(writer, sheet_name="Incidents", index=False)

    return FileResponse(
        path,
        filename=path.name,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@app.get("/api/reports/incidents/excel")
def export_incidents_excel(
    camera_id: Optional[str] = Query(default=None),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
):
    df = filter_df(read_table("incidents"), camera_id, start_date, end_date)
    filename = f"incidents_report_{int(time.time())}.xlsx"
    return export_df_response(df, filename, "excel", "Incidents")


@app.get("/api/reports/forecast/excel")
def export_forecast_excel(
    camera_id: Optional[str] = Query(default=None),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
    type: Optional[str] = Query(default=None),
):
    df = filter_df(read_table("minute_analytics"), camera_id, start_date, end_date)

    if df.empty:
        return JSONResponse({"ok": False, "message": "No analytics data for selected filters"}, status_code=404)

    if "timestamp" in df.columns:
        df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
        df = df.sort_values("timestamp")

    recent = df.tail(30).copy()
    avg_people = safe_float(recent.get("active_people", pd.Series([0])).mean())
    avg_risk = safe_float(recent.get("risk_score", pd.Series([0])).mean())
    last_time = recent["timestamp"].iloc[-1] if "timestamp" in recent.columns else pd.Timestamp.now()

    forecast_rows = []
    for i in range(1, 25):
        forecast_rows.append(
            {
                "forecast_hour": i,
                "predicted_time": last_time + pd.Timedelta(hours=i),
                "predicted_people": max(0, round(avg_people + i * 0.5)),
                "predicted_risk": min(100, max(0, round(avg_risk + i * 0.8))),
                "camera_id": camera_id or "all",
                "forecast_type": type or "all",
            }
        )

    forecast_df = pd.DataFrame(forecast_rows)
    path = EXPORTS_DIR / f"forecast_report_{int(time.time())}.xlsx"

    with pd.ExcelWriter(path, engine="openpyxl") as writer:
        recent.to_excel(writer, sheet_name="Filtered Analytics", index=False)
        forecast_df.to_excel(writer, sheet_name="Forecast", index=False)

    return FileResponse(
        path,
        filename=path.name,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


def executive_recommendation(kpis: dict[str, Any], incidents_count: int) -> tuple[str, str]:
    risk = safe_int(kpis.get("risk_score", 0))
    fps = safe_float(kpis.get("fps", 0))
    quality = safe_float(kpis.get("quality", 0))

    if risk >= 70 or incidents_count >= 5:
        return (
            "Critical Attention",
            "Risk is elevated. Assign a supervisor to live monitoring, review incident causes, and increase physical presence near high-risk cameras.",
        )
    if risk >= 35 or fps < 5 or quality < 65:
        return (
            "Controlled Watch",
            "Operations are stable but need attention. Improve stream quality/FPS, validate camera angles, and review the top risk camera every hour.",
        )
    return (
        "Stable Operations",
        "Current indicators are stable. Continue automated monitoring and use the camera leaderboard for routine operational review.",
    )


def make_bar_chart(title: str, labels: list[str], values: list[float], color: colors.Color) -> Drawing:
    drawing = Drawing(480, 210)
    drawing.add(String(0, 190, title, fontName="Helvetica-Bold", fontSize=13, fillColor=colors.HexColor("#111827")))

    chart = VerticalBarChart()
    chart.x = 36
    chart.y = 34
    chart.height = 130
    chart.width = 410
    chart.data = [values or [0]]
    chart.categoryAxis.categoryNames = labels or ["No data"]
    chart.categoryAxis.labels.fontSize = 7
    chart.categoryAxis.labels.boxAnchor = "ne"
    chart.categoryAxis.labels.angle = 30
    chart.valueAxis.valueMin = 0
    chart.valueAxis.valueMax = max(10, max(values or [0]) * 1.25)
    chart.valueAxis.labels.fontSize = 7
    chart.bars[0].fillColor = color
    chart.bars[0].strokeColor = color
    drawing.add(chart)
    return drawing


def make_pie_chart(title: str, labels: list[str], values: list[int]) -> Drawing:
    drawing = Drawing(480, 210)
    drawing.add(String(0, 190, title, fontName="Helvetica-Bold", fontSize=13, fillColor=colors.HexColor("#111827")))

    clean_values = [safe_int(value, 0) for value in values]
    if not any(clean_values):
        labels = ["No objects"]
        clean_values = [1]

    pie = Pie()
    pie.x = 72
    pie.y = 34
    pie.width = 135
    pie.height = 135
    pie.data = clean_values
    pie.labels = labels
    palette = ["#2563eb", "#06b6d4", "#10b981", "#f59e0b", "#ef4444"]
    for idx, color in enumerate(palette[: len(clean_values)]):
        pie.slices[idx].fillColor = colors.HexColor(color)
    drawing.add(pie)
    return drawing


def table_style(header_color: str = "#0f172a") -> TableStyle:
    return TableStyle(
        [
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(header_color)),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#cbd5e1")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]
    )


@app.get("/api/reports/executive/pdf")
def export_executive_pdf(
    camera_id: Optional[str] = Query(default=None),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
    type: Optional[str] = Query(default=None),
):
    summary_data = build_summary(camera_id, start_date, end_date)
    cameras_data = build_cameras_response(camera_id, start_date, end_date)
    incidents_df = filter_df(read_table("incidents"), camera_id, start_date, end_date)

    pdf_path = EXPORTS_DIR / f"executive_report_{int(time.time())}.pdf"
    doc = SimpleDocTemplate(
        str(pdf_path),
        pagesize=A4,
        rightMargin=0.45 * inch,
        leftMargin=0.45 * inch,
        topMargin=0.45 * inch,
        bottomMargin=0.45 * inch,
    )
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="ExecutiveTitle",
            parent=styles["Title"],
            fontName="Helvetica-Bold",
            fontSize=22,
            leading=26,
            textColor=colors.HexColor("#0f172a"),
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Muted",
            parent=styles["Normal"],
            fontSize=9,
            leading=12,
            textColor=colors.HexColor("#64748b"),
        )
    )
    styles.add(
        ParagraphStyle(
            name="Section",
            parent=styles["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=14,
            leading=18,
            textColor=colors.HexColor("#111827"),
            spaceBefore=10,
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Callout",
            parent=styles["BodyText"],
            fontSize=10,
            leading=14,
            textColor=colors.HexColor("#0f172a"),
        )
    )
    story = []

    kpis = summary_data.get("kpis", {})
    analytics_df = filter_df(read_table("minute_analytics"), camera_id, start_date, end_date)
    if "timestamp" in analytics_df.columns:
        analytics_df["timestamp"] = pd.to_datetime(analytics_df["timestamp"], errors="coerce")
        analytics_df = analytics_df.sort_values("timestamp")

    story.append(Paragraph("ASSBI Executive Security Intelligence Report", styles["ExecutiveTitle"]))
    story.append(
        Paragraph(
            f"Generated {pd.Timestamp.now().strftime('%Y-%m-%d %H:%M')} | Camera filter: {camera_id or 'All cameras'} | Period: {start_date or 'Any'} to {end_date or 'Any'}",
            styles["Muted"],
        )
    )
    story.append(Spacer(1, 12))

    recommendation_title, recommendation = executive_recommendation(kpis, safe_int(len(incidents_df)))
    story.append(
        Table(
            [[Paragraph(f"<b>AI Executive Recommendation: {recommendation_title}</b><br/>{recommendation}", styles["Callout"])]],
            colWidths=[7.25 * inch],
            style=TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#e0f2fe")),
                    ("BOX", (0, 0), (-1, -1), 0.7, colors.HexColor("#0284c7")),
                    ("LEFTPADDING", (0, 0), (-1, -1), 10),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                    ("TOPPADDING", (0, 0), (-1, -1), 9),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
                ]
            ),
        )
    )
    story.append(Spacer(1, 12))

    kpi_rows = [
        ["Live People", f"{safe_int(kpis.get('active_people', 0)):,}", "Today Visitors", f"{safe_int(kpis.get('today_visitors', 0)):,}"],
        ["Total Unique", f"{safe_int(kpis.get('total_unique', 0)):,}", "Risk Score", f"{safe_int(kpis.get('risk_score', 0))}%"],
        ["Avg FPS", f"{safe_float(kpis.get('fps', 0)):.1f}", "Quality", f"{safe_float(kpis.get('quality', 0)):.1f}%"],
        ["Objects", f"{safe_int(kpis.get('objects', 0)):,}", "Incidents", f"{safe_int(kpis.get('incidents', 0)):,}"],
    ]
    story.append(Paragraph("Board-Level KPI Snapshot", styles["Section"]))
    kpi_table = Table(kpi_rows, colWidths=[1.55 * inch, 1.9 * inch, 1.55 * inch, 1.9 * inch])
    kpi_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
                ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#0f172a")),
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")),
                ("BACKGROUND", (1, 0), (1, -1), colors.HexColor("#dbeafe")),
                ("BACKGROUND", (3, 0), (3, -1), colors.HexColor("#dcfce7")),
                ("ALIGN", (1, 0), (1, -1), "CENTER"),
                ("ALIGN", (3, 0), (3, -1), "CENTER"),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    story.append(kpi_table)
    story.append(Spacer(1, 14))

    trend_labels = [safe_str(item.get("time", "")) for item in summary_data.get("trend", [])[-8:]]
    trend_values = [safe_float(item.get("people", item.get("active", 0))) for item in summary_data.get("trend", [])[-8:]]
    risk_labels = [safe_str(cam.get("site") or cam.get("camera_id"))[:14] for cam in cameras_data[:8]]
    risk_values = [safe_float(cam.get("risk_score", 0)) for cam in cameras_data[:8]]
    story.append(make_bar_chart("People Flow Trend (latest readings)", trend_labels, trend_values, colors.HexColor("#2563eb")))
    story.append(Spacer(1, 10))
    story.append(make_bar_chart("Camera Risk Leaderboard", risk_labels, risk_values, colors.HexColor("#ef4444")))
    story.append(PageBreak())

    object_labels = ["Laptops", "Phones", "Vehicles", "Objects"]
    object_values = [
        safe_int(kpis.get("laptops", 0)),
        safe_int(kpis.get("phones", 0)),
        safe_int(kpis.get("vehicles", 0)),
        safe_int(kpis.get("objects", 0)),
    ]
    story.append(make_pie_chart("Detected Asset & Object Breakdown", object_labels, object_values))
    story.append(Spacer(1, 12))

    story.append(Paragraph("Camera Status Overview", styles["Section"]))
    camera_rows = [["Camera", "Status", "People", "Risk", "FPS", "Quality"]]
    for cam in cameras_data[:12]:
        camera_rows.append(
            [
                Paragraph(f"<b>{safe_str(cam.get('site') or cam.get('camera_id'))}</b><br/><font size='7'>{safe_str(cam.get('camera_id'))}</font>", styles["BodyText"]),
                "ONLINE" if cam.get("running") else "OFFLINE",
                safe_int(cam.get("active_people", 0)),
                f"{safe_int(cam.get('risk_score', 0))}%",
                f"{safe_float(cam.get('fps', 0)):.1f}",
                f"{safe_float(cam.get('quality', 0)):.1f}%",
            ]
        )
    story.append(Table(camera_rows, colWidths=[2.25 * inch, 0.95 * inch, 0.8 * inch, 0.8 * inch, 0.75 * inch, 0.9 * inch], style=table_style()))
    story.append(Spacer(1, 14))

    story.append(Paragraph("Incident & Operational Notes", styles["Section"]))
    if incidents_df.empty:
        story.append(Paragraph("No incidents recorded for the selected period. Continue normal monitoring.", styles["BodyText"]))
    else:
        incident_rows = [["Type", "Severity", "Camera", "Message"]]
        for _, row in incidents_df.tail(8).iterrows():
            incident_rows.append(
                [
                    safe_str(row.get("incident_type", row.get("title", "Incident")))[:24],
                    safe_str(row.get("severity", "N/A"))[:12],
                    safe_str(row.get("camera_id", "N/A"))[:18],
                    Paragraph(safe_str(row.get("description", row.get("message", "")))[:110], styles["BodyText"]),
                ]
            )
        story.append(Table(incident_rows, colWidths=[1.45 * inch, 0.8 * inch, 1.25 * inch, 3.35 * inch], style=table_style("#7f1d1d")))

    story.append(Spacer(1, 18))
    story.append(Paragraph("Prepared for executive review by ASSBI AI Surveillance & BI Platform.", styles["Muted"]))

    doc.build(story)

    return FileResponse(pdf_path, filename=pdf_path.name, media_type="application/pdf")


@app.post("/api/maintenance/cleanup")
@app.post("/api/incidents/clear")
def maintenance_cleanup(payload: Optional[dict[str, Any]] = None):
    if isinstance(payload, dict) and payload.get("full_reset"):
        restart_after_reset = payload.get("restart_cameras", True)
        for camera_id in list(RUNNING_PROCESSES.keys()):
            stop_detector(camera_id)

        init_db()
        conn = sqlite3.connect(DB_PATH, timeout=30)
        conn.execute("PRAGMA busy_timeout = 30000")
        cur = conn.cursor()

        for table in ["minute_analytics", "person_sessions", "incidents", "audit_log"]:
            cur.execute(f"DELETE FROM {table}")

        for table in ["minute_analytics", "person_sessions", "incidents", "audit_log"]:
            cur.execute("DELETE FROM sqlite_sequence WHERE name=?", (table,))

        conn.commit()
        conn.close()

        for path in FRAMES_DIR.glob("*.jpg"):
            try:
                path.unlink()
            except Exception:
                pass
        for path in FRAMES_DIR.glob("*_boxes.json"):
            try:
                path.unlink()
            except Exception:
                pass

        if restart_after_reset:
            auto_start_cameras()

        return {"ok": True, "mode": "full_reset"}

    keep_days = 30
    if isinstance(payload, dict):
        keep_days = safe_int(payload.get("keep_days", 30), 30)

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    cutoff = pd.Timestamp.now() - pd.Timedelta(days=keep_days)

    cleanup_queries = [
        ("DELETE FROM incidents WHERE camera_id LIKE 'sim_%' OR site LIKE '%Simulation%'", ()),
        ("DELETE FROM minute_analytics WHERE camera_id LIKE 'sim_%' OR site LIKE '%Simulation%'", ()),
        ("DELETE FROM person_sessions WHERE camera_id LIKE 'sim_%'", ()),
    ]

    for query, params in cleanup_queries:
        try:
            cur.execute(query, params)
        except Exception:
            pass

    for table in ["incidents", "minute_analytics"]:
        try:
            cur.execute(
                f"DELETE FROM {table} WHERE timestamp IS NOT NULL AND datetime(timestamp) < datetime(?)",
                (cutoff.strftime("%Y-%m-%d %H:%M:%S"),),
            )
        except Exception:
            pass

    conn.commit()
    conn.close()

    return {"ok": True, "message": f"Cleanup finished. Kept last {keep_days} days."}



def find_peak_period(df_analytics: pd.DataFrame) -> Optional[dict[str, Any]]:
    if df_analytics.empty or "timestamp" not in df_analytics.columns:
        return None

    work = df_analytics.copy()
    work["timestamp"] = pd.to_datetime(work["timestamp"], errors="coerce")
    work = work.dropna(subset=["timestamp"])
    if work.empty:
        return None

    if "active_people" not in work.columns:
        return None

    work["active_people"] = pd.to_numeric(work["active_people"], errors="coerce").fillna(0)
    if "risk_score" in work.columns:
        work["risk_score"] = pd.to_numeric(work["risk_score"], errors="coerce").fillna(0)
    else:
        work["risk_score"] = 0
    peak_row = work.sort_values(["active_people", "timestamp"], ascending=[False, False]).iloc[0]
    return {
        "time": peak_row["timestamp"].strftime("%Y-%m-%d %H:%M"),
        "people": safe_int(peak_row.get("active_people", 0)),
        "risk": safe_int(peak_row.get("risk_score", 0)),
    }


def build_chat_context(
    summary_data: dict[str, Any],
    camera_data: list[dict[str, Any]],
    df_analytics: pd.DataFrame,
    df_incidents: pd.DataFrame,
) -> dict[str, Any]:
    kpis = summary_data.get("kpis", {}) if isinstance(summary_data, dict) else {}
    peak = find_peak_period(df_analytics)

    cameras = []
    for camera in camera_data[:12]:
        cameras.append(
            {
                "camera_id": camera.get("camera_id"),
                "site": camera.get("site"),
                "type": camera.get("type"),
                "online": bool(camera.get("running")),
                "active_people": safe_int(camera.get("active_people", 0)),
                "today_visitors": safe_int(camera.get("today_visitors", 0)),
                "total_unique": safe_int(camera.get("total_unique", 0)),
                "objects": safe_int(camera.get("objects", 0)),
                "vehicles": safe_int(camera.get("vehicles", 0)),
                "phones": safe_int(camera.get("phones", 0)),
                "laptops": safe_int(camera.get("laptops", 0)),
                "fps": safe_float(camera.get("fps", 0)),
                "quality": safe_int(camera.get("quality", 0)),
                "risk_score": safe_int(camera.get("risk_score", 0)),
            }
        )

    incidents: list[dict[str, Any]] = []
    if not df_incidents.empty:
        work = df_incidents.copy()
        if "timestamp" in work.columns:
            work["timestamp"] = pd.to_datetime(work["timestamp"], errors="coerce")
            work = work.sort_values("timestamp", ascending=False)
        for _, row in work.head(10).iterrows():
            incidents.append(
                {
                    "timestamp": str(row.get("timestamp", "")),
                    "camera_id": row.get("camera_id"),
                    "type": row.get("type"),
                    "severity": row.get("severity"),
                    "message": row.get("message"),
                    "status": row.get("status"),
                }
            )

    trend: list[dict[str, Any]] = []
    if not df_analytics.empty:
        work = df_analytics.copy()
        if "timestamp" in work.columns:
            work["timestamp"] = pd.to_datetime(work["timestamp"], errors="coerce")
            work = work.sort_values("timestamp", ascending=False)
        for _, row in work.head(30).iterrows():
            trend.append(
                {
                    "timestamp": str(row.get("timestamp", "")),
                    "camera_id": row.get("camera_id"),
                    "active_people": safe_int(row.get("active_people", 0)),
                    "today_visitors": safe_int(row.get("today_visitors", 0)),
                    "total_unique": safe_int(row.get("total_unique", 0)),
                    "objects": safe_int(row.get("objects", 0)),
                    "vehicles": safe_int(row.get("vehicles", 0)),
                    "risk_score": safe_int(row.get("risk_score", 0)),
                    "fps": safe_float(row.get("fps", 0)),
                    "quality": safe_int(row.get("quality", 0)),
                }
            )

    return {
        "generated_at": pd.Timestamp.now().isoformat(),
        "kpis": {
            "active_people": safe_int(kpis.get("active_people", 0)),
            "today_visitors": safe_int(kpis.get("today_visitors", 0)),
            "total_unique": safe_int(kpis.get("total_unique", 0)),
            "objects": safe_int(kpis.get("objects", 0)),
            "vehicles": safe_int(kpis.get("vehicles", 0)),
            "phones": safe_int(kpis.get("phones", 0)),
            "laptops": safe_int(kpis.get("laptops", 0)),
            "risk_score": safe_int(kpis.get("risk_score", 0)),
            "fps": safe_float(kpis.get("fps", 0)),
            "quality": safe_int(kpis.get("quality", 0)),
            "incidents": safe_int(kpis.get("incidents", 0)),
        },
        "peak_period": peak,
        "cameras": cameras,
        "recent_incidents": incidents,
        "recent_trend": trend,
        "notes": [
            "Standing and sitting analytics were removed because they were unreliable for the camera angles.",
            "Live people means current detected people. Today visitors and total unique are visit counters from tracking data.",
        ],
    }


def get_openai_api_key() -> str:
    for key_name in ("OPENAI_API_KEY", "ASSBI_OPENAI_API_KEY"):
        value = os.getenv(key_name, "").strip()
        if value:
            return value
    try:
        return str(load_settings().get("openai_api_key", "")).strip()
    except Exception:
        return ""


def ask_openai_assistant(user_message: str, context: dict[str, Any]) -> Optional[str]:
    api_key = get_openai_api_key()
    if not api_key:
        return None

    system_prompt = (
        "You are the ASSBI Platform AI assistant. Answer naturally in the same language as the user; "
        "if the user writes Uzbek, use Uzbek Latin. Use the provided ASSBI JSON context for questions "
        "about cameras, people counts, peak time, risk, incidents, objects, FPS, quality, reports and operations. "
        "Do not invent database values. If the context is insufficient, say exactly what is missing and give the "
        "best available answer. Keep answers concise, practical and executive-friendly."
    )
    payload = {
        "model": os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        "messages": [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": (
                    "ASSBI_CONTEXT_JSON:\n"
                    + json.dumps(context, ensure_ascii=False, default=str)[:18000]
                    + "\n\nUSER_QUESTION:\n"
                    + user_message
                ),
            },
        ],
        "temperature": 0.2,
        "max_tokens": 700,
    }

    request = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=18) as response:
            data = json.loads(response.read().decode("utf-8"))
        reply = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        return reply.strip() or None
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, KeyError, IndexError, json.JSONDecodeError):
        return None


def text_has_any(text: str, words: list[str]) -> bool:
    return any(word in text for word in words)


def wants_uzbek(text: str) -> bool:
    return text_has_any(
        text,
        [
            "qancha", "qaysi", "qayer", "kamera", "odam", "odamlar", "hozir",
            "bugun", "xavf", "risk", "ishlayap", "ishlayab", "ishlamay", "eng",
            "hisobot", "hodisa", "obyekt", "mashina", "telefon", "noutbuk", "sifat",
        ],
    )


def camera_display_name(camera: dict[str, Any]) -> str:
    return str(camera.get("site") or camera.get("camera_id") or "Unknown")


def sorted_live_cameras(camera_data: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        camera_data,
        key=lambda item: (safe_int(item.get("active_people", 0)), safe_float(item.get("fps", 0)), safe_int(item.get("risk_score", 0))),
        reverse=True,
    )


def format_live_people_by_camera(camera_data: list[dict[str, Any]], uz: bool) -> str:
    if not camera_data:
        return "Hozir kamera topilmadi." if uz else "No cameras are currently configured."

    live = sorted_live_cameras(camera_data)
    total_people = sum(safe_int(camera.get("active_people", 0)) for camera in live if camera.get("running"))
    lines = []
    for camera in live:
        status = "online" if camera.get("running") else "offline"
        has_frame = bool(camera.get("has_frame"))
        frame_status = "frame bor" if has_frame else "frame yo‘q"
        lines.append(
            f"- {camera_display_name(camera)} ({camera.get('camera_id', '-')}) — "
            f"{safe_int(camera.get('active_people', 0))} odam, "
            f"risk {safe_int(camera.get('risk_score', 0))}%, "
            f"FPS {safe_float(camera.get('fps', 0)):.1f}, {status}, {frame_status}"
        )

    if uz:
        return "Hozir live kameralar bo‘yicha odamlar:\n" + "\n".join(lines) + f"\nJami live odam: {total_people}."
    return "Current live people by camera:\n" + "\n".join(lines) + f"\nTotal live people: {total_people}."


def format_camera_status(camera_data: list[dict[str, Any]], uz: bool) -> str:
    total = len(camera_data)
    online = len([c for c in camera_data if c.get("running") and c.get("has_frame")])
    no_frame = len([c for c in camera_data if c.get("running") and not c.get("has_frame")])
    offline = total - online - no_frame
    if uz:
        return f"Kamera statusi: {online} ta live/frame bor, {no_frame} ta process bor lekin frame yo‘q, {offline} ta offline. Jami {total} kamera."
    return f"Camera status: {online} live with frames, {no_frame} running without frames, {offline} offline. {total} total cameras."


def format_highest_risk(camera_data: list[dict[str, Any]], uz: bool) -> str:
    if not camera_data:
        return "Kamera topilmadi." if uz else "No cameras are currently configured."
    highest = max(camera_data, key=lambda x: safe_int(x.get("risk_score", 0)))
    if uz:
        return f"Eng yuqori risk: {camera_display_name(highest)} ({highest.get('camera_id', '-')}) — {safe_int(highest.get('risk_score', 0))}% risk, {safe_int(highest.get('active_people', 0))} odam."
    return f"The highest risk camera is {camera_display_name(highest)} ({highest.get('camera_id', '-')}) with {safe_int(highest.get('risk_score', 0))}% risk and {safe_int(highest.get('active_people', 0))} active people."


def format_busiest_camera(camera_data: list[dict[str, Any]], uz: bool) -> str:
    if not camera_data:
        return "Kamera topilmadi." if uz else "No cameras are currently configured."
    busiest = max(camera_data, key=lambda x: safe_int(x.get("active_people", 0)))
    if uz:
        return f"Eng gavjum kamera: {camera_display_name(busiest)} ({busiest.get('camera_id', '-')}) — {safe_int(busiest.get('active_people', 0))} odam, risk {safe_int(busiest.get('risk_score', 0))}%."
    return f"The busiest camera is {camera_display_name(busiest)} ({busiest.get('camera_id', '-')}) with {safe_int(busiest.get('active_people', 0))} active people."


@app.delete("/api/cleanup/demo")
def cleanup_demo_data():
    return maintenance_cleanup({"keep_days": 9999})


@app.post("/api/chat")
def ai_chat(req: ChatRequest):
    original_message = req.message.strip()
    message = original_message.lower()
    camera_data = build_cameras_response()
    summary_data: Optional[dict[str, Any]] = None
    kpis: Optional[dict[str, Any]] = None
    df_analytics: Optional[pd.DataFrame] = None
    df_incidents: Optional[pd.DataFrame] = None
    uz = wants_uzbek(message)

    def get_summary_data() -> dict[str, Any]:
        nonlocal summary_data, kpis
        if summary_data is None:
            summary_data = build_summary()
            kpis = summary_data.get("kpis", {})
        return summary_data

    def get_kpis() -> dict[str, Any]:
        get_summary_data()
        return kpis or {}

    def get_analytics_df() -> pd.DataFrame:
        nonlocal df_analytics
        if df_analytics is None:
            df_analytics = read_table("minute_analytics")
        return df_analytics

    def get_incidents_df() -> pd.DataFrame:
        nonlocal df_incidents
        if df_incidents is None:
            df_incidents = read_table("incidents")
        return df_incidents

    if not message:
        return {"reply": "Kamera, odamlar, risk, incident yoki analytics haqida savol yozing." if uz else "Please ask something about people, risk, cameras, incidents, objects or analytics.", "source": "fallback"}

    operational_words = [
        "live", "hozir", "real time", "realtime", "real-time", "odam", "odamlar", "people",
        "camera", "kamera", "kamerada", "qaysi", "qancha", "risk", "xavf", "fps", "quality",
        "sifat", "stream", "incident", "hodisa", "alert", "anomaly", "obyekt", "object",
        "telefon", "phone", "noutbuk", "laptop", "transport", "vehicle", "status", "online",
        "offline", "summary", "xulosa", "hisobot", "trend", "analytics", "statistika",
    ]
    should_answer_locally = text_has_any(message, operational_words) or message in {"hi", "hello", "hey", "salom", "assalomu alaykum", "salam"}

    if not should_answer_locally:
        ai_reply = ask_openai_assistant(
            original_message,
            build_chat_context(get_summary_data(), camera_data, get_analytics_df(), get_incidents_df()),
        )
        if ai_reply:
            return {"reply": ai_reply, "source": "openai"}

    if message in {"hi", "hello", "hey", "salom", "assalomu alaykum", "salam"}:
        return {
            "reply": (
                "Salom! Men ASSBI AI yordamchiman. Hozirgi odamlar soni, qaysi kamerada nechta odam bor, "
                "risk, FPS, stream sifati, obyektlar, incidentlar va umumiy holat haqida so‘rashingiz mumkin."
                if uz else
                "Hello! I am your ASSBI AI assistant. Ask about live people, cameras, risk, FPS, quality, objects, incidents and summaries."
            ),
            "source": "fallback",
        }

    live_people_words = ["live", "hozir", "real time", "realtime", "real-time", "ayni payt", "shu payt", "odam", "odamlar", "people", "person", "qancha"]
    camera_words = ["qaysi kamera", "kamerada", "kamera", "camera", "cameras", "where", "qayer"]
    if text_has_any(message, live_people_words) and (text_has_any(message, camera_words) or text_has_any(message, ["qancha", "count", "soni"])):
        return {"reply": format_live_people_by_camera(camera_data, uz), "source": "fallback"}

    if text_has_any(message, ["highest risk", "risk camera", "most risky", "eng yuqori risk", "eng xavf", "xavfli", "risk baland", "risk eng baland", "eng baland", "yuqori risk"]):
        return {"reply": format_highest_risk(camera_data, uz), "source": "fallback"}

    if text_has_any(message, ["busiest", "most people", "crowded", "eng gavjum", "eng ko'p odam", "eng kop odam", "odam eng ko'p", "odam eng kop"]):
        return {"reply": format_busiest_camera(camera_data, uz), "source": "fallback"}

    if text_has_any(message, ["offline", "online", "camera status", "kamera status", "kameralar ishlay", "ishlayaptimi", "ishlayabdimi", "frame yo'q", "frame yuq"]):
        return {"reply": format_camera_status(camera_data, uz), "source": "fallback"}

    if text_has_any(message, ["summary", "overview", "security report", "xulosa", "umumiy", "holat", "hisobot"]):
        kpis = get_kpis()
        if uz:
            reply = (
                f"Umumiy holat: {kpis.get('active_people', 0)} live odam, "
                f"{kpis.get('total_unique', 0)} total unique, risk {kpis.get('risk_score', 0)}%, "
                f"{kpis.get('incidents', 0)} incident, {kpis.get('laptops', 0)} noutbuk, "
                f"{kpis.get('phones', 0)} telefon, {kpis.get('vehicles', 0)} transport va "
                f"{kpis.get('objects', 0)} obyekt aniqlangan."
            )
        else:
            reply = (
                f"Security summary: {kpis.get('active_people', 0)} active people, "
                f"{kpis.get('total_unique', 0)} total unique people, {kpis.get('risk_score', 0)}% risk, "
                f"{kpis.get('incidents', 0)} incidents, {kpis.get('laptops', 0)} laptops, "
                f"{kpis.get('phones', 0)} phones, {kpis.get('vehicles', 0)} vehicles and {kpis.get('objects', 0)} objects."
            )
        return {"reply": reply, "source": "fallback"}

    if text_has_any(message, ["peak", "pik", "eng ko'p", "eng kop", "qaysi vaqt", "vaqt"]):
        peak = find_peak_period(get_analytics_df())
        if peak:
            return {"reply": f"Eng gavjum vaqt: {peak['time']} atrofida. Shu paytda {peak['people']} odam bo‘lgan, risk {peak['risk']}%." if uz else f"Peak time: around {peak['time']}. People: {peak['people']}, risk: {peak['risk']}%.", "source": "fallback"}
        return {"reply": "Peak vaqtni hisoblash uchun hali yetarli analytics ma’lumot yo‘q." if uz else "Not enough analytics data to calculate peak time yet.", "source": "fallback"}

    if text_has_any(message, ["incident", "alert", "anomaly", "hodisa", "xabar", "ogohlantirish", "anomaliya"]):
        incidents_df = get_incidents_df()
        if incidents_df.empty:
            return {"reply": "Hozir database’da incident yo‘q." if uz else "No incidents are currently recorded in the database.", "source": "fallback"}
        high = len(incidents_df[incidents_df["severity"] == "HIGH"]) if "severity" in incidents_df.columns else 0
        medium = len(incidents_df[incidents_df["severity"] == "MEDIUM"]) if "severity" in incidents_df.columns else 0
        low = len(incidents_df) - high - medium
        return {"reply": f"Jami {len(incidents_df)} incident bor. High: {high}, medium: {medium}, low/other: {low}." if uz else f"There are {len(incidents_df)} incidents recorded. High: {high}, medium: {medium}, low/other: {low}.", "source": "fallback"}

    if text_has_any(message, ["risk", "xavf"]):
        kpis = get_kpis()
        risk = safe_int(kpis.get("risk_score", 0))
        if risk >= 70:
            level = "yuqori" if uz else "high"
            action = "Darhol monitoring qilish kerak." if uz else "Immediate monitoring is recommended."
        elif risk >= 35:
            level = "o‘rtacha" if uz else "medium"
            action = "Yaqindan kuzatishda davom eting." if uz else "Continue close monitoring."
        else:
            level = "past" if uz else "low"
            action = "Oddiy monitoring yetarli." if uz else "Normal monitoring is enough."
        return {"reply": f"Hozirgi risk {risk}%, daraja {level}. {action}" if uz else f"Current risk score is {risk}%, which is {level}. {action}", "source": "fallback"}

    object_queries = [
        (["laptop", "noutbuk"], "laptops", "noutbuk", "laptops"),
        (["phone", "telefon"], "phones", "telefon", "phones"),
        (["vehicle", "car", "mashina", "transport"], "vehicles", "transport", "vehicles"),
        (["object", "obyekt", "obj"], "objects", "obyekt", "objects"),
    ]
    kpis = get_kpis()
    for words, key, uz_name, en_name in object_queries:
        if text_has_any(message, words):
            return {"reply": f"Hozir {kpis.get(key, 0)} ta {uz_name} aniqlangan." if uz else f"{kpis.get(key, 0)} {en_name} are currently detected.", "source": "fallback"}

    if text_has_any(message, ["fps", "quality", "sifat", "stream"]):
        return {"reply": f"Hozir o‘rtacha FPS {safe_float(kpis.get('fps', 0)):.1f}, stream sifati {safe_int(kpis.get('quality', 0))}%." if uz else f"Average FPS is {safe_float(kpis.get('fps', 0)):.1f}, stream quality is {safe_int(kpis.get('quality', 0))}%.", "source": "fallback"}

    if text_has_any(message, ["standing", "sitting", "posture", "turib", "o'tirib", "otirib"]):
        return {"reply": "Standing/sitting analytics hozir o‘chirilgan, chunki bu kamera burchagida ishonchli emas. Live odam soni person boxlar orqali olinadi." if uz else "Standing and sitting analytics are disabled because they were not reliable for the current camera angle. Live people count is based on detected person boxes.", "source": "fallback"}

    if text_has_any(message, ["trend", "analytics", "statistika"]):
        analytics_df = get_analytics_df()
        kpis = get_kpis()
        if analytics_df.empty:
            return {"reply": "Hali analytics data yo‘q." if uz else "No analytics data is available yet.", "source": "fallback"}
        return {"reply": f"Analytics bazada {len(analytics_df)} yozuv bor. Oxirgi live odam: {kpis.get('active_people', 0)}, risk: {kpis.get('risk_score', 0)}%." if uz else f"Analytics database contains {len(analytics_df)} records. Latest active people: {kpis.get('active_people', 0)}, latest risk score: {kpis.get('risk_score', 0)}%.", "source": "fallback"}

    return {
        "reply": (
            "Men kamera bo‘yicha live odamlar, qaysi kamerada nechta odam borligi, eng yuqori risk, eng gavjum kamera, FPS/sifat, obyektlar, incidentlar va umumiy holatga javob bera olaman. Masalan: ‘hozir qaysi kamerada qancha odam bor?’"
            if uz else
            "I can answer questions about live people by camera, highest risk, busiest camera, FPS/quality, objects, incidents and summaries. Try: ‘how many people are live in each camera?’"
        ),
        "source": "fallback",
    }
