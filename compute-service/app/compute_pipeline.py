"""
API-обёртки над lapis_engine V5.2 для HTTP compute-сервиса (блоки 1A и 1B прогона).
"""

from __future__ import annotations

import datetime
import json
import logging
import os
from pathlib import Path
from typing import Any, Optional

from timezonefinder import TimezoneFinder

from app import lapis_engine as le

_ENGINE_DIR = Path(__file__).resolve().parent
_DEFAULT_EPHE = _ENGINE_DIR.parent / "ephe"
_ENGINE_VERSION = "lapis_engine_v5.2"


def ensure_ephe_path() -> None:
    ephe_path = os.environ.get("SWISSEPH_PATH", str(_DEFAULT_EPHE))
    if Path(ephe_path).is_dir():
        le.swe.set_ephe_path(ephe_path)


def build_hd_data(year: int, month: int, day: int, hour_utc: float, is_debug: bool = False) -> dict:
    ensure_ephe_path()
    raw = le.build_hd_json(year, month, day, hour_utc, is_debug=is_debug)
    return json.loads(raw)


def resolve_birth_utc(
    city: str,
    year: int,
    month: int,
    day: int,
    hour: int,
    minute: int,
    is_debug: bool = False,
) -> tuple[dict, dict]:
    geo = le.get_coordinates(city, is_debug=is_debug)
    if "error" in geo:
        raise ValueError(geo["error"])

    utc_info = le.convert_local_time_to_utc(
        year,
        month,
        day,
        hour,
        minute,
        geo["latitude"],
        geo["longitude"],
        is_debug=is_debug,
    )
    tz = TimezoneFinder().timezone_at(lng=geo["longitude"], lat=geo["latitude"]) or ""
    utc_info["timezone_name"] = tz
    return geo, utc_info


def compute_age_from_birth(year: int, month: int, day: int) -> float:
    today = datetime.date.today()
    born = datetime.date(year, month, day)
    age = today.year - born.year
    if (today.month, today.day) < (born.month, born.day):
        age -= 1
    return float(max(0, age))


def build_utc_info_package(
    city: str,
    year: int,
    month: int,
    day: int,
    hour: int,
    minute: int,
    geo: dict,
    utc_info: dict,
    target_age: float,
) -> dict[str, Any]:
    return {
        **utc_info,
        "target_age": float(target_age),
        "city": city,
        "input_year": year,
        "input_month": month,
        "input_day": day,
        "input_hour": hour,
        "input_minute": minute,
        "geo": geo,
    }


def build_protocol_monolith(
    utc_info: dict[str, Any],
    hd_data: dict,
    birth_year: int,
    birth_month: int,
    birth_day: int,
) -> dict[str, Any]:
    """Конвейер V5.2: 1A+1B+стенты+ХВД+Цолькин+шина Райха (без CLI)."""
    ensure_ephe_path()
    birth_date_str = f"{birth_year:04d}-{birth_month:02d}-{birth_day:02d}"
    hd_raw = json.dumps(hd_data, ensure_ascii=False)

    tropical_payload, transit_result = le.execute_natal_and_transit_layer(utc_info)

    transit_delta = le.calculate_bodygraph_transits_delta(hd_raw, None, None)
    transit_interpretation = le.interpret_astral_hijacks_and_bridges(transit_delta)

    pythagoras_data = le.calculate_pythagoras_matrix(birth_date_str)
    ladini_data = le.calculate_ladini_matrix(birth_date_str)
    age_arcane_data = le.calculate_ladini_age_arcane(
        ladini_data["raw_nodes"], utc_info["target_age"]
    )
    hvd_data = le.calculate_hvd_chakras(birth_date_str)
    tzolkin_data = le.calculate_maya_tzolkin_oracle(birth_date_str)

    tsp_modifiers, all_resonance_nodes, usin_snapshot, academic_core = le.execute_somatic_macro_conveyor(
        utc_info,
        hd_data,
        pythagoras_data,
        ladini_data,
        age_arcane_data,
        hvd_data,
        tzolkin_data,
        transit_result,
    )

    grid_vector = pythagoras_data["pythagoras_grid_vector"]
    vacuum_gaps = pythagoras_data["pythagoras_vacuum_gaps"]
    chakra_health = ladini_data["chakra_health_matrix"]
    current_arcane = age_arcane_data["current_year_arcane"]

    return {
        "METAMODEL_MONOLITH_RUNTIME": {
            "engine": _ENGINE_VERSION,
            "execution_engine_version": "V5.2_MODULAR_DECOMPOSITION",
            "status": "CONVERGENCE_SUCCESSFUL",
            "antihallucination_gate": "LOCK_INVARIANT_1.00",
        },
        "block_1a_tropical_natal": tropical_payload,
        "block_1a_rave_data": hd_data["tropical"],
        "block_1a_bodygraph_transits": transit_interpretation,
        "block_1b_pythagoras_data": {
            "working_numbers": pythagoras_data["working_numbers"],
            "pythagoras_grid_vector": grid_vector,
            "pythagoras_vacuum_gaps": vacuum_gaps,
            "lines_pressure_index": pythagoras_data["lines_pressure_index"],
        },
        "block_1b_ladini_monolith": {
            "ladini_nodes_vector": ladini_data["ladini_nodes_vector"],
            "ancestral_quadrant_lines": ladini_data["ancestral_quadrant_lines"],
            "rectified_diagonals": ladini_data["rectified_diagonals"],
            "axes_power": ladini_data["axes_power"],
            "karmic_tail_triple": ladini_data["karmic_tail_triple"],
            "channels_triadas": ladini_data["channels_triadas"],
            "destiny_levels": ladini_data["destiny_levels"],
            "age_dynamic_resolving": {
                "target_age": utc_info["target_age"],
                "current_year_arcane": current_arcane,
                "alchemical_stage": age_arcane_data["cross_system_impact"]["alchemical_stage"],
                "node_anchor": age_arcane_data["node"],
            },
            "chakra_health_matrix": chakra_health,
        },
        "block_2b_hvd_chakras": hvd_data,
        "block_1d_tzolkin_oracle": tzolkin_data,
        "usin_snapshot": usin_snapshot,
        "academic_core": academic_core,
        "cross_system_stent_matrix": {
            "description": (
                "Сквозное послойное наложение стентов Октаграммы, Пифагора, ХВД, Цолькин, "
                "У-Син и транзитов на Кеному Бодиграфа (шина Райха V5.2)."
            ),
            "active_resonance_nodes": all_resonance_nodes,
            "final_somatic_tensor_reich_uV": tsp_modifiers,
        },
    }


