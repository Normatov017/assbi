import time
class SuspiciousBehaviorDetector:
    def __init__(self, threshold_seconds=120): self.threshold_seconds=threshold_seconds; self.first_seen={}; self.alerted=set()
    def update(self, track_id):
        if track_id is None: return False, 0
        now=time.time(); self.first_seen.setdefault(track_id, now); duration=int(now-self.first_seen[track_id])
        if duration >= self.threshold_seconds and track_id not in self.alerted:
            self.alerted.add(track_id); return True, duration
        return False, duration
