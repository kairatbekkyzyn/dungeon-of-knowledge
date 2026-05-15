from collections import defaultdict
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models import User, QuizAttempt, Question
from app.schemas import UserStats, TopicStat
from app.auth import get_current_user
from app.services.ai_service import get_ai_recommendation

router = APIRouter()

@router.get("/", response_model=UserStats)
async def get_stats(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(
        select(QuizAttempt, Question.topic)
        .join(Question, QuizAttempt.question_id == Question.id)
        .where(QuizAttempt.user_id == current_user.id)
    )
    rows = result.all()
    total_attempts   = len(rows)
    correct_attempts = sum(1 for r in rows if r.QuizAttempt.is_correct)
    overall_accuracy = (correct_attempts / total_attempts) if total_attempts else 0.0

    topic_data: dict[str, dict] = defaultdict(lambda: {"total":0,"correct":0})
    for row in rows:
        topic_data[row.topic]["total"] += 1
        if row.QuizAttempt.is_correct:
            topic_data[row.topic]["correct"] += 1

    topics = []
    for topic, data in topic_data.items():
        acc = data["correct"]/data["total"] if data["total"] else 0.0
        topics.append(TopicStat(topic=topic, total=data["total"],
                                correct=data["correct"], accuracy=round(acc,3)))
    topics.sort(key=lambda t: t.accuracy)

    weak           = [{"topic":t.topic,"accuracy":t.accuracy} for t in topics if t.accuracy < 0.7]
    recommendation = await get_ai_recommendation(weak)

    return UserStats(total_attempts=total_attempts, correct_attempts=correct_attempts,
                     overall_accuracy=round(overall_accuracy,3), xp=current_user.xp,
                     streak_days=current_user.streak_days, topics=topics,
                     ai_recommendation=recommendation)