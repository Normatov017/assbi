def weapon_detection_placeholder(boxes): return []
def fire_smoke_detection_placeholder(frame): return []
def license_plate_recognition_placeholder(frame): return []
def fight_aggression_detection_placeholder(frame): return []
def explainable_ai_summary(metrics):
    return f"Risk explanation: active={metrics.get('active_people',0)}, zone_peak={metrics.get('zone_peak',0)}, risk={metrics.get('risk_score',0)}%."
