import io
import csv
import os
from datetime import datetime, timezone
from typing import Optional
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="TraceVision Compliance Engine", version="2.5.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FILE_1 = os.path.join(BASE_DIR, "templates", "index.html")
FILE_2 = os.path.join(BASE_DIR, "index.html")

@app.get("/", summary="Dashboard UI")
def serve_dashboard():
    target = FILE_1 if os.path.exists(FILE_1) else FILE_2
    if os.path.exists(target):
        with open(target, "r", encoding="utf-8") as f:
            return Response(content=f.read(), media_type="text/html")
    return Response(content="<h2>Error: index.html not found</h2>", media_type="text/html", status_code=404)

@app.get("/api/v1/telemetry", summary="Live Telemetry")
def get_telemetry():
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "center_id": "TC-AP-ANP-042",
        "batch_id": "PMKVY-4.0-CSE-B1",
        "enrolled_capacity": 25,
        "detected_headcount": 20,
        "compliance_percentage": 80.0,
        "equipment_status": "VERIFIED",
        "camera_health": "HEALTHY",
        "status": "GREEN",
        "payload_size_bytes": 164
    }

@app.get("/api/v1/export-report", summary="Download Audit CSV")
def export_csv_report():
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Timestamp", "Center ID", "Batch ID", "Capacity", "Headcount", "Compliance %", "Status"])
    writer.writerow([datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"), "TC-AP-ANP-042", "PMKVY-4.0-CSE-B1", 25, 20, "80.0%", "APPROVED"])
    output.seek(0)
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=audit_report_TC-AP-ANP-042.csv"}
    )
