import logging
import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from app.human_design_engine import compute_genesis_monolith, compute_human_design

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

API_SECRET = os.environ.get("COMPUTE_API_SECRET", "").strip()
ALLOWED_BLOCKS = {"1A", "1B"}


class BirthComputeRequest(BaseModel):
    block_id: str = Field(default="1A", description="Блок Lapis Vivus (1A или 1B)")
    birth_date: str = Field(..., description="DD.MM.YYYY")
    birth_time: str = Field(..., description="HH:MM")
    birth_place: str = Field(..., description="Город рождения")
    gender: Optional[str] = None
    target_age: Optional[float] = Field(
        default=None,
        description="Возраст для кармических циклов Ладини (по умолчанию — от даты рождения до сегодня)",
    )


# Обратная совместимость имён
HumanDesignRequest = BirthComputeRequest


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
        raise ValueError("Для расчёта прогона нужно точное время рождения (HH:MM)")
    parts = raw.split(":")
    if len(parts) != 2:
        raise ValueError("birth_time должен быть в формате HH:MM")
    hour, minute = (int(p) for p in parts)
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        raise ValueError("Некорректное время рождения")
    return hour, minute


def run_block_compute(body: BirthComputeRequest, block_id: str) -> dict:
    block_id = block_id.strip().upper()
    if block_id not in ALLOWED_BLOCKS:
        raise HTTPException(status_code=400, detail=f"Блок {block_id} не поддерживается compute-сервисом")

    day, month, year = parse_birth_date(body.birth_date)
    hour, minute = parse_birth_time(body.birth_time)

    if block_id == "1A":
        result = compute_human_design(
            city=body.birth_place,
            year=year,
            month=month,
            day=day,
            hour=hour,
            minute=minute,
            is_debug=False,
        )
    else:
        result = compute_genesis_monolith(
            city=body.birth_place,
            year=year,
            month=month,
            day=day,
            hour=hour,
            minute=minute,
            target_age=body.target_age,
            is_debug=False,
        )

    if body.gender:
        result["input"]["gender"] = body.gender
    return result


app = FastAPI(title="Lapis Vivus Compute", version="1.1.0")


@app.get("/health")
def health():
    return {"ok": True, "service": "lapis-compute", "blocks": sorted(ALLOWED_BLOCKS)}


@app.post("/v1/compute/human-design")
def compute_human_design_endpoint(
    body: BirthComputeRequest,
    _: None = Depends(verify_auth),
):
    try:
        result = run_block_compute(body, "1A")
        return {"ok": True, "data": result}
    except ValueError as err:
        raise HTTPException(status_code=422, detail=str(err)) from err
    except HTTPException:
        raise
    except Exception as err:
        logging.exception("compute_human_design failed")
        raise HTTPException(status_code=500, detail=f"Ошибка расчёта: {err}") from err


@app.post("/v1/compute/genesis")
def compute_genesis_endpoint(
    body: BirthComputeRequest,
    _: None = Depends(verify_auth),
):
    """Блок 1B: Пифагор + Ладини + кросс-системные стенты (с HD для стыковки)."""
    try:
        result = run_block_compute(body, "1B")
        return {"ok": True, "data": result}
    except ValueError as err:
        raise HTTPException(status_code=422, detail=str(err)) from err
    except HTTPException:
        raise
    except Exception as err:
        logging.exception("compute_genesis failed")
        raise HTTPException(status_code=500, detail=f"Ошибка расчёта: {err}") from err
