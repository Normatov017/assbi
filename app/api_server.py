import base64
import hashlib
import hmac
import json
import os
import sqlite3
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Optional

import pandas as pd
from fastapi import FastAPI, File, Form, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse
from pydantic import BaseModel

from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
from reportlab.lib.styles import getSampleStyleSheet

try:
    from app.config import DB_PATH
    from app.database import init_db, get_thresholds, insert_minute_analytics, update_threshold
except ModuleNotFoundError:
    from config import DB_PATH
    from database import init_db, get_thresholds, insert_minute_analytics, update_threshold


BASE_DIR = Path(__file__).resolve().parent.parent
FRAMES_DIR = BASE_DIR / "frames"
STREAMS_DIR = BASE_DIR / "streams"
EXPORTS_DIR = BASE_DIR / "exports"
LOGS_DIR = BASE_DIR / "logs"
CAMERAS_FILE = STREAMS_DIR / "cameras.json"
SETTINGS_FILE = STREAMS_DIR / "settings.json"

FRAMES_DIR.mkdir(exist_ok=True)
STREAMS_DIR.mkdir(exist_ok=True)
EXPORTS_DIR.mkdir(exist_ok=True)
LOGS_DIR.mkdir(exist_ok=True)

app = FastAPI(title="ASSBI Ultra API", version="3.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

RUNNING_PROCESSES: dict[str, subprocess.Popen] = {}

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


def safe_str(value: Any, default: str = "") -> str:
    try:
        if value is None or pd.isna(value):
            return default
        return str(value)
    except Exception:
        return default


def is_local_video(url: str) -> bool:
    return str(url).lower().endswith((".mp4", ".mov", ".avi", ".mkv", ".webm"))


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
    init_db()
    if not Path(DB_PATH).exists():
        return pd.DataFrame()

    conn = sqlite3.connect(DB_PATH)
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


def start_detector(camera_id: str, site: str, url: str, speed_mode: str = "normal") -> bool:
    if not url:
        return False

    existing = RUNNING_PROCESSES.get(camera_id)
    if existing and existing.poll() is None:
        return True

    if speed_mode not in ["slow", "normal", "fast"]:
        speed_mode = "normal"

    lightweight = os.getenv("ASSBI_LIGHTWEIGHT_DETECTOR", "0") == "1"
    detector_path = BASE_DIR / "app" / ("frame_grabber.py" if lightweight else "main_detector.py")
    if not detector_path.exists():
        return False

    cmd = [
        sys.executable,
        str(detector_path),
        "--url",
        url,
        "--camera-id",
        camera_id,
        "--site",
        site,
    ]

    if lightweight:
        cmd.extend(["--interval", "1.5"])
    else:
        cmd.extend(["--clean-ui", "--speed-mode", speed_mode])

    if not lightweight and is_local_video(url):
        cmd.extend(["--detect-every", "3", "--log-every", "5"])
    elif not lightweight:
        cmd.append("--fast-mode")

    log_file = open(LOGS_DIR / f"{camera_id}.log", "a", encoding="utf-8")

    process = subprocess.Popen(
        cmd,
        cwd=str(BASE_DIR),
        stdout=log_file,
        stderr=log_file,
    )

    RUNNING_PROCESSES[camera_id] = process
    print("[ASSBI] Started detector:", " ".join(cmd))

    return True


def stop_detector(camera_id: str) -> bool:
    process = RUNNING_PROCESSES.get(camera_id)

    if process and process.poll() is None:
        process.terminate()
        RUNNING_PROCESSES.pop(camera_id, None)
        return True

    RUNNING_PROCESSES.pop(camera_id, None)
    return False


def auto_start_cameras() -> None:
    for cam in load_cameras():
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

    config_cameras = load_cameras()
    if camera_id and camera_id != "all":
        config_cameras = [cam for cam in config_cameras if cam.get("camera_id") == camera_id]

    result = []

    for cam in config_cameras:
        cam_id = cam.get("camera_id")
        latest = latest_map.get(cam_id, {})
        process = RUNNING_PROCESSES.get(cam_id)
        running = bool(process and process.poll() is None) or is_recent_camera_row(latest)

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
                "risk_score": safe_int(latest.get("risk_score", 0)),
                "fps": round(safe_float(latest.get("fps", 0)), 1),
                "quality": round(safe_float(latest.get("data_quality_score", latest.get("quality", 0))), 1),
                "laptops": safe_int(latest.get("laptop_count", latest.get("laptops", 0))),
                "phones": safe_int(latest.get("phone_count", latest.get("phones", 0))),
                "vehicles": safe_int(latest.get("vehicle_count", latest.get("vehicles", 0))),
                "objects": safe_int(latest.get("object_count", latest.get("objects", 0))),
                "standing": safe_int(latest.get("standing_count", latest.get("standing", 0))),
                "sitting": safe_int(latest.get("sitting_count", latest.get("sitting", 0))),
                "created_at": safe_str(latest.get("timestamp", "")),
                "timestamp": safe_str(latest.get("timestamp", "")),
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
            "total_unique": 0,
            "risk_score": 0,
            "fps": 0,
            "quality": 0,
            "laptops": 0,
            "phones": 0,
            "vehicles": 0,
            "objects": 0,
            "incidents": safe_int(len(incidents_df)),
            "standing": 0,
            "sitting": 0,
        },
        "trend": [],
        "zones": [],
        "posture": [],
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

    posture = [
        {"name": "Standing", "value": safe_int(day_df.get("standing_count", pd.Series([0])).sum())},
        {"name": "Sitting", "value": safe_int(day_df.get("sitting_count", pd.Series([0])).sum())},
    ]

    latest_clean = {
        key: value.isoformat() if hasattr(value, "isoformat") else value
        for key, value in latest.items()
    }

    return {
        "latest": latest_clean,
        "kpis": {
            "active_people": safe_int(latest.get("active_people", 0)),
            "new_unique_today": safe_int(day_df.get("new_unique_people", pd.Series([0])).sum()),
            "total_unique": safe_int(latest.get("total_unique_people", latest.get("total_unique", 0))),
            "risk_score": safe_int(latest.get("risk_score", 0)),
            "fps": round(safe_float(latest.get("fps", 0)), 1),
            "quality": round(safe_float(latest.get("data_quality_score", latest.get("quality", 0))), 1),
            "laptops": safe_int(latest.get("laptop_count", latest.get("laptops", 0))),
            "phones": safe_int(latest.get("phone_count", latest.get("phones", 0))),
            "vehicles": safe_int(latest.get("vehicle_count", latest.get("vehicles", 0))),
            "objects": safe_int(latest.get("object_count", latest.get("objects", 0))),
            "incidents": safe_int(len(incidents_df)),
            "standing": safe_int(latest.get("standing_count", latest.get("standing", 0))),
            "sitting": safe_int(latest.get("sitting_count", latest.get("sitting", 0))),
        },
        "trend": trend,
        "zones": zones,
        "posture": posture,
        "incidents": json_safe_records(incidents_df.tail(20).sort_values("id", ascending=False) if "id" in incidents_df.columns else incidents_df.tail(20)),
        "cameras": build_cameras_response(camera_id, start_date, end_date),
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


@app.get("/api/cameras")
def cameras(
    camera_id: Optional[str] = Query(default=None),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
):
    return build_cameras_response(camera_id, start_date, end_date)


@app.get("/api/relay/cameras")
def relay_cameras():
    return build_cameras_response()


@app.post("/api/cameras")
@app.post("/api/cameras/add")
@app.post("/api/add_camera")
def add_camera(payload: CameraPayload):
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

    started = start_detector(camera_id, site, url, speed_mode)

    return {
        "ok": True,
        "camera_id": camera_id,
        "started": started,
        "message": "Camera saved and detector start attempted",
        "cameras": cameras_data,
    }


@app.post("/api/cameras/{camera_id}/start")
def start_camera(camera_id: str):
    cam = next((c for c in load_cameras() if c.get("camera_id") == camera_id), None)
    if not cam:
        return JSONResponse({"ok": False, "message": "Camera not found"}, status_code=404)

    started = start_detector(
        cam.get("camera_id"),
        cam.get("site", camera_id),
        cam.get("url", ""),
        cam.get("speed_mode", "normal"),
    )
    return {"ok": True, "started": started}


@app.post("/api/cameras/{camera_id}/stop")
def stop_camera(camera_id: str):
    stopped = stop_detector(camera_id)
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

    final_path = FRAMES_DIR / f"{cam_id}.jpg"
    temp_path = FRAMES_DIR / f"{cam_id}_tmp.jpg"
    temp_path.write_bytes(await frame.read())
    temp_path.replace(final_path)

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
            "total_unique_people": total_unique_people,
            "vehicle_count": vehicle_count,
            "object_count": object_count,
            "laptop_count": laptop_count,
            "phone_count": phone_count,
            "left_zone": left_zone,
            "center_zone": center_zone,
            "right_zone": right_zone,
            "standing_count": standing_count,
            "sitting_count": sitting_count,
            "crowd_level": crowd_level,
            "risk_score": risk_score,
            "fps": fps,
            "data_quality_score": data_quality_score,
        }
    )

    return {"ok": True, "camera_id": cam_id}


