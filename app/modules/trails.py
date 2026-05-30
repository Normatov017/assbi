import cv2
class TrailManager:
    def __init__(self, max_points=25): self.history={}; self.max_points=max_points
    def update(self, frame, track_id, cx, cy):
        if track_id is None: return
        self.history.setdefault(track_id, []).append((cx,cy))
        if len(self.history[track_id]) > self.max_points: self.history[track_id].pop(0)
        pts=self.history[track_id]
        for i in range(1, len(pts)): cv2.line(frame, pts[i-1], pts[i], (0,255,255), 2)
