"""Sample factory data.

The generator is deterministic (fixed seed) and *causally linked*:

    degradation  ->  hotter + shakier readings
                 ->  higher energy per unit and more downtime
                 ->  lower output against target and more defects
                 ->  rule alerts fire, health drops, failure probability rises
                 ->  the prediction engine raises predicted maintenance

Run manually with:  python -m app.seed --reset
"""

from __future__ import annotations

import math
import random
import sys
from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from .database import Base, SessionLocal, engine
from .models import (
    Alert,
    EnergyRecord,
    Machine,
    MachineReading,
    MaintenanceRecord,
    Order,
    ProductionRecord,
)
from .predict import compute_prediction, fetch_readings, prediction_for_machine

RNG = random.Random(20260218)
KWH_PRICE = 0.14  # currency units per kWh

# code, name, line, area, rated units/h, normal temp, normal vib, normal kW,
# degradation (0 healthy .. 1 failing), drift over the window, status
MACHINES = [
    ("M-001", "CNC Mill 1", "Line A", "Machining", 46, 58.0, 1.6, 34.0, 0.06, -0.02, "RUNNING"),
    ("M-002", "CNC Mill 2", "Line A", "Machining", 44, 59.0, 1.7, 33.0, 0.14, 0.05, "RUNNING"),
    ("M-003", "Injection Moulder 200t", "Line B", "Moulding", 62, 64.0, 2.1, 58.0, 0.34, 0.18, "RUNNING"),
    ("M-004", "Robotic Welder 1", "Line A", "Joining", 38, 55.0, 1.5, 41.0, 0.09, 0.01, "RUNNING"),
    ("M-005", "Assembly Robot 1", "Line C", "Assembly", 70, 48.0, 1.3, 27.0, 0.11, -0.03, "RUNNING"),
    ("M-006", "Robotic Welder 2", "Line A", "Joining", 36, 56.0, 1.6, 40.0, 0.26, 0.14, "RUNNING"),
    ("M-007", "Powder Coat Oven", "Line C", "Finishing", 54, 72.0, 1.1, 76.0, 0.18, 0.06, "RUNNING"),
    ("M-008", "CNC Lathe 3", "Line A", "Machining", 40, 60.0, 1.8, 31.0, 0.44, 0.20, "RUNNING"),
    ("M-009", "Packaging Robot", "Line C", "Packaging", 88, 45.0, 1.2, 22.0, 0.07, -0.01, "RUNNING"),
    ("M-010", "Hydraulic Press 160t", "Line B", "Forming", 34, 61.0, 2.0, 47.0, 0.22, 0.09, "RUNNING"),
    ("M-011", "Air Compressor 2", "Utilities", "Utilities", 130, 47.0, 1.4, 65.0, 0.16, 0.04, "RUNNING"),
    ("M-012", "Hydraulic Press 400t", "Line B", "Forming", 30, 63.0, 2.2, 52.0, 0.72, 0.30, "RUNNING"),
    ("M-013", "Deburring Cell", "Line C", "Finishing", 58, 50.0, 1.5, 24.0, 0.05, -0.02, "IDLE"),
    ("M-014", "Injection Moulder 350t", "Line B", "Moulding", 55, 66.0, 2.0, 61.0, 0.29, 0.12, "RUNNING"),
]

# realised utilisation per sample hour (night shifts run light)
SHIFT_PATTERN = {0: 0.45, 4: 0.40, 8: 1.00, 12: 0.94, 16: 0.88, 20: 0.62}
# planned utilisation used to build the production target for each shift
PLANNED_PATTERN = {0: 0.44, 4: 0.40, 8: 0.96, 12: 0.92, 16: 0.85, 20: 0.60}


# --------------------------------------------------------------------------- #
def _noise(scale: float) -> float:
    return (RNG.random() - 0.5) * 2 * scale


