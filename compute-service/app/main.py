import logging
import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from app.human_design_engine import compute_human_design

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

API_SECRET = os.environ.get("COMPUTE_API_SECRET", "").strip()
ALLOWED_BLOCKS = {"1A"}


class HumanDesignRequest(BaseModel):
    block_id: str = Field(default="1A", description="Блок Lapis Vivus (пока только 1A)")
    birth_date: str = Field(..., description="DD.MM.YYYY")
    birth_time: str = Field(..., description="HH:MM")
    birth_place: str = Field(..., description="Город рождения")
    gender: Optional[str] = None


def verify_auth(authorization: Optional[str] = Header(default=None)) -> None:
    if not API_SECRET:
        raise HTTPException(
            status_code=503,
            detail="COMPUTE_API_SECRET не задан на сервере.",
        )
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Требуется Authorization: Bearer <secret>")
    token = authorization[7:].strip()
    if token != API_SECRET:
        raise HTTPException(status_code=403, detail="Неверный API secret")


def parse_birth_date(value: str) -> tuple[int, int, int]:
    parts = value.strip().split(".")
    if len(parts) != 3:
        raise ValueError("birth_date должен быть в формате DD.MM.YYYY")
    day, month, year = (int(p) for p in parts)
    if not (1 <= day <= 31 and 1 <= month <= 12 and 1900 <= year <= 2100):
        raise ValueError("Некорректная дата рождения")
    return day, month, year


def parse_birth_time(value: str) -> tuple[int, int]:
    raw = value.strip().lower()
    if raw in ("неизвестно", "unknown", ""):
        raise ValueError("Для Human Design нужно точное время рождения (HH:MM)")
    parts = raw.split(":")
    if len(parts) != 2:
        raise ValueError("birth_time должен быть в формате HH:MM")
    hour, minute = (int(p) for p in parts)
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        raise ValueError("Некорректное время рождения")
    return hour, minute


app = FastAPI(title="Lapis Vivus Compute", version="1.0.0")


@app.get("/health")
def health():
    return {"ok": True, "service": "lapis-compute", "blocks": sorted(ALLOWED_BLOCKS)}


@app.post("/v1/compute/human-design")
def compute_human_design_endpoint(
    body: HumanDesignRequest,
    _: None = Depends(verify_auth),
):
    block_id = body.block_id.strip().upper()
    if block_id not in ALLOWED_BLOCKS:
        raise HTTPException(status_code=400, detail=f"Блок {block_id} не поддерживается compute-сервисом")

    try:
        day, month, year = parse_birth_date(body.birth_date)
        hour, minute = parse_birth_time(body.birth_time)
        result = compute_human_design(
            city=body.birth_place,
            year=year,
            month=month,
            day=day,
            hour=hour,
            minute=minute,
            is_debug=False,
        )
        if body.gender:
            result["input"]["gender"] = body.gender
        return {"ok": True, "data": result}
    except ValueError as err:
        raise HTTPException(status_code=422, detail=str(err)) from err
    except Exception as err:
        logging.exception("compute_human_design failed")
        raise HTTPException(status_code=500, detail=f"Ошибка расчёта: {err}") from err
