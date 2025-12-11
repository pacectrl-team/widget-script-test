import asyncio
import json
from datetime import datetime, timedelta, timezone
import random
import string
from pathlib import Path
from typing import Dict, List

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

app = FastAPI(title="PaceCtrl MVP", version="0.1.0")

# Load environment variables if present (no required env vars for the MVP).
load_dotenv()

# Allow all origins for embeddable widget usage during the MVP phase.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static voyage + theme configuration for the MVP (multiple trips).
TRIP_CONFIGS: Dict[str, Dict] = {
    "HEL-TLL-2025-12-12": {
        "external_trip_id": "HEL-TLL-2025-12-12",
        "speed_min_kn": 18.0,
        "speed_max_kn": 22.0,
        "speed_default_kn": 21.0,
        "max_reduction_pct": 20,
        "theme": {
            "font_family": "Inter, system-ui",
            "primary_color": "#10b981",
            "danger_color": "#ef4444",
            "bg_color": "#ffffff",
            "text_color": "#0f172a",
            "radius_px": 18,
        },
    },
    "VAA-UME-2025-12-15": {
        "external_trip_id": "VAA-UME-2025-12-15",
        "speed_min_kn": 16.0,
        "speed_max_kn": 21.0,
        "speed_default_kn": 19.5,
        "max_reduction_pct": 18,
        "theme": {
            "font_family": """'Trebuchet MS', 'Segoe UI', system-ui""",
            "primary_color": "#2563eb",  # blue variant
            "danger_color": "#e11d48",   # rose
            "bg_color": "#5efa73",       # light slate
            "text_color": "#420003",
            "radius_px": 0,
        },
    },
}

# In-memory store for choice intents. Suitable for testing only.
INTENT_STORE: Dict[str, Dict] = {}
CONFIRMED_CHOICES: List[Dict] = []
STREAM_SUBSCRIBERS: List[asyncio.Queue] = []


class ThemeConfig(BaseModel):
    font_family: str
    primary_color: str
    danger_color: str
    bg_color: str
    text_color: str
    radius_px: int


class WidgetConfigResponse(BaseModel):
    external_trip_id: str
    speed_min_kn: float
    speed_max_kn: float
    speed_default_kn: float
    max_reduction_pct: float
    theme: ThemeConfig


class ChoiceIntentRequest(BaseModel):
    external_trip_id: str = Field(..., description="Trip identifier to validate")
    reduction_pct: float = Field(..., ge=0, description="Requested speed reduction percent")


class ChoiceIntentResponse(BaseModel):
    intent_id: str


class ChoiceIntentRecord(BaseModel):
    intent_id: str
    external_trip_id: str
    reduction_pct: float
    created_at: str


class ChoiceConfirmationRequest(BaseModel):
    booking_id: int = Field(..., description="Booking identifier from host app")
    intent_id: str = Field(..., description="Previously created intent id")


class ChoiceConfirmationRecord(BaseModel):
    booking_id: int
    intent_id: str
    external_trip_id: str
    reduction_pct: float
    confirmed_at: str


class TripAverageResponse(BaseModel):
    external_trip_id: str
    count: int
    average_reduction_pct: float


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.get("/api/v1/public/widget/config", response_model=WidgetConfigResponse)
def get_widget_config(external_trip_id: str = Query(..., alias="external_trip_id")):
    trip = _get_trip_config(external_trip_id)
    return trip


@app.post("/api/v1/public/choice-intents", response_model=ChoiceIntentResponse)
def create_choice_intent(payload: ChoiceIntentRequest):
    _prune_old_intents()
    _get_trip_config(payload.external_trip_id)

    max_reduction = float(TRIP_CONFIGS[payload.external_trip_id]["max_reduction_pct"])
    if payload.reduction_pct < 0 or payload.reduction_pct > max_reduction:
        raise HTTPException(status_code=400, detail="Reduction out of bounds")

    intent_id = _generate_intent_id()
    INTENT_STORE[intent_id] = {
        "intent_id": intent_id,
        "external_trip_id": payload.external_trip_id,
        "reduction_pct": payload.reduction_pct,
        "created_at": datetime.utcnow().isoformat() + "Z",
    }
    _broadcast_state()
    return {"intent_id": intent_id}


@app.post("/api/v1/public/choice-confirmations", response_model=ChoiceConfirmationRecord)
def confirm_choice(payload: ChoiceConfirmationRequest):
    intent = INTENT_STORE.pop(payload.intent_id, None)
    if not intent:
        raise HTTPException(status_code=404, detail="Intent not found")

    record = {
        "booking_id": payload.booking_id,
        "intent_id": intent["intent_id"],
        "external_trip_id": intent["external_trip_id"],
        "reduction_pct": intent["reduction_pct"],
        "confirmed_at": datetime.utcnow().isoformat() + "Z",
    }
    CONFIRMED_CHOICES.append(record)
    _broadcast_state()
    return record


