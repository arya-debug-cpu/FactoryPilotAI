"""GET /api/dashboard -- everything the Overview screen needs, computed live."""

from __future__ import annotations

from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..ai import build_insights
from ..database import get_db
from ..models import (
    Alert,
    EnergyRecord,
    Machine,
    MaintenanceRecord,
    Order,
    ProductionRecord,
)
from ..predict import compute_prediction, detect_anomalies, fetch_readings, machine_brief

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db)) -> dict:
    today = date.today()
    days = [today - timedelta(days=i) for i in range(13, -1, -1)]
    start = days[0]

    machines = db.query(Machine).order_by(Machine.code).all()
    briefs = [machine_brief(db, m) for m in machines]

    # ---------------- production -------------------------------------------
    rows = (
        db.query(ProductionRecord).filter(ProductionRecord.day.between(start, today)).all()
    )
    today_rows = [r for r in rows if r.day == today]

    out_target = sum(r.target for r in today_rows)
    out_now = sum(r.output for r in today_rows)
    defects_now = sum(r.defects for r in today_rows)
    downtime_today = round(sum(r.downtime_minutes for r in today_rows) / 60.0, 1)

    daily: dict = {}
    for r in rows:
        entry = daily.setdefault(r.day, {"output": 0, "target": 0, "defects": 0, "downtime": 0.0})
        entry["output"] += r.output
        entry["target"] += r.target
        entry["defects"] += r.defects
        entry["downtime"] += r.downtime_minutes

    daily_series = [
        {
            "day": d.isoformat(),
            "label": d.strftime("%d %b"),
            "output": daily[d]["output"],
            "target": daily[d]["target"],
            "defects": daily[d]["defects"],
            "downtime_hours": round(daily[d]["downtime"] / 60.0, 1),
        }
        for d in days
        if d in daily
    ]

    # machine-wise target vs output (today)
    per_machine: dict = {}
    for r in today_rows:
        entry = per_machine.setdefault(r.machine_id, {"output": 0, "target": 0, "defects": 0})
        entry["output"] += r.output
        entry["target"] += r.target
        entry["defects"] += r.defects
    vs_target = []
    for machine in machines:
        entry = per_machine.get(machine.id)
        if not entry or not entry["target"]:
            continue
        vs_target.append(
            {
                "code": machine.code,
                "name": machine.name,
                "output": entry["output"],
                "target": entry["target"],
                "defects": entry["defects"],
                "pct": round(entry["output"] / entry["target"] * 100, 1),
            }
        )
    vs_target.sort(key=lambda x: x["pct"])

    # ---------------- machines ---------------------------------------------
    risk_counts = {"LOW": 0, "MEDIUM": 0, "HIGH": 0, "CRITICAL": 0}
    for b in briefs:
        risk_counts[b["risk_level"]] += 1

    health_avg = round(sum(b["health_score"] for b in briefs) / max(1, len(briefs)), 1)
    healthy = [b for b in briefs if b["risk_level"] == "LOW" and b["health_score"] >= 75]
    warning = [b for b in briefs if b["risk_level"] in ("MEDIUM", "HIGH")]
    critical = [b for b in briefs if b["risk_level"] == "CRITICAL"]
    offline = [b for b in briefs if b["status"] == "OFFLINE"]

    # ---------------- energy ------------------------------------------------
    energy_today = (
        db.query(func.coalesce(func.sum(EnergyRecord.kwh), 0))
        .filter(EnergyRecord.day == today)
        .scalar()
    )
    energy_week = (
        db.query(
            func.coalesce(func.sum(EnergyRecord.kwh), 0),
            func.coalesce(func.sum(EnergyRecord.units_produced), 0),
        )
        .filter(EnergyRecord.day.between(start, today))
        .one()
    )

    # ---------------- orders ------------------------------------------------
    orders = db.query(Order).all()
    active = [o for o in orders if o.status == "In Production"]
    pending = [o for o in orders if o.status == "Pending"]
    delayed = [o for o in orders if o.status == "Delayed"]
    completed = [o for o in orders if o.status == "Completed"]

    # ---------------- alerts ------------------------------------------------
    open_alerts = (
        db.query(Alert).filter(Alert.status != "Resolved").order_by(Alert.created_at.desc()).all()
    )
    critical_alerts = [a for a in open_alerts if a.severity == "Critical"]
    warning_alerts = [a for a in open_alerts if a.severity == "Warning"]

    def alert_payload(a: Alert) -> dict:
        machine = next((m for m in machines if m.id == a.machine_id), None)
        return {
            "id": a.id,
            "machine_id": a.machine_id,
            "machine_code": machine.code if machine else "—",
            "machine_name": machine.name if machine else "",
            "alert_type": a.alert_type,
            "severity": a.severity,
            "description": a.description,
            "timestamp": a.created_at.isoformat(timespec="minutes"),
            "status": a.status,
            "source": a.source,
        }

    # ---------------- maintenance ------------------------------------------
    overdue = db.query(MaintenanceRecord).filter(MaintenanceRecord.status == "Overdue").count()
    predicted = db.query(MaintenanceRecord).filter(MaintenanceRecord.status == "Predicted").count()
    upcoming = (
        db.query(MaintenanceRecord)
        .filter(MaintenanceRecord.status == "Scheduled", MaintenanceRecord.scheduled_date >= today)
        .count()
    )
    high_risk = risk_counts["HIGH"] + risk_counts["CRITICAL"]

    # ---------------- DETECT > PREDICT > RECOMMEND -------------------------
    ranked = sorted(briefs, key=lambda b: b["failure_probability"], reverse=True)
    top = ranked[0] if ranked else None
    workflow = None
    if top:
        machine = next(m for m in machines if m.id == top["id"])
        readings = fetch_readings(db, machine.id)
        prediction = compute_prediction(machine, readings)
        anomalies = detect_anomalies(machine, readings)
        workflow = {
            "machine_code": machine.code,
            "machine_name": machine.name,
            "detect": anomalies[:3] or [{
                "signal": "Nominal",
                "severity": "Information",
                "detail": f"{machine.code} signals are inside the rated envelope.",
            }],
            "predict": {
                "health_score": prediction["health_score"],
                "failure_probability_pct": prediction.get(
                    "failure_probability_pct", round(prediction["failure_probability"] * 100, 1)
                ),
                "risk_level": prediction["risk_level"],
                "trend": prediction["trend"],
                "dominant_factor": prediction.get("dominant_factor", "—"),
                "factors": prediction.get("factors", []),
            },
            "recommend": prediction.get("recommendation", ""),
        }

    kpis = [
        {
            "key": "production",
            "label": "Total Production",
            "value": out_now,
            "unit": "units",
            "sub": f"today · {len(today_rows)} shift records",
            "tone": "emerald" if out_target and out_now >= out_target else "amber",
            "spark": [d["output"] for d in daily_series],
        },
        {
            "key": "target",
            "label": "Production Target",
            "value": out_target,
            "unit": "units",
            "sub": (
                f"{round(out_now / out_target * 100, 1)}% achieved"
                if out_target
                else "no target set"
            ),
            "tone": "neutral",
            "spark": [d["target"] for d in daily_series],
        },
        {
            "key": "health",
            "label": "Machine Health",
            "value": health_avg,
            "unit": "%",
            "sub": f"{len(healthy)} of {len(briefs)} machines nominal",
            "tone": "emerald" if health_avg >= 75 else "amber" if health_avg >= 60 else "red",
            "spark": [b["health_score"] for b in briefs],
        },
        {
            "key": "orders",
            "label": "Active Orders",
            "value": len(active) + len(delayed),
            "unit": "orders",
            "sub": f"{len(delayed)} delayed · {len(pending)} pending",
            "tone": "red" if delayed else "emerald",
            "spark": [],
        },
        {
            "key": "defects",
            "label": "Defect Rate",
            "value": round(defects_now / out_now * 100, 2) if out_now else 0,
            "unit": "%",
            "sub": f"{defects_now} defective units today",
            "tone": "emerald" if out_now and defects_now / out_now < 0.015 else "amber",
            "spark": [d["defects"] for d in daily_series],
        },
        {
            "key": "energy",
            "label": "Energy Consumption",
            "value": round(float(energy_today), 0),
            "unit": "kWh",
            "sub": (
                f"{round(float(energy_week[0]) / max(1, int(energy_week[1])), 2)} kWh per unit · 7d"
            ),
            "tone": "neutral",
            "spark": [],
        },
        {
            "key": "downtime",
            "label": "Downtime",
            "value": round(sum(b["downtime_hours"] for b in briefs), 1),
            "unit": "hours",
            "sub": f"last 7 days · {downtime_today} h today",
            "tone": "red" if sum(b["downtime_hours"] for b in briefs) > 70 else "amber",
            "spark": [d["downtime_hours"] for d in daily_series],
        },
        {
            "key": "risk",
            "label": "Maintenance Risk",
            "value": high_risk,
            "unit": "machines",
            "sub": f"{risk_counts['CRITICAL']} critical · {risk_counts['HIGH']} high · "
                   f"{overdue} overdue tasks",
            "tone": "red" if risk_counts["CRITICAL"] else "amber" if high_risk else "emerald",
            "spark": [],
        },
    ]

    return {
        "generated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "plant": {
            "name": "Plant 04 — Kestrel Works",
            "shift": "Day shift",
            "machines_total": len(briefs),
            "risk_counts": risk_counts,
        },
        "kpis": kpis,
        "production": {
            "today_output": out_now,
            "today_target": out_target,
            "achievement_pct": round(out_now / out_target * 100, 1) if out_target else 0,
            "defect_rate": round(defects_now / out_now * 100, 2) if out_now else 0,
            "downtime_hours_today": downtime_today,
            "daily": daily_series,
            "vs_target": vs_target,
        },
        "machines": {
            "healthy": len(healthy),
            "warning": len(warning),
            "critical": len(critical),
            "offline": len(offline),
            "health_average": health_avg,
            "risk_counts": risk_counts,
            "items": briefs,
        },
        "alerts": {
            "critical": len(critical_alerts),
            "warning": len(warning_alerts),
            "open": len(open_alerts),
            "recent": [alert_payload(a) for a in open_alerts[:8]],
        },
        "orders": {
            "active": len(active),
            "delayed": len(delayed),
            "completed": len(completed),
            "pending": len(pending),
            "total": len(orders),
            "completion_pct": round(
                sum(o.completed_quantity for o in orders) / max(1, sum(o.quantity for o in orders))
                * 100,
                1,
            ),
        },
        "energy": {
            "today_kwh": round(float(energy_today), 1),
            "week_kwh": round(float(energy_week[0]), 1),
            "week_units": int(energy_week[1]),
            "kwh_per_unit": round(float(energy_week[0]) / max(1, int(energy_week[1])), 2),
        },
        "maintenance": {"overdue": overdue, "predicted": predicted, "upcoming": upcoming},
        "insights": build_insights(db),
        "workflow": workflow,
    }
