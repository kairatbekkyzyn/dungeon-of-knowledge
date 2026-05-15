from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update, distinct
from collections import defaultdict
from datetime import date
from app.database import get_db
from app.models import User, Material, Question, QuizAttempt, TopicMastery, MonsterLog
from app.auth import get_current_user

router = APIRouter()


async def _update_mastery(db: AsyncSession, user_id: int, material_id: int, topic: str, is_correct: bool):
    """Recalculate and save mastery for a topic after each answer.
    
    Mastery = unique questions answered correctly / total questions in topic.
    This means 5/5 = 100%, not inflated by retries.
    """
    result = await db.execute(
        select(TopicMastery).where(
            TopicMastery.user_id == user_id,
            TopicMastery.material_id == material_id,
            TopicMastery.topic == topic,
        )
    )
    m = result.scalar_one_or_none()

    if not m:
        m = TopicMastery(
            user_id=user_id,
            material_id=material_id,
            topic=topic,
            total=0,
            correct=0,
            mastery=0.0
        )
        db.add(m)

    # Count total questions in this topic
    total_q_result = await db.execute(
        select(func.count(Question.id)).where(
            Question.material_id == material_id,
            Question.topic == topic,
        )
    )
    total_questions = total_q_result.scalar() or 0

    # Count UNIQUE questions the user has answered correctly at least once
    correct_q_result = await db.execute(
        select(func.count(func.distinct(QuizAttempt.question_id))).where(
            QuizAttempt.user_id == user_id,
            QuizAttempt.is_correct == True,
            QuizAttempt.question_id.in_(
                select(Question.id).where(
                    Question.material_id == material_id,
                    Question.topic == topic,
                )
            )
        )
    )
    unique_correct = correct_q_result.scalar() or 0

    # Track total attempts for state logic (still useful)
    m.total = (m.total or 0) + 1
    m.correct = unique_correct
    m.mastery = round(unique_correct / total_questions, 3) if total_questions > 0 else 0.0

    # State: mastered when all questions answered correctly
    if unique_correct >= total_questions and total_questions > 0:
        m.state = 'mastered'
    elif unique_correct > 0:
        m.state = 'in_progress'
    else:
        m.state = 'locked'

    await db.commit()


async def _update_monster_log(db: AsyncSession, user_id: int, question_id: int, is_correct: bool):
    """Add to monster log on wrong answer, mark defeated on correct."""
    result = await db.execute(
        select(MonsterLog).where(
            MonsterLog.user_id == user_id,
            MonsterLog.question_id == question_id,
        )
    )
    entry = result.scalar_one_or_none()
    
    if is_correct:
        if entry and not entry.defeated:
            entry.defeated = True
            await db.commit()
    else:
        if entry:
            entry.times_wrong += 1
            entry.defeated = False
        else:
            entry = MonsterLog(
                user_id=user_id, 
                question_id=question_id,
                times_wrong=1,
                defeated=False
            )
            db.add(entry)
        await db.commit()