def build_readings(session: Session) -> dict:
    """14 days of 4-hourly sensor readings for every machine."""
    now = datetime.utcnow().replace(minute=0, second=0, microsecond=0)
    start_day = now - timedelta(days=13)
    per_machine: dict = {}
    count = 0

    for idx, spec in enumerate(MACHINES):
        code, name, line, area, cap, ntemp, nvib, nkw, cond, drift, status = spec
        machine = (
            session.query(Machine).filter(Machine.code == code).one_or_none()
        )
        series = []
        for day_offset in range(14):
            day = (start_day + timedelta(days=day_offset)).date()
            progress = day_offset / 13.0
            condition = max(0.02, cond + drift * progress)
            for hour in (0, 4, 8, 12, 16, 20):
                ts = datetime.combine(day, datetime.min.time()) + timedelta(hours=hour)
                if ts > now:
                    continue
                shift_factor = SHIFT_PATTERN[hour]
                weekend = day.weekday() >= 5
                load = clamp(
                    (0.95 + 0.06 * math.sin(idx + hour / 3.0)) * shift_factor
                    * (0.62 if weekend else 1.0)
                    + _noise(0.05)
                    + condition * 0.06,
                    0.05,
                    1.0,
                )
                temperature = (
                    ntemp
                    + condition * 16
                    + progress * condition * 5
                    + 2.2 * math.sin(hour / 3.0)
                    + _noise(1.6)
                )
                vibration = nvib + condition * 2.3 + progress * condition * 0.6 + _noise(0.18)
                energy_kw = nkw * (0.52 + 0.55 * load) * (1 + condition * 0.16) + _noise(0.6)

                downtime = 0.0
                if condition > 0.4 and RNG.random() < 0.10 + condition * 0.16:
                    downtime = round(18 + condition * 46 + RNG.random() * 20, 1)
                elif condition > 0.25 and RNG.random() < 0.05:
                    downtime = round(8 + RNG.random() * 12, 1)

                efficiency = 1.0 - condition * 0.34
                hours = 4.0
                output = 0
                if cap > 0:
                    output = int(round(cap * hours * load * efficiency))
                    if downtime:
                        output = int(output * (1 - downtime / (hours * 60)))
                    output = max(0, output)

                reading = MachineReading(
                    machine_id=machine.id,
                    ts=ts,
                    temperature=round(max(20.0, temperature), 1),
                    vibration=round(max(0.4, vibration), 2),
                    energy_kw=round(max(1.0, energy_kw), 1),
                    load=round(load, 3),
                    output_units=output,
                    downtime_minutes=downtime,
                )
                session.add(reading)
                series.append(reading)
                count += 1
        per_machine[code] = series

    session.flush()
    return per_machine


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def build_production(session: Session, per_machine: dict) -> None:
    """Aggregate readings into daily production records for 3 shifts."""
    today = date.today()
    shifts = {"Night": (0, 4), "Day": (8, 12), "Evening": (16, 20)}

    for code, series in per_machine.items():
        machine = session.query(Machine).filter(Machine.code == code).one()
        by_day: dict = {}
        for r in series:
            by_day.setdefault(r.ts.date(), []).append(r)

        for day, readings in by_day.items():
            for shift_name, hours in shifts.items():
                chunk = [r for r in readings if r.ts.hour in hours]
                if not chunk:
                    continue
                # target is built per sample so partially-elapsed shifts compare fairly
                target = int(
                    round(
                        sum(
                            machine.rated_capacity * 4.0 * PLANNED_PATTERN[r.ts.hour]
                            for r in chunk
                        )
                    )
                )
                if day.weekday() >= 5:
                    target = int(target * 0.62)
                output = sum(r.output_units for r in chunk)
                condition = 0.0
                if machine.normal_temperature:
                    condition = clamp(
                        (sum(r.temperature for r in chunk) / len(chunk) - machine.normal_temperature) / 30.0,
                        0.0,
                        1.0,
                    )
                defects = int(round(output * (0.006 + condition * 0.055)))
                downtime = round(sum(r.downtime_minutes for r in chunk), 1)
                session.add(
                    ProductionRecord(
                        day=day,
                        shift=shift_name,
                        machine_id=machine.id,
                        target=target,
                        output=output,
                        defects=defects,
                        downtime_minutes=downtime,
                    )
                )


