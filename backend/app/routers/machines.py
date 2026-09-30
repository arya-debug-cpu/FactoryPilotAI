"""GET /api/machines and GET /api/machines/{id}."""

from __future__ import annotations

from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Alert, Machine, MachineReading, MaintenanceRecord, ProductionRecord
from ..predict import machine_brief, prediction_for_machine

router = APIRouter(tags=["machines"])


@router.get("/machines")
def list_machines(
    status: str | None = None,
    risk: str | None = None,
    line: str | None = None,
    q: str | None = None,
    sort: str = Query("risk", pattern="^(risk|health|code|name)$"),
    db: Session = Depends(get_db),
) -> dict:
    machines = db.query(Machine).order_by(Machine.code).all()
    all_briefs = [machine_brief(db, m) for m in machines]

    briefs = list(all_briefs)
    if status:
        briefs = [b for b in briefs if b["status"].upper() == status.upper()]
    if risk:
        briefs = [b for b in briefs if b["risk_level"] == risk.upper()]
    if line:
        briefs = [b for b in briefs if b["line"].lower() == line.lower()]
    if q:
        needle = q.lower()
        briefs = [
            b
            for b in briefs
            if needle in b["code"].lower()
            or needle in b["name"].lower()
            or needle in b["area"].lower()
        ]

    if sort == "risk":
        rank = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
        briefs.sort(key=lambda b: (rank[b["risk_level"]], -b["failure_probability"]))
    elif sort == "health":
        briefs.sort(key=lambda b: b["health_score"])
    else:
        briefs.sort(key=lambda b: str(b[sort]).lower())

    counts = {"LOW": 0, "MEDIUM": 0, "HIGH": 0, "CRITICAL": 0}
    for b in all_briefs:
        counts[b["risk_level"]] += 1

    lines = sorted({m.line for m in machines})
    return {"count": len(briefs), "risk_counts": counts, "lines": lines, "machines": briefs}


@router.get("/machines/{machine_id}")
def machine_detail(machine_id: int, db: Session = Depends(get_db)) -> dict:
    machine = db.get(Machine, machine_id)
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")

    brief = machine_brief(db, machine)
    prediction = prediction_for_machine(db, machine)

    # ---- sensor history (last 7 days, 4h sampling) -------------------------
    since = datetime.utcnow() - timedelta(days=7)
    readings = (
        db.query(MachineReading)
        .filter(MachineReading.machine_id == machine.id, MachineReading.ts >= since)
        .order_by(MachineReading.ts)
        .all()
    )

    def bucket(rows, key, step=1):
        return [
            {"t": r.ts.strftime("%d %b %H:%M"), "v": round(getattr(r, key), 2)}
            for i, r in enumerate(rows)
            if i % step == 0
        ]

    # ---- daily production / downtime (14 days) -----------------------------
    start = date.today() - timedelta(days=13)
    prod_rows = (
        db.query(ProductionRecord)
        .filter(
            ProductionRecord.machine_id == machine.id,
            ProductionRecord.day.between(start, date.today()),
        )
        .order_by(ProductionRecord.day)
        .all()
    )
    daily_map: dict = {}
    for row in prod_rows:
        entry = daily_map.setdefault(
            row.day, {"output": 0, "target": 0, "defects": 0, "downtime_hours": 0.0}
        )
        entry["output"] += row.output
        entry["target"] += row.target
        entry["defects"] += row.defects
        entry["downtime_hours"] += row.downtime_minutes / 60.0

    downtime_map: dict = {}
    for r in readings:
        day = r.ts.date()
        downtime_map[day] = downtime_map.get(day, 0.0) + r.downtime_minutes / 60.0

    days = [start + timedelta(days=i) for i in range(14)]
    production_history = [
        {
            "day": d.isoformat(),
            "label": d.strftime("%d %b"),
            "output": daily_map.get(d, {}).get("output", 0),
            "target": daily_map.get(d, {}).get("target", 0),
            "defects": daily_map.get(d, {}).get("defects", 0),
            "downtime_hours": round(
                max(
                    daily_map.get(d, {}).get("downtime_hours", 0.0),
                    downtime_map.get(d, 0.0),
                ),
                2,
            ),
        }
        for d in days
    ]

    # ---- related records ---------------------------------------------------
    alerts = (
        db.query(Alert)
        .filter(Alert.machine_id == machine.id)
        .order_by(Alert.created_at.desc())
        .limit(8)
        .all()
    )
    maintenance = (
        db.query(MaintenanceRecord)
        .filter(MaintenanceRecord.machine_id == machine.id)
        .order_by(MaintenanceRecord.scheduled_date)
        .all()
    )

    return {
        "machine": brief,
        "prediction": prediction,
        "history": {
            "temperature": bucket(readings, "temperature"),
            "vibration": bucket(readings, "vibration", 2),
            "energy": bucket(readings, "energy_kw", 2),
            "load": bucket(readings, "load", 2),
            "production": production_history,
        },
        "alerts": [
            {
                "id": a.id,
                "alert_type": a.alert_type,
                "severity": a.severity,
                "description": a.description,
                "timestamp": a.created_at.isoformat(timespec="minutes"),
                "status": a.status,
            }
            for a in alerts
        ],
        "maintenance": [
            {
                "id": m.id,
                "issue": m.issue,
                "priority": m.priority,
                "date": m.scheduled_date.isoformat(),
                "status": m.status,
                "source": m.source,
                "notes": m.notes,
                "completed_date": m.completed_date.isoformat() if m.completed_date else None,
            }
            for m in maintenance
        ],
    }