@app.delete("/api/cameras/{camera_id}")
@app.delete("/api/camera/{camera_id}")
@app.delete("/api/cameras/{camera_id}/delete")
def delete_camera(camera_id: str):
    stop_detector(camera_id)

    cameras_data = [cam for cam in load_cameras() if cam.get("camera_id") != camera_id]
    save_cameras(cameras_data)

    frame_path = FRAMES_DIR / f"{camera_id}.jpg"
    if frame_path.exists():
        frame_path.unlink()

    return {"ok": True, "camera_id": camera_id, "cameras": cameras_data}


@app.get("/api/frame/{camera_id}")
def camera_frame(camera_id: str):
    frame_path = FRAMES_DIR / f"{camera_id}.jpg"
    if not frame_path.exists():
        return JSONResponse({"ok": False, "message": "No frame available yet"}, status_code=404)

    return FileResponse(frame_path, media_type="image/jpeg", headers={"Cache-Control": "no-store"})


def mjpeg_generator(camera_id: str):
    frame_path = FRAMES_DIR / f"{camera_id}.jpg"

    while True:
        if frame_path.exists():
            try:
                frame = frame_path.read_bytes()
                yield b"--frame\r\n" b"Content-Type: image/jpeg\r\n\r\n" + frame + b"\r\n"
            except Exception:
                pass
        time.sleep(0.03)