def build_energy(session: Session, per_machine: dict) -> None:
    for code, series in per_machine.items():
        machine = session.query(Machine).filter(Machine.code == code).one()
        by_day: dict = {}
        for r in series:
            entry = by_day.setdefault(r.ts.date(), {"kwh": 0.0, "units": 0})
            entry["kwh"] += r.energy_kw * 4.0
            entry["units"] += r.output_units
        for day, entry in by_day.items():
            session.add(
                EnergyRecord(
                    day=day,
                    machine_id=machine.id,
                    kwh=round(entry["kwh"], 1),
                    cost=round(entry["kwh"] * KWH_PRICE, 2),
                    units_produced=entry["units"],
                )
            )


def build_orders(session: Session) -> None:
    today = date.today()
    rows = [
        ("SO-2481", "Nordvik Automotive", "Wheel Hub Carrier", 4200, 3610, 5, "High", "In Production"),
        ("SO-2482", "Nordvik Automotive", "Brake Caliper Bracket", 2600, 2600, -4, "Medium", "Completed"),
        ("SO-2483", "Helios Rail", "Coupling Housing", 1800, 720, 3, "High", "In Production"),
        ("SO-2484", "Kestrel Agri", "Gearbox Cover", 3000, 1180, 9, "Medium", "In Production"),
        ("SO-2485", "Meridian Marine", "Propeller Mount", 900, 120, 2, "Critical", "Delayed"),
        ("SO-2486", "Helios Rail", "Bogie Side Frame", 1500, 1500, -2, "Medium", "Completed"),
        ("SO-2487", "Vantage HVAC", "Fan Impeller", 5400, 4020, 6, "Low", "In Production"),
        ("SO-2488", "Kestrel Agri", "Seed Meter Body", 2200, 640, 12, "Medium", "In Production"),
        ("SO-2489", "Meridian Marine", "Valve Body", 1200, 260, 1, "High", "Delayed"),
        ("SO-2490", "Nordvik Automotive", "Suspension Knuckle", 3400, 0, 15, "Low", "Pending"),
        ("SO-2491", "Vantage HVAC", "Duct Flange", 6000, 6000, -6, "Low", "Completed"),
        ("SO-2492", "Helios Rail", "Piston Rod", 1600, 410, 7, "High", "In Production"),
        ("SO-2493", "Kestrel Agri", "Drive Shaft Yoke", 1400, 0, 18, "Medium", "Pending"),
        ("SO-2494", "Nordvik Automotive", "Steering Rack Cap", 2800, 1950, 4, "Medium", "In Production"),
        ("SO-2495", "Meridian Marine", "Shaft Seal Housing", 750, 90, 2, "Critical", "Delayed"),
        ("SO-2496", "Vantage HVAC", "Damper Linkage", 3200, 3200, -1, "Low", "Completed"),
        ("SO-2497", "Helios Rail", "Gearbox Bracket", 2100, 860, 10, "Medium", "In Production"),
        ("SO-2498", "Kestrel Agri", "Hydraulic Manifold", 1100, 0, 21, "Low", "Pending"),
    ]
    for i, (code, customer, product, qty, done, offset, priority, status) in enumerate(rows):
        session.add(
            Order(
                order_code=code,
                customer=customer,
                product=product,
                quantity=qty,
                completed_quantity=done,
                deadline=today + timedelta(days=offset),
                priority=priority,
                status=status,
                created_on=today - timedelta(days=40 - i * 2),
            )
        )


