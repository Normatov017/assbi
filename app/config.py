from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
REPORT_DIR = BASE_DIR / "reports"

DB_PATH = DATA_DIR / "assbi_ultra.db"
LINEAGE_PATH = DATA_DIR / "lineage.json"
VERSION_PATH = DATA_DIR / "versions.json"

DATA_DIR.mkdir(exist_ok=True)
REPORT_DIR.mkdir(exist_ok=True)

PERSON_CLASS_ID = 0

VEHICLE_CLASS_IDS = {
    2: "car",
    3: "motorcycle",
    5: "bus",
    7: "truck",
}

OBJECT_CLASS_IDS = {
    24: "backpack",
    26: "handbag",
    28: "suitcase",
    63: "laptop",
    67: "phone",
}

DEFAULT_THRESHOLDS = {
    "low_crowd_limit": 5,
    "medium_crowd_limit": 15,
    "risk_alert_limit": 70,
    "suspicious_seconds": 120,
    "zone_overload_limit": 8,
    "data_retention_days": 31,
}
