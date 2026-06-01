import argparse
import sqlite3
import time
from pathlib import Path

import requests

try:
    from app.config import DB_PATH
except ModuleNotFoundError:
    from config import DB_PATH


BASE_DIR = Path(__file__).resolve().parent.parent
FRAMES_DIR = BASE_DIR / "frames"


FIELDS = [
    "timestamp",
    "active_people",
    "new_unique_people",
    "total_unique_people",
    "vehicle_count",
    "object_count",
    "laptop_count",
    "phone_count",
    "left_zone",
    "center_zone",
    "right_zone",
    "standing_count",
    "sitting_count",
    "crowd_level",
    "risk_score",
    "fps",
    "data_quality_score",
]


def latest_row(camera_id):
    if not Path(DB_PATH).exists():
        return None

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        return conn.execute(
            """
            SELECT *
            FROM minute_analytics
            WHERE camera_id=?
            ORDER BY id DESC
            LIMIT 1
            """,
            (camera_id,),
        ).fetchone()
    finally:
        conn.close()


def main():
    parser = argparse.ArgumentParser(description="Relay local detector output to ASSBI API")
    parser.add_argument("--api-url", required=True)
    parser.add_argument("--camera-id", required=True)
    parser.add_argument("--site", required=True)
    parser.add_argument("--source-url", default="")
    parser.add_argument("--camera-type", default="youtube")
    parser.add_argument("--interval", type=float, default=2.0)
    args = parser.parse_args()

    endpoint = args.api_url.rstrip("/") + "/api/ingest/frame"
    frame_path = FRAMES_DIR / f"{args.camera_id}.jpg"
    last_timestamp = None

    while True:
        row = latest_row(args.camera_id)
        if not row or not frame_path.exists():
            time.sleep(args.interval)
            continue

        row_data = dict(row)
        timestamp = row_data.get("timestamp")
        if timestamp == last_timestamp:
            time.sleep(args.interval)
            continue

        payload = {
            "camera_id": args.camera_id,
            "site": args.site,
            "source_url": args.source_url,
            "camera_type": args.camera_type,
        }
        for field in FIELDS:
            payload[field] = row_data.get(field, 0)

        try:
            with frame_path.open("rb") as handle:
                response = requests.post(
                    endpoint,
                    data=payload,
                    files={"frame": ("frame.jpg", handle, "image/jpeg")},
                    timeout=10,
                )
            response.raise_for_status()
            last_timestamp = timestamp
            print(f"[ASSBI relay] uploaded {args.camera_id} {timestamp}", flush=True)
        except Exception as exc:
            print(f"[ASSBI relay] upload failed: {exc}", flush=True)

        time.sleep(args.interval)


if __name__ == "__main__":
    main()