@router.get("/")
async def list_dungeons(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return all materials as dungeons with full mastery breakdown."""
    mats_result = await db.execute(
        select(Material)
        .where(Material.user_id == current_user.id)
        .order_by(Material.dungeon_order, Material.created_at)
    )
    materials = mats_result.scalars().all()

    dungeons = []
    for mat in materials:
        # Get all topics for this material
        q_result = await db.execute(
            select(Question.topic)
            .where(Question.material_id == mat.id)
            .distinct()
        )
        topics = [r[0] for r in q_result.all()]

        # Get mastery per topic
        mastery_result = await db.execute(
            select(TopicMastery).where(
                TopicMastery.user_id == current_user.id,
                TopicMastery.material_id == mat.id,
            )
        )
        mastery_map = {m.topic: m for m in mastery_result.scalars().all()}

        rooms = []
        for t in topics:
            # Get question count for this topic
            q_count_result = await db.execute(
                select(func.count(Question.id)).where(
                    Question.material_id == mat.id,
                    Question.topic == t,
                )
            )
            q_count = q_count_result.scalar() or 0

            # Count unique correctly answered questions
            correct_result = await db.execute(
                select(func.count(func.distinct(QuizAttempt.question_id))).where(
                    QuizAttempt.user_id == current_user.id,
                    QuizAttempt.is_correct == True,
                    QuizAttempt.question_id.in_(
                        select(Question.id).where(
                            Question.material_id == mat.id,
                            Question.topic == t,
                        )
                    )
                )
            )
            unique_correct = correct_result.scalar() or 0
            mastery_value = round(unique_correct / q_count, 3) if q_count > 0 else 0.0

            state = "locked"
            if unique_correct >= q_count and q_count > 0:
                state = "mastered"
            elif unique_correct > 0:
                state = "in_progress"

            rooms.append({
                "topic": t,
                "mastery": mastery_value,
                "question_count": q_count,
                "state": state,
            })

        overall = sum(r["mastery"] for r in rooms) / len(rooms) if rooms else 0.0
        boss_unlocked = all(r["mastery"] >= 0.7 for r in rooms) and len(rooms) > 0

        dungeons.append({
            "id": mat.id,
            "title": mat.title,
            "question_count": mat.question_count,
            "rooms": rooms,
            "overall_mastery": round(overall, 3),
            "boss_unlocked": boss_unlocked,
            "state": "mastered" if overall >= 0.8 else "active" if overall > 0 else "new",
            "dungeon_order": mat.dungeon_order,
            "created_at": mat.created_at.isoformat(),
        })

    return dungeons


@router.get("/{material_id}/rooms")
async def get_rooms(
    material_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get room-by-room breakdown for one dungeon."""
    mat_result = await db.execute(
        select(Material).where(
            Material.id == material_id,
            Material.user_id == current_user.id,
        )
    )
    mat = mat_result.scalar_one_or_none()
    if not mat:
        raise HTTPException(status_code=404, detail="Dungeon not found.")

    # Get question count per topic
    q_result = await db.execute(
        select(Question.topic, func.count(Question.id))
        .where(Question.material_id == material_id)
        .group_by(Question.topic)
    )
    topic_counts = {row[0]: row[1] for row in q_result.all()}

    # Get mastery per topic
    mastery_result = await db.execute(
        select(TopicMastery).where(
            TopicMastery.user_id == current_user.id,
            TopicMastery.material_id == material_id,
        )
    )
    mastery_map = {m.topic: m for m in mastery_result.scalars().all()}

    rooms = []
    for topic, count in topic_counts.items():
        m = mastery_map.get(topic)

        # Recompute mastery correctly: unique correct / total questions
        correct_q_result = await db.execute(
            select(func.count(func.distinct(QuizAttempt.question_id))).where(
                QuizAttempt.user_id == current_user.id,
                QuizAttempt.is_correct == True,
                QuizAttempt.question_id.in_(
                    select(Question.id).where(
                        Question.material_id == material_id,
                        Question.topic == topic,
                    )
                )
            )
        )
        unique_correct = correct_q_result.scalar() or 0
        mastery_value = round(unique_correct / count, 3) if count > 0 else 0.0

        # Determine state
        if unique_correct >= count and count > 0:
            state = "mastered"
        elif unique_correct > 0:
            state = "in_progress"
        else:
            state = "locked"

        rooms.append({
            "topic": topic,
            "question_count": count,
            "correct": unique_correct,
            "total": m.total if m else 0,
            "mastery": mastery_value,
            "state": state,
        })

    # Sort rooms
    rooms.sort(key=lambda x: x["topic"])

    # NEW: Calculate which rooms are accessible based on previous room mastery >= 0.7
    accessible_rooms = []
    for i, room in enumerate(rooms):
        if i == 0:
            # First room always accessible
            room["accessible"] = True
        else:
            # Check if previous room has mastery >= 70%
            prev_room = rooms[i - 1]
            prev_mastery = prev_room["mastery"]
            room["accessible"] = prev_mastery >= 0.7
        
        # Override if room is already mastered
        if room["state"] == "mastered":
            room["accessible"] = True

    return {
        "dungeon_id": mat.id,
        "dungeon_title": mat.title,
        "rooms": rooms,
        "boss_unlocked": all(r["mastery"] >= 0.7 for r in rooms) and len(rooms) > 0,
    }


@router.post("/mastery/update")
async def update_mastery_endpoint(
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Called after every quiz answer to update mastery and monster log."""
    await _update_mastery(
        db, current_user.id,
        data["material_id"], data["topic"], data["is_correct"]
    )
    await _update_monster_log(
        db, current_user.id, data["question_id"], data["is_correct"]
    )
    return {"ok": True}


@router.get("/monster-log")
async def get_monster_log(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return all undefeated monsters (wrong answers)."""
    result = await db.execute(
        select(MonsterLog, Question)
        .join(Question, MonsterLog.question_id == Question.id)
        .where(
            MonsterLog.user_id == current_user.id,
            MonsterLog.defeated == False,
        )
        .order_by(MonsterLog.times_wrong.desc())
    )
    rows = result.all()

    return [
        {
            "id": row.MonsterLog.id,
            "question_id": row.Question.id,
            "material_id": row.Question.material_id,
            "question_text": row.Question.question_text,
            "options": row.Question.options,
            "correct_answer": row.Question.correct_answer,
            "explanation": row.Question.explanation,
            "topic": row.Question.topic,
            "times_wrong": row.MonsterLog.times_wrong,
            "last_seen": row.MonsterLog.last_seen.isoformat(),
        }
        for row in rows
    ]

@router.get("/{material_id}/rooms/progress")
async def get_room_progress(
    material_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get which questions have been correctly answered per room/topic."""
    
    # Get all questions for this material
    questions_result = await db.execute(
        select(Question).where(Question.material_id == material_id)
    )
    questions = questions_result.scalars().all()
    
    # Get mastery records
    mastery_result = await db.execute(
        select(TopicMastery).where(
            TopicMastery.user_id == current_user.id,
            TopicMastery.material_id == material_id,
        )
    )
    masteries = {m.topic: m for m in mastery_result.scalars().all()}
    
    # Get correctly answered question IDs from quiz attempts
    correct_question_ids = set()
    for question in questions:
        # FIX: Add .limit(1) and use .first()
        attempt_result = await db.execute(
            select(QuizAttempt)
            .where(
                QuizAttempt.user_id == current_user.id,
                QuizAttempt.question_id == question.id,
                QuizAttempt.is_correct == True
            )
            .limit(1)  # Add this
        )
        if attempt_result.first():  # Use .first() instead of scalar_one_or_none()
            correct_question_ids.add(question.id)
    
    # Group by topic
    room_progress = {}
    for question in questions:
        if question.topic not in room_progress:
            room_progress[question.topic] = {
                "total_questions": 0,
                "correct_ids": []
            }
        room_progress[question.topic]["total_questions"] += 1
        if question.id in correct_question_ids:
            room_progress[question.topic]["correct_ids"].append(question.id)
    
    return room_progress

@router.get("/{material_id}/topics/{topic}/summary")
async def get_topic_summary(
    material_id: int,
    topic: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a PROPER topic summary with AI-generated key terms and definitions."""
    
    import re
    
    # Get the material content
    mat_result = await db.execute(
        select(Material).where(
            Material.id == material_id,
            Material.user_id == current_user.id,
        )
    )
    material = mat_result.scalar_one_or_none()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
    
    # Get all questions for this topic
    questions_result = await db.execute(
        select(Question).where(
            Question.material_id == material_id,
            Question.topic == topic,
            Question.user_id == current_user.id,
        )
    )
    questions = questions_result.scalars().all()
    
    # Count mastered questions
    mastered_count = 0
    for q in questions:
        # FIX: Add .limit(1) and use .first() instead of scalar_one_or_none()
        correct_attempt = await db.execute(
            select(QuizAttempt)
            .where(
                QuizAttempt.user_id == current_user.id,
                QuizAttempt.question_id == q.id,
                QuizAttempt.is_correct == True
            )
            .limit(1)  # Add this to prevent MultipleResultsFound
        )
        if correct_attempt.first():  # Use .first() instead of scalar_one_or_none()
            mastered_count += 1
    
    total_questions = len(questions)
    mastery_percentage = (mastered_count / total_questions * 100) if total_questions > 0 else 0
    
    # Extract content related to this topic
    content = material.content
    topic_lower = topic.lower()
    content_lower = content.lower()
    topic_index = content_lower.find(topic_lower)
    
    if topic_index != -1:
        start = max(0, topic_index - 800)
        end = min(len(content), topic_index + 1200)
        raw_content = content[start:end]
    else:
        raw_content = content[:1200]
    
    # CLEAN THE TEXT - Remove excessive line breaks, fix formatting
    # Replace multiple newlines with single newline
    cleaned = re.sub(r'\n\s*\n', '\n\n', raw_content)
    # Remove line breaks that split sentences (replace \n with space when it's in the middle of a sentence)
    cleaned = re.sub(r'(?<![.!?])\n(?![0-9])', ' ', cleaned)
    # Remove extra spaces
    cleaned = re.sub(r' +', ' ', cleaned)
    # Remove spaces before punctuation
    cleaned = re.sub(r' \.', '.', cleaned)
    cleaned = re.sub(r' ,', ',', cleaned)
    # Split into paragraphs
    paragraphs = [p.strip() for p in cleaned.split('\n\n') if p.strip()]
    # Take first 3-4 paragraphs
    topic_content = '\n\n'.join(paragraphs[:4])
    
    # Generate key terms using AI
    key_terms = []
    ai_summary = ""
    try:
        from app.services.ai_service import generate_key_terms, generate_topic_summary
        key_terms = await generate_key_terms(raw_content, topic)
        ai_summary = await generate_topic_summary(raw_content, topic)
    except Exception as e:
        print(f"Error generating AI content: {e}")
    
    # If AI fails, create simple fallback key terms
    if not key_terms:
        key_terms = [
            {"term": topic, "definition": f"Core concept of {topic}"},
            {"term": "Key Principle", "definition": "Main idea to understand"},
            {"term": "Important Concept", "definition": "Critical knowledge point"},
        ]
    
    # Use AI summary if available, otherwise fall back to cleaned raw text
    final_content = ai_summary if ai_summary else topic_content
    
    # Create a clean, student-friendly summary
    summary = f"""📚 Welcome to the {topic} room!

🎯 What you'll learn:
• Core concepts and principles of {topic}
• Key terminology and definitions
• Practical applications and examples

💡 Study Tips:
• Read through the key terms first
• Review the content below
• Test yourself with the quiz questions

Good luck on your journey!"""

    return {
        "topic": topic,
        "material_title": material.title,
        "total_questions": total_questions,
        "mastered_questions": mastered_count,
        "mastery_percentage": mastery_percentage,
        "topic_content": final_content,
        "key_terms": key_terms,
        "summary": summary,
    }