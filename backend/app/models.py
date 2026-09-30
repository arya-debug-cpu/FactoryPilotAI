"""SQLAlchemy models for FactoryPilot AI.

Tables:
    machines            -- the physical assets on the shop floor
    machine_readings    -- time series sensor data (temperature/vibration/...)
    production_records  -- daily output per machine and shift
    orders              -- customer orders and their fulfilment
    maintenance_records -- scheduled / overdue / completed / AI-predicted work
    energy_records      -- daily kWh per machine
    alerts              -- rule generated operational alerts
    chat_messages       -- AI assistant conversation history
"""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Column, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from .database import Base


class Machine(Base):
    __tablename__ = "machines"

    id = Column(Integer, primary_key=True)
    code = Column(String(16), unique=True, nullable=False, index=True)
    name = Column(String(80), nullable=False)
    line = Column(String(40), nullable=False, default="Line A")
    area = Column(String(60), nullable=False, default="Machining")
    status = Column(String(16), nullable=False, default="RUNNING")  # RUNNING/IDLE/STOPPED/OFFLINE
    installed_on = Column(Date, nullable=False)
    rated_capacity = Column(Float, nullable=False, default=0)  # units / hour
    # Nominal (healthy) operating envelope used by the prediction model.
    normal_temperature = Column(Float, nullable=False, default=60.0)
    normal_vibration = Column(Float, nullable=False, default=2.0)
    normal_energy_kw = Column(Float, nullable=False, default=40.0)
    operating_hours = Column(Float, nullable=False, default=0.0)
    downtime_hours = Column(Float, nullable=False, default=0.0)  # last 7 days
    failure_count = Column(Integer, nullable=False, default=0)
    last_maintenance = Column(Date, nullable=False)
    notes = Column(Text, nullable=False, default="")

    readings = relationship(
        "MachineReading", back_populates="machine", cascade="all, delete-orphan"
    )
    production = relationship(
        "ProductionRecord", back_populates="machine", cascade="all, delete-orphan"
    )
    maintenance = relationship(
        "MaintenanceRecord", back_populates="machine", cascade="all, delete-orphan"
    )
    energy = relationship(
        "EnergyRecord", back_populates="machine", cascade="all, delete-orphan"
    )
    alerts = relationship("Alert", back_populates="machine", cascade="all, delete-orphan")


class MachineReading(Base):
    __tablename__ = "machine_readings"

    id = Column(Integer, primary_key=True)
    machine_id = Column(Integer, ForeignKey("machines.id"), nullable=False, index=True)
    ts = Column(DateTime, nullable=False, index=True)
    temperature = Column(Float, nullable=False)
    vibration = Column(Float, nullable=False)
    energy_kw = Column(Float, nullable=False)
    load = Column(Float, nullable=False)  # 0..1 utilisation of rated capacity
    output_units = Column(Integer, nullable=False, default=0)
    downtime_minutes = Column(Float, nullable=False, default=0.0)

    machine = relationship("Machine", back_populates="readings")


class ProductionRecord(Base):
    __tablename__ = "production_records"

    id = Column(Integer, primary_key=True)
    day = Column(Date, nullable=False, index=True)
    shift = Column(String(12), nullable=False, default="Day")
    machine_id = Column(Integer, ForeignKey("machines.id"), nullable=False, index=True)
    target = Column(Integer, nullable=False, default=0)
    output = Column(Integer, nullable=False, default=0)
    defects = Column(Integer, nullable=False, default=0)
    downtime_minutes = Column(Float, nullable=False, default=0.0)

    machine = relationship("Machine", back_populates="production")


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True)
    order_code = Column(String(24), unique=True, nullable=False)
    customer = Column(String(80), nullable=False)
    product = Column(String(80), nullable=False)
    quantity = Column(Integer, nullable=False)
    completed_quantity = Column(Integer, nullable=False, default=0)
    deadline = Column(Date, nullable=False)
    priority = Column(String(12), nullable=False, default="Medium")  # High/Medium/Low
    status = Column(String(20), nullable=False, default="Pending")
    created_on = Column(Date, nullable=False)


class MaintenanceRecord(Base):
    __tablename__ = "maintenance_records"

    id = Column(Integer, primary_key=True)
    machine_id = Column(Integer, ForeignKey("machines.id"), nullable=False, index=True)
    issue = Column(String(160), nullable=False)
    priority = Column(String(12), nullable=False, default="Medium")
    scheduled_date = Column(Date, nullable=False, index=True)
    completed_date = Column(Date, nullable=True)
    status = Column(String(20), nullable=False, default="Scheduled")
    # Scheduled | Overdue | Completed | Predicted
    source = Column(String(16), nullable=False, default="Manual")  # Manual | Predicted
    notes = Column(Text, nullable=False, default="")

    machine = relationship("Machine", back_populates="maintenance")


class EnergyRecord(Base):
    __tablename__ = "energy_records"

    id = Column(Integer, primary_key=True)
    day = Column(Date, nullable=False, index=True)
    machine_id = Column(Integer, ForeignKey("machines.id"), nullable=False, index=True)
    kwh = Column(Float, nullable=False)
    cost = Column(Float, nullable=False, default=0.0)
    units_produced = Column(Integer, nullable=False, default=0)

    machine = relationship("Machine", back_populates="energy")


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True)
    machine_id = Column(Integer, ForeignKey("machines.id"), nullable=False, index=True)
    alert_type = Column(String(60), nullable=False)
    severity = Column(String(12), nullable=False, default="Warning")  # Critical/Warning/Information
    description = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    status = Column(String(16), nullable=False, default="Open")  # Open/Acknowledged/Resolved
    source = Column(String(16), nullable=False, default="Rule")

    machine = relationship("Machine", back_populates="alerts")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True)
    session_id = Column(String(40), nullable=False, index=True)
    role = Column(String(12), nullable=False)  # user | assistant
    content = Column(Text, nullable=False)
    context_used = Column(Text, nullable=False, default="")
    mode = Column(String(16), nullable=False, default="grounded")  # llm | grounded
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
