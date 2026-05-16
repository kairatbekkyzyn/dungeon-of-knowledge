import random
import json
from datetime import date
from collections import defaultdict
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional, Union, List
from app.database import get_db
from app.models import User, Question, QuizAttempt, Badge, UserBadge, Material
from app.schemas import QuestionOut, AnswerSubmit, AnswerResult, OpenAnswerSubmit, OpenAnswerResult, MatchingPair
from app.auth import get_current_user

router = APIRouter()

XP_CORRECT=10; XP_WRONG=2; XP_PERFECT_BONUS=30

BADGE_DEFS = [
    {"key":"first_answer","name":"First Step",    "icon":"🎯","description":"Answer your first question","rarity":"common"},
    {"key":"correct_10",  "name":"On a Roll",     "icon":"🔥","description":"Get 10 correct answers",    "rarity":"common"},
    {"key":"correct_50",  "name":"Scholar",        "icon":"📚","description":"Get 50 correct answers",   "rarity":"rare"},
    {"key":"streak_3",    "name":"Consistent",     "icon":"📅","description":"Study 3 days in a row",    "rarity":"common"},
    {"key":"streak_7",    "name":"Dedicated",      "icon":"⚡","description":"Study 7 days in a row",    "rarity":"rare"},
    {"key":"perfect_quiz","name":"Perfectionist",  "icon":"💎","description":"5 consecutive correct",    "rarity":"epic"},
    {"key":"attempts_100","name":"Exam Ready",     "icon":"🏆","description":"100 quiz attempts",        "rarity":"rare"},
]

RANK_THRESHOLDS = [("Apprentice",0),("Knight",500),("Wizard",1500),("Archmage",5000)]

def get_rank(xp: int) -> str:
    return next((r for r,t in reversed(RANK_THRESHOLDS) if xp >= t), "Apprentice")

# FIX: in-memory flag so we only seed badges once per process lifetime,
# not on every single request to /quizzes/next and /quizzes/badges.
_badges_seeded = False

async def ensure_badges(db):
    global _badges_seeded
    if _badges_seeded:
        return
    # FIX: single query to get all existing badge keys instead of 7 individual queries
    existing_res = await db.execute(select(Badge.key))
    existing_keys = {row[0] for row in existing_res.all()}
    for b in BADGE_DEFS:
        if b["key"] not in existing_keys:
            db.add(Badge(**b))
    await db.commit()
    _badges_seeded = True

async def check_badges(user, db, correct_total, attempt_total) -> list[str]:
    res = await db.execute(select(UserBadge,Badge).join(Badge).where(UserBadge.user_id==user.id))
    earned = {row.Badge.key for row in res.all()}
    conditions = {"first_answer":attempt_total>=1,"correct_10":correct_total>=10,
                  "correct_50":correct_total>=50,"streak_3":user.streak_days>=3,
                  "streak_7":user.streak_days>=7,"attempts_100":attempt_total>=100}

    keys_to_award = [key for key, met in conditions.items() if met and key not in earned]
    if not keys_to_award:
        return []

    # FIX: single bulk query for all badges to award instead of one query per badge
    badges_res = await db.execute(select(Badge).where(Badge.key.in_(keys_to_award)))
    badges_to_award = badges_res.scalars().all()

    new = []
    for badge in badges_to_award:
        db.add(UserBadge(user_id=user.id, badge_id=badge.id))
        new.append(badge.name)
    await db.commit()
    return new

def update_streak(user: User):
    today = date.today().isoformat()
    if user.last_active_date == today: return
    try:
        from datetime import date as dt
        prev = dt.fromisoformat(user.last_active_date) if user.last_active_date else None
        user.streak_days = (user.streak_days+1) if prev and (date.today()-prev).days==1 else 1
    except: user.streak_days = 1
    user.last_active_date = today


def _parse_options(options: Union[str, List, None]) -> List[str]:
    """Parse options from database (could be JSON string or already a list)"""
    if options is None:
        return []
    if isinstance(options, list):
        return options
    if isinstance(options, str):
        try:
            parsed = json.loads(options)
            if isinstance(parsed, list):
                return parsed
        except json.JSONDecodeError:
            pass
    return []


def _parse_matching_pairs(matching_pairs: Union[str, List, None]) -> Optional[List[MatchingPair]]:
    """Parse matching pairs from database (could be JSON string or already a list)"""
    if matching_pairs is None:
        return None
    if isinstance(matching_pairs, list):
        try:
            return [MatchingPair(**p) for p in matching_pairs if isinstance(p, dict)]
        except Exception:
            return None
    if isinstance(matching_pairs, str):
        try:
            parsed = json.loads(matching_pairs)
            if isinstance(parsed, list):
                return [MatchingPair(**p) for p in parsed if isinstance(p, dict)]
        except json.JSONDecodeError:
            pass
    return None


