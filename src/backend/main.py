"""
VOLTRA IoT Energy & Intelligent Circuit Protection API
======================================================
FastAPI backend for VOLTRA IoT ESP32 Smart Energy Telemetry,
5-Branch Relay Control, and Autonomous Overcurrent Protection.
"""

import logging
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Load environment
BACKEND_DIR = Path(__file__).parent
load_dotenv(BACKEND_DIR / ".env")
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from auth_router import router as auth_router
from usage_router import router as usage_router

logger = logging.getLogger("voltra.backend")
logging.basicConfig(level=logging.INFO)

app = FastAPI(
    title="VOLTRA IoT Energy & Intelligent Circuit Protection API",
    description="Real-time AC electrical telemetry, dual-channel hardware connectivity (BLE & Wi-Fi), sub-second breaker actuation, and autonomous overcurrent protection.",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(usage_router)

# ─── In-Memory Circuit State ──────────────────────────────────────────────────

DEFAULT_CIRCUITS = [
    {"id": "c1", "name": "Living Room & HVAC", "rated_current": 16.0, "current": 6.2, "state": "CLOSED"},
    {"id": "c2", "name": "Kitchen & Refrigeration", "rated_current": 20.0, "current": 4.1, "state": "CLOSED"},
    {"id": "c3", "name": "Master Bedroom & Lighting", "rated_current": 10.0, "current": 1.8, "state": "CLOSED"},
    {"id": "c4", "name": "EV Fast Charger", "rated_current": 32.0, "current": 0.0, "state": "OPEN"},
    {"id": "c5", "name": "Water Heater & Utility", "rated_current": 16.0, "current": 8.5, "state": "CLOSED"},
]

circuits_db = {c["id"]: dict(c) for c in DEFAULT_CIRCUITS}

# ─── Schemas ──────────────────────────────────────────────────────────────────

class BreakerToggleRequest(BaseModel):
    state: str  # "OPEN" or "CLOSED"

class TelemetryPayload(BaseModel):
    voltage_rms: float
    current_rms: float
    frequency: float
    active_power: float
    power_factor: float
    temperature_c: float
    circuits: Optional[List[Dict[str, Any]]] = None

# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/")
@app.get("/health")
@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "service": "VOLTRA IoT Smart Energy Engine",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version": "2.0.0",
        "esp32_link": "ready",
    }

@app.get("/api/telemetry/live")
def get_live_telemetry():
    """Returns simulated or last known real-time ESP32 AC telemetry."""
    active_circuits = [c for c in circuits_db.values() if c["state"] == "CLOSED"]
    total_amps = sum(c["current"] for c in active_circuits)
    voltage = 230.2
    pf = 0.98
    active_power_watts = voltage * total_amps * pf

    return {
        "timestamp": time.time(),
        "voltage_rms": voltage,
        "current_rms": round(total_amps, 2),
        "frequency": 50.02,
        "active_power": round(active_power_watts, 1),
        "apparent_power": round(voltage * total_amps, 1),
        "power_factor": pf,
        "temperature_c": 38.4,
        "overload_status": "NORMAL" if total_amps < 38.0 else "OVERLOAD",
        "circuits": list(circuits_db.values()),
    }

@app.post("/api/telemetry")
def ingest_telemetry(payload: TelemetryPayload):
    """Ingests raw electrical telemetry from an active ESP32-S3 microcontroller."""
    logger.info("Ingested telemetry: %sV, %sA, %sW", payload.voltage_rms, payload.current_rms, payload.active_power)
    if payload.circuits:
        for c in payload.circuits:
            cid = c.get("id")
            if cid in circuits_db:
                circuits_db[cid].update(c)
    return {"status": "accepted", "timestamp": time.time()}

@app.get("/api/circuits")
def list_circuits():
    """List all 5 branch circuits on the VOLTRA smart panel."""
    return {"circuits": list(circuits_db.values())}

@app.post("/api/circuits/{circuit_id}/toggle")
def toggle_circuit(circuit_id: str, req: BreakerToggleRequest):
    """Actuates branch circuit breaker relay."""
    if circuit_id not in circuits_db:
        raise HTTPException(status_code=404, detail="Circuit not found")

    target_state = req.state.upper()
    if target_state not in ("OPEN", "CLOSED", "TRIPPED"):
        raise HTTPException(status_code=400, detail="Invalid state: must be OPEN, CLOSED, or TRIPPED")

    circuits_db[circuit_id]["state"] = target_state
    if target_state == "OPEN":
        circuits_db[circuit_id]["current"] = 0.0
    elif target_state == "CLOSED":
        # Restore nominal draw
        default_current = next((c["current"] for c in DEFAULT_CIRCUITS if c["id"] == circuit_id), 4.0)
        circuits_db[circuit_id]["current"] = default_current

    logger.info("Circuit %s switched to %s", circuit_id, target_state)
    return {
        "status": "success",
        "circuit": circuits_db[circuit_id],
        "actuation_latency_ms": 7.4,
    }

@app.post("/api/circuits/emergency-trip")
def emergency_trip_all():
    """Emergency cut-off: opens all branch relays immediately."""
    for c in circuits_db.values():
        c["state"] = "OPEN"
        c["current"] = 0.0
    return {"status": "all_circuits_tripped", "circuits": list(circuits_db.values())}

@app.post("/api/circuits/reset-all")
def reset_all_circuits():
    """Energizes all branch relays."""
    for c in circuits_db.values():
        c["state"] = "CLOSED"
        default_current = next((dc["current"] for dc in DEFAULT_CIRCUITS if dc["id"] == c["id"]), 4.0)
        c["current"] = default_current
    return {"status": "all_circuits_closed", "circuits": list(circuits_db.values())}

@app.get("/api/tariff")
def get_tariff_info():
    """Returns dynamic electricity tariff rates."""
    return {
        "currency": "INR",
        "base_rate_per_kwh": 6.85,
        "peak_rate_per_kwh": 9.40,
        "off_peak_rate_per_kwh": 5.20,
        "current_slab": "OFF_PEAK",
        "monthly_projection_inr": 4250,
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
