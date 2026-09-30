"""GET /api/production -- filters by date and machine."""

from __future__ import annotations

from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Machine, ProductionRecord

router = APIRouter(tags=["production"])


@router.get("/production")
def production(
    day: str | None = None,
    machine_id: int | None = None,
    days: int = 14,
    db: Session = Depends(get_db),
) -> dict:
    today = date.today()
    end = today
    if day:
        try:
            end = datetime.strptime(day, "%Y-%m-%d").date()
        except ValueError:
            end = today
        start = end
    else:
        start = end - timedelta(days=max(1, days) - 1)

    machines = db.query(Machine).order_by(Machine.code).all()
    machine_by_id = {m.id: m for m in machines}

    query = db.query(ProductionRecord).filter(ProductionRecord.day.between(start, end))
    if machine_id:
        query = query.filter(ProductionRecord.machine_id == machine_id)
    rows = query.all()

    target = sum(r.target for r in rows)
    output = sum(r.output for r in rows)
    defects = sum(r.defects for r in rows)
    downtime_min = sum(r.downtime_minutes for r in rows)

    # machine-wise aggregation
    per_machine: dict = {}
    for r in rows:
        entry = per_machine.setdefault(
            r.machine_id, {"output": 0, "target": 0, "defects": 0, "downtime": 0.0, "shifts": 0}
        )
        entry["output"] += r.output
        entry["target"] += r.target
        entry["defects"] += r.defects
        entry["downtime"] += r.downtime_minutes
        entry["shifts"] += 1

    by_machine = []
    for mid, entry in per_machine.items():
        machine = machine_by_id.get(mid)
        if not machine:
            continue
        by_machine.append(
            {
                "machine_id": mid,
                "code": machine.code,
                "name": machine.name,
                "line": machine.line,
                "target": entry["target"],
                "output": entry["output"],
                "achievement_pct": round(entry["output"] / entry["target"] * 100, 1)
                if entry["target"]
                else 0,
                "defects": entry["defects"],
                "defect_rate": round(entry["defects"] / entry["output"] * 100, 2)
                if entry["output"]
                else 0,
                "downtime_hours": round(entry["downtime"] / 60.0, 1),
                "shifts": entry["shifts"],
            }
        )
    by_machine.sort(key=lambda x: x["achievement_pct"])

    # daily series
    day_map: dict = {}
    for r in rows:
        entry = day_map.setdefault(r.day, {"output": 0, "target": 0, "defects": 0, "downtime": 0.0})
        entry["output"] += r.output
        entry["target"] += r.target
        entry["defects"] += r.defects
        entry["downtime"] += r.downtime_minutes

    ordered_days = sorted(day_map)
    series = [
        {
            "day": d.isoformat(),
            "label": d.strftime("%d %b"),
            "output": day_map[d]["output"],
            "target": day_map[d]["target"],
            "achievement": round(day_map[d]["output"] / day_map[d]["target"] * 100, 1)
            if day_map[d]["target"]
            else 0,
            "defects": day_map[d]["defects"],
            "downtime_hours": round(day_map[d]["downtime"] / 60.0, 1),
        }
        for d in ordered_days
    ]

    # shift split
    shift_map: dict = {}
    for r in rows:
        entry = shift_map.setdefault(r.shift, {"output": 0, "target": 0})
        entry["output"] += r.output
        entry["target"] += r.target
    by_shift = [
        {"shift": name, "output": v["output"], "target": v["target"]}
        for name, v in sorted(shift_map.items())
    ]

    return {
        "filters": {
            "from": start.isoformat(),
            "to": end.isoformat(),
            "machine_id": machine_id,
            "available_days": [
                (today - timedelta(days=i)).isoformat() for i in range(13, -1, -1)
            ],
        },
        "summary": {
            "target": target,
            "output": output,
            "achievement_pct": round(output / target * 100, 1) if target else 0,
            "defects": defects,
            "defect_rate": round(defects / output * 100, 2) if output else 0,
            "downtime_hours": round(downtime_min / 60.0, 1),
            "gap": output - target,
            "shifts": len(rows),
        },
        "by_machine": by_machine,
        "series": series,
        "by_shift": by_shift,
        "machines": [
            {"id": m.id, "code": m.code, "name": m.name, "line": m.line} for m in machines
        ],
    }
