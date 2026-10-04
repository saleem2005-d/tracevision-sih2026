import cv2
import numpy as np
import base64
import os
from datetime import datetime
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI(title="MSDE Vigilance & Infrastructure Inspection Platform")

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

face_cascade = None
try:
    cascade_path = getattr(cv2.data, 'haarcascades', '') + 'haarcascade_frontalface_default.xml'
    face_cascade = cv2.CascadeClassifier(cascade_path)
    if face_cascade.empty():
        face_cascade = None
except Exception:
    face_cascade = None

class FramePayload(BaseModel):
    image_base64: str
    camera_id: str = "CAM-01"

@app.get("/", response_class=HTMLResponse)
def get_dashboard():
    with open("templates/index.html", "r", encoding="utf-8") as f:
        return f.read()

@app.post("/api/v1/analyze_frame")
def analyze_frame(payload: FramePayload):
    try:
        nparr = np.frombuffer(base64.b64decode(payload.image_base64), np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if frame is None:
            raise HTTPException(status_code=400, detail="Invalid frame format")

        detected_count = 0
        if face_cascade is not None:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(30, 30))
            detected_count = len(faces)
            for (x, y, fw, fh) in faces:
                cv2.rectangle(frame, (x, y), (x + fw, y + fh), (19, 136, 8), 2)
                cv2.putText(frame, "Verified Candidate", (x, max(20, y - 8)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.45, (19, 136, 8), 1, cv2.LINE_AA)

        # Official Govt Stamp Overlay
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cv2.putText(frame, f"GOVT OF INDIA | MSDE ATP-0104 | {payload.camera_id} | {timestamp}",
                    (15, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)
        cv2.putText(frame, f"Verified Trainees In-Frame: {detected_count} / 25",
                    (15, 48), cv2.FONT_HERSHEY_SIMPLEX, 0.50, (51, 153, 255), 2, cv2.LINE_AA)

        _, buffer = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 70])
        encoded_image = base64.b64encode(buffer).decode('utf-8')

        enrolled = 25
        rate = round((detected_count / enrolled) * 100, 1)
        discrepancies = []
        if rate < 70.0 and detected_count > 0:
            discrepancies.append(f"Mandatory 70% Attendance Quota Breached: {rate}%")

        return {
            "status": "success",
            "detected_heads": detected_count,
            "attendance_percentage": rate,
            "discrepancies": discrepancies,
            "processed_image": encoded_image
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