def build_maintenance(session: Session) -> None:
    today = date.today()
    manual = [
        ("M-001", "Routine 500-hour service", "Low", -21, "Completed", "Completed"),
        ("M-004", "Weld tip replacement", "Medium", -14, "Completed", "Completed"),
        ("M-009", "Conveyor belt tracking adjustment", "Low", -9, "Completed", "Completed"),
        ("M-011", "Condensate drain inspection", "Medium", -30, "Completed", "Completed"),
        ("M-007", "Oven element resistance check", "Medium", -11, "Completed", "Completed"),
        ("M-013", "Fixture re-calibration", "Low", -6, "Completed", "Completed"),
        ("M-010", "Hydraulic oil filter change", "Medium", -12, "Overdue", "Overdue"),
        ("M-006", "Torch liner inspection", "High", -5, "Overdue", "Overdue"),
        ("M-014", "Barrel wear-ring replacement", "High", -2, "Overdue", "Overdue"),
        ("M-002", "Coolant concentration top-up", "Low", 2, "Scheduled", "Scheduled"),
        ("M-003", "Heater band thermocouple check", "Medium", 4, "Scheduled", "Scheduled"),
        ("M-005", "Gripper pad replacement", "Low", 6, "Scheduled", "Scheduled"),
        ("M-008", "Spindle bearing inspection", "High", 1, "Scheduled", "Scheduled"),
        ("M-012", "Slide way lubrication and alignment", "High", 3, "Scheduled", "Scheduled"),
        ("M-007", "Extraction fan belt replacement", "Medium", 9, "Scheduled", "Scheduled"),
        ("M-001", "Annual geometry re-verification", "Medium", 13, "Scheduled", "Scheduled"),
    ]
    for code, issue, priority, offset, status, _label in manual:
        machine = session.query(Machine).filter(Machine.code == code).one()
        scheduled = today + timedelta(days=offset)
        session.add(
            MaintenanceRecord(
                machine_id=machine.id,
                issue=issue,
                priority=priority,
                scheduled_date=scheduled,
                completed_date=scheduled if status == "Completed" else None,
                status=status,
                source="Manual",
                notes="Raised from the planned maintenance schedule.",
            )
        )


