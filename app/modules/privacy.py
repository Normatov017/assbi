import cv2
def blur_people_regions(frame, boxes):
    for item in boxes:
        if item.get('cls_id') != 0: continue
        x1,y1,x2,y2=item['xyxy']; h,w=frame.shape[:2]
        x1=max(0,x1); y1=max(0,y1); x2=min(w,x2); y2=min(h,y2)
        roi=frame[y1:y2,x1:x2]
        if roi.size > 0: frame[y1:y2,x1:x2]=cv2.GaussianBlur(roi,(31,31),0)
    return frame