def _question_to_out(question: Question, material: Material | None) -> QuestionOut:
    """Convert a Question ORM object to QuestionOut schema."""
    options = _parse_options(question.options)
    pairs = _parse_matching_pairs(question.matching_pairs)
    return QuestionOut(
        id=question.id,
        question_text=question.question_text,
        options=options,
        topic=question.topic,
        material_title=material.title if material else None,
        question_type=question.question_type or "mcq",
        matching_pairs=pairs,
    )


@router.get("/next", response_model=QuestionOut)
async def get_next_question(
    material_id: Optional[int]=None,
    topic: Optional[str]=None,
    seen_ids: str = Query(default=""),
    review_mode: bool = Query(default=False),
    question_type: Optional[str] = Query(default=None),
    db: AsyncSession=Depends(get_db),
    current_user: User=Depends(get_current_user)
):
    await ensure_badges(db)  # now a near-zero-cost no-op after first call

    seen_id_list = [int(x) for x in seen_ids.split(",") if x.strip()] if seen_ids else []

    q_query = select(Question).where(Question.user_id==current_user.id)
    if material_id:
        q_query = q_query.where(Question.material_id==material_id)
    if topic:
        q_query = q_query.where(Question.topic==topic)
    if question_type:
        q_query = q_query.where(Question.question_type==question_type)

    result = await db.execute(q_query)
    questions = result.scalars().all()

    if not questions:
        raise HTTPException(status_code=404, detail="No questions found.")

    question_ids = [q.id for q in questions]

    # FIX: single bulk query to find all correctly answered question IDs
    # instead of one query per question in a loop
    correct_res = await db.execute(
        select(QuizAttempt.question_id)
        .where(
            QuizAttempt.user_id == current_user.id,
            QuizAttempt.is_correct == True,
            QuizAttempt.question_id.in_(question_ids),
        )
        .distinct()
    )
    permanently_correct = {row[0] for row in correct_res.all()}

    if review_mode:
        pool = [q for q in questions if q.id not in seen_id_list]
        if not pool:
            pool = list(questions)
    else:
        pool = [q for q in questions if q.id not in permanently_correct and q.id not in seen_id_list]
        if not pool and len(permanently_correct) < len(questions):
            pool = [q for q in questions if q.id not in permanently_correct]
        if not pool:
            pool = [q for q in questions if q.id not in seen_id_list]
            if not pool:
                pool = list(questions)

    if not pool:
        raise HTTPException(status_code=404, detail="No questions available.")

    a_result = await db.execute(
        select(QuizAttempt).where(QuizAttempt.user_id==current_user.id)
    )
    attempt_map: dict = defaultdict(lambda:{"total":0,"correct":0})
    for a in a_result.scalars().all():
        attempt_map[a.question_id]["total"]+=1
        if a.is_correct:
            attempt_map[a.question_id]["correct"]+=1

    def priority(q):
        s = attempt_map[q.id]
        if review_mode:
            if s["total"] == 0: return 1000.0
            return (1 - s["correct"] / s["total"]) * 100 + s["total"]
        else:
            if s["total"] == 0: return 1000.0
            if s["correct"] == 0: return 500.0 + s["total"]
            return (1 - s["correct"] / s["total"]) * 100

    sorted_pool = sorted(pool, key=priority, reverse=True)
    top_n = min(5, len(sorted_pool))
    question = random.choice(sorted_pool[:top_n])

    mat_res = await db.execute(select(Material).where(Material.id==question.material_id))
    material = mat_res.scalar_one_or_none()

    return _question_to_out(question, material)