def build_predictions_and_alerts(session: Session) -> None:
    today = date.today()
    machines = session.query(Machine).order_by(Machine.code).all()

    for machine in machines:
        prediction = prediction_for_machine(session, machine)
        # predicted maintenance for anything at MEDIUM risk or worse
        if prediction["risk_level"] in ("MEDIUM", "HIGH", "CRITICAL") and prediction[
            "failure_probability"
        ] >= 0.22:
            horizon = {"CRITICAL": 1, "HIGH": 3, "MEDIUM": 7}[prediction["risk_level"]]
            session.add(
                MaintenanceRecord(
                    machine_id=machine.id,
                    issue=f"Predicted: {prediction['dominant_factor'].lower()} degradation \u2014 "
                    f"health {prediction['health_score']:.0f}%, "
                    f"failure risk {prediction['failure_probability'] * 100:.0f}%",
                    priority=(
                        "High"
                        if prediction["risk_level"] in ("HIGH", "CRITICAL")
                        else "Medium"
                    ),
                    scheduled_date=today + timedelta(days=horizon),
                    status="Predicted",
                    source="Predicted",
                    notes=prediction["recommendation"],
                )
            )

        # a critical asset raises a critical alert, straight from the prediction
        if prediction["risk_level"] in ("CRITICAL", "HIGH"):
            session.add(
                Alert(
                    machine_id=machine.id,
                    alert_type="Predictive risk",
                    severity="Critical" if prediction["risk_level"] == "CRITICAL" else "Warning",
                    description=(
                        f"{machine.code} scored {prediction['health_score']:.0f}% health with a "
                        f"{prediction['failure_probability_pct']:.0f}% failure probability "
                        f"({prediction['risk_level']}). Dominant factor: "
                        f"{prediction.get('dominant_factor', 'n/a')}."
                    ),
                    created_at=datetime.utcnow() - timedelta(hours=1),
                    status="Open",
                    source="AI",
                )
            )

        # rule alerts from real threshold breaches (one per machine/day/type)
        recent = fetch_readings(session, machine.id, hours=120)
        seen: set = set()

        def once(key) -> bool:
            if key in seen:
                return False
            seen.add(key)
            return True

        for reading in recent:
            day = reading.ts.date()
            if reading.temperature > machine.normal_temperature + 15 and once(
                ("temp", day)
            ):
                session.add(
                    Alert(
                        machine_id=machine.id,
                        alert_type="Over-temperature",
                        severity="Critical"
                        if reading.temperature > machine.normal_temperature + 22
                        else "Warning",
                        description=(
                            f"Temperature {reading.temperature:.1f}\u00b0C exceeds the rated envelope "
                            f"of {machine.normal_temperature:.0f}\u00b0C at {reading.ts:%H:%M}."
                        ),
                        created_at=reading.ts,
                        status="Open",
                        source="Rule",
                    )
                )
            if reading.vibration > machine.normal_vibration + 1.8 and once(("vib", day)):
                session.add(
                    Alert(
                        machine_id=machine.id,
                        alert_type="High vibration",
                        severity="Critical"
                        if reading.vibration > machine.normal_vibration + 3.0
                        else "Warning",
                        description=(
                            f"Vibration {reading.vibration:.2f} mm/s measured against a rated "
                            f"baseline of {machine.normal_vibration:.1f} mm/s."
                        ),
                        created_at=reading.ts,
                        status="Open",
                        source="Rule",
                    )
                )
            if reading.downtime_minutes > 30 and once(("down", day)):
                session.add(
                    Alert(
                        machine_id=machine.id,
                        alert_type="Unplanned downtime",
                        severity="Warning",
                        description=(
                            f"{reading.downtime_minutes:.0f} minutes of unplanned stop recorded "
                            f"during the {reading.ts:%H:%M} sample."
                        ),
                        created_at=reading.ts,
                        status="Open",
                        source="Rule",
                    )
                )

    # close older alerts so the feed carries real history
    session.flush()
    old = (
        session.query(Alert)
        .filter(Alert.created_at < datetime.utcnow() - timedelta(hours=18))
        .order_by(Alert.created_at.desc())
        .all()
    )
    for alert in old[6:]:
        alert.status = "Resolved"

    # a couple of informational alerts
    first = machines[0]
    session.add(
        Alert(
            machine_id=first.id,
            alert_type="Schedule",
            severity="Information",
            description="Planned service window confirmed for this week \u2014 no line stop required.",
            created_at=datetime.utcnow() - timedelta(hours=5),
            status="Acknowledged",
            source="Rule",
        )
    )


# --------------------------------------------------------------------------- #
def seed(reset: bool = False) -> None:
    if reset:
        Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    session = SessionLocal()
    try:
        if session.query(Machine).count() > 0:
            print("Database already seeded \u2014 skipping.")
            return

        today = date.today()
        for code, name, line, area, cap, ntemp, nvib, nkw, cond, _drift, status in MACHINES:
            session.add(
                Machine(
                    code=code,
                    name=name,
                    line=line,
                    area=area,
                    status=status,
                    installed_on=today - timedelta(days=1200 + int(cond * 400)),
                    rated_capacity=cap,
                    normal_temperature=ntemp,
                    normal_vibration=nvib,
                    normal_energy_kw=nkw,
                    operating_hours=9000 + int(RNG.random() * 26000) + int(cond * 8000),
                    downtime_hours=round(0.9 + cond * 11.0 + RNG.random() * 1.6, 1),
                    failure_count=int(cond * 5 + RNG.random() * 2),
                    last_maintenance=today - timedelta(days=int(10 + RNG.random() * 50)),
                    notes=f"{name} on {line} \u2014 {area} cell.",
                )
            )
        session.flush()

        per_machine = build_readings(session)
        build_production(session, per_machine)
        build_energy(session, per_machine)
        build_orders(session)
        build_maintenance(session)
        build_predictions_and_alerts(session)
        session.commit()
        print(
            f"Seeded {len(MACHINES)} machines, "
            f"{session.query(MachineReading).count()} readings, "
            f"{session.query(ProductionRecord).count()} production records, "
            f"{session.query(Alert).count()} alerts."
        )
    finally:
        session.close()


if __name__ == "__main__":
    seed(reset="--reset" in sys.argv)
