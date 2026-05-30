import cv2, yt_dlp

def get_youtube_stream_url(url):
    opts={"format":"best","quiet":True,"no_warnings":True,"cookiesfrombrowser":("chrome",),"extractor_args":{"youtube":{"player_client":["android","web"]}}}
    with yt_dlp.YoutubeDL(opts) as ydl:
        info=ydl.extract_info(url, download=False)
        if info.get("url"): return info["url"]
        formats=[f for f in info.get("formats",[]) if f.get("url") and f.get("vcodec") != "none"]
        if not formats: raise RuntimeError("Stream URL topilmadi")
        return formats[-1]["url"]

def open_video_source(source):
    if source.startswith("http") and ("youtube.com" in source or "youtu.be" in source):
        return cv2.VideoCapture(get_youtube_stream_url(source))
    return cv2.VideoCapture(source)

def draw_zones(frame):
    h,w=frame.shape[:2]; x1=w//3; x2=x1*2
    cv2.line(frame,(x1,0),(x1,h),(255,255,255),2); cv2.line(frame,(x2,0),(x2,h),(255,255,255),2)
    cv2.putText(frame,"LEFT",(20,35),cv2.FONT_HERSHEY_SIMPLEX,0.85,(255,255,255),2)
    cv2.putText(frame,"CENTER",(x1+20,35),cv2.FONT_HERSHEY_SIMPLEX,0.85,(255,255,255),2)
    cv2.putText(frame,"RIGHT",(x2+20,35),cv2.FONT_HERSHEY_SIMPLEX,0.85,(255,255,255),2)