def _build_input_meta(
    city: str,
    year: int,
    month: int,
    day: int,
    hour: int,
    minute: int,
    geo: dict,
    utc_info: dict,
    gender: Optional[str] = None,
    target_age: Optional[float] = None,
) -> dict:
    meta = {
        "city": city,
        "local_datetime": f"{year:04d}-{month:02d}-{day:02d} {hour:02d}:{minute:02d}",
        "coordinates": {
            "latitude": geo["latitude"],
            "longitude": geo["longitude"],
            "display_name": geo.get("display_name"),
        },
        "timezone": utc_info.get("timezone_name", ""),
        "utc_datetime": (
            f"{utc_info['utc_year']:04d}-{utc_info['utc_month']:02d}-"
            f"{utc_info['utc_day']:02d} "
            f"{utc_info['utc_hour_float']:.4f}h"
        ),
    }
    if gender:
        meta["gender"] = gender
    if target_age is not None:
        meta["target_age"] = target_age
    return meta


def compute_human_design(
    city: str,
    year: int,
    month: int,
    day: int,
    hour: int,
    minute: int,
    is_debug: bool = False,
) -> dict:
    if not city or not str(city).strip():
        raise ValueError("Город рождения не указан.")

    city = str(city).strip()
    logging.info("[1A] Геокодинг и расчёт бодиграфа V5.2 для '%s'", city)

    geo, utc_info = resolve_birth_utc(city, year, month, day, hour, minute, is_debug=is_debug)
    hd_data = build_hd_data(
        utc_info["utc_year"],
        utc_info["utc_month"],
        utc_info["utc_day"],
        utc_info["utc_hour_float"],
        is_debug=is_debug,
    )

    return {
        "engine": _ENGINE_VERSION,
        "block_id": "1A",
        "input": _build_input_meta(city, year, month, day, hour, minute, geo, utc_info),
        "bodygraph": hd_data,
    }


def compute_genesis_monolith(
    city: str,
    year: int,
    month: int,
    day: int,
    hour: int,
    minute: int,
    target_age: Optional[float] = None,
    is_debug: bool = False,
) -> dict:
    """Полный детерминированный пакет для блока 1B (V5.2)."""
    if not city or not str(city).strip():
        raise ValueError("Город рождения не указан.")

    city = str(city).strip()
    logging.info("[1B] Кросс-системный расчёт V5.2 для '%s'", city)

    geo, utc_info = resolve_birth_utc(city, year, month, day, hour, minute, is_debug=is_debug)
    resolved_age = target_age if target_age is not None else compute_age_from_birth(year, month, day)
    utc_package = build_utc_info_package(
        city, year, month, day, hour, minute, geo, utc_info, resolved_age
    )

    hd_data = build_hd_data(
        utc_info["utc_year"],
        utc_info["utc_month"],
        utc_info["utc_day"],
        utc_info["utc_hour_float"],
        is_debug=is_debug,
    )

    monolith = build_protocol_monolith(utc_package, hd_data, year, month, day)

    return {
        "engine": _ENGINE_VERSION,
        "block_id": "1B",
        "input": _build_input_meta(
            city, year, month, day, hour, minute, geo, utc_info, target_age=resolved_age
        ),
        "monolith": monolith,
        "bodygraph": hd_data,
    }
