import os
from pathlib import Path

import cv2
import yt_dlp


BASE_DIR = Path(__file__).resolve().parent.parent


def youtube_cookie_options():
    cookie_path = Path(
        os.environ.get("YOUTUBE_COOKIES_FILE", BASE_DIR / "streams" / "youtube_cookies.txt")
    )
    if cookie_path.exists() and cookie_path.stat().st_size > 0:
        return {"cookiefile": str(cookie_path)}
    return {}


def youtube_extractor_args():
    args = {"youtube": {"player_client": ["android", "web", "web_embedded"]}}
    provider_url = os.environ.get("YOUTUBE_POT_PROVIDER_URL")
    if provider_url:
        args["youtubepot-bgutilhttp"] = {"base_url": [provider_url]}
    return args


def get_youtube_stream_url(url):
    opts = {
        "format": "best[ext=mp4]/best",
        "quiet": True,
        "no_warnings": True,
        "extractor_args": youtube_extractor_args(),
        **youtube_cookie_options(),
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        info=ydl.extract_info(url, download=False)
        if info.get("url"): return info["url"]
        formats=[f for f in info.get("formats",[]) if f.get("url") and f.get("vcodec") != "none"]
        if not formats: raise RuntimeError("Stream URL topilmadi")
        return formats[-1]["url"]

def open_video_source(source):
    if source.startswith("http") and ("youtube.com" in source or "youtu.be" in source):
        return cv2.VideoCapture(get_youtube_stream_url(source), cv2.CAP_FFMPEG)
    if source.startswith("http"):
        return cv2.VideoCapture(source, cv2.CAP_FFMPEG)
    return cv2.VideoCapture(source)

def draw_zones(frame):
    h,w=frame.shape[:2]; x1=w//3; x2=x1*2
    cv2.line(frame,(x1,0),(x1,h),(255,255,255),2); cv2.line(frame,(x2,0),(x2,h),(255,255,255),2)
    cv2.putText(frame,"LEFT",(20,35),cv2.FONT_HERSHEY_SIMPLEX,0.85,(255,255,255),2)
    cv2.putText(frame,"CENTER",(x1+20,35),cv2.FONT_HERSHEY_SIMPLEX,0.85,(255,255,255),2)
    cv2.putText(frame,"RIGHT",(x2+20,35),cv2.FONT_HERSHEY_SIMPLEX,0.85,(255,255,255),2)
