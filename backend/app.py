from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from fairfare import FairFare

app = FastAPI(title="FairFare India v2")
engine = FairFare()
META = engine.meta()


class CheckRequest(BaseModel):
    origin: str
    dest: str
    airline: str
    stops: str
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    price: float = Field(gt=0)
    method: Optional[str] = None


@app.get("/api/meta")
def meta():
    return META


@app.post("/api/check")
def check(req: CheckRequest):
    if req.origin not in META["cities"] or req.dest not in META["cities"] or req.airline not in META["airlines"]:
        raise HTTPException(400, "Unknown city or airline")
    try:
        return engine.check(req.origin, req.dest, req.airline, req.stops, req.date, req.price, req.method)
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.get("/api/models")
def models():
    return engine.models()


@app.get("/api/forecast")
def forecast(method: str, weeks: int = 26):
    try:
        return engine.forecast(method, max(4, min(weeks, 52)))
    except ValueError as e:
        raise HTTPException(400, str(e))


app.mount("/", StaticFiles(directory=Path(__file__).resolve().parent.parent / "frontend", html=True), name="web")
