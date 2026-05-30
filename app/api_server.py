import json
import sqlite3
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    PageBreak,
)
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib import colors

try:
    from app.config import DB_PATH
    from app.database import init_db, get_thresholds, update_threshold
except ModuleNotFoundError:
    from config import DB_PATH
    from database import init_db, get_thresholds, update_threshold


BASE_DIR = Path(__file__).resolve().parent.parent
FRAMES_DIR = BASE_DIR / "frames"
STREAMS_DIR = BASE_DIR / "streams"
EXPORTS_DIR = BASE_DIR / "exports"
LOGS_DIR = BASE_DIR / "logs"
CAMERAS_FILE = STREAMS_DIR / "cameras.json"

FRAMES_DIR.mkdir(exist_ok=True)
STREAMS_DIR.mkdir(exist_ok=True)
EXPORTS_DIR.mkdir(exist_ok=True)
LOGS_DIR.mkdir(exist_ok=True)

app = FastAPI(title="ASSBI Ultra API", version="2.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

RUNNING_PROCESSES: dict[str, subprocess.Popen] = {}


class ChatRequest(BaseModel):
    message: str


def is_local_video(url: str):
    return url.lower().endswith((".mp4", ".mov", ".avi", ".mkv"))


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


def safe_int(value, default=0):
    try:
        if pd.isna(value):
            return default
        return int(value)
    except Exception:
        return default


def safe_float(value, default=0.0):
    try:
        if pd.isna(value):
            return default
        return float(value)
    except Exception:
        return default


def load_cameras():
    if not CAMERAS_FILE.exists():
        CAMERAS_FILE.write_text("[]", encoding="utf-8")

    try:
        data = json.loads(CAMERAS_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception:
        CAMERAS_FILE.write_text("[]", encoding="utf-8")
        return []


def save_cameras(cameras):
    CAMERAS_FILE.write_text(
        json.dumps(cameras, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def latest_by_camera(df: pd.DataFrame):
    if df.empty or "camera_id" not in df.columns:
        return pd.DataFrame()

    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
    df = df.sort_values("timestamp")

    return df.groupby("camera_id", as_index=False).tail(1)


def start_detector(camera_id: str, site: str, url: str, speed_mode: str = "normal"):
    if not url:
        return False

    existing = RUNNING_PROCESSES.get(camera_id)

    if existing and existing.poll() is None:
        return True

    if speed_mode not in ["slow", "normal", "fast"]:
        speed_mode = "normal"

    cmd = [
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
        speed_mode,
    ]

    if is_local_video(url):
        cmd.extend(["--detect-every", "3", "--log-every", "5"])
    else:
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


def stop_detector(camera_id: str):
    process = RUNNING_PROCESSES.get(camera_id)

    if process and process.poll() is None:
        process.terminate()
        RUNNING_PROCESSES.pop(camera_id, None)
        return True

    RUNNING_PROCESSES.pop(camera_id, None)
    return False


def auto_start_cameras():
    for cam in load_cameras():
        if cam.get("enabled", True) and cam.get("url"):
            start_detector(
                cam.get("camera_id", "cam"),
                cam.get("site", cam.get("camera_id", "Camera")),
                cam.get("url", ""),
                cam.get("speed_mode", "normal"),
            )


def build_cameras_response():
    analytics_df = read_table("minute_analytics")
    config_cameras = load_cameras()

    latest_df = latest_by_camera(analytics_df)
    latest_map = {}

    if not latest_df.empty:
        for _, row in latest_df.iterrows():
            latest_map[row["camera_id"]] = row.to_dict()

    result = []

    for cam in config_cameras:
        camera_id = cam.get("camera_id")
        latest = latest_map.get(camera_id, {})
        process = RUNNING_PROCESSES.get(camera_id)
        running = bool(process and process.poll() is None)

        result.append({
            "camera_id": camera_id,
            "site": cam.get("site", camera_id),
            "url": cam.get("url", ""),
            "type": cam.get("type", "unknown"),
            "speed_mode": cam.get("speed_mode", "normal"),
            "enabled": cam.get("enabled", True),
            "running": running,
            "active_people": safe_int(latest.get("active_people", 0)),
            "total_unique": safe_int(latest.get("total_unique_people", 0)),
            "risk_score": safe_int(latest.get("risk_score", 0)),
            "fps": safe_float(latest.get("fps", 0)),
            "quality": safe_float(latest.get("data_quality_score", 0)),
            "laptops": safe_int(latest.get("laptop_count", 0)),
            "phones": safe_int(latest.get("phone_count", 0)),
            "vehicles": safe_int(latest.get("vehicle_count", 0)),
            "objects": safe_int(latest.get("object_count", 0)),
            "standing": safe_int(latest.get("standing_count", 0)),
            "sitting": safe_int(latest.get("sitting_count", 0)),
            "frame_url": f"/api/frame/{camera_id}",
        })

    return result


def build_summary():
    df = read_table("minute_analytics")
    incidents_df = read_table("incidents")

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
            "incidents": 0,
            "standing": 0,
            "sitting": 0,
        },
        "trend": [],
        "zones": [],
        "posture": [],
        "incidents": [],
        "cameras": load_cameras(),
    }

    if df.empty:
        return empty

    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
    df = df.sort_values("timestamp")
    latest = df.iloc[-1].to_dict()

    today = latest.get("date")
    day_df = df[df["date"] == today] if "date" in df.columns else df

    trend = []

    for _, row in df.tail(80).iterrows():
        ts = row.get("timestamp")
        trend.append({
            "time": ts.strftime("%H:%M") if hasattr(ts, "strftime") else "",
            "active": safe_int(row.get("active_people", 0)),
            "risk": safe_int(row.get("risk_score", 0)),
            "laptops": safe_int(row.get("laptop_count", 0)),
            "phones": safe_int(row.get("phone_count", 0)),
            "vehicles": safe_int(row.get("vehicle_count", 0)),
            "objects": safe_int(row.get("object_count", 0)),
        })

    zones = [
        {"zone": "Left", "value": safe_int(day_df.get("left_zone", pd.Series([0])).sum())},
        {"zone": "Center", "value": safe_int(day_df.get("center_zone", pd.Series([0])).sum())},
        {"zone": "Right", "value": safe_int(day_df.get("right_zone", pd.Series([0])).sum())},
    ]

    posture = [
        {"name": "Standing", "value": safe_int(day_df.get("standing_count", pd.Series([0])).sum())},
        {"name": "Sitting", "value": safe_int(day_df.get("sitting_count", pd.Series([0])).sum())},
    ]

    recent_incidents = []

    if not incidents_df.empty:
        recent_incidents = (
            incidents_df.tail(20)
            .sort_values("id", ascending=False)
            .to_dict(orient="records")
        )

    latest_clean = {
        key: value.isoformat() if hasattr(value, "isoformat") else value
        for key, value in latest.items()
    }

    return {
        "latest": latest_clean,
        "kpis": {
            "active_people": safe_int(latest.get("active_people", 0)),
            "new_unique_today": safe_int(day_df.get("new_unique_people", pd.Series([0])).sum()),
            "total_unique": safe_int(latest.get("total_unique_people", 0)),
            "risk_score": safe_int(latest.get("risk_score", 0)),
            "fps": safe_float(latest.get("fps", 0)),
            "quality": safe_float(latest.get("data_quality_score", 0)),
            "laptops": safe_int(latest.get("laptop_count", 0)),
            "phones": safe_int(latest.get("phone_count", 0)),
            "vehicles": safe_int(latest.get("vehicle_count", 0)),
            "objects": safe_int(latest.get("object_count", 0)),
            "incidents": safe_int(len(incidents_df)),
            "standing": safe_int(latest.get("standing_count", 0)),
            "sitting": safe_int(latest.get("sitting_count", 0)),
        },
        "trend": trend,
        "zones": zones,
        "posture": posture,
        "incidents": recent_incidents,
        "cameras": load_cameras(),
    }


@app.on_event("startup")
async def startup_event():
    auto_start_cameras()


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "database": str(DB_PATH),
        "frames_dir": str(FRAMES_DIR),
        "cameras_file": str(CAMERAS_FILE),
        "running_detectors": list(RUNNING_PROCESSES.keys()),
    }


@app.get("/api/summary")
def summary():
    return build_summary()


@app.get("/api/analytics")
def analytics(limit: int = 200):
    df = read_table("minute_analytics")

    if df.empty:
        return []

    return df.tail(limit).to_dict(orient="records")


@app.get("/api/incidents")
def incidents(limit: int = 100):
    df = read_table("incidents")

    if df.empty:
        return []

    return df.tail(limit).sort_values("id", ascending=False).to_dict(orient="records")


@app.get("/api/cameras")
def cameras():
    return build_cameras_response()


@app.post("/api/cameras")
def add_camera(payload: dict[str, Any]):
    cameras_data = load_cameras()

    camera_id = str(payload.get("camera_id", "")).strip()
    site = str(payload.get("site", "New Camera")).strip()
    url = str(payload.get("url", "")).strip()
    cam_type = str(payload.get("type", "youtube")).strip()
    speed_mode = str(payload.get("speed_mode", "normal")).strip()

    if speed_mode not in ["slow", "normal", "fast"]:
        speed_mode = "normal"

    if not camera_id:
        camera_id = f"cam_{len(cameras_data) + 1:02d}"

    if not site:
        site = camera_id

    if not url:
        return {"ok": False, "message": "URL is required"}

    cameras_data = [
        cam for cam in cameras_data
        if cam.get("camera_id") != camera_id
    ]

    new_camera = {
        "camera_id": camera_id,
        "site": site,
        "url": url,
        "type": cam_type,
        "speed_mode": speed_mode,
        "enabled": True,
    }

    cameras_data.append(new_camera)
    save_cameras(cameras_data)

    started = start_detector(camera_id, site, url, speed_mode)

    return {
        "ok": True,
        "camera_id": camera_id,
        "started": started,
        "message": "Camera saved and detector started automatically",
        "cameras": cameras_data,
    }


@app.post("/api/cameras/{camera_id}/start")
def start_camera(camera_id: str):
    cam = next(
        (c for c in load_cameras() if c.get("camera_id") == camera_id),
        None,
    )

    if not cam:
        return {"ok": False, "message": "Camera not found"}

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


@app.delete("/api/cameras/{camera_id}")
def delete_camera(camera_id: str):
    stop_detector(camera_id)

    cameras_data = [
        cam for cam in load_cameras()
        if cam.get("camera_id") != camera_id
    ]

    save_cameras(cameras_data)

    frame_path = FRAMES_DIR / f"{camera_id}.jpg"

    if frame_path.exists():
        frame_path.unlink()

    return {
        "ok": True,
        "camera_id": camera_id,
        "cameras": cameras_data,
    }


@app.get("/api/frame/{camera_id}")
def camera_frame(camera_id: str):
    frame_path = FRAMES_DIR / f"{camera_id}.jpg"

    if not frame_path.exists():
        return {"ok": False, "message": "No frame available yet"}

    return FileResponse(
        frame_path,
        media_type="image/jpeg",
        headers={"Cache-Control": "no-store"},
    )


def mjpeg_generator(camera_id: str):
    frame_path = FRAMES_DIR / f"{camera_id}.jpg"

    while True:
        if frame_path.exists():
            try:
                frame = frame_path.read_bytes()
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n" +
                    frame +
                    b"\r\n"
                )
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
        return {"ok": False, "message": "No frame available"}

    snapshot_dir = EXPORTS_DIR / "snapshots"
    snapshot_dir.mkdir(parents=True, exist_ok=True)

    filename = f"{camera_id}_snapshot_{int(time.time())}.jpg"
    snapshot_path = snapshot_dir / filename

    snapshot_path.write_bytes(frame_path.read_bytes())

    return FileResponse(
        snapshot_path,
        filename=filename,
        media_type="image/jpeg",
    )


