"""
Обратная совместимость: публичные функции compute-сервиса.
Реализация — в lapis_engine + compute_pipeline.
"""

from app.compute_pipeline import compute_genesis_monolith, compute_human_design

__all__ = ["compute_human_design", "compute_genesis_monolith"]
