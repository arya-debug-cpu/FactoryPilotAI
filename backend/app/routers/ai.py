"""AI endpoints: /api/ai/chat, /api/ai/insights, /api/ai/history."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..ai import ask, build_insights, gather_context, relevant_context
from ..database import get_db
from ..models import ChatMessage

router = APIRouter(tags=["ai"])


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=600)
    session_id: str = Field(default="default", max_length=40)


@router.post("/ai/chat")
def chat(body: ChatRequest, db: Session = Depends(get_db)) -> dict:
    result = ask(db, body.message, body.session_id)
    db.add(
        ChatMessage(
            session_id=body.session_id,
            role="user",
            content=body.message,
            context_used=",".join(result.get("sources", [])),
            mode=result["mode"],
        )
    )
    db.add(
        ChatMessage(
            session_id=body.session_id,
            role="assistant",
            content=result["reply"],
            context_used=",".join(result.get("sources", [])),
            mode=result["mode"],
        )
    )
    db.commit()
    return result


@router.get("/ai/insights")
def insights(db: Session = Depends(get_db)) -> dict:
    return {"insights": build_insights(db)}


@router.get("/ai/context")
def context(question: str = "plant overview", db: Session = Depends(get_db)) -> dict:
    """Debug view of exactly which data the AI would send to the model."""
    ctx = gather_context(db, question)
    return {"intents": ctx.get("_intents"), "context": relevant_context(ctx)}


@router.get("/ai/history")
def history(session_id: str = "default", limit: int = 40, db: Session = Depends(get_db)) -> dict:
    rows = (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.id.desc())
        .limit(limit)
        .all()
    )
    return {
        "messages": [
            {
                "id": r.id,
                "role": r.role,
                "content": r.content,
                "mode": r.mode,
                "created_at": r.created_at.isoformat(timespec="minutes"),
            }
            for r in reversed(rows)
        ]
    }
