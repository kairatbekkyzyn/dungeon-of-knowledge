from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import date
import random
from app.database import get_db
from app.models import User, DailyQuest, TopicMastery
from app.auth import get_current_user

router = APIRouter()

QUEST_TEMPLATES = [
    {"type": "volume",   "desc": "Answer {n} questions in any dungeon",          "target": 10, "xp": 40},
    {"type": "accuracy", "desc": "Answer {n} questions correctly in a row",       "target": 5,  "xp": 60},
    {"type": "topic",    "desc": "Reach 70% mastery on '{topic}'",                "target": 70, "xp": 80},
    {"type": "volume",   "desc": "Defeat {n} monsters in your Monster Log",       "target": 3,  "xp": 50},
    {"type": "speed",    "desc": "Complete a dungeon room without losing a life",  "target": 1,  "xp": 45},
]


@router.get("/")
async def get_quests(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today = date.today().isoformat()

    # Check if today's quests already exist
    result = await db.execute(
        select(DailyQuest).where(
            DailyQuest.user_id == current_user.id,
            DailyQuest.date == today,
        )
    )
    quests = result.scalars().all()

    if quests:
        return [_quest_out(q) for q in quests]

    # Generate 3 new quests
    # Find weakest topic to personalize one quest
    mastery_result = await db.execute(
        select(TopicMastery)
        .where(TopicMastery.user_id == current_user.id)
        .order_by(TopicMastery.mastery)
        .limit(1)
    )
    weak = mastery_result.scalar_one_or_none()
    weak_topic = weak.topic if weak else None

    templates = random.sample(QUEST_TEMPLATES, 3)
    new_quests = []
    for t in templates:
        desc = t["desc"].replace("{n}", str(t["target"]))
        if "{topic}" in desc and weak_topic:
            desc = desc.replace("{topic}", weak_topic)
        elif "{topic}" in desc:
            desc = desc.replace("'{topic}'", "any topic")

        q = DailyQuest(
            user_id=current_user.id,
            date=today,
            quest_type=t["type"],
            description=desc,
            target_value=t["target"],
            xp_reward=t["xp"],
            topic=weak_topic if t["type"] == "topic" else None,
        )
        db.add(q)
        new_quests.append(q)

    await db.commit()
    for q in new_quests:
        await db.refresh(q)

    return [_quest_out(q) for q in new_quests]


@router.post("/{quest_id}/progress")
async def update_quest_progress(
    quest_id: int,
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(DailyQuest).where(
            DailyQuest.id == quest_id,
            DailyQuest.user_id == current_user.id,
        )
    )
    quest = result.scalar_one_or_none()
    if not quest or quest.completed:
        return {"ok": False}

    quest.current_value = min(quest.current_value + data.get("increment", 1), quest.target_value)
    if quest.current_value >= quest.target_value:
        quest.completed = True
        current_user.xp += quest.xp_reward

    await db.commit()
    return {"ok": True, "completed": quest.completed, "xp_reward": quest.xp_reward if quest.completed else 0}


def _quest_out(q: DailyQuest):
    return {
        "id":            q.id,
        "description":   q.description,
        "quest_type":    q.quest_type,
        "target_value":  q.target_value,
        "current_value": q.current_value,
        "completed":     q.completed,
        "xp_reward":     q.xp_reward,
        "progress_pct":  round(q.current_value / q.target_value * 100),
    }