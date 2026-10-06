import io
import csv
import os
import traceback
from datetime import datetime, timezone
from typing import Optional
from fastapi import FastAPI, Response, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(
    title="TraceVision Compliance & Monitoring Engine",
    description="Edge-to-cloud AI compliance verification for MSDE vocational centers (DPDP Act 2023 compliant)",
    version="2.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
HTML_PATH = os.path.join(BASE_DIR, "index.html")

class SystemState:
    def __init__(self):
        self.enrolled_capacity = 25
        self.detected_headcount = 22
        self.mandatory_equipment_present = True
        self.camera_tampered = False
        self.center_id = "TC-AP-ANP-042"
        self.batch_id = "PMKVY-4.0-CSE-B1"

state = SystemState()

class SimulationOverride(BaseModel):
    detected_headcount: Optional[int] = None
    mandatory_equipment_present: Optional[bool] = None
    camera_tampered: Optional[bool] = None

@app.get("/", summary="Dashboard UI")
def serve_dashboard():
    try:
        if os.path.exists(HTML_PATH):
            with open(HTML_PATH, "r", encoding="utf-8") as f:
                return Response(content=f.read(), media_type="text/html")
        return Response(content="<h2>Error: index.html not found on server</h2>", media_type="text/html", status_code=200)
    except Exception as e:
        return Response(content=f"<h2>Server Error Loading UI: {str(e)}</h2>", media_type="text/html", status_code=500)

@app.get("/api/v1/telemetry", summary="Fetch Live Telemetry")
def get_telemetry():
    try:
        cap = state.enrolled_capacity if state.enrolled_capacity > 0 else 1
        compliance_percentage = (
            0.0 if state.camera_tampered 
            else round((state.detected_headcount / cap) * 100, 1)
        )
        
        violations = []
        if state.camera_tampered:
            violations.append("CRITICAL: Camera Occlusion / Offline Detected")
        if compliance_percentage < 70.0 and not state.camera_tampered:
            violations.append(f"HIGH: Attendance Below 70% Quota ({compliance_percentage}%)")
        if not state.mandatory_equipment_present:
            violations.append("MEDIUM: Mandatory Lab Equipment / Safety Kit Missing")

        status_code = "GREEN" if not violations else ("RED" if any("CRITICAL" in v or "HIGH" in v for v in violations) else "YELLOW")

        now_str = datetime.now(timezone.utc).isoformat()

        return {
            "timestamp": now_str,
            "center_id": state.center_id,
            "batch_id": state.batch_id,
            "enrolled_capacity": state.enrolled_capacity,
            "detected_headcount": state.detected_headcount,
            "compliance_percentage": compliance_percentage,
            "equipment_status": "VERIFIED" if state.mandatory_equipment_present else "MISSING",
            "camera_health": "TAMPERED/OFFLINE" if state.camera_tampered else "HEALTHY",
            "status": status_code,
            "violations": violations,
            "payload_size_bytes": 164
        }
    except Exception as e:
        print("[ERROR IN TELEMETRY]:", traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"error": str(e), "traceback": traceback.format_exc()}
        )

@app.post("/api/v1/simulate", summary="Trigger Live Demo Edge Overrides")
def simulate_edge_change(override: SimulationOverride):
    try:
        if override.detected_headcount is not None:
            state.detected_headcount = override.detected_headcount
        if override.mandatory_equipment_present is not None:
            state.mandatory_equipment_present = override.mandatory_equipment_present
        if override.camera_tampered is not None:
            state.camera_tampered = override.camera_tampered
        return {"message": "State updated", "current_state": get_telemetry()}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/api/v1/export-report", summary="Download Audit CSV Dossier")
def export_csv_report():
    try:
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Timestamp", "Center ID", "Batch ID", "Capacity", "Headcount", "Compliance %", "Equipment OK", "Camera Status", "Audit Verdict"])
        
        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        cap = state.enrolled_capacity if state.enrolled_capacity > 0 else 1
        comp = round((state.detected_headcount / cap) * 100, 1)
        verdict = "APPROVED" if comp >= 70.0 and state.mandatory_equipment_present and not state.camera_tampered else "FLAGGED_FOR_REVIEW"
        
        writer.writerow([
            now, state.center_id, state.batch_id, state.enrolled_capacity,
            state.detected_headcount, f"{comp}%", state.mandatory_equipment_present,
            "HEALTHY" if not state.camera_tampered else "OCCLUDED", verdict
        ])
        output.seek(0)
        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=audit_report_{state.center_id}.csv"}
        )
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})
