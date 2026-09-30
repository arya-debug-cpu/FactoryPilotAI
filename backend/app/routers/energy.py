"""GET /api/energy."""

from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import EnergyRecord, Machine

router = APIRouter(tags=["energy"])

ENERGY_PRICE = 0.14  # currency per kWh, kept in config in production


@router.get("/energy")
def energy(days: int = 14, machine_id: int | None = None, db: Session = Depends(get_db)) -> dict:
    today = date.today()
    start = today - timedelta(days=max(1, days) - 1)
    machines = {m.id: m for m in db.query(Machine).all()}

    query = db.query(EnergyRecord).filter(EnergyRecord.day.between(start, today))
    rows = query.all() if not machine_id else query.filter(
        EnergyRecord.machine_id == machine_id
    ).all()

    total_kwh = sum(r.kwh for r in rows)
    total_units = sum(r.units_produced for r in rows)
    total_cost = sum(r.cost for r in rows)

    # efficiency: previous window of equal length
    prev_start = start - timedelta(days=max(1, days))
    prev_rows = (
        db.query(EnergyRecord).filter(EnergyRecord.day.between(prev_start, start - timedelta(days=1))).all()
    )
    prev_kwh = sum(r.kwh for r in prev_rows)
    prev_units = sum(r.units_produced for r in prev_rows)
    prev_intensity = prev_kwh / max(1, prev_units)
    intensity = total_kwh / max(1, total_units)
    intensity_delta = (intensity - prev_intensity) / prev_intensity if prev_intensity else 0

    # trend per day
    day_map: dict = {}
    for r in rows:
        entry = day_map.setdefault(r.day, {"kwh": 0.0, "units": 0, "cost": 0.0})
        entry["kwh"] += r.kwh
        entry["units"] += r.units_produced
        entry["cost"] += r.cost
    trend = [
        {
            "day": d.isoformat(),
            "label": d.strftime("%d %b"),
            "kwh": round(day_map[d]["kwh"], 1),
            "units": day_map[d]["units"],
            "cost": round(day_map[d]["cost"], 2),
            "kwh_per_unit": round(day_map[d]["kwh"] / max(1, day_map[d]["units"]), 2),
        }
        for d in sorted(day_map)
    ]

    # machine-wise
    per_machine: dict = {}
    for r in rows:
        entry = per_machine.setdefault(r.machine_id, {"kwh": 0.0, "units": 0, "cost": 0.0})
        entry["kwh"] += r.kwh
        entry["units"] += r.units_produced
        entry["cost"] += r.cost

    by_machine = []
    for mid, entry in per_machine.items():
        machine = machines.get(mid)
        if not machine:
            continue
        kwh_unit = entry["kwh"] / max(1, entry["units"])
        by_machine.append(
            {
                "machine_id": mid,
                "code": machine.code,
                "name": machine.name,
                "line": machine.line,
                "kwh": round(entry["kwh"], 1),
                "units": entry["units"],
                "cost": round(entry["cost"], 2),
                "kwh_per_unit": round(kwh_unit, 2),
                "share_pct": round(entry["kwh"] / max(1.0, total_kwh) * 100, 1),
                "intensity_index": round(kwh_unit / max(0.01, intensity), 2),
            }
        )
    by_machine.sort(key=lambda x: x["kwh"], reverse=True)

    return {
        "summary": {
            "total_kwh": round(total_kwh, 1),
            "total_units": total_units,
            "total_cost": round(total_cost, 2),
            "kwh_per_unit": round(intensity, 2),
            "prev_kwh_per_unit": round(prev_intensity, 2),
            "intensity_delta_pct": round(intensity_delta * 100, 1),
            "efficiency_pct": round(
                max(0.0, min(100.0, 100 - max(0.0, intensity_delta) * 300)), 1
            ),
            "daily_average_kwh": round(total_kwh / max(1, len(day_map)), 1),
            "price_per_kwh": ENERGY_PRICE,
        },
        "trend": trend,
        "by_machine": by_machine,
        "machines": [
            {"id": m.id, "code": m.code, "name": m.name}
            for m in sorted(machines.values(), key=lambda m: m.code)
        ],
    }
