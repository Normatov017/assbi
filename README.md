# ASSBI Ultra UI Project

This ZIP combines your AI surveillance backend with the uploaded premium React dashboard UI.

## What is included

- RTSP camera detector
- YOLO / RT-DETR support
- Person tracking with BoT-SORT
- Laptop and phone detection
- SQLite database
- FastAPI backend API
- Uploaded premium React dashboard UI adapted to project data
- Real-time API polling dashboard

## Setup backend

```bash
cd assbi_ultra_ui_project
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run detector

```bash
python app/main_detector.py --url 'rtsp://USERNAME:PASSWORD@CAMERA_IP:554/stream1' --camera-id cam_01 --site "My Camera" --model yolov8s.pt --log-every 60 --detect-every 2 --conf 0.08 --width 960 --height 540 --show
```

## Run API server

Open a second terminal:

```bash
cd assbi_ultra_ui_project
source .venv/bin/activate
uvicorn app.api_server:app --host 0.0.0.0 --port 8000 --reload
```

Test API:

```text
http://localhost:8000/api/summary
```

## Run premium React dashboard

Open a third terminal:

```bash
cd assbi_ultra_ui_project/frontend
npm install
npm run dev
```

Open:

```text
http://localhost:5173
```

Login in UI is the uploaded demo login screen.
