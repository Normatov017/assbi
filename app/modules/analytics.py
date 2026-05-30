def zone_name(cx, frame_width):
    if cx < frame_width // 3: return "LEFT"
    if cx < (frame_width // 3) * 2: return "CENTER"
    return "RIGHT"

def crowd_level(active_people, thresholds):
    if active_people <= thresholds["low_crowd_limit"]: return "LOW"
    if active_people <= thresholds["medium_crowd_limit"]: return "MEDIUM"
    return "HIGH"

def risk_score(active_people, vehicle_count, object_count, zone_peak, thresholds):
    score = active_people * 3 + min(vehicle_count * 4, 15) + min(object_count * 3, 15)
    if zone_peak >= thresholds["zone_overload_limit"]: score += 15
    return min(int(score), 100)

def data_quality_score(frame_ok, fps, detection_count):
    score = 100
    if not frame_ok: score -= 50
    if fps < 5: score -= 25
    elif fps < 10: score -= 10
    if detection_count == 0: score -= 5
    return max(score, 0)
