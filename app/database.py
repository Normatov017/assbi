import sqlite3
from datetime import datetime

try:
    from app.config import DB_PATH, DEFAULT_THRESHOLDS
except ModuleNotFoundError:
    from config import DB_PATH, DEFAULT_THRESHOLDS


def get_connection():
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.execute("PRAGMA busy_timeout = 30000")
    return conn


def init_db():
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("PRAGMA journal_mode = WAL")

    cur.execute("""
    CREATE TABLE IF NOT EXISTS minute_analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        date TEXT NOT NULL,
        hour INTEGER NOT NULL,
        minute INTEGER NOT NULL,
        camera_id TEXT NOT NULL,
        site TEXT NOT NULL,

        active_people INTEGER DEFAULT 0,
        new_unique_people INTEGER DEFAULT 0,
        total_unique_people INTEGER DEFAULT 0,

        vehicle_count INTEGER DEFAULT 0,
        object_count INTEGER DEFAULT 0,
        laptop_count INTEGER DEFAULT 0,
        phone_count INTEGER DEFAULT 0,

        left_zone INTEGER DEFAULT 0,
        center_zone INTEGER DEFAULT 0,
        right_zone INTEGER DEFAULT 0,

        standing_count INTEGER DEFAULT 0,
        sitting_count INTEGER DEFAULT 0,

        crowd_level TEXT DEFAULT 'LOW',
        risk_score INTEGER DEFAULT 0,
        fps REAL DEFAULT 0,
        data_quality_score REAL DEFAULT 0
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS person_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        camera_id TEXT NOT NULL,
        track_id INTEGER NOT NULL,
        first_seen TEXT NOT NULL,
        last_seen TEXT NOT NULL,
        first_zone TEXT,
        last_zone TEXT,
        posture TEXT DEFAULT 'unknown',
        total_seen_frames INTEGER DEFAULT 1,
        UNIQUE(camera_id, track_id)
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS incidents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        camera_id TEXT NOT NULL,
        site TEXT NOT NULL,
        incident_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        message TEXT NOT NULL,
        status TEXT DEFAULT 'Open',
        assigned_to TEXT,
        operator_note TEXT,
        resolved_at TEXT
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        username TEXT NOT NULL,
        action TEXT NOT NULL,
        details TEXT
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS thresholds (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )
    """)

    for key, value in DEFAULT_THRESHOLDS.items():
        cur.execute(
            "INSERT OR IGNORE INTO thresholds (key, value) VALUES (?, ?)",
            (key, str(value))
        )

    existing_cols = {
        row[1]
        for row in cur.execute("PRAGMA table_info(minute_analytics)").fetchall()
    }

    migrations = {
        "standing_count": "INTEGER DEFAULT 0",
        "sitting_count": "INTEGER DEFAULT 0",
        "laptop_count": "INTEGER DEFAULT 0",
        "phone_count": "INTEGER DEFAULT 0",
        "left_zone": "INTEGER DEFAULT 0",
        "center_zone": "INTEGER DEFAULT 0",
        "right_zone": "INTEGER DEFAULT 0",
        "vehicle_count": "INTEGER DEFAULT 0",
        "object_count": "INTEGER DEFAULT 0",
        "data_quality_score": "REAL DEFAULT 0",
    }

    for col, definition in migrations.items():
        if col not in existing_cols:
            cur.execute(
                f"ALTER TABLE minute_analytics ADD COLUMN {col} {definition}"
            )

    incident_cols = {
        row[1]
        for row in cur.execute("PRAGMA table_info(incidents)").fetchall()
    }
    incident_migrations = {
        "assigned_to": "TEXT",
        "operator_note": "TEXT",
        "resolved_at": "TEXT",
    }

    for col, definition in incident_migrations.items():
        if col not in incident_cols:
            cur.execute(
                f"ALTER TABLE incidents ADD COLUMN {col} {definition}"
            )

    conn.commit()
    conn.close()


def get_thresholds():
    init_db()

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("SELECT key, value FROM thresholds")
    rows = cur.fetchall()

    conn.close()

    data = {}

    for key, value in rows:
        try:
            data[key] = float(value) if "." in str(value) else int(value)
        except ValueError:
            data[key] = value

    return data


def update_threshold(key, value):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        "INSERT OR REPLACE INTO thresholds (key, value) VALUES (?, ?)",
        (key, str(value))
    )

    conn.commit()
    conn.close()


def upsert_person_session(camera_id, track_id, timestamp, zone, posture="unknown"):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        "SELECT track_id FROM person_sessions WHERE camera_id=? AND track_id=?",
        (camera_id, track_id)
    )

    exists = cur.fetchone()

    if exists:
        cur.execute("""
        UPDATE person_sessions
        SET last_seen=?,
            last_zone=?,
            posture=?,
            total_seen_frames=total_seen_frames+1
        WHERE camera_id=? AND track_id=?
        """, (
            timestamp,
            zone,
            posture,
            camera_id,
            track_id
        ))

        is_new = False

    else:
        cur.execute("""
        INSERT INTO person_sessions (
            camera_id,
            track_id,
            first_seen,
            last_seen,
            first_zone,
            last_zone,
            posture,
            total_seen_frames
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        """, (
            camera_id,
            track_id,
            timestamp,
            timestamp,
            zone,
            zone,
            posture
        ))

        is_new = True

    conn.commit()
    conn.close()

    return is_new


def insert_minute_analytics(row):
    init_db()

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
    INSERT INTO minute_analytics (
        timestamp,
        date,
        hour,
        minute,
        camera_id,
        site,

        active_people,
        new_unique_people,
        total_unique_people,

        vehicle_count,
        object_count,
        laptop_count,
        phone_count,

        left_zone,
        center_zone,
        right_zone,

        standing_count,
        sitting_count,

        crowd_level,
        risk_score,
        fps,
        data_quality_score
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        row["timestamp"],
        row["date"],
        row["hour"],
        row["minute"],
        row["camera_id"],
        row["site"],

        row.get("active_people", 0),
        row.get("new_unique_people", 0),
        row.get("total_unique_people", 0),

        row.get("vehicle_count", 0),
        row.get("object_count", 0),
        row.get("laptop_count", 0),
        row.get("phone_count", 0),

        row.get("left_zone", 0),
        row.get("center_zone", 0),
        row.get("right_zone", 0),

        row.get("standing_count", 0),
        row.get("sitting_count", 0),

        row.get("crowd_level", "LOW"),
        row.get("risk_score", 0),
        row.get("fps", 0),
        row.get("data_quality_score", 0),
    ))

    conn.commit()
    conn.close()


def insert_incident(timestamp, camera_id, site, incident_type, severity, message):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
    INSERT INTO incidents (
        timestamp,
        camera_id,
        site,
        incident_type,
        severity,
        message
    )
    VALUES (?, ?, ?, ?, ?, ?)
    """, (
        timestamp,
        camera_id,
        site,
        incident_type,
        severity,
        message
    ))

    conn.commit()
    conn.close()


def audit(username, action, details=""):
    init_db()
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
    INSERT INTO audit_log (
        timestamp,
        username,
        action,
        details
    )
    VALUES (?, ?, ?, ?)
    """, (
        datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        username,
        action,
        details
    ))

    conn.commit()
    conn.close()
