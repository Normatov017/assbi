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


def is_youtube_source(source: str) -> bool:
    return source.startswith("http") and ("youtube.com" in source or "youtu.be" in source)


def youtube_extractor_args():
    args = {"youtube": {"player_client": ["web_embedded", "web", "android", "ios"]}}
    provider_url = os.environ.get("YOUTUBE_POT_PROVIDER_URL")
    if provider_url:
        args["youtubepot-bgutilhttp"] = {"base_url": [provider_url]}
    return args


def youtube_dlp_options(quiet: bool = True):
    return {
        "format": "best[height<=720][vcodec!=none]/best[ext=mp4]/best",
        "quiet": quiet,
        "no_warnings": quiet,
        "extractor_args": youtube_extractor_args(),
        "extractor_retries": 2,
        "fragment_retries": 2,
        "retries": 2,
        "sleep_interval_requests": 2,
        "sleep_interval": 1,
        "max_sleep_interval": 5,
        **youtube_cookie_options(),
    }


def get_youtube_stream_url(url):
    opts = youtube_dlp_options()
    with yt_dlp.YoutubeDL(opts) as ydl:
        info=ydl.extract_info(url, download=False)
        if info.get("url"): return info["url"]
        formats=[f for f in info.get("formats",[]) if f.get("url") and f.get("vcodec") != "none"]
        if not formats: raise RuntimeError("Stream URL topilmadi")
        return formats[-1]["url"]

def open_video_source(source):
    if is_youtube_source(source):
        return cv2.VideoCapture(get_youtube_stream_url(source), cv2.CAP_FFMPEG)
    if source.startswith("http"):
        return cv2.VideoCapture(source, cv2.CAP_FFMPEG)
    return cv2.VideoCapture(source)

def draw_zones(frame):
    h,w=frame.shape[:2]; x1=w//3; x2=x1*2
    cv2.line(frame,(x1,0),(x1,h),(255,255,255),1); cv2.line(frame,(x2,0),(x2,h),(255,255,255),1)
    cv2.putText(frame,"L",(10,16),cv2.FONT_HERSHEY_SIMPLEX,0.34,(255,255,255),1)
    cv2.putText(frame,"C",(x1+10,16),cv2.FONT_HERSHEY_SIMPLEX,0.34,(255,255,255),1)
    cv2.putText(frame,"R",(x2+10,16),cv2.FONT_HERSHEY_SIMPLEX,0.34,(255,255,255),1)
