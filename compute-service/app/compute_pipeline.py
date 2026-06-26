"""
API-обёртки над lapis_engine для HTTP compute-сервиса (блоки 1A и 1B прогона).
"""

from __future__ import annotations

import datetime
import json
import logging
import os
from pathlib import Path
from typing import Any, Optional

from app import lapis_engine as le

_ENGINE_DIR = Path(__file__).resolve().parent
_DEFAULT_EPHE = _ENGINE_DIR.parent / "ephe"

ALL_CENTERS = [
    "Head",
    "Ajna",
    "Throat",
    "G_Center",
    "Heart",
    "Sacral",
    "Root",
    "Splenic",
    "Solar_Plexus",
]


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
    return geo, utc_info


def compute_age_from_birth(year: int, month: int, day: int) -> float:
    today = datetime.date.today()
    born = datetime.date(year, month, day)
    age = today.year - born.year
    if (today.month, today.day) < (born.month, born.day):
        age -= 1
    return float(max(0, age))


def build_protocol_monolith(
    hd_data: dict,
    birth_year: int,
    birth_month: int,
    birth_day: int,
    target_age: Optional[float] = None,
) -> dict[str, Any]:
    """Кросс-системный JSON-пакет 1A+1B+стенты (из run_from_console без I/O)."""
    if target_age is None:
        target_age = compute_age_from_birth(birth_year, birth_month, birth_day)

    birth_date_str = f"{birth_year:04d}-{birth_month:02d}-{birth_day:02d}"
    pythagoras_data = le.calculate_pythagoras_matrix(birth_date_str)
    ladini_data = le.calculate_ladini_matrix(birth_date_str)
    age_arcane_data = le.calculate_ladini_age_arcane(ladini_data["raw_nodes"], target_age)

    defined_centers = hd_data["tropical"]["defined_centers"]
    open_centers = [c for c in ALL_CENTERS if c not in defined_centers]
    vacuum_gaps = pythagoras_data["pythagoras_vacuum_gaps"]
    grid_vector = pythagoras_data["pythagoras_grid_vector"]

    tsp_modifiers = {f"segment_{i}": 0.0 for i in range(1, 8)}
    all_resonance_nodes: list[dict] = []

    if 1 in vacuum_gaps and "Heart" in open_centers:
        all_resonance_nodes.append(
            {"register": "PYTHAGORAS_NODE_1", "state": "ACTIVE_MERCURIUS_LEAKAGE [Ego Proof Danger]"}
        )
        tsp_modifiers["segment_4"] += 2.0

    if 2 in vacuum_gaps and "Sacral" in open_centers:
        all_resonance_nodes.append(
            {"register": "PYTHAGORAS_NODE_2", "state": "ACTIVE_MERCURIUS_LEAKAGE [Adrenal Exhaustion]"}
        )
        tsp_modifiers["segment_7"] += 2.0

    if 4 in vacuum_gaps and "Splenic" in open_centers:
        all_resonance_nodes.append(
            {"register": "PYTHAGORAS_NODE_3", "state": "ACTIVE_SAL_COMPRESSION [Survival Panic]"}
        )
        tsp_modifiers["segment_5"] += 2.0

    if 5 in vacuum_gaps and "Ajna" in open_centers:
        all_resonance_nodes.append(
            {"register": "PYTHAGORAS_NODE_4", "state": "ACTIVE_MERCURIUS_LEAKAGE [Mental Chaos Dogma]"}
        )
        tsp_modifiers["segment_1"] += 2.0

    if grid_vector[8] >= 3 and "Head" in defined_centers:
        all_resonance_nodes.append(
            {
                "register": "PYTHAGORAS_NODE_5",
                "state": "ACTIVE_SAL_HYPER_COAGULATION [Masseter Lock Bit Active]",
            }
        )
        tsp_modifiers["segment_2"] += 2.5

    current_arcane = age_arcane_data["current_year_arcane"]
    if current_arcane == 15 and "Root" in open_centers:
        all_resonance_nodes.append(
            {"register": "AGE_KARMIC_STENT_15", "state": "CRITICAL_SATURN_LOCK [Devil Material Obsession]"}
        )
        tsp_modifiers["segment_5"] *= 1.5
        tsp_modifiers["segment_7"] += 2.8

    if current_arcane == 7 and "G_Center" in defined_centers:
        all_resonance_nodes.append(
            {"register": "AGE_KARMIC_STENT_7", "state": "IDENTITY_SUPER_ALIGNMENT [Chariot Vector Active]"}
        )
        tsp_modifiers["segment_4"] *= 0.5

    nodes_l1, tsp_modifiers = le.validate_and_apply_heaven_stents(
        ladini_data, open_centers, defined_centers, tsp_modifiers
    )
    all_resonance_nodes.extend(nodes_l1)

    nodes_l2, tsp_modifiers = le.validate_and_apply_earth_stents(
        ladini_data, open_centers, defined_centers, tsp_modifiers
    )
    all_resonance_nodes.extend(nodes_l2)

    nodes_l3, tsp_modifiers = le.validate_and_apply_father_stents(
        ladini_data, open_centers, defined_centers, tsp_modifiers
    )
    all_resonance_nodes.extend(nodes_l3)

    nodes_l4, tsp_modifiers = le.validate_and_apply_mother_stents(
        ladini_data, open_centers, defined_centers, tsp_modifiers
    )
    all_resonance_nodes.extend(nodes_l4)

    nodes_l5, tsp_modifiers = le.validate_karmic_tail_layer(
        ladini_data, open_centers, defined_centers, tsp_modifiers
    )
    all_resonance_nodes.extend(nodes_l5)

    nodes_l6, tsp_modifiers = le.validate_and_apply_money_stents(
        ladini_data, open_centers, defined_centers, tsp_modifiers
    )
    all_resonance_nodes.extend(nodes_l6)

    nodes_l7, tsp_modifiers = le.validate_and_apply_love_stents(
        ladini_data, open_centers, defined_centers, tsp_modifiers
    )
    all_resonance_nodes.extend(nodes_l7)

    nodes_l8, tsp_modifiers = le.validate_and_apply_destiny_stents(ladini_data, target_age, tsp_modifiers)
    all_resonance_nodes.extend(nodes_l8)

    chakra_health = ladini_data["chakra_health_matrix"]
    tsp_modifiers["segment_1"] += chakra_health["sahasrara_7"]["total"] * 0.1
    tsp_modifiers["segment_2"] += chakra_health["ajna_6"]["total"] * 0.1
    tsp_modifiers["segment_3"] += chakra_health["vishuddha_5"]["total"] * 0.1
    tsp_modifiers["segment_4"] += chakra_health["anahata_4"]["total"] * 0.1
    tsp_modifiers["segment_5"] += chakra_health["manipura_3"]["total"] * 0.1
    tsp_modifiers["segment_6"] += chakra_health["svadhishthana_2"]["total"] * 0.1
    tsp_modifiers["segment_7"] += chakra_health["muladhara_1"]["total"] * 0.1

    return {
        "METAMODEL_MONOLITH_RUNTIME": {
            "engine": "lapis_engine_v3.9",
            "execution_engine_version": "V3.9_MODULAR_MONOLITH_ON",
            "status": "CONVERGENCE_SUCCESSFUL",
            "antihallucination_gate": "LOCK_INVARIANT_1.00",
        },
        "block_1a_rave_data": hd_data["tropical"],
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
                "target_age": target_age,
                "current_year_arcane": current_arcane,
                "alchemical_stage": age_arcane_data["cross_system_impact"]["alchemical_stage"],
                "node_anchor": age_arcane_data["node"],
            },
            "chakra_health_matrix": chakra_health,
        },
        "cross_system_stent_matrix": {
            "description": (
                "Сквозное послойное наложение изолированных транзисторов Октаграммы и Пифагора "
                "на Кеному Бодиграфа для вычисления финального соматического вектора TSP."
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
        "timezone": utc_info["timezone_name"],
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
    logging.info("[1A] Геокодинг и расчёт бодиграфа для '%s'", city)

    geo, utc_info = resolve_birth_utc(city, year, month, day, hour, minute, is_debug=is_debug)
    hd_data = build_hd_data(
        utc_info["utc_year"],
        utc_info["utc_month"],
        utc_info["utc_day"],
        utc_info["utc_hour_float"],
        is_debug=is_debug,
    )

    return {
        "engine": "lapis_engine_v3.9",
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
    """Полный детерминированный пакет для блока 1B (Пифагор + Ладини + стенты + HD)."""
    if not city or not str(city).strip():
        raise ValueError("Город рождения не указан.")

    city = str(city).strip()
    logging.info("[1B] Кросс-системный расчёт для '%s'", city)

    geo, utc_info = resolve_birth_utc(city, year, month, day, hour, minute, is_debug=is_debug)
    hd_data = build_hd_data(
        utc_info["utc_year"],
        utc_info["utc_month"],
        utc_info["utc_day"],
        utc_info["utc_hour_float"],
        is_debug=is_debug,
    )

    resolved_age = target_age if target_age is not None else compute_age_from_birth(year, month, day)
    monolith = build_protocol_monolith(hd_data, year, month, day, resolved_age)

    return {
        "engine": "lapis_engine_v3.9",
        "block_id": "1B",
        "input": _build_input_meta(
            city, year, month, day, hour, minute, geo, utc_info, target_age=resolved_age
        ),
        "monolith": monolith,
        "bodygraph": hd_data,
    }
