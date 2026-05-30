import cv2, numpy as np
class LiveHeatmap:
    def __init__(self): self.map=None
    def update(self, frame, points):
        h,w=frame.shape[:2]
        if self.map is None: self.map=np.zeros((h,w), dtype=np.float32)
        for x,y in points:
            if 0 <= x < w and 0 <= y < h: cv2.circle(self.map, (x,y), 45, 1, -1)
        self.map=cv2.GaussianBlur(self.map, (0,0), 35)
    def draw(self, frame):
        if self.map is None: return frame
        norm=cv2.normalize(self.map, None, 0, 255, cv2.NORM_MINMAX)
        colored=cv2.applyColorMap(norm.astype(np.uint8), cv2.COLORMAP_JET)
        return cv2.addWeighted(frame, 0.75, colored, 0.25, 0)
