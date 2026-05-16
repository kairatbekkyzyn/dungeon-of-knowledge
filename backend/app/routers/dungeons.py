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

    total_q_result = await db.execute(
        select(func.count(Question.id)).where(
            Question.material_id == material_id,
            Question.topic == topic,
        )
    )
    total_questions = total_q_result.scalar() or 0

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

    m.total = (m.total or 0) + 1
    m.correct = unique_correct
    m.mastery = round(unique_correct / total_questions, 3) if total_questions > 0 else 0.0

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
    if not materials:
        return []

    material_ids = [m.id for m in materials]

    # FIX: single query for all topics across all materials
    q_result = await db.execute(
        select(Question.material_id, Question.topic, func.count(Question.id))
        .where(Question.material_id.in_(material_ids))
        .group_by(Question.material_id, Question.topic)
    )
    # {material_id: {topic: count}}
    topic_counts: dict = defaultdict(dict)
    for mat_id, topic, count in q_result.all():
        topic_counts[mat_id][topic] = count

    # FIX: single query for all mastery records across all materials
    mastery_result = await db.execute(
        select(TopicMastery).where(
            TopicMastery.user_id == current_user.id,
            TopicMastery.material_id.in_(material_ids),
        )
    )
    # {material_id: {topic: mastery_obj}}
    mastery_map: dict = defaultdict(dict)
    for m in mastery_result.scalars().all():
        mastery_map[m.material_id][m.topic] = m

    # FIX: single query for all correctly-answered question IDs across all materials
    all_question_ids_res = await db.execute(
        select(Question.id, Question.material_id, Question.topic)
        .where(Question.material_id.in_(material_ids))
    )
    # {material_id: {topic: [question_ids]}}
    mat_topic_qids: dict = defaultdict(lambda: defaultdict(list))
    for qid, mid, topic in all_question_ids_res.all():
        mat_topic_qids[mid][topic].append(qid)

    all_qids = [qid for mid in mat_topic_qids for topic in mat_topic_qids[mid] for qid in mat_topic_qids[mid][topic]]
    correct_res = await db.execute(
        select(QuizAttempt.question_id)
        .where(
            QuizAttempt.user_id == current_user.id,
            QuizAttempt.is_correct == True,
            QuizAttempt.question_id.in_(all_qids),
        )
        .distinct()
    )
    correctly_answered = {row[0] for row in correct_res.all()}

    dungeons = []
    for mat in materials:
        topics_for_mat = topic_counts.get(mat.id, {})
        rooms = []
        for topic, q_count in topics_for_mat.items():
            qids_for_topic = mat_topic_qids[mat.id][topic]
            unique_correct = sum(1 for qid in qids_for_topic if qid in correctly_answered)
            mastery_value = round(unique_correct / q_count, 3) if q_count > 0 else 0.0

            if unique_correct >= q_count and q_count > 0:
                state = "mastered"
            elif unique_correct > 0:
                state = "in_progress"
            else:
                state = "locked"

            rooms.append({
                "topic": topic,
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

    # Question count per topic
    q_result = await db.execute(
        select(Question.topic, func.count(Question.id))
        .where(Question.material_id == material_id)
        .group_by(Question.topic)
    )
    topic_counts = {row[0]: row[1] for row in q_result.all()}

    # Mastery per topic
    mastery_result = await db.execute(
        select(TopicMastery).where(
            TopicMastery.user_id == current_user.id,
            TopicMastery.material_id == material_id,
        )
    )
    mastery_map = {m.topic: m for m in mastery_result.scalars().all()}

    # FIX: single query for all question IDs + their topics
    qids_result = await db.execute(
        select(Question.id, Question.topic)
        .where(Question.material_id == material_id)
    )
    topic_qids: dict = defaultdict(list)
    all_qids = []
    for qid, topic in qids_result.all():
        topic_qids[topic].append(qid)
        all_qids.append(qid)

    # FIX: single query for all correctly answered question IDs
    correct_res = await db.execute(
        select(QuizAttempt.question_id)
        .where(
            QuizAttempt.user_id == current_user.id,
            QuizAttempt.is_correct == True,
            QuizAttempt.question_id.in_(all_qids),
        )
        .distinct()
    )
    correctly_answered = {row[0] for row in correct_res.all()}

    rooms = []
    for topic, count in topic_counts.items():
        m = mastery_map.get(topic)
        qids_for_topic = topic_qids[topic]
        unique_correct = sum(1 for qid in qids_for_topic if qid in correctly_answered)
        mastery_value = round(unique_correct / count, 3) if count > 0 else 0.0

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

    rooms.sort(key=lambda x: x["topic"])

    for i, room in enumerate(rooms):
        if i == 0:
            room["accessible"] = True
        else:
            room["accessible"] = rooms[i - 1]["mastery"] >= 0.7
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
    question_ids = [q.id for q in questions]

    # FIX: single bulk query instead of one per question
    correct_res = await db.execute(
        select(QuizAttempt.question_id)
        .where(
            QuizAttempt.user_id == current_user.id,
            QuizAttempt.is_correct == True,
            QuizAttempt.question_id.in_(question_ids),
        )
        .distinct()
    )
    correct_question_ids = {row[0] for row in correct_res.all()}

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
    """Get a topic summary with AI-generated key terms and definitions."""
    
    import re
    
    mat_result = await db.execute(
        select(Material).where(
            Material.id == material_id,
            Material.user_id == current_user.id,
        )
    )
    material = mat_result.scalar_one_or_none()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
    
    questions_result = await db.execute(
        select(Question).where(
            Question.material_id == material_id,
            Question.topic == topic,
            Question.user_id == current_user.id,
        )
    )
    questions = questions_result.scalars().all()
    question_ids = [q.id for q in questions]

    # FIX: single bulk query instead of one per question
    correct_res = await db.execute(
        select(QuizAttempt.question_id)
        .where(
            QuizAttempt.user_id == current_user.id,
            QuizAttempt.is_correct == True,
            QuizAttempt.question_id.in_(question_ids),
        )
        .distinct()
    )
    correct_ids = {row[0] for row in correct_res.all()}
    mastered_count = len(correct_ids)
    
    total_questions = len(questions)
    mastery_percentage = (mastered_count / total_questions * 100) if total_questions > 0 else 0
    
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
    
    cleaned = re.sub(r'\n\s*\n', '\n\n', raw_content)
    cleaned = re.sub(r'(?<![.!?])\n(?![0-9])', ' ', cleaned)
    cleaned = re.sub(r' +', ' ', cleaned)
    cleaned = re.sub(r' \.', '.', cleaned)
    cleaned = re.sub(r' ,', ',', cleaned)
    paragraphs = [p.strip() for p in cleaned.split('\n\n') if p.strip()]
    topic_content = '\n\n'.join(paragraphs[:4])
    
    key_terms = []
    ai_summary = ""
    try:
        from app.services.ai_service import generate_key_terms, generate_topic_summary
        key_terms = await generate_key_terms(raw_content, topic)
        ai_summary = await generate_topic_summary(raw_content, topic)
    except Exception as e:
        print(f"Error generating AI content: {e}")
    
    if not key_terms:
        key_terms = [
            {"term": topic, "definition": f"Core concept of {topic}"},
            {"term": "Key Principle", "definition": "Main idea to understand"},
            {"term": "Important Concept", "definition": "Critical knowledge point"},
        ]
    
    final_content = ai_summary if ai_summary else topic_content
    
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