@router.post("/answer", response_model=AnswerResult)
async def submit_answer(data: AnswerSubmit, db: AsyncSession=Depends(get_db),
                        current_user: User=Depends(get_current_user)):
    q_res = await db.execute(select(Question).where(Question.id==data.question_id, Question.user_id==current_user.id))
    question = q_res.scalar_one_or_none()
    if not question: raise HTTPException(status_code=404, detail="Question not found")

    existing_correct = await db.execute(
        select(QuizAttempt)
        .where(
            QuizAttempt.user_id == current_user.id,
            QuizAttempt.question_id == question.id,
            QuizAttempt.is_correct == True
        )
        .limit(1)
    )

    is_correct = data.selected_answer == question.correct_answer
    already_correct = existing_correct.first() is not None
    award_xp = not already_correct

    db.add(QuizAttempt(
        user_id=current_user.id, question_id=question.id,
        selected_answer=data.selected_answer, is_correct=is_correct,
        quiz_mode=data.quiz_mode or "normal",
    ))
    update_streak(current_user)

    xp_gained = 0
    if award_xp:
        xp_gained = XP_CORRECT if is_correct else XP_WRONG
        current_user.xp += xp_gained
        current_user.rank = get_rank(current_user.xp)

    await db.flush()

    tr = await db.execute(select(func.count(QuizAttempt.id)).where(QuizAttempt.user_id==current_user.id))
    total_att = tr.scalar() or 0
    cr = await db.execute(select(func.count(QuizAttempt.id)).where(
        QuizAttempt.user_id==current_user.id, QuizAttempt.is_correct==True
    ))
    correct_tot = cr.scalar() or 0

    if award_xp and is_correct:
        rr = await db.execute(select(QuizAttempt).where(QuizAttempt.user_id==current_user.id).order_by(QuizAttempt.created_at.desc()).limit(5))
        recent = rr.scalars().all()
        if len(recent)>=5 and all(a.is_correct for a in recent):
            current_user.xp+=XP_PERFECT_BONUS
            xp_gained+=XP_PERFECT_BONUS
            br = await db.execute(select(Badge).where(Badge.key=="perfect_quiz"))
            badge = br.scalar_one_or_none()
            if badge:
                ex = await db.execute(select(UserBadge).where(UserBadge.user_id==current_user.id, UserBadge.badge_id==badge.id))
                if not ex.scalar_one_or_none():
                    db.add(UserBadge(user_id=current_user.id, badge_id=badge.id))

    await db.commit()
    await db.refresh(current_user)
    new_badges = await check_badges(current_user, db, correct_tot, total_att)
    return AnswerResult(
        is_correct=is_correct,
        correct_answer=question.correct_answer,
        explanation=question.explanation,
        xp_gained=xp_gained,
        new_total_xp=current_user.xp,
        new_badges=new_badges,
    )


@router.post("/answer-open", response_model=OpenAnswerResult)
async def submit_open_answer(
    data: OpenAnswerSubmit,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """AI-judge an open-ended answer. Partial credit via 0.0–1.0 score."""
    from app.services.ai_service import judge_open_answer

    q_res = await db.execute(
        select(Question).where(Question.id == data.question_id, Question.user_id == current_user.id)
    )
    question = q_res.scalar_one_or_none()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    if question.question_type != "open_ended":
        raise HTTPException(status_code=400, detail="This endpoint is for open-ended questions only")

    options = _parse_options(question.options)
    model_answer = options[0] if options else question.explanation
    
    key_concepts: list = []
    if question.matching_pairs:
        pairs = _parse_matching_pairs(question.matching_pairs)
        if pairs:
            key_concepts = [p.term for p in pairs]

    judgment = await judge_open_answer(
        question_text=question.question_text,
        model_answer=model_answer,
        key_concepts=key_concepts,
        student_answer=data.answer_text,
        explanation=question.explanation,
    )

    is_correct = judgment.get("is_correct", False)
    score = float(judgment.get("score", 0.0))

    existing_correct = await db.execute(
        select(QuizAttempt)
        .where(
            QuizAttempt.user_id == current_user.id,
            QuizAttempt.question_id == question.id,
            QuizAttempt.is_correct == True,
        )
        .limit(1)
    )
    already_correct = existing_correct.first() is not None
    award_xp = not already_correct

    db.add(QuizAttempt(
        user_id=current_user.id,
        question_id=question.id,
        selected_answer=1 if is_correct else 0,
        is_correct=is_correct,
        quiz_mode=data.quiz_mode or "normal",
    ))
    update_streak(current_user)

    xp_gained = 0
    if award_xp:
        xp_gained = round(XP_CORRECT * score) if score > 0 else XP_WRONG
        current_user.xp += xp_gained
        current_user.rank = get_rank(current_user.xp)

    await db.flush()

    tr = await db.execute(select(func.count(QuizAttempt.id)).where(QuizAttempt.user_id == current_user.id))
    total_att = tr.scalar() or 0
    cr = await db.execute(select(func.count(QuizAttempt.id)).where(
        QuizAttempt.user_id == current_user.id, QuizAttempt.is_correct == True
    ))
    correct_tot = cr.scalar() or 0

    await db.commit()
    await db.refresh(current_user)
    new_badges = await check_badges(current_user, db, correct_tot, total_att)

    return OpenAnswerResult(
        is_correct=is_correct,
        score=score,
        feedback=judgment.get("feedback", ""),
        correct_answer=judgment.get("correct_answer", model_answer),
        explanation=question.explanation,
        xp_gained=xp_gained,
        new_total_xp=current_user.xp,
        new_badges=new_badges,
    )


@router.get("/badges")
async def get_badges(db: AsyncSession=Depends(get_db), current_user: User=Depends(get_current_user)):
    await ensure_badges(db)
    all_res = await db.execute(select(Badge))
    all_badges = all_res.scalars().all()
    earned_res = await db.execute(select(UserBadge).where(UserBadge.user_id==current_user.id))
    earned_map = {ub.badge_id: ub.earned_at for ub in earned_res.scalars().all()}
    return [{"key":b.key,"name":b.name,"description":b.description,"icon":b.icon,
             "rarity":b.rarity,"earned":b.id in earned_map,"earned_at":earned_map.get(b.id)}
            for b in all_badges]