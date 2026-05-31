# ASSBI Ultra Deployment

Recommended server: Ubuntu 22.04/24.04 VPS with Docker. For real-time camera analytics, choose at least 4 vCPU and 8 GB RAM. If several cameras run at once, use 8 vCPU and 16 GB RAM or a GPU server.

## 1. Create GitHub repository

```bash
git init
git add .
git commit -m "Initial ASSBI Ultra deployment setup"
git branch -M main
git remote add origin git@github.com:YOUR_USER/assbi-ultra-ui.git
git push -u origin main
```

Do not commit runtime data, logs, `.venv`, `node_modules`, model weights, or local `.env` files. They are ignored by `.gitignore`.

## 2. Prepare server

```bash
sudo apt update
sudo apt install -y git docker.io docker-compose-plugin
sudo systemctl enable --now docker
```

## 3. Deploy

```bash
git clone git@github.com:YOUR_USER/assbi-ultra-ui.git
cd assbi-ultra-ui
mkdir -p data frames logs reports exports streams models
docker compose up -d --build
```

Open:

```text
http://SERVER_IP
```

API health check:

```text
http://SERVER_IP/api/health
```

The default Docker API image uses `requirements-api.txt` so it can run on small
free-tier servers. This starts the dashboard and API, but not the full
YOLO/PyTorch detector stack. For production camera detection, use a larger VPS
or GPU server and install `requirements.txt`.

## 4. Model files

The `.pt` model files are intentionally not committed to GitHub. Copy them to the server when needed:

```bash
scp yolov8s.pt root@SERVER_IP:/path/to/assbi-ultra-ui/models/
```

If a detector command expects `yolov8s.pt` in the project root, either copy the file to the server root too or update that command to use `models/yolov8s.pt`.

## 5. Updating

```bash
git pull
docker compose up -d --build
```
