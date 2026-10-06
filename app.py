import io
import csv
from datetime import datetime
from typing import Optional
from fastapi import FastAPI, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

app = FastAPI(
    title="TraceVision Compliance & Monitoring Engine",
    description="Edge-to-cloud AI compliance verification for MSDE vocational centers (DPDP Act 2023 compliant)",
    version="1.2.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

templates = Jinja2Templates(directory="templates")

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
def serve_dashboard(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/api/v1/telemetry", summary="Fetch Live Telemetry & Compliance Score")
def get_telemetry():
    compliance_percentage = (
        0.0 if state.camera_tampered 
        else round((state.detected_headcount / state.enrolled_capacity) * 100, 1)
    )
    
    violations = []
    if state.camera_tampered:
        violations.append("CRITICAL: Camera Occlusion / Offline Detected")
    if compliance_percentage < 70.0 and not state.camera_tampered:
        violations.append(f"HIGH: Attendance Below 70% Quota ({compliance_percentage}%)")
    if not state.mandatory_equipment_present:
        violations.append("MEDIUM: Mandatory Lab Equipment / Safety Kit Missing")

    status_code = "GREEN" if not violations else ("RED" if any("CRITICAL" in v or "HIGH" in v for v in violations) else "YELLOW")

    return {
        "timestamp": datetime.utcnow().isoformat() + "Z",
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

@app.post("/api/v1/simulate", summary="Trigger Live Demo Edge Overrides")
def simulate_edge_change(override: SimulationOverride):
    if override.detected_headcount is not None:
        state.detected_headcount = override.detected_headcount
    if override.mandatory_equipment_present is not None:
        state.mandatory_equipment_present = override.mandatory_equipment_present
    if override.camera_tampered is not None:
        state.camera_tampered = override.camera_tampered
    return {"message": "State updated", "current_state": get_telemetry()}

@app.get("/api/v1/export-report", summary="Download Audit CSV Dossier")
def export_csv_report():
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Timestamp", "Center ID", "Batch ID", "Capacity", "Headcount", "Compliance %", "Equipment OK", "Camera Status", "Audit Verdict"])
    
    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    comp = round((state.detected_headcount / state.enrolled_capacity) * 100, 1)
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
