"""GET /api/orders."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Order

router = APIRouter(tags=["orders"])


@router.get("/orders")
def orders(
    status: str | None = None,
    priority: str | None = None,
    q: str | None = None,
    db: Session = Depends(get_db),
) -> dict:
    today = date.today()
    rows = db.query(Order).order_by(Order.deadline).all()

    payload = []
    for o in rows:
        remaining = o.quantity - o.completed_quantity
        days_left = (o.deadline - today).days
        payload.append(
            {
                "id": o.id,
                "order_code": o.order_code,
                "customer": o.customer,
                "product": o.product,
                "quantity": o.quantity,
                "completed_quantity": o.completed_quantity,
                "remaining_quantity": remaining,
                "deadline": o.deadline.isoformat(),
                "days_left": days_left,
                "priority": o.priority,
                "status": o.status,
                "progress_pct": round(o.completed_quantity / o.quantity * 100, 1)
                if o.quantity
                else 0,
                "created_on": o.created_on.isoformat(),
            }
        )

    if status:
        payload = [p for p in payload if p["status"].lower() == status.lower()]
    if priority:
        payload = [p for p in payload if p["priority"].lower() == priority.lower()]
    if q:
        needle = q.lower()
        payload = [
            p
            for p in payload
            if needle in p["order_code"].lower()
            or needle in p["product"].lower()
            or needle in p["customer"].lower()
        ]

    all_rows = [
        o
        for o in rows
    ]
    summary = {
        "total": len(all_rows),
        "active": len([o for o in all_rows if o.status == "In Production"]),
        "pending": len([o for o in all_rows if o.status == "Pending"]),
        "delayed": len([o for o in all_rows if o.status == "Delayed"]),
        "completed": len([o for o in all_rows if o.status == "Completed"]),
        "due_within_5_days": len(
            [
                o
                for o in all_rows
                if o.status != "Completed" and 0 <= (o.deadline - today).days <= 5
            ]
        ),
        "completion_pct": round(
            sum(o.completed_quantity for o in all_rows) / max(1, sum(o.quantity for o in all_rows))
            * 100,
            1,
        ),
    }
    return {"count": len(payload), "summary": summary, "orders": payload}
