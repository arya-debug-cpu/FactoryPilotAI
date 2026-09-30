"""GET /api/maintenance."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Machine, MaintenanceRecord
from ..predict import prediction_for_machine

router = APIRouter(tags=["maintenance"])


@router.get("/maintenance")
def maintenance(
    filter: str | None = None,
    machine_id: int | None = None,
    db: Session = Depends(get_db),
) -> dict:
    today = date.today()
    machines = {m.id: m for m in db.query(Machine).all()}
    rows = (
        db.query(MaintenanceRecord)
        .order_by(MaintenanceRecord.scheduled_date.desc())
        .all()
    )

    records = []
    for m in rows:
        machine = machines.get(m.machine_id)
        records.append(
            {
                "id": m.id,
                "machine_id": m.machine_id,
                "machine_code": machine.code if machine else "—",
                "machine_name": machine.name if machine else "",
                "issue": m.issue,
                "priority": m.priority,
                "date": m.scheduled_date.isoformat(),
                "completed_date": m.completed_date.isoformat() if m.completed_date else None,
                "status": m.status,
                "source": m.source,
                "notes": m.notes,
                "days_from_today": (m.scheduled_date - today).days,
            }
        )

    upcoming = [r for r in records if r["status"] == "Scheduled"]
    overdue = [r for r in records if r["status"] == "Overdue"]
    completed = [r for r in records if r["status"] == "Completed"]
    predicted = [r for r in records if r["status"] == "Predicted"]

    # attach live prediction numbers for AI-predicted work orders
    for record in predicted:
        machine = machines.get(record["machine_id"])
        if machine:
            pred = prediction_for_machine(db, machine)
            record["health_score"] = pred["health_score"]
            record["failure_probability_pct"] = pred.get(
                "failure_probability_pct", round(pred["failure_probability"] * 100, 1)
            )
            record["risk_level"] = pred["risk_level"]

    bucket = {
        "upcoming": upcoming,
        "overdue": overdue,
        "completed": completed,
        "predicted": predicted,
    }
    if filter and filter.lower() in bucket:
        visible = bucket[filter.lower()]
    else:
        visible = sorted(records, key=lambda r: r["date"], reverse=True)

    return {
        "summary": {
            "upcoming": len(upcoming),
            "overdue": len(overdue),
            "completed": len(completed),
            "predicted": len(predicted),
            "total": len(records),
        },
        "counts": {k: len(v) for k, v in bucket.items()},
        "count": len(visible),
        "records": visible,
    }
