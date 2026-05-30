import json
import subprocess
from pathlib import Path

CONFIG = Path("streams/cameras.json")

with open(CONFIG, "r") as f:
    cameras = json.load(f)

processes = []

for cam in cameras:
    cmd = [
        "python",
        "app/main_detector.py",
        "--url", cam["url"],
        "--camera-id", cam["camera_id"],
        "--site", cam["site"],
        "--fast-mode",
        "--show",
    ]

    print("STARTING:", cam["camera_id"])
    p = subprocess.Popen(cmd)
    processes.append(p)

for p in processes:
    p.wait()