@app.get("/api/v1/admin/choice-intents", response_model=List[ChoiceIntentRecord])
def list_choice_intents():
    return sorted(INTENT_STORE.values(), key=lambda intent: intent["created_at"], reverse=True)


@app.get("/api/v1/admin/choice-confirmations", response_model=List[ChoiceConfirmationRecord])
def list_choice_confirmations():
    return sorted(CONFIRMED_CHOICES, key=lambda record: record["confirmed_at"], reverse=True)


@app.get("/api/v1/admin/trip-average", response_model=TripAverageResponse)
def get_trip_average(external_trip_id: str = Query(..., alias="external_trip_id")):
    _get_trip_config(external_trip_id)
    trip_choices = [c for c in CONFIRMED_CHOICES if c["external_trip_id"] == external_trip_id]
    count = len(trip_choices)
    avg = sum(c["reduction_pct"] for c in trip_choices) / count if count else 0.0
    return {
        "external_trip_id": external_trip_id,
        "count": count,
        "average_reduction_pct": round(avg, 3),
    }


@app.get("/api/v1/admin/stream")
async def stream_state():
    async def event_generator():
        queue: asyncio.Queue = asyncio.Queue()
        STREAM_SUBSCRIBERS.append(queue)
        try:
            await queue.put(_current_state_snapshot())
            while True:
                data = await queue.get()
                yield f"data: {json.dumps(data)}\n\n"
        except asyncio.CancelledError:
            raise
        finally:
            if queue in STREAM_SUBSCRIBERS:
                STREAM_SUBSCRIBERS.remove(queue)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.get("/widget.js")
def serve_widget_js():
    widget_path = _resolve_widget_path()
    if not widget_path.exists():
        raise HTTPException(status_code=404, detail="widget.js not built yet")
    return FileResponse(widget_path, media_type="application/javascript")


def _generate_intent_id(length: int = 6) -> str:
    suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=length))
    return f"int_{suffix}"


def _resolve_widget_path() -> Path:
    # backend/app/main.py -> backend -> widget-script-test -> widget/dist/widget.js
    root_dir = Path(__file__).resolve().parents[2]
    return root_dir / "widget" / "dist" / "widget.js"


def _get_trip_config(external_trip_id: str) -> Dict:
    trip = TRIP_CONFIGS.get(external_trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    return trip


def _prune_old_intents(max_age_minutes: int = 15) -> None:
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=max_age_minutes)
    stale_keys = []
    for key, intent in INTENT_STORE.items():
        ts = intent.get("created_at")
        try:
            created_at = datetime.fromisoformat(ts.replace("Z", "+00:00")) if ts else None
        except Exception:
            created_at = None
        if created_at and created_at < cutoff:
            stale_keys.append(key)

    for key in stale_keys:
        INTENT_STORE.pop(key, None)

    if stale_keys:
        _broadcast_state()


def _broadcast_state() -> None:
    if not STREAM_SUBSCRIBERS:
        return
    snapshot = _current_state_snapshot()
    for queue in list(STREAM_SUBSCRIBERS):
        try:
            queue.put_nowait(snapshot)
        except Exception:
            # If a subscriber is misbehaving, drop it quietly for this MVP.
            try:
                STREAM_SUBSCRIBERS.remove(queue)
            except ValueError:
                pass


def _current_state_snapshot() -> Dict:
    intents = sorted(INTENT_STORE.values(), key=lambda intent: intent["created_at"], reverse=True)
    confirmations = sorted(CONFIRMED_CHOICES, key=lambda record: record["confirmed_at"], reverse=True)
    return {
        "intents": intents,
        "confirmations": confirmations,
        "trip_averages": _aggregate_by_trip(confirmations),
    }


def _aggregate_by_trip(confirmations: List[Dict]) -> List[Dict]:
    aggregates: Dict[str, Dict] = {}
    for record in confirmations:
        trip_id = record.get("external_trip_id")
        if not trip_id:
            continue
        agg = aggregates.setdefault(trip_id, {"external_trip_id": trip_id, "count": 0, "average_reduction_pct": 0.0})
        agg["count"] += 1
        # Incremental mean
        agg["average_reduction_pct"] += (record.get("reduction_pct", 0.0) - agg["average_reduction_pct"]) / agg["count"]

    # round for readability
    return [
        {
            "external_trip_id": v["external_trip_id"],
            "count": v["count"],
            "average_reduction_pct": round(v["average_reduction_pct"], 3),
        }
        for v in aggregates.values()
    ]