@app.get("/api/thresholds")
def thresholds():
    return get_thresholds()


@app.post("/api/thresholds/{key}")
def set_threshold(key: str, payload: dict[str, Any]):
    value = payload.get("value")
    update_threshold(key, value)

    return {
        "ok": True,
        "key": key,
        "value": value,
    }


@app.get("/api/reports/analytics/csv")
def export_analytics_csv():
    df = read_table("minute_analytics")

    if df.empty:
        return {"ok": False, "message": "No analytics data"}

    path = EXPORTS_DIR / "analytics_report.csv"
    df.to_csv(path, index=False)

    return FileResponse(path, filename="analytics_report.csv", media_type="text/csv")


@app.get("/api/reports/incidents/csv")
def export_incidents_csv():
    df = read_table("incidents")

    if df.empty:
        return {"ok": False, "message": "No incidents data"}

    path = EXPORTS_DIR / "incidents_report.csv"
    df.to_csv(path, index=False)

    return FileResponse(path, filename="incidents_report.csv", media_type="text/csv")


@app.get("/api/reports/analytics/excel")
def export_analytics_excel():
    df = read_table("minute_analytics")

    if df.empty:
        return {"ok": False, "message": "No analytics data"}

    path = EXPORTS_DIR / "analytics_report.xlsx"
    df.to_excel(path, index=False)

    return FileResponse(
        path,
        filename="analytics_report.xlsx",
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@app.get("/api/reports/incidents/excel")
def export_incidents_excel():
    df = read_table("incidents")

    if df.empty:
        return {"ok": False, "message": "No incidents data"}

    path = EXPORTS_DIR / "incidents_report.xlsx"
    df.to_excel(path, index=False)

    return FileResponse(
        path,
        filename="incidents_report.xlsx",
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@app.get("/api/reports/forecast/excel")
def export_forecast_excel():
    df = read_table("minute_analytics")

    if df.empty:
        return {"ok": False, "message": "No analytics data"}

    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
    df = df.sort_values("timestamp")

    recent = df.tail(30).copy()

    avg_people = recent["active_people"].mean()
    avg_risk = recent["risk_score"].mean()
    last_time = recent["timestamp"].iloc[-1]

    forecast_rows = []

    for i in range(1, 11):
        forecast_rows.append({
            "forecast_minute": i,
            "predicted_time": last_time + pd.Timedelta(minutes=i),
            "predicted_people": round(avg_people + i * 0.5),
            "predicted_risk": min(100, round(avg_risk + i * 1.2)),
            "forecast_type": "10 minute crowd prediction",
        })

    forecast_df = pd.DataFrame(forecast_rows)
    path = EXPORTS_DIR / "forecasted_report.xlsx"

    with pd.ExcelWriter(path, engine="openpyxl") as writer:
        recent.to_excel(writer, sheet_name="Recent Analytics", index=False)
        forecast_df.to_excel(writer, sheet_name="Forecast", index=False)

    return FileResponse(
        path,
        filename="forecasted_report.xlsx",
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@app.delete("/api/cleanup/demo")
def cleanup_demo_data():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    queries = [
        "DELETE FROM incidents WHERE camera_id LIKE 'sim_%' OR site LIKE '%Simulation%'",
        "DELETE FROM minute_analytics WHERE camera_id LIKE 'sim_%' OR site LIKE '%Simulation%'",
        "DELETE FROM person_sessions WHERE camera_id LIKE 'sim_%'",
    ]

    for query in queries:
        try:
            cur.execute(query)
        except Exception:
            pass

    conn.commit()
    conn.close()

    return {"ok": True, "message": "Demo/simulated data cleaned"}


@app.post("/api/chat")
def ai_chat(req: ChatRequest):
    message = req.message.lower().strip()

    summary_data = build_summary()
    kpis = summary_data.get("kpis", {})
    camera_data = build_cameras_response()

    df_analytics = read_table("minute_analytics")
    df_incidents = read_table("incidents")

    if not message:
        return {
            "reply": "Please ask something about people, risk, cameras, incidents, objects or analytics."
        }

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

        return {
            "reply": (
                f"Camera status: {online} online, {offline} offline, "
                f"{total} total configured cameras."
            )
        }

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

        return {
            "reply": (
                f"There are {len(df_incidents)} incidents recorded. "
                f"High severity: {high}, medium severity: {medium}, low/other: {low}."
            )
        }

    if "people" in message or "person" in message or "occupancy" in message:
        return {
            "reply": (
                f"There are currently {kpis.get('active_people', 0)} active people. "
                f"Total unique people recorded: {kpis.get('total_unique', 0)}."
            )
        }

    if "risk" in message:
        risk = kpis.get("risk_score", 0)

        if risk >= 70:
            level = "high"
            action = "Immediate monitoring is recommended."
        elif risk >= 35:
            level = "medium"
            action = "Continue close monitoring."
        else:
            level = "low"
            action = "Normal monitoring is enough."

        return {
            "reply": f"Current risk score is {risk}%, which is {level}. {action}"
        }

    if "laptop" in message:
        return {
            "reply": f"{kpis.get('laptops', 0)} laptops are currently detected."
        }

    if "phone" in message:
        return {
            "reply": f"{kpis.get('phones', 0)} phones are currently detected."
        }

    if "vehicle" in message or "car" in message:
        return {
            "reply": f"{kpis.get('vehicles', 0)} vehicles are currently detected."
        }

    if "object" in message:
        return {
            "reply": f"{kpis.get('objects', 0)} objects are currently detected."
        }

    if "standing" in message or "sitting" in message or "posture" in message:
        return {
            "reply": (
                f"Posture analytics: {kpis.get('standing', 0)} standing people "
                f"and {kpis.get('sitting', 0)} sitting people detected."
            )
        }

    if "trend" in message or "analytics" in message:
        if df_analytics.empty:
            return {"reply": "No analytics data is available yet."}

        return {
            "reply": (
                f"Analytics database contains {len(df_analytics)} records. "
                f"Latest active people: {kpis.get('active_people', 0)}, "
                f"latest risk score: {kpis.get('risk_score', 0)}%."
            )
        }

    return {
        "reply": (
            "I can answer questions such as: highest risk camera, busiest camera, "
            "security summary, incidents, people count, laptops, phones, vehicles, "
            "objects, posture, camera status and analytics trend."
        )
    }


@app.get("/api/predictive")
def predictive_analytics():
    df = read_table("minute_analytics")

    if df.empty:
        return {
            "summary": {
                "peak_people": 0,
                "confidence": 0,
                "risk_window": "No data",
                "forecast_horizon": "24h",
                "busiest_camera": "No data",
                "highest_risk_camera": "No data",
                "recommendation": "Start a camera to generate predictions.",
            },
            "forecast": [],
            "risk": [],
            "camera_forecast": [],
            "insights": [],
        }

    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
    df = df.sort_values("timestamp")

    recent = df.tail(60).copy()
    latest = recent.iloc[-1]

    current_people = safe_int(latest.get("active_people", 0))
    current_risk = safe_int(latest.get("risk_score", 0))

    avg_people = safe_float(recent["active_people"].mean())
    avg_risk = safe_float(recent["risk_score"].mean())

    first_people_avg = safe_float(recent["active_people"].head(10).mean())
    last_people_avg = safe_float(recent["active_people"].tail(10).mean())
    first_risk_avg = safe_float(recent["risk_score"].head(10).mean())
    last_risk_avg = safe_float(recent["risk_score"].tail(10).mean())

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
            cam_id = row.get("camera_id", "unknown")
            site = row.get("site", cam_id)
            people = safe_int(row.get("active_people", 0))
            risk = safe_int(row.get("risk_score", 0))
            fps = safe_float(row.get("fps", 0))

            if people > max_people:
                max_people = people
                busiest_camera = f"{site} ({cam_id})"

            if risk > max_risk:
                max_risk = risk
                highest_risk_camera = f"{site} ({cam_id})"

            predicted_people_30m = max(0, round(people + trend_people * 0.25 + 2))
            predicted_risk_30m = max(0, min(100, round(risk + trend_risk * 0.25 + 3)))

            camera_forecast.append({
                "camera_id": cam_id,
                "site": site,
                "current_people": people,
                "predicted_people_30m": predicted_people_30m,
                "current_risk": risk,
                "predicted_risk_30m": predicted_risk_30m,
                "fps": round(fps, 1),
                "status": "High" if predicted_risk_30m >= 70 else "Medium" if predicted_risk_30m >= 35 else "Low",
            })

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

        forecast.append({
            "time": "Now" if i == 0 else f"+{i}h",
            "actual": current_people if i == 0 else None,
            "predicted": predicted_people,
            "lower": lower,
            "upper": upper,
        })

        risk_forecast.append({
            "time": "Now" if i == 0 else f"+{i}h",
            "risk": predicted_risk,
        })

    peak_people = max(item["predicted"] for item in forecast)
    peak_risk = max(item["risk"] for item in risk_forecast)

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
            "confidence": confidence,
            "risk_window": risk_window,
            "forecast_horizon": "24h",
            "busiest_camera": busiest_camera,
            "highest_risk_camera": highest_risk_camera,
            "recommendation": recommendation,
        },
        "forecast": forecast,
        "risk": risk_forecast,
        "camera_forecast": camera_forecast,
        "insights": insights,
    }

@app.get("/api/reports/executive/pdf")
def export_executive_pdf():

    summary = build_summary()
    cameras = build_cameras_response()
    incidents = read_table("incidents")

    pdf_path = EXPORTS_DIR / "executive_report.pdf"

    doc = SimpleDocTemplate(str(pdf_path))

    styles = getSampleStyleSheet()

    story = []

    title = Paragraph(
        "ASSBI Executive Security Intelligence Report",
        styles["Title"],
    )

    story.append(title)
    story.append(Spacer(1, 20))

    story.append(
        Paragraph(
            "Generated automatically by ASSBI Platform",
            styles["Normal"],
        )
    )

    story.append(Spacer(1, 20))

    kpis = summary.get("kpis", {})

    story.append(
        Paragraph("Executive KPI Summary", styles["Heading1"])
    )

    story.append(
        Paragraph(
            f"""
            Active People: {kpis.get('active_people',0)}<br/>
            Total Unique People: {kpis.get('total_unique',0)}<br/>
            Risk Score: {kpis.get('risk_score',0)}%<br/>
            Incidents: {kpis.get('incidents',0)}<br/>
            Laptops: {kpis.get('laptops',0)}<br/>
            Phones: {kpis.get('phones',0)}<br/>
            Vehicles: {kpis.get('vehicles',0)}<br/>
            Objects: {kpis.get('objects',0)}
            """,
            styles["BodyText"],
        )
    )

    story.append(Spacer(1, 20))

    story.append(
        Paragraph("Camera Status Overview", styles["Heading1"])
    )

    for cam in cameras:
        status = "ONLINE" if cam.get("running") else "OFFLINE"

        story.append(
            Paragraph(
                f"""
                <b>{cam.get('site')}</b><br/>
                Camera ID: {cam.get('camera_id')}<br/>
                Status: {status}<br/>
                Active People: {cam.get('active_people',0)}<br/>
                Risk Score: {cam.get('risk_score',0)}%
                """,
                styles["BodyText"],
            )
        )

        story.append(Spacer(1, 10))

    story.append(PageBreak())

    story.append(
        Paragraph("Incident Analysis", styles["Heading1"])
    )

    if len(incidents) == 0:
        story.append(
            Paragraph(
                "No incidents recorded.",
                styles["Normal"],
            )
        )
    else:

        recent = incidents.tail(20)

        for _, row in recent.iterrows():

            story.append(
                Paragraph(
                    f"""
                    <b>{row.get('incident_type','Incident')}</b><br/>
                    Severity: {row.get('severity','N/A')}<br/>
                    Camera: {row.get('camera_id','N/A')}<br/>
                    Description: {row.get('description','')}
                    """,
                    styles["BodyText"],
                )
            )

            story.append(Spacer(1, 8))

    story.append(PageBreak())

    story.append(
        Paragraph(
            "AI Executive Recommendation",
            styles["Heading1"],
        )
    )

    risk = kpis.get("risk_score", 0)

    if risk >= 70:
        recommendation = """
        High operational risk detected.
        Increase monitoring and security presence immediately.
        """
    elif risk >= 35:
        recommendation = """
        Medium risk detected.
        Continue monitoring and review incident patterns.
        """
    else:
        recommendation = """
        Low risk environment.
        Current monitoring strategy is sufficient.
        """

    story.append(
        Paragraph(
            recommendation,
            styles["BodyText"],
        )
    )

    story.append(Spacer(1, 20))

    story.append(
        Paragraph(
            "Generated by ASSBI AI Security Platform",
            styles["Italic"],
        )
    )

    doc.build(story)

    return FileResponse(
        pdf_path,
        filename="executive_report.pdf",
        media_type="application/pdf",
    )