@app.get("/api/stream/{camera_id}")
def stream_camera(camera_id: str):
    return StreamingResponse(
        mjpeg_generator(camera_id),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


@app.get("/api/snapshot/{camera_id}")
def export_snapshot(camera_id: str):
    frame_path = FRAMES_DIR / f"{camera_id}.jpg"
    if not frame_path.exists():
        return JSONResponse({"ok": False, "message": "No frame available"}, status_code=404)

    snapshot_dir = EXPORTS_DIR / "snapshots"
    snapshot_dir.mkdir(parents=True, exist_ok=True)

    filename = f"{camera_id}_snapshot_{int(time.time())}.jpg"
    snapshot_path = snapshot_dir / filename
    snapshot_path.write_bytes(frame_path.read_bytes())

    return FileResponse(snapshot_path, filename=filename, media_type="image/jpeg")


@app.get("/api/thresholds")
def thresholds():
    return load_settings()


@app.post("/api/thresholds")
@app.post("/api/settings")
def save_thresholds(payload: dict[str, Any]):
    saved = save_settings(payload)
    return {"ok": True, "settings": saved, **saved}


@app.post("/api/thresholds/{key}")
def set_threshold(key: str, payload: dict[str, Any]):
    value = payload.get("value")
    saved = save_settings({key: value})
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
    doc = SimpleDocTemplate(str(pdf_path))
    styles = getSampleStyleSheet()
    story = []

    story.append(Paragraph("ASSBI Executive Security Intelligence Report", styles["Title"]))
    story.append(Spacer(1, 16))
    story.append(Paragraph("Generated automatically by ASSBI Platform", styles["Normal"]))
    story.append(Paragraph(f"Camera Filter: {camera_id or 'All'}", styles["Normal"]))
    story.append(Paragraph(f"Date Range: {start_date or 'Any'} to {end_date or 'Any'}", styles["Normal"]))
    story.append(Spacer(1, 20))

    kpis = summary_data.get("kpis", {})
    story.append(Paragraph("Executive KPI Summary", styles["Heading1"]))
    story.append(
        Paragraph(
            f"""
            Active People: {kpis.get('active_people', 0)}<br/>
            Total Unique People: {kpis.get('total_unique', 0)}<br/>
            Risk Score: {kpis.get('risk_score', 0)}%<br/>
            Incidents: {kpis.get('incidents', 0)}<br/>
            Laptops: {kpis.get('laptops', 0)}<br/>
            Phones: {kpis.get('phones', 0)}<br/>
            Vehicles: {kpis.get('vehicles', 0)}<br/>
            Objects: {kpis.get('objects', 0)}
            """,
            styles["BodyText"],
        )
    )

    story.append(Spacer(1, 20))
    story.append(Paragraph("Camera Status Overview", styles["Heading1"]))

    if not cameras_data:
        story.append(Paragraph("No camera data available for selected filters.", styles["Normal"]))
    else:
        for cam in cameras_data:
            status = "ONLINE" if cam.get("running") else "OFFLINE"
            story.append(
                Paragraph(
                    f"""
                    <b>{cam.get('site')}</b><br/>
                    Camera ID: {cam.get('camera_id')}<br/>
                    Status: {status}<br/>
                    Active People: {cam.get('active_people', 0)}<br/>
                    Risk Score: {cam.get('risk_score', 0)}%
                    """,
                    styles["BodyText"],
                )
            )
            story.append(Spacer(1, 10))

    story.append(PageBreak())
    story.append(Paragraph("Incident Analysis", styles["Heading1"]))

    if incidents_df.empty:
        story.append(Paragraph("No incidents recorded for selected filters.", styles["Normal"]))
    else:
        recent = incidents_df.tail(20)
        for _, row in recent.iterrows():
            story.append(
                Paragraph(
                    f"""
                    <b>{row.get('incident_type', row.get('title', 'Incident'))}</b><br/>
                    Severity: {row.get('severity', 'N/A')}<br/>
                    Camera: {row.get('camera_id', 'N/A')}<br/>
                    Description: {row.get('description', row.get('message', ''))}
                    """,
                    styles["BodyText"],
                )
            )
            story.append(Spacer(1, 8))

    story.append(PageBreak())
    story.append(Paragraph("AI Executive Recommendation", styles["Heading1"]))

    risk = safe_int(kpis.get("risk_score", 0))
    if risk >= 70:
        recommendation = "High operational risk detected. Increase monitoring and security presence immediately."
    elif risk >= 35:
        recommendation = "Medium risk detected. Continue monitoring and review incident patterns."
    else:
        recommendation = "Low risk environment. Current monitoring strategy is sufficient."

    story.append(Paragraph(recommendation, styles["BodyText"]))
    story.append(Spacer(1, 20))
    story.append(Paragraph("Generated by ASSBI AI Security Platform", styles["Italic"]))

    doc.build(story)

    return FileResponse(pdf_path, filename=pdf_path.name, media_type="application/pdf")


@app.post("/api/maintenance/cleanup")
@app.post("/api/incidents/clear")
def maintenance_cleanup(payload: Optional[dict[str, Any]] = None):
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


@app.delete("/api/cleanup/demo")
def cleanup_demo_data():
    return maintenance_cleanup({"keep_days": 9999})


@app.post("/api/chat")
def ai_chat(req: ChatRequest):
    message = req.message.lower().strip()
    summary_data = build_summary()
    kpis = summary_data.get("kpis", {})
    camera_data = build_cameras_response()
    df_analytics = read_table("minute_analytics")
    df_incidents = read_table("incidents")

    if not message:
        return {"reply": "Please ask something about people, risk, cameras, incidents, objects or analytics."}

    if "highest risk" in message or "risk camera" in message or "most risky" in message:
        if not camera_data:
            return {"reply": "No cameras are currently configured."}
        highest = max(camera_data, key=lambda x: x.get("risk_score", 0))
        return {
            "reply": (
                f"The highest risk camera is {highest.get('site', 'Unknown')} "
                f"({highest.get('camera_id', '-')}) with a risk score of "
                f"{highest.get('risk_score', 0)}%."
            )
        }

    if "busiest" in message or "most people" in message or "crowded" in message:
        if not camera_data:
            return {"reply": "No cameras are currently configured."}
        busiest = max(camera_data, key=lambda x: x.get("active_people", 0))
        return {
            "reply": (
                f"The busiest camera is {busiest.get('site', 'Unknown')} "
                f"({busiest.get('camera_id', '-')}) with "
                f"{busiest.get('active_people', 0)} active people."
            )
        }

    if "offline" in message or "online" in message or "camera status" in message:
        total = len(camera_data)
        online = len([c for c in camera_data if c.get("running")])
        offline = total - online
        return {"reply": f"Camera status: {online} online, {offline} offline, {total} total configured cameras."}

    if "summary" in message or "overview" in message or "security report" in message:
        return {
            "reply": (
                f"Security summary: {kpis.get('active_people', 0)} active people, "
                f"{kpis.get('total_unique', 0)} total unique people, "
                f"{kpis.get('risk_score', 0)}% risk score, "
                f"{kpis.get('incidents', 0)} incidents, "
                f"{kpis.get('laptops', 0)} laptops, "
                f"{kpis.get('phones', 0)} phones, "
                f"{kpis.get('vehicles', 0)} vehicles and "
                f"{kpis.get('objects', 0)} objects detected."
            )
        }

    if "incident" in message or "alert" in message or "anomaly" in message:
        if df_incidents.empty:
            return {"reply": "No incidents are currently recorded in the database."}

        high = len(df_incidents[df_incidents["severity"] == "HIGH"]) if "severity" in df_incidents.columns else 0
        medium = len(df_incidents[df_incidents["severity"] == "MEDIUM"]) if "severity" in df_incidents.columns else 0
        low = len(df_incidents) - high - medium

        return {"reply": f"There are {len(df_incidents)} incidents recorded. High severity: {high}, medium severity: {medium}, low/other: {low}."}

    if "people" in message or "person" in message or "occupancy" in message:
        return {"reply": f"There are currently {kpis.get('active_people', 0)} active people. Total unique people recorded: {kpis.get('total_unique', 0)}."}

    if "risk" in message:
        risk = safe_int(kpis.get("risk_score", 0))
        if risk >= 70:
            level = "high"
            action = "Immediate monitoring is recommended."
        elif risk >= 35:
            level = "medium"
            action = "Continue close monitoring."
        else:
            level = "low"
            action = "Normal monitoring is enough."
        return {"reply": f"Current risk score is {risk}%, which is {level}. {action}"}

    if "laptop" in message:
        return {"reply": f"{kpis.get('laptops', 0)} laptops are currently detected."}
    if "phone" in message:
        return {"reply": f"{kpis.get('phones', 0)} phones are currently detected."}
    if "vehicle" in message or "car" in message:
        return {"reply": f"{kpis.get('vehicles', 0)} vehicles are currently detected."}
    if "object" in message:
        return {"reply": f"{kpis.get('objects', 0)} objects are currently detected."}
    if "standing" in message or "sitting" in message or "posture" in message:
        return {"reply": f"Posture analytics: {kpis.get('standing', 0)} standing people and {kpis.get('sitting', 0)} sitting people detected."}
    if "trend" in message or "analytics" in message:
        if df_analytics.empty:
            return {"reply": "No analytics data is available yet."}
        return {"reply": f"Analytics database contains {len(df_analytics)} records. Latest active people: {kpis.get('active_people', 0)}, latest risk score: {kpis.get('risk_score', 0)}%."}

    return {
        "reply": (
            "I can answer questions such as: highest risk camera, busiest camera, "
            "security summary, incidents, people count, laptops, phones, vehicles, "
            "objects, posture, camera status and analytics trend."
        )
    }
