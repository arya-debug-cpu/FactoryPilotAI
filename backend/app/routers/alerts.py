"""GET /api/alerts and POST /api/alerts/{id}/resolve."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Alert, Machine

router = APIRouter(tags=["alerts"])


def _payload(alert: Alert, machine: Machine | None) -> dict:
    return {
        "id": alert.id,
        "machine_id": alert.machine_id,
        "machine_code": machine.code if machine else "—",
        "machine_name": machine.name if machine else "",
        "machine_line": machine.line if machine else "",
        "alert_type": alert.alert_type,
        "severity": alert.severity,
        "description": alert.description,
        "timestamp": alert.created_at.isoformat(timespec="seconds"),
        "status": alert.status,
        "source": alert.source,
    }


@router.get("/alerts")
def alerts(
    severity: str | None = None,
    status: str | None = None,
    machine_id: int | None = None,
    limit: int = 200,
    db: Session = Depends(get_db),
) -> dict:
    machines = {m.id: m for m in db.query(Machine).all()}
    query = db.query(Alert).order_by(Alert.created_at.desc())
    all_rows = query.all()

    if severity and severity.lower() != "all":
        query = query.filter(Alert.severity == severity.capitalize())
    if status and status.lower() != "all":
        query = query.filter(Alert.status == status.capitalize())
    if machine_id:
        query = query.filter(Alert.machine_id == machine_id)
    rows = query.limit(limit).all()

    summary = {
        "critical": len([a for a in all_rows if a.severity == "Critical" and a.status != "Resolved"]),
        "warning": len([a for a in all_rows if a.severity == "Warning" and a.status != "Resolved"]),
        "information": len(
            [a for a in all_rows if a.severity == "Information" and a.status != "Resolved"]
        ),
        "open": len([a for a in all_rows if a.status == "Open"]),
        "acknowledged": len([a for a in all_rows if a.status == "Acknowledged"]),
        "resolved": len([a for a in all_rows if a.status == "Resolved"]),
        "total": len(all_rows),
    }

    return {
        "count": len(rows),
        "summary": summary,
        "alerts": [_payload(a, machines.get(a.machine_id)) for a in rows],
    }


@router.post("/alerts/{alert_id}/resolve")
def resolve_alert(alert_id: int, db: Session = Depends(get_db)) -> dict:
    alert = db.get(Alert, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.status = "Resolved"
    db.commit()
    db.refresh(alert)
    machine = db.get(Machine, alert.machine_id)
    return {"ok": True, "alert": _payload(alert, machine)}


@router.post("/alerts/{alert_id}/acknowledge")
def acknowledge_alert(alert_id: int, db: Session = Depends(get_db)) -> dict:
    alert = db.get(Alert, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.status = "Acknowledged"
    db.commit()
    db.refresh(alert)
    machine = db.get(Machine, alert.machine_id)
    return {"ok": True, "alert": _payload(alert, machine)}
