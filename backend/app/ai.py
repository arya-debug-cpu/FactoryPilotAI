"""FactoryPilot AI engine.

Flow for every question:

    question  ->  intent detection (what factory data is relevant?)
              ->  retrieval of that data from PostgreSQL (real numbers only)
              ->  context package
              ->  LLM (OpenAI-compatible, when OPENAI_API_KEY is configured)
                   or a deterministic data-grounded composer as fallback
              ->  answer: Situation / Evidence / Likely cause / Risk / Action

The engine never invents factory data. If the database cannot answer, it says
so explicitly.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from .models import (
    Alert,
    EnergyRecord,
    Machine,
    MaintenanceRecord,
    Order,
    ProductionRecord,
)
from .predict import fetch_readings, machine_brief, prediction_for_machine

# --------------------------------------------------------------------------- #
# intent detection
# --------------------------------------------------------------------------- #
INTENTS: Dict[str, List[str]] = {
    "risk": [
        "risk", "at risk", "failure", "failing", "fail ", "break down", "unhealthy",
        "health", "risky", "critical machine", "which machine", "inspect first",
        "predict", "predictive", "reliability",
    ],
    "production": [
        "production", "target", "below", "output", "bottleneck", "drop", "shortfall",
        "throughput", "shift", "yield", "achieve", "underperform",
    ],
    "maintenance": [
        "maintenance", "service", "inspect", "overhaul", "repair", "schedule",
        "preventive", "spare", "replace",
    ],
    "energy": ["energy", "kwh", "consumption", "power", "consumes", "efficien", "cost", "watt"],
    "orders": ["order", "deadline", "delivery", "delayed", "customer", "shipment", "dispatch"],
    "alerts": ["alert", "alarm", "warning", "notification", "acknowledge", "resolve"],
    "quality": ["defect", "quality", "scrap", "reject", "faulty", "rework"],
    "machine": ["m-0", "machine", "temperature", "vibration", "sensor", "reading"],
}


def classify(question: str) -> List[str]:
    q = " " + question.lower().strip() + " "
    found = [name for name, keys in INTENTS.items() if any(k in q for k in keys)]
    return found or ["general"]


def _machine_code(question: str) -> Optional[str]:
    q = question.upper()
    for i in range(1, 30):
        code = f"M-{i:03d}"
        if code in q:
            return code
    return None


# --------------------------------------------------------------------------- #
# context retrieval -- everything below is read live from PostgreSQL
# --------------------------------------------------------------------------- #
def gather_context(db: Session, question: str) -> Dict:
    today = date.today()
    intents = classify(question)

    machines = db.query(Machine).order_by(Machine.code).all()
    briefs = [machine_brief(db, m) for m in machines]
    by_risk = sorted(briefs, key=lambda b: b["failure_probability"], reverse=True)

    # ---- production ----
    today_rows = (
        db.query(ProductionRecord).filter(ProductionRecord.day == today).all()
    )
    target_total = sum(r.target for r in today_rows)
    output_total = sum(r.output for r in today_rows)
    defects_total = sum(r.defects for r in today_rows)
    downtime_today = round(sum(r.downtime_minutes for r in today_rows) / 60.0, 1)

    by_machine: Dict[int, Dict] = {}
    for row in today_rows:
        entry = by_machine.setdefault(
            row.machine_id,
            {"machine_id": row.machine_id, "output": 0, "target": 0, "defects": 0, "downtime": 0.0},
        )
        entry["output"] += row.output
        entry["target"] += row.target
        entry["defects"] += row.defects
        entry["downtime"] += row.downtime_minutes

    code_by_id = {m.id: m.code for m in machines}
    name_by_id = {m.id: m.name for m in machines}
    prod_by_machine = []
    for mid, entry in by_machine.items():
        gap = (entry["output"] - entry["target"]) / entry["target"] if entry["target"] else 0
        prod_by_machine.append(
            {
                "code": code_by_id[mid],
                "name": name_by_id[mid],
                "output": entry["output"],
                "target": entry["target"],
                "gap_pct": round(gap * 100, 1),
                "defects": entry["defects"],
                "defect_rate": round(entry["defects"] / entry["output"] * 100, 2) if entry["output"] else 0.0,
                "downtime_min": round(entry["downtime"], 0),
            }
        )
    prod_by_machine.sort(key=lambda p: p["gap_pct"])

    # 14-day trend
    trend_rows = (
        db.query(
            ProductionRecord.day,
            func.sum(ProductionRecord.output),
            func.sum(ProductionRecord.target),
            func.sum(ProductionRecord.defects),
        )
        .group_by(ProductionRecord.day)
        .order_by(ProductionRecord.day)
        .all()
    )
    trend = [
        {
            "day": r[0].isoformat(),
            "output": int(r[1] or 0),
            "target": int(r[2] or 0),
            "defects": int(r[3] or 0),
        }
        for r in trend_rows[-14:]
    ]

    # ---- energy ----
    week_start = today - timedelta(days=6)
    energy_rows = (
        db.query(
            EnergyRecord.machine_id,
            func.sum(EnergyRecord.kwh),
            func.sum(EnergyRecord.units_produced),
        )
        .filter(EnergyRecord.day >= week_start)
        .group_by(EnergyRecord.machine_id)
        .all()
    )
    energy_total = sum(r[1] or 0 for r in energy_rows)
    units_total = sum(r[2] or 0 for r in energy_rows)
    energy_by_machine = sorted(
        [
            {
                "code": code_by_id[r[0]],
                "kwh": round(r[1] or 0, 1),
                "units": int(r[2] or 0),
                "kwh_per_unit": round((r[1] or 0) / max(1, r[2] or 0), 2),
            }
            for r in energy_rows
        ],
        key=lambda e: e["kwh"],
        reverse=True,
    )

    # ---- orders ----
    orders = db.query(Order).order_by(Order.deadline).all()
    delayed = [o for o in orders if o.status == "Delayed"]
    due_soon = [
        o for o in orders
        if o.status in ("Pending", "In Production") and 0 <= (o.deadline - today).days <= 5
    ]

    # ---- maintenance ----
    overdue = [
        m for m in db.query(MaintenanceRecord).filter(MaintenanceRecord.status == "Overdue")
    ]
    predicted = [
        m for m in db.query(MaintenanceRecord)
        .filter(MaintenanceRecord.status == "Predicted")
        .order_by(MaintenanceRecord.scheduled_date)
    ]
    upcoming = [
        m for m in db.query(MaintenanceRecord)
        .filter(MaintenanceRecord.status == "Scheduled", MaintenanceRecord.scheduled_date >= today)
        .order_by(MaintenanceRecord.scheduled_date)
        .limit(6)
    ]

    # ---- alerts ----
    open_alerts = (
        db.query(Alert).filter(Alert.status != "Resolved").order_by(Alert.created_at.desc()).all()
    )
    critical = [a for a in open_alerts if a.severity == "Critical"]
    warnings = [a for a in open_alerts if a.severity == "Warning"]

    risk_counts: Dict[str, int] = {"LOW": 0, "MEDIUM": 0, "HIGH": 0, "CRITICAL": 0}
    for b in briefs:
        risk_counts[b["risk_level"]] += 1

    health_avg = round(sum(b["health_score"] for b in briefs) / max(1, len(briefs)), 1)

    ctx = {
        "generated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "plant": {
            "machines_total": len(briefs),
            "running": sum(1 for b in briefs if b["status"] == "RUNNING"),
            "idle": sum(1 for b in briefs if b["status"] == "IDLE"),
            "offline": sum(1 for b in briefs if b["status"] == "OFFLINE"),
            "health_average": health_avg,
            "risk_counts": risk_counts,
            "today_output": output_total,
            "today_target": target_total,
            "achievement_pct": round(output_total / target_total * 100, 1) if target_total else 0,
            "defect_rate_pct": round(defects_total / output_total * 100, 2) if output_total else 0,
            "downtime_today_hours": downtime_today,
            "energy_kwh_7d": round(energy_total, 1),
            "units_7d": units_total,
            "kwh_per_unit": round(energy_total / max(1, units_total), 2),
            "open_critical_alerts": len(critical),
            "open_warning_alerts": len(warnings),
            "orders_delayed": len(delayed),
            "orders_due_within_5_days": len(due_soon),
            "maintenance_overdue": len(overdue),
            "maintenance_predicted": len(predicted),
        },
        "machines_ranked_by_risk": by_risk,
        "production_today_by_machine": prod_by_machine,
        "production_trend": trend,
        "energy": {"total_kwh_7d": round(energy_total, 1), "by_machine": energy_by_machine},
        "orders": {
            "delayed": [
                {
                    "code": o.order_code,
                    "product": o.product,
                    "customer": o.customer,
                    "quantity": o.quantity,
                    "completed": o.completed_quantity,
                    "remaining": o.quantity - o.completed_quantity,
                    "deadline": o.deadline.isoformat(),
                    "priority": o.priority,
                    "status": o.status,
                }
                for o in delayed
            ],
            "due_soon": [
                {"code": o.order_code, "product": o.product, "deadline": o.deadline.isoformat(),
                 "remaining": o.quantity - o.completed_quantity, "status": o.status}
                for o in due_soon[:6]
            ],
        },
        "maintenance": {
            "overdue": [
                {
                    "code": code_by_id[m.machine_id],
                    "issue": m.issue,
                    "priority": m.priority,
                    "date": m.scheduled_date.isoformat(),
                }
                for m in overdue
            ],
            "predicted": [
                {
                    "code": code_by_id[m.machine_id],
                    "issue": m.issue,
                    "priority": m.priority,
                    "date": m.scheduled_date.isoformat(),
                }
                for m in predicted[:6]
            ],
            "upcoming": [
                {
                    "code": code_by_id[m.machine_id],
                    "issue": m.issue,
                    "priority": m.priority,
                    "date": m.scheduled_date.isoformat(),
                }
                for m in upcoming
            ],
        },
        "alerts": {
            "open_critical": [
                {
                    "code": code_by_id[a.machine_id],
                    "type": a.alert_type,
                    "description": a.description,
                    "at": a.created_at.isoformat(timespec="minutes"),
                }
                for a in critical[:8]
            ],
            "open_warning": [
                {
                    "code": code_by_id[a.machine_id],
                    "type": a.alert_type,
                    "description": a.description,
                    "at": a.created_at.isoformat(timespec="minutes"),
                }
                for a in warnings[:8]
            ],
        },
        "detected_anomalies": [],
        "_intents": intents,
        "_machine_code": _machine_code(question),
    }

    # anomalies are attached cheaply for the top-risk machines only
    anomalies = []
    for brief in by_risk[:6]:
        machine = next(m for m in machines if m.id == brief["id"])
        from .predict import detect_anomalies

        for anomaly in detect_anomalies(machine, fetch_readings(db, machine.id)):
            anomalies.append({"code": brief["code"], **anomaly})
    ctx["detected_anomalies"] = anomalies
    return ctx


def relevant_context(ctx: Dict) -> Dict:
    """Trim the context to what the question actually needs."""
    intents = ctx.get("_intents", ["general"])
    wanted = {"plant", "generated_at", "_intents", "_machine_code", "detected_anomalies"}
    if "risk" in intents or "machine" in intents:
        wanted |= {"machines_ranked_by_risk"}
    if "production" in intents or "quality" in intents:
        wanted |= {"production_today_by_machine", "production_trend", "machines_ranked_by_risk"}
    if "maintenance" in intents:
        wanted |= {"maintenance", "machines_ranked_by_risk"}
    if "energy" in intents:
        wanted |= {"energy", "machines_ranked_by_risk"}
    if "orders" in intents:
        wanted |= {"orders", "production_today_by_machine"}
    if "alerts" in intents:
        wanted |= {"alerts"}
    if "general" in intents:
        wanted |= {"orders", "maintenance", "energy", "alerts",
                   "production_today_by_machine", "machines_ranked_by_risk"}
    if ctx.get("_machine_code"):
        wanted |= {"machines_ranked_by_risk", "alerts", "maintenance"}
    return {k: v for k, v in ctx.items() if k in wanted}


# --------------------------------------------------------------------------- #
# LLM transport (optional -- the assistant still works without a key)
# --------------------------------------------------------------------------- #
SYSTEM_PROMPT = (
    "You are FactoryPilot AI, the operations analyst embedded in a factory "
    "monitoring platform.\n"
    "You are given FACTORY DATA extracted live from the plant database.\n"
    "Rules:\n"
    "1. Use ONLY the numbers and machine codes present in FACTORY DATA. Never "
    "invent a machine, value, date or event.\n"
    "2. If the data is not sufficient to answer, reply exactly that sufficient "
    "data is unavailable and name the missing data.\n"
    "3. Structure the answer in this order, plain text:\n"
    "   Situation: ...\n"
    "   Evidence: (bullets with machine codes and real numbers)\n"
    "   Likely cause: ...\n"
    "   Risk: ...\n"
    "   Recommended action: ...\n"
    "   If a section is not supported by the data, omit it.\n"
    "4. Be concise (max 200 words), factual, operational. Use a dash for bullets."
)


def call_llm(question: str, ctx: Dict) -> Optional[str]:
    key = (
        os.getenv("OPENAI_API_KEY")
        or os.getenv("AI_API_KEY")
        or os.getenv("LLM_API_KEY")
    )
    if not key:
        return None
    base = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    payload = {
        "model": model,
        "temperature": 0.1,
        "max_tokens": 700,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    "FACTORY DATA (JSON):\n"
                    + json.dumps(relevant_context(ctx), default=str)
                    + "\n\nQUESTION: "
                    + question
                ),
            },
        ],
    }
    request = urllib.request.Request(
        f"{base}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {key}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            body = json.loads(response.read().decode("utf-8"))
        return body["choices"][0]["message"]["content"].strip()
    except (urllib.error.URLError, KeyError, ValueError, TimeoutError, OSError) as exc:
        print(f"[ai] LLM call failed, falling back to grounded composer: {exc}")
        return None


# --------------------------------------------------------------------------- #
# deterministic data-grounded composer (also the fallback when no key exists)
# --------------------------------------------------------------------------- #
def _wants_energy(intents: List[str]) -> bool:
    """True when energy is the primary subject of the question."""
    return "energy" in intents and "production" not in intents and "orders" not in intents


def _machine_line(b: Dict) -> str:
    return (
        f"{b['code']} {b['name']}: health {b['health_score']:.0f}%, "
        f"failure probability {b['failure_probability_pct']:.0f}%, risk {b['risk_level']}"
    )


def grounded_answer(question: str, ctx: Dict) -> str:
    intents = ctx.get("_intents", ["general"])
    plant = ctx["plant"]
    ranked: List[Dict] = ctx["machines_ranked_by_risk"]
    target_code = ctx.get("_machine_code")

    # --- a specific machine was named --------------------------------------
    if target_code:
        match = next((b for b in ranked if b["code"] == target_code), None)
        if not match:
            return (
                "Situation: No machine with code "
                f"{target_code} exists in the FactoryPilot database.\n"
                "Evidence: The asset register contains "
                f"{plant['machines_total']} machines ({', '.join(b['code'] for b in ranked)}).\n"
                "Recommended action: Re-check the machine code and ask again."
            )
        alerts = [a for a in ctx.get("alerts", {}).get("open_critical", [])
                  + ctx.get("alerts", {}).get("open_warning", []) if a["code"] == target_code]
        s = match["signals"]
        lines = [
            f"Situation: {match['code']} {match['name']} is {match['status']} with a health score "
            f"of {match['health_score']:.0f}% and a {match['risk_level']} failure risk "
            f"({match['failure_probability_pct']:.0f}% over the next operating window).",
            "Evidence:",
            f"- Temperature {s['temperature_avg']}°C, {s['temperature_delta']:+.1f}°C against its rated baseline of {match['normal_temperature']:.0f}°C",
            f"- Vibration {s['vibration_avg']} mm/s, {s['vibration_delta']:+.2f} mm/s against a rated {match['normal_vibration']:.1f} mm/s",
            f"- Load {s['load_avg'] * 100:.0f}%, drawing {s['energy_kw_avg']} kW, {s['energy_per_unit']} kWh per unit (previously {s['energy_per_unit_prev']})",
            f"- {s['downtime_7d_hours']} h of downtime in the last 7 days, {s['output_gap'] * 100:.0f}% below planned output",
            f"- {match['failure_count']} recorded failures, last maintenance {match['last_maintenance']}",
        ]
        if alerts:
            lines.append(f"- Open alerts: {alerts[0]['type']} — {alerts[0]['description']}")
        lines.append(
            f"Risk: {match['risk_level']} — driven mainly by {match['dominant_factor'].lower()}."
            if "dominant_factor" in match
            else f"Risk: {match['risk_level']}."
        )
        lines.append(f"Recommended action: {match['recommendation']}")
        return "\n".join(lines)

    # --- energy ------------------------------------------------------------
    if "energy" in intents and "production" not in intents:
        pass  # handled below, after the machine-specific branch

    # --- risk / predictive maintenance -------------------------------------
    if ("risk" in intents or "maintenance" in intents) and not _wants_energy(intents):
        top = ranked[:4]
        overdue = ctx["maintenance"]["overdue"]
        predicted = ctx["maintenance"]["predicted"]
        lines = [
            f"Situation: {plant['risk_counts']['CRITICAL']} machine(s) are CRITICAL, "
            f"{plant['risk_counts']['HIGH']} HIGH and {plant['risk_counts']['MEDIUM']} MEDIUM "
            f"across {plant['machines_total']} assets. Plant-wide health averages "
            f"{plant['health_average']}%.",
            "Evidence:",
        ]
        lines += [f"- {_machine_line(b)} — {_primary(b)}" for b in top]
        if "maintenance" in intents:
            if overdue:
                lines.append(
                    f"- {len(overdue)} overdue maintenance tasks, oldest: "
                    f"{overdue[0]['code']} — {overdue[0]['issue']} (due {overdue[0]['date']})"
                )
            if predicted:
                lines.append(
                    f"- {len(predicted)} AI-predicted work orders generated from sensor data, "
                    f"next: {predicted[0]['code']} on {predicted[0]['date']}"
                )
        first = top[0]
        lines += [
            f"Risk: {first['code']} at {first['risk_level']} risk with a "
            f"{first['failure_probability_pct']:.0f}% failure probability; a stop here would "
            f"impact {first['line']} output.",
            f"Recommended action: {first['recommendation']}",
        ]
        return "\n".join(lines)

    # --- production --------------------------------------------------------
    if "production" in intents or "quality" in intents:
        gap = plant["today_output"] - plant["today_target"]
        worst = ctx["production_today_by_machine"][:3]
        degrading = [b for b in ranked if b["risk_level"] in ("HIGH", "CRITICAL")][:2]
        lines = [
            f"Situation: Production is at {plant['today_output']:,} units against a target of "
            f"{plant['today_target']:,} ({plant['achievement_pct']}% of target, "
            f"{gap:+,} units). Defect rate {plant['defect_rate_pct']}%, "
            f"{plant['downtime_today_hours']} h downtime today.",
            "Evidence:",
        ]
        for p in worst:
            lines.append(
                f"- {p['code']} {p['name']}: {p['output']:,}/{p['target']:,} units "
                f"({p['gap_pct']:+.1f}%), {p['downtime_min']:.0f} min downtime, "
                f"defect rate {p['defect_rate']}%"
            )
        for b in degrading:
            lines.append(
                f"- {b['code']} health {b['health_score']:.0f}%, risk {b['risk_level']}, "
                f"{b['signals']['downtime_7d_hours']} h downtime in the last 7 days"
            )
        crit = ctx["alerts"].get("open_critical", [])
        if crit:
            lines.append(f"- {len(crit)} open critical alerts, latest: {crit[0]['code']} {crit[0]['type']}")
        cause = (
            worst[0]["code"] if worst and worst[0]["gap_pct"] < -5 else "the machines listed above"
        )
        lines += [
            f"Likely cause: Loss is concentrated on {cause}, where unplanned downtime and reduced "
            f"machine health are cutting effective run time against plan.",
            f"Risk: {plant['orders_due_within_5_days']} orders are due within 5 days "
            f"({plant['orders_delayed']} already delayed) — continued shortfall puts them at risk.",
            f"Recommended action: Inspect {cause}, review its recent temperature and vibration "
            f"readings, and re-plan the shift once the reading is back inside the rated envelope.",
        ]
        return "\n".join(lines)

    # --- energy ------------------------------------------------------------
    if "energy" in intents:
        energy = ctx["energy"]["by_machine"]  # noqa: PLW2901
        top = energy[:3]
        wasted = [e for e in energy if e["kwh_per_unit"] > plant["kwh_per_unit"] * 1.15][:3]
        lines = [
            f"Situation: The plant consumed {plant['energy_kwh_7d']:,} kWh over the last 7 days "
            f"for {plant['units_7d']:,} units — {plant['kwh_per_unit']} kWh per unit.",
            "Evidence:",
        ]
        lines += [f"- {e['code']}: {e['kwh']:,} kWh, {e['kwh_per_unit']} kWh/unit ({e['units']:,} units)" for e in top]
        if wasted:
            lines.append(
                "- Above plant-average intensity: "
                + ", ".join(f"{e['code']} ({e['kwh_per_unit']} kWh/unit)" for e in wasted)
            )
        worst = next((b for b in ranked if b["code"] == (wasted[0]["code"] if wasted else "")), None)
        lines += [
            f"Risk: Excess draw raises cost per unit and is usually the first sign of mechanical "
            f"stress on the driving asset.",
            f"Recommended action: "
            + (f"Check {worst['code']} load profile and drive efficiency — its health score is "
               f"{worst['health_score']:.0f}%."
               if worst else "Compare kWh per unit by machine on the Energy page and audit the "
                             "highest-intensity assets."),
        ]
        return "\n".join(lines)

    # --- orders ------------------------------------------------------------
    if "orders" in intents:
        delayed = ctx["orders"]["delayed"]
        lines = [
            f"Situation: {plant['orders_delayed']} orders are delayed and "
            f"{plant['orders_due_within_5_days']} are due within 5 days.",
            "Evidence:",
        ]
        lines += [
            f"- {o['code']} {o['product']}: {o['completed']:,}/{o['quantity']:,} completed, "
            f"{o['remaining']:,} remaining, deadline {o['deadline']} ({o['priority']} priority)"
            for o in delayed
        ]
        if not delayed:
            lines.append("- No orders are currently flagged as delayed.")
        worst = ctx["production_today_by_machine"][:1]
        lines.append(
            f"Risk: Remaining quantities must be finished on a line currently running at "
            f"{plant['achievement_pct']}% of target."
        )
        if worst:
            lines.append(
                f"Recommended action: Prioritise {worst[0]['code']} capacity for the delayed "
                f"quantities and re-sequence the shift around it."
            )
        return "\n".join(lines)

    # --- alerts ------------------------------------------------------------
    if "alerts" in intents:
        crit = ctx["alerts"].get("open_critical", [])
        warn = ctx["alerts"].get("open_warning", [])
        lines = [
            f"Situation: {len(crit)} critical and {len(warn)} warning alerts are open.",
            "Evidence:",
        ]
        lines += [f"- {a['code']} {a['type']}: {a['description']}" for a in (crit + warn)[:6]]
        if not crit and not warn:
            lines.append("- No open alerts in the database.")
        lines.append(
            f"Recommended action: Resolve the critical items first — "
            f"{crit[0]['code']} is the highest-risk asset." if crit else
            "Recommended action: Review warning alerts during the next shift handover."
        )
        return "\n".join(lines)

    # --- general plant overview -------------------------------------------
    top = ranked[:3]
    return "\n".join(
        [
            f"Situation: Plant is running {plant['running']}/{plant['machines_total']} machines, "
            f"health average {plant['health_average']}%, today at {plant['achievement_pct']}% of "
            f"production target with a {plant['defect_rate_pct']}% defect rate.",
            "Evidence:",
            *[f"- {_machine_line(b)}" for b in top],
            f"- {plant['open_critical_alerts']} critical / {plant['open_warning_alerts']} warning alerts open",
            f"- {plant['maintenance_overdue']} overdue and {plant['maintenance_predicted']} predicted maintenance tasks",
            f"- Energy {plant['energy_kwh_7d']} kWh/7 days at {plant['kwh_per_unit']} kWh per unit",
            "Recommended action: Ask about a specific area, e.g. “Which machines are at risk?”, "
            "“Why is production below target?” or “M-012”.",
        ]
    )


def _primary(brief: Dict) -> str:
    sig = brief.get("signals", {})
    return (
        f"temperature {sig.get('temperature_avg')}°C, vibration {sig.get('vibration_avg')} mm/s, "
        f"{sig.get('downtime_7d_hours')} h downtime/7d"
    )


# --------------------------------------------------------------------------- #
# public entry point
# --------------------------------------------------------------------------- #
def ask(db: Session, question: str, session_id: str = "default") -> Dict:
    question = (question or "").strip()
    if not question:
        return {"reply": "Please type a question about the factory.", "mode": "grounded",
                "sources": [], "session_id": session_id}

    ctx = gather_context(db, question)
    sources = [f"machines:{len(ctx['machines_ranked_by_risk'])}",
               f"production:{len(ctx['production_today_by_machine'])}",
               f"alerts:{len(ctx['alerts']['open_critical']) + len(ctx['alerts']['open_warning'])}"]

    llm_reply = call_llm(question, ctx)
    if llm_reply:
        reply, mode = llm_reply, "llm"
    else:
        reply, mode = grounded_answer(question, ctx), "grounded"

    if not reply.strip():
        reply = "Sufficient data is unavailable to answer that question."

    return {
        "reply": reply,
        "mode": mode,
        "sources": sources,
        "intents": ctx.get("_intents", []),
        "session_id": session_id,
        "generated_at": ctx["generated_at"],
    }


# --------------------------------------------------------------------------- #
# dashboard insights
# --------------------------------------------------------------------------- #
def build_insights(db: Session) -> List[Dict]:
    ctx = gather_context(db, "plant overview")
    plant = ctx["plant"]
    ranked = ctx["machines_ranked_by_risk"]
    insights: List[Dict] = []
    if not ranked:
        return []

    worst = ranked[0]
    if worst["risk_level"] in ("HIGH", "CRITICAL"):
        insights.append({
            "category": "Predictive maintenance",
            "severity": "Critical" if worst["risk_level"] == "CRITICAL" else "Warning",
            "title": f"{worst['code']} is the highest failure risk on the floor",
            "body": (
                f"Health {worst['health_score']:.0f}% with a {worst['failure_probability_pct']:.0f}% "
                f"failure probability ({worst['risk_level']}). Dominant factor: "
                f"{worst['signals']['temperature_avg']}°C and "
                f"{worst['signals']['vibration_avg']} mm/s against rated baselines."
            ),
            "action": worst["recommendation"],
        })

    gap = plant["today_target"] - plant["today_output"]
    if gap > 0:
        worst_prod = ctx["production_today_by_machine"][:1]
        code = worst_prod[0]["code"] if worst_prod else "the line"
        insights.append({
            "category": "Production",
            "severity": "Warning" if gap > plant["today_target"] * 0.05 else "Information",
            "title": f"Output is {gap:,} units below today's target",
            "body": (
                f"{plant['today_output']:,} of {plant['today_target']:,} units "
                f"({plant['achievement_pct']}% achievement). The largest shortfall is on {code}, "
                f"with {plant['downtime_today_hours']} h of downtime recorded today."
            ),
            "action": f"Review {code} changeover and stoppage causes before the next shift.",
        })

    if plant["defect_rate_pct"] > 1.5:
        insights.append({
            "category": "Quality",
            "severity": "Warning",
            "title": f"Defect rate at {plant['defect_rate_pct']}% of output",
            "body": "Defects rise with machine temperature and vibration — the two signals driving "
                    "the current health scores.",
            "action": "Run a first-article inspection on the machines flagged HIGH risk.",
        })

    worst_energy = ctx["energy"]["by_machine"][:1]
    if worst_energy and worst_energy[0]["kwh_per_unit"] > plant["kwh_per_unit"]:
        insights.append({
            "category": "Energy",
            "severity": "Information",
            "title": f"{worst_energy[0]['code']} is the largest energy consumer",
            "body": (
                f"{worst_energy[0]['kwh']:,} kWh in 7 days at "
                f"{worst_energy[0]['kwh_per_unit']} kWh per unit against a plant average of "
                f"{plant['kwh_per_unit']}."
            ),
            "action": "Verify drive and standby settings; intensity above average usually "
                      "coincides with mechanical drag.",
        })

    if plant["maintenance_overdue"]:
        first = ctx["maintenance"]["overdue"][0]
        insights.append({
            "category": "Maintenance",
            "severity": "Warning",
            "title": f"{plant['maintenance_overdue']} maintenance tasks are overdue",
            "body": f"Oldest: {first['code']} — {first['issue']}, due {first['date']}.",
            "action": "Clear overdue work before adding predicted tasks to the schedule.",
        })

    if plant["orders_delayed"]:
        order = ctx["orders"]["delayed"][0]
        insights.append({
            "category": "Orders",
            "severity": "Warning",
            "title": f"{plant['orders_delayed']} orders delayed",
            "body": (
                f"{order['code']} {order['product']} has {order['remaining']:,} units remaining "
                f"against a deadline of {order['deadline']}."
            ),
            "action": "Re-plan capacity on the highest-availability line.",
        })

    return insights[:6]
