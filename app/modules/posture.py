class PostureEstimator:
    def estimate(self, x1, y1, x2, y2, frame_h=None):
        width = x2 - x1
        height = y2 - y1

        if width <= 0 or height <= 0:
            return "unknown"

        ratio = height / width

        # Camera is mounted high, so sitting people may still have tall boxes.
        if ratio >= 1.9:
            return "standing"

        if ratio <= 1.2:
            return "sitting"

        if frame_h:
            relative_height = height / frame_h
            if relative_height < 0.18:
                return "sitting"

        if ratio > 1.45:
            return "standing"

        return "sitting"
