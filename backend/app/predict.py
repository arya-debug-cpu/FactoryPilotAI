"""Predictive maintenance engine.

Everything here is *calculated* from machine sensor data stored in PostgreSQL:
temperature, vibration, load, energy draw, operating hours, downtime, output
gap and previous failures. Nothing is a hardcoded probability.

The model is deliberately simple and auditable:

  1. Normalise each signal against the machine's rated (healthy) baseline.
  2. Compare the recent 7-day window against the previous 7-day window to get
     a deterioration trend.
  3. Weighted factors  -> health_score   (0..100, higher is better)
  4. Weighted factors  -> failure_probability via a logistic function (0..1)
  5. failure_probability -> risk level  LOW | MEDIUM | HIGH | CRITICAL
  6. Dominant factor    -> a concrete written recommendation.
"""

from __future__ import annotations

import math
from datetime import datetime, timedelta
from typing import Dict, List, Optional

from sqlalchemy import desc
from sqlalchemy.orm import Session

from .models import Machine, MachineReading, ProductionRecord

WINDOW_HOURS = 168  # 7 days
SAMPLE_HOURS = 4  # readings are stored every 4 hours


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


def _mean(values: List[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _slope(values: List[float]) -> float:
    """Least-squares slope per sample step (positive = rising)."""
    n = len(values)
    if n < 3:
        return 0.0
    xs = list(range(n))
    mx, my = _mean([float(v) for v in xs]), _mean(values)
    denom = sum((x - mx) ** 2 for x in xs)
    if denom == 0:
        return 0.0
    return sum((x - mx) * (y - my) for x, y in zip(xs, values)) / denom


def fetch_readings(db: Session, machine_id: int, hours: int = WINDOW_HOURS * 2):
    since = datetime.utcnow() - timedelta(hours=hours)
    return (
        db.query(MachineReading)
        .filter(MachineReading.machine_id == machine_id, MachineReading.ts >= since)
        .order_by(MachineReading.ts)
        .all()
    )


def risk_level(probability: float) -> str:
    if probability < 0.18:
        return "LOW"
    if probability < 0.42:
        return "MEDIUM"
    if probability < 0.72:
        return "HIGH"
    return "CRITICAL"


# --------------------------------------------------------------------------- #
# detection: abnormal conditions in the most recent 24h
# --------------------------------------------------------------------------- #
def detect_anomalies(machine: Machine, readings: List[MachineReading]) -> List[Dict]:
    """DETECT stage -- find abnormal conditions from raw readings."""
    if not readings:
        return []

    recent = readings[-6:]  # last 24h
    baseline = readings[-24:-6] or readings[:-1] or readings

    avg_temp = _mean([r.temperature for r in recent])
    base_temp = _mean([r.temperature for r in baseline])
    avg_vib = _mean([r.vibration for r in recent])
    base_vib = _mean([r.vibration for r in baseline])
    avg_kw = _mean([r.energy_kw for r in recent])
    base_kw = _mean([r.energy_kw for r in baseline]) or 1.0
    downtime_24 = sum(r.downtime_minutes for r in recent)

    anomalies: List[Dict] = []

    if avg_temp > machine.normal_temperature + 6:
        anomalies.append(
            {
                "signal": "Temperature",
                "severity": "Critical" if avg_temp > machine.normal_temperature + 16 else "Warning",
                "detail": (
                    f"{machine.code} averaging {avg_temp:.1f}\u00b0C in the last 24h "
                    f"({avg_temp - machine.normal_temperature:+.1f}\u00b0C vs rated baseline, "
                    f"{avg_temp - base_temp:+.1f}\u00b0C vs previous day)"
                ),
            }
        )

    if avg_vib > machine.normal_vibration + 0.9:
        anomalies.append(
            {
                "signal": "Vibration",
                "severity": "Critical" if avg_vib > machine.normal_vibration + 2.2 else "Warning",
                "detail": (
                    f"{machine.code} vibration at {avg_vib:.2f} mm/s "
                    f"({avg_vib - machine.normal_vibration:+.2f} mm/s vs rated baseline, "
                    f"{avg_vib - base_vib:+.2f} mm/s day-on-day)"
                ),
            }
        )

    if downtime_24 > 25:
        anomalies.append(
            {
                "signal": "Downtime",
                "severity": "Critical" if downtime_24 > 60 else "Warning",
                "detail": (
                    f"{machine.code} recorded {downtime_24:.0f} minutes of unplanned "
                    f"downtime in the last 24h"
                ),
            }
        )

    energy_drift = (avg_kw - base_kw) / base_kw
    if energy_drift > 0.10:
        anomalies.append(
            {
                "signal": "Energy",
                "severity": "Warning",
                "detail": (
                    f"{machine.code} drawing {avg_kw:.1f} kW, {energy_drift * 100:.0f}% above its "
                    f"previous-day average \u2014 energy per unit is rising"
                ),
            }
        )

    if machine.status == "OFFLINE":
        anomalies.append(
            {
                "signal": "Availability",
                "severity": "Critical",
                "detail": f"{machine.code} is offline \u2014 no output is being contributed to the line",
            }
        )

    return anomalies


# --------------------------------------------------------------------------- #
# prediction
# --------------------------------------------------------------------------- #
def compute_prediction(machine: Machine, readings: List[MachineReading]) -> Dict:
    """PREDICT stage -- health score, failure probability, risk, factors."""
    readings = [r for r in readings if r is not None]
    recent = readings[-42:]  # last 7 days at 4h sampling
    older = readings[-84:-42] if len(readings) > 42 else readings[:-42] or readings

    if not recent:
        return {
            "health_score": 50.0,
            "failure_probability": 0.2,
            "risk_level": "MEDIUM",
            "confidence": "LOW",
            "factors": [],
            "recommendation": "Insufficient sensor history \u2014 collect readings before predicting.",
            "trend": "STABLE",
        }

    temp_recent = [r.temperature for r in recent]
    vib_recent = [r.vibration for r in recent]

    avg_temp = _mean(temp_recent)
    avg_vib = _mean(vib_recent)
    avg_load = _mean([r.load for r in recent])
    avg_kw = _mean([r.energy_kw for r in recent])

    avg_temp_old = _mean([r.temperature for r in older]) if older else avg_temp
    avg_vib_old = _mean([r.vibration for r in older]) if older else avg_vib

    # ---- normalised signals (0 = nominal, 1 = severely out of envelope) ----
    temp_excess = clamp((avg_temp - machine.normal_temperature) / 30.0, 0.0, 1.5)
    vib_excess = clamp((avg_vib - machine.normal_vibration) / 3.0, 0.0, 1.5)
    temp_trend = clamp((avg_temp - avg_temp_old) / 15.0, -1.0, 1.5)
    vib_trend = clamp((avg_vib - avg_vib_old) / 1.5, -1.0, 1.5)
    load_norm = clamp(avg_load, 0.0, 1.0)
    downtime_norm = clamp(machine.downtime_hours / 20.0, 0.0, 1.5)
    hours_norm = clamp(machine.operating_hours / 40000.0, 0.0, 1.2)
    history_norm = clamp(machine.failure_count / 8.0, 0.0, 1.5)

    # energy per unit vs the machine's own older window (efficiency decay)
    kwh_recent = sum(r.energy_kw for r in recent) * SAMPLE_HOURS
    units_recent = max(1, sum(r.output_units for r in recent))
    kwh_old = sum(r.energy_kw for r in older) * SAMPLE_HOURS if older else kwh_recent
    units_old = max(1, sum(r.output_units for r in older)) if older else units_recent
    epu_recent, epu_old = kwh_recent / units_recent, kwh_old / units_old
    energy_waste = clamp((epu_recent - epu_old) / max(epu_old, 0.001), -0.5, 1.5)
    energy_waste = max(0.0, energy_waste)

    target_shift = max(1.0, machine.rated_capacity * 8 * 0.85)
    produced_7d = sum(r.output_units for r in recent)
    output_gap = clamp(1.0 - (produced_7d / 7.0) / target_shift, 0.0, 1.0)

    # ---- health score ----
    health_pen = (
        0.28 * temp_excess
        + 0.26 * vib_excess
        + 0.16 * downtime_norm
        + 0.10 * energy_waste
        + 0.12 * history_norm
        + 0.08 * clamp((avg_temp - machine.normal_temperature) / 25.0, 0, 1)
    )
    trend_penalty = 6.0 * max(0.0, temp_trend) + 5.0 * max(0.0, vib_trend)
    health = clamp(100.0 - 100.0 * clamp(health_pen, 0.0, 0.9) - trend_penalty, 5.0, 99.0)

    # ---- failure probability (logistic model) ----
    z = (
        -3.2
        + 2.2 * temp_excess
        + 2.4 * vib_excess
        + 1.1 * downtime_norm
        + 0.7 * load_norm
        + 0.9 * energy_waste
        + 0.7 * history_norm
        + 0.9 * max(0.0, temp_trend)
        + 0.8 * max(0.0, vib_trend)
        + 0.6 * output_gap
        + 0.5 * hours_norm
    )
    probability = round(sigmoid(z), 3)
    level = risk_level(probability)

    # ---- contributing factors, ranked ----
    raw = [
        ("Temperature", temp_excess, 2.2, f"{avg_temp:.1f}\u00b0C avg (\u2295 {machine.normal_temperature:.0f}\u00b0C)"),
        ("Vibration", vib_excess, 2.4, f"{avg_vib:.2f} mm/s avg (\u2295 {machine.normal_vibration:.1f} mm/s)"),
        ("Downtime", downtime_norm, 1.1, f"{machine.downtime_hours:.1f} h lost in last 7 days"),
        ("Energy waste", energy_waste, 0.9, f"{epu_recent:.2f} kWh/unit vs {epu_old:.2f} previously"),
        ("Failure history", history_norm, 0.7, f"{machine.failure_count} recorded failures"),
        ("Load", load_norm, 0.7, f"{avg_load * 100:.0f}% average load"),
        ("Rising trend", max(0.0, temp_trend) + max(0.0, vib_trend), 0.85, "7-day upward drift"),
        ("Operating hours", hours_norm, 0.5, f"{machine.operating_hours:,.0f} h since install"),
        ("Output gap", output_gap, 0.6, f"{output_gap * 100:.0f}% below planned output"),
    ]
    scored = [(label, value, weight, detail) for label, value, weight, detail in raw if value > 0.02]
    scored.sort(key=lambda item: item[1] * item[2], reverse=True)
    total = sum(value * weight for _, value, weight, _ in scored) or 1.0

    factors = [
        {
            "label": label,
            "contribution": round(value * weight / total * 100, 1),
            "value": detail,
        }
        for label, value, weight, detail in scored[:5]
    ]

    dominant = factors[0]["label"] if factors else "None"
    trend = "DETERIORATING" if (temp_trend > 0.15 or vib_trend > 0.15) else (
        "IMPROVING" if (temp_trend < -0.1 and vib_trend < -0.1) else "STABLE"
    )

    return {
        "health_score": round(health, 1),
        "failure_probability": probability,
        "failure_probability_pct": round(probability * 100, 1),
        "risk_level": level,
        "confidence": "HIGH" if len(recent) >= 40 else "MEDIUM",
        "trend": trend,
        "dominant_factor": dominant,
        "factors": factors,
        "recommendation": recommend(machine, level, dominant, avg_temp, avg_vib, epu_recent, epu_old),
        "signals": {
            "temperature_avg": round(avg_temp, 1),
            "temperature_delta": round(avg_temp - machine.normal_temperature, 1),
            "vibration_avg": round(avg_vib, 2),
            "vibration_delta": round(avg_vib - machine.normal_vibration, 2),
            "load_avg": round(avg_load, 3),
            "energy_kw_avg": round(avg_kw, 1),
            "energy_per_unit": round(epu_recent, 2),
            "energy_per_unit_prev": round(epu_old, 2),
            "downtime_7d_hours": round(machine.downtime_hours, 1),
            "output_gap": round(output_gap, 3),
        },
    }


def recommend(
    machine: Machine,
    level: str,
    dominant: str,
    avg_temp: float,
    avg_vib: float,
    epu: float,
    epu_prev: float,
) -> str:
    """RECOMMEND stage -- a concrete action derived from the dominant factor."""
    actions = {
        "Temperature": (
            f"Inspect {machine.code} cooling circuit and lubrication flow, verify spindle/ram "
            f"thermal sensors, then schedule preventive maintenance before the next shift."
        ),
        "Vibration": (
            f"Run a vibration spectrum test on {machine.code}, check bearings, coupling and mount "
            f"alignment, and reduce load until the reading returns inside the rated envelope."
        ),
        "Downtime": (
            f"Review the last 7 days of stoppages on {machine.code} with the shift leader and "
            f"reserve a maintenance window inside the next 48 hours."
        ),
        "Energy waste": (
            f"Audit {machine.code} drive and standby modes \u2014 kWh per unit has risen from "
            f"{epu_prev:.2f} to {epu:.2f}; a burn-down test should confirm the cause."
        ),
        "Failure history": (
            f"Prioritise {machine.code} for a full condition survey given its recorded failure "
            f"history, and confirm spares availability."
        ),
        "Load": (
            f"Re-balance workload away from {machine.code} \u2014 sustained high load is driving "
            f"thermal and vibration stress."
        ),
        "Rising trend": (
            f"Track {machine.code} hourly: both temperature and vibration are trending upward. "
            f"Prepare a preventive maintenance work order now."
        ),
        "Operating hours": f"Add {machine.code} to the scheduled overhaul plan based on running hours.",
        "Output gap": (
            f"Investigate the output shortfall on {machine.code} \u2014 review changeover time, "
            f"material feed and the last recorded faults."
        ),
    }
    base = actions.get(dominant, f"Review condition data for {machine.code}.")
    if level == "CRITICAL":
        return f"IMMEDIATE: {base} Do not run unsupervised until the reading normalises."
    if level == "HIGH":
        return f"Within 24h: {base}"
    if level == "MEDIUM":
        return f"Within this week: {base}"
    return f"Routine: {base} No action required beyond standard inspection."


def prediction_for_machine(db: Session, machine: Machine) -> Dict:
    readings = fetch_readings(db, machine.id)
    prediction = compute_prediction(machine, readings)
    prediction["anomalies"] = detect_anomalies(machine, readings)
    return prediction


def machine_brief(db: Session, machine: Machine) -> Dict:
    """Machine row + its live prediction, used by list endpoints."""
    prediction = prediction_for_machine(db, machine)
    return {
        "id": machine.id,
        "code": machine.code,
        "name": machine.name,
        "line": machine.line,
        "area": machine.area,
        "status": machine.status,
        "installed_on": machine.installed_on.isoformat(),
        "rated_capacity": machine.rated_capacity,
        "normal_temperature": machine.normal_temperature,
        "normal_vibration": machine.normal_vibration,
        "operating_hours": round(machine.operating_hours, 0),
        "downtime_hours": round(machine.downtime_hours, 1),
        "failure_count": machine.failure_count,
        "last_maintenance": machine.last_maintenance.isoformat(),
        "notes": machine.notes,
        "health_score": prediction["health_score"],
        "failure_probability": prediction["failure_probability"],
        "failure_probability_pct": prediction.get(
            "failure_probability_pct", round(prediction["failure_probability"] * 100, 1)
        ),
        "risk_level": prediction["risk_level"],
        "trend": prediction["trend"],
        "signals": prediction["signals"],
        "recommendation": prediction["recommendation"],
    }
