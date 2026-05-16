from datetime import datetime
from typing import Optional
import secrets

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func, or_, and_, desc, Integer
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import (
    User, QuizAttempt, UserBadge, Badge,
    Competition, CompetitionParticipant, Friendship,
)

router = APIRouter()

class UserPublic(BaseModel):
    id: int
    name: str
    rank: str
    xp: int
    streak_days: int
    model_config = {"from_attributes": True}


class LeaderboardEntry(BaseModel):
    rank_position: int
    user_id: int
    name: str
    rank: str
    xp: int
    streak_days: int
    total_correct: int
    accuracy: float
    is_friend: bool = False
    is_me: bool = False


class FriendRequestOut(BaseModel):
    id: int
    requester_id: int
    requester_name: str
    addressee_id: int
    status: str
    created_at: datetime


class CompetitionOut(BaseModel):
    id: int
    title: str
    creator_id: int
    creator_name: str
    material_id: Optional[int]
    status: str
    max_players: int
    duration_s: int
    participant_count: int
    starts_at: Optional[datetime]
    created_at: datetime


class CompetitionCreate(BaseModel):
    title: str
    material_id: Optional[int] = None
    max_players: int = 10
    duration_s: int = 300


class ScoreSubmit(BaseModel):
    score: int
    total: int

class CompetitionParticipantOut(BaseModel):
    user_id: int
    name: str
    rank: str
    score: int
    total: int
    answered: int
    xp_earned: int
    finished_at: Optional[datetime] = None
    joined_at: datetime
    model_config = {"from_attributes": True}

class CompetitionAnswer(BaseModel):
    question_id: int
    is_correct: bool


# ─── Helpers ─────────────────────────────────────────────────

async def _friend_ids(db: AsyncSession, user_id: int) -> set[int]:
    """Return set of user_ids that are accepted friends of user_id."""
    result = await db.execute(
        select(Friendship).where(
            and_(
                Friendship.status == "accepted",
                or_(
                    Friendship.requester_id == user_id,
                    Friendship.addressee_id == user_id,
                )
            )
        )
    )
    friends = result.scalars().all()
    ids = set()
    for f in friends:
        ids.add(f.addressee_id if f.requester_id == user_id else f.requester_id)
    return ids


# ═══════════════════════════════════════════════════════════════
#  LEADERBOARD
# ═══════════════════════════════════════════════════════════════

@router.get("/leaderboard", response_model=list[LeaderboardEntry])
async def get_leaderboard(
    scope: str = Query("global", enum=["global", "friends"]),
    period: str = Query("all", enum=["all", "week"]),
    limit: int = Query(50, le=100),
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    friend_set = await _friend_ids(db, me.id)

    stmt = (
        select(
            User.id,
            User.name,
            User.rank,
            User.xp,
            User.streak_days,
            func.count(QuizAttempt.id).label("total_answers"),
            func.sum(
                func.cast(QuizAttempt.is_correct, Integer)
            ).label("correct_answers"),
        )
        .outerjoin(QuizAttempt, QuizAttempt.user_id == User.id)
        .where(User.is_verified == True)
        .group_by(User.id)
        .order_by(desc(User.xp), User.name, User.id)
        .limit(limit)
    )

    if scope == "friends":
        allowed = list(friend_set | {me.id})
        stmt = stmt.where(User.id.in_(allowed))

    result = await db.execute(stmt)
    rows = result.all()

    entries = []
    for pos, row in enumerate(rows, start=1):
        total   = row.total_answers or 0
        correct = int(row.correct_answers or 0)
        acc     = round(correct / total, 3) if total else 0.0
        entries.append(LeaderboardEntry(
            rank_position=pos,
            user_id=row.id,
            name=row.name,
            rank=row.rank,
            xp=row.xp,
            streak_days=row.streak_days,
            total_correct=correct,
            accuracy=acc,
            is_friend=(row.id in friend_set),
            is_me=(row.id == me.id),
        ))
    return entries


@router.get("/leaderboard/my-rank")
async def get_my_rank(
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    result = await db.execute(
        select(func.count(User.id)).where(
            and_(
                or_(
                    User.xp > me.xp,
                    and_(
                        User.xp == me.xp,
                        func.lower(User.name) < func.lower(me.name)
                    )
                ),
                User.is_verified == True
            )
        )
    )
    above = result.scalar() or 0
    return {"rank_position": above + 1, "xp": me.xp, "name": me.name}

@router.get("/profile/{user_id}")
async def get_public_profile(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    badge_res = await db.execute(
        select(Badge, UserBadge.earned_at)
        .join(UserBadge, UserBadge.badge_id == Badge.id)
        .where(UserBadge.user_id == user_id)
    )
    badges = [
        {"key": b.key, "name": b.name, "icon": b.icon,
         "rarity": b.rarity, "earned_at": str(ea)}
        for b, ea in badge_res.all()
    ]

    stats_res = await db.execute(
        select(
            func.count(QuizAttempt.id),
            func.sum(func.cast(QuizAttempt.is_correct, Integer))
        ).where(QuizAttempt.user_id == user_id)
    )
    total, correct = stats_res.one()
    total   = total   or 0
    correct = int(correct or 0)

    fs_res = await db.execute(
        select(Friendship).where(
            or_(
                and_(Friendship.requester_id == me.id, Friendship.addressee_id == user_id),
                and_(Friendship.requester_id == user_id, Friendship.addressee_id == me.id),
            )
        )
    )
    friendship = fs_res.scalar_one_or_none()

    return {
        "id": target.id,
        "name": target.name,
        "rank": target.rank,
        "xp": target.xp,
        "streak_days": target.streak_days,
        "created_at": str(target.created_at),
        "badges": badges,
        "total_attempts": total,
        "correct_attempts": correct,
        "accuracy": round(correct / total, 3) if total else 0.0,
        "friendship_status": friendship.status if friendship else None,
        "friendship_id": friendship.id if friendship else None,
        "is_me": (user_id == me.id),
    }


# ═══════════════════════════════════════════════════════════════
#  FRIENDS
# ═══════════════════════════════════════════════════════════════

@router.get("/friends", response_model=list[dict])
async def list_friends(
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Friendship).where(
            and_(
                Friendship.status == "accepted",
                or_(
                    Friendship.requester_id == me.id,
                    Friendship.addressee_id == me.id,
                )
            )
        )
    )
    friendships = result.scalars().all()
    friend_ids = [
        (f.addressee_id if f.requester_id == me.id else f.requester_id)
        for f in friendships
    ]
    if not friend_ids:
        return []

    users_res = await db.execute(select(User).where(User.id.in_(friend_ids)))
    users = {u.id: u for u in users_res.scalars().all()}

    return [
        {
            "id": uid,
            "name": users[uid].name,
            "rank": users[uid].rank,
            "xp": users[uid].xp,
            "streak_days": users[uid].streak_days,
        }
        for uid in friend_ids if uid in users
    ]


@router.get("/friends/requests")
async def list_pending_requests(
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    """Incoming pending friend requests."""
    result = await db.execute(
        select(Friendship).where(
            and_(
                Friendship.addressee_id == me.id,
                Friendship.status == "pending",
            )
        )
    )
    requests = result.scalars().all()
    if not requests:
        return []

    # FIX: single bulk query for all requesters instead of one per request
    requester_ids = [req.requester_id for req in requests]
    users_res = await db.execute(select(User).where(User.id.in_(requester_ids)))
    users = {u.id: u for u in users_res.scalars().all()}

    return [
        {
            "id": req.id,
            "requester_id": req.requester_id,
            "requester_name": users[req.requester_id].name if req.requester_id in users else "Unknown",
            "addressee_id": req.addressee_id,
            "status": req.status,
            "created_at": str(req.created_at),
        }
        for req in requests
    ]


@router.post("/friends/request/{addressee_id}")
async def send_friend_request(
    addressee_id: int,
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    if addressee_id == me.id:
        raise HTTPException(400, "Can't friend yourself")

    res = await db.execute(select(User).where(User.id == addressee_id))
    if not res.scalar_one_or_none():
        raise HTTPException(404, "User not found")

    existing = await db.execute(
        select(Friendship).where(
            or_(
                and_(Friendship.requester_id == me.id, Friendship.addressee_id == addressee_id),
                and_(Friendship.requester_id == addressee_id, Friendship.addressee_id == me.id),
            )
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(400, "Request already exists")

    f = Friendship(requester_id=me.id, addressee_id=addressee_id)
    db.add(f)
    await db.commit()
    return {"message": "Friend request sent"}


@router.post("/friends/respond/{friendship_id}")
async def respond_to_request(
    friendship_id: int,
    action: str = Query(..., enum=["accept", "reject"]),
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    res = await db.execute(select(Friendship).where(Friendship.id == friendship_id))
    f = res.scalar_one_or_none()
    if not f or f.addressee_id != me.id:
        raise HTTPException(404, "Request not found")
    f.status = "accepted" if action == "accept" else "rejected"
    f.updated_at = datetime.utcnow()
    await db.commit()
    return {"status": f.status}


@router.delete("/friends/{friend_id}")
async def remove_friend(
    friend_id: int,
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    res = await db.execute(
        select(Friendship).where(
            and_(
                Friendship.status == "accepted",
                or_(
                    and_(Friendship.requester_id == me.id, Friendship.addressee_id == friend_id),
                    and_(Friendship.requester_id == friend_id, Friendship.addressee_id == me.id),
                )
            )
        )
    )
    f = res.scalar_one_or_none()
    if not f:
        raise HTTPException(404, "Friendship not found")
    await db.delete(f)
    await db.commit()
    return {"message": "Unfriended"}


@router.get("/search")
async def search_users(
    q: str = Query(..., min_length=2),
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    result = await db.execute(
        select(User)
        .where(and_(User.name.ilike(f"%{q}%"), User.id != me.id, User.is_verified == True))  # noqa
        .limit(20)
    )
    users = result.scalars().all()
    friend_set = await _friend_ids(db, me.id)

    pending_res = await db.execute(
        select(Friendship).where(
            or_(
                Friendship.requester_id == me.id,
                Friendship.addressee_id == me.id,
            )
        )
    )
    pending = {
        (f.requester_id, f.addressee_id): f.status
        for f in pending_res.scalars().all()
    }

    def get_status(uid):
        k1 = (me.id, uid)
        k2 = (uid, me.id)
        if uid in friend_set:
            return "friends"
        if k1 in pending:
            return pending[k1]
        if k2 in pending:
            return pending[k2]
        return None

    return [
        {
            "id": u.id,
            "name": u.name,
            "rank": u.rank,
            "xp": u.xp,
            "friendship_status": get_status(u.id),
        }
        for u in users
    ]


# ═══════════════════════════════════════════════════════════════
#  COMPETITIONS
# ═══════════════════════════════════════════════════════════════

@router.get("/competitions", response_model=list[CompetitionOut])
async def list_competitions(
    status: str = Query("open", enum=["open", "active", "finished", "all"]),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    stmt = select(Competition)
    if status != "all":
        stmt = stmt.where(Competition.status == status)
    stmt = stmt.order_by(desc(Competition.created_at)).limit(30)
    result = await db.execute(stmt)
    comps = result.scalars().all()
    if not comps:
        return []

    # FIX: single query for all creator users instead of one per competition
    creator_ids = list({c.creator_id for c in comps})
    creators_res = await db.execute(select(User).where(User.id.in_(creator_ids)))
    creators = {u.id: u for u in creators_res.scalars().all()}

    # FIX: single query for participant counts instead of one per competition
    comp_ids = [c.id for c in comps]
    counts_res = await db.execute(
        select(CompetitionParticipant.competition_id, func.count(CompetitionParticipant.id))
        .where(CompetitionParticipant.competition_id.in_(comp_ids))
        .group_by(CompetitionParticipant.competition_id)
    )
    participant_counts = {row[0]: row[1] for row in counts_res.all()}

    out = []
    for c in comps:
        creator = creators.get(c.creator_id)
        out.append(CompetitionOut(
            id=c.id,
            title=c.title,
            creator_id=c.creator_id,
            creator_name=creator.name if creator else "?",
            material_id=c.material_id,
            status=c.status,
            max_players=c.max_players,
            duration_s=c.duration_s,
            participant_count=participant_counts.get(c.id, 0),
            starts_at=c.starts_at,
            created_at=c.created_at,
        ))
    return out


@router.post("/competitions", response_model=CompetitionOut)
async def create_competition(
    body: CompetitionCreate,
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    join_code = secrets.token_hex(4).upper()
    
    c = Competition(
        title=body.title,
        creator_id=me.id,
        material_id=body.material_id,
        max_players=body.max_players,
        duration_s=body.duration_s,
        join_code=join_code,
    )
    db.add(c)
    await db.flush()
    
    p = CompetitionParticipant(competition_id=c.id, user_id=me.id)
    db.add(p)
    await db.commit()
    await db.refresh(c)
    
    return {
        "id": c.id, 
        "title": c.title, 
        "creator_id": c.creator_id,
        "creator_name": me.name, 
        "material_id": c.material_id,
        "status": c.status, 
        "max_players": c.max_players,
        "duration_s": c.duration_s, 
        "participant_count": 1,
        "starts_at": c.starts_at, 
        "created_at": c.created_at,
        "join_code": join_code,
    }


@router.post("/competitions/{comp_id}/join")
async def join_competition(
    comp_id: int,
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    res = await db.execute(select(Competition).where(Competition.id == comp_id))
    c = res.scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Competition not found")
    if c.status != "open":
        raise HTTPException(400, "Competition is not open for joining")

    ep = await db.execute(
        select(CompetitionParticipant).where(
            and_(CompetitionParticipant.competition_id == comp_id,
                 CompetitionParticipant.user_id == me.id)
        )
    )
    if ep.scalar_one_or_none():
        raise HTTPException(400, "Already joined")

    count_res = await db.execute(
        select(func.count(CompetitionParticipant.id))
        .where(CompetitionParticipant.competition_id == comp_id)
    )
    if (count_res.scalar() or 0) >= c.max_players:
        raise HTTPException(400, "Competition is full")

    p = CompetitionParticipant(competition_id=comp_id, user_id=me.id)
    db.add(p)
    await db.commit()
    return {"message": "Joined!"}


@router.post("/competitions/{comp_id}/start")
async def start_competition(
    comp_id: int,
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    res = await db.execute(select(Competition).where(Competition.id == comp_id))
    c = res.scalar_one_or_none()
    if not c or c.creator_id != me.id:
        raise HTTPException(403, "Only creator can start")
    if c.status != "open":
        raise HTTPException(400, "Already started/finished")
    c.status = "active"
    c.starts_at = datetime.utcnow()
    await db.commit()
    return {"message": "Competition started!"}


@router.post("/competitions/{comp_id}/submit")
async def submit_score(
    comp_id: int,
    body: ScoreSubmit,
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    """Player submits their final score for the competition."""
    res = await db.execute(select(Competition).where(Competition.id == comp_id))
    c = res.scalar_one_or_none()
    if not c or c.status not in ("active", "open"):
        raise HTTPException(400, "Competition not active")

    ep = await db.execute(
        select(CompetitionParticipant).where(
            and_(CompetitionParticipant.competition_id == comp_id,
                 CompetitionParticipant.user_id == me.id)
        )
    )
    p = ep.scalar_one_or_none()
    if not p:
        raise HTTPException(400, "Not a participant")

    xp = body.score * 15
    p.score = body.score
    p.total = body.total
    p.xp_earned = xp
    p.finished_at = datetime.utcnow()

    me.xp += xp
    await db.commit()
    return {"xp_earned": xp, "score": body.score, "total": body.total}


@router.get("/competitions/{comp_id}/participants", response_model=list[CompetitionParticipantOut])
async def competition_participants(
    comp_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    res = await db.execute(select(Competition).where(Competition.id == comp_id))
    c = res.scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Competition not found")

    p_res = await db.execute(
        select(CompetitionParticipant)
        .where(CompetitionParticipant.competition_id == comp_id)
    )
    participants = p_res.scalars().all()
    if not participants:
        return []

    # FIX: single bulk query for all participant users instead of one per participant
    user_ids = [p.user_id for p in participants]
    users_res = await db.execute(select(User).where(User.id.in_(user_ids)))
    users = {u.id: u for u in users_res.scalars().all()}

    rows = []
    for p in participants:
        u = users.get(p.user_id)
        rows.append({
            "user_id": p.user_id,
            "name": u.name if u else "?",
            "rank": u.rank if u else "?",
            "score": p.score,
            "answered": p.total,
            "total": p.total,
            "xp_earned": p.xp_earned,
            "finished_at": p.finished_at,
            "joined_at": p.joined_at,
        })
    return rows


@router.post("/competitions/{comp_id}/answer")
async def record_competition_answer(
    comp_id: int,
    body: CompetitionAnswer,
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    res = await db.execute(select(Competition).where(Competition.id == comp_id))
    c = res.scalar_one_or_none()
    if not c or c.status != "active":
        raise HTTPException(400, "Competition is not active")

    ep = await db.execute(
        select(CompetitionParticipant).where(
            and_(CompetitionParticipant.competition_id == comp_id,
                 CompetitionParticipant.user_id == me.id)
        )
    )
    p = ep.scalar_one_or_none()
    if not p:
        raise HTTPException(400, "Not a participant")

    p.total += 1
    if body.is_correct:
        p.score += 1
    await db.commit()
    return {"score": p.score, "answered": p.total}


@router.get("/competitions/{comp_id}/results")
async def get_results(
    comp_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    res = await db.execute(select(Competition).where(Competition.id == comp_id))
    c = res.scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Not found")

    p_res = await db.execute(
        select(CompetitionParticipant)
        .where(CompetitionParticipant.competition_id == comp_id)
        .order_by(desc(CompetitionParticipant.score))
    )
    participants = p_res.scalars().all()

    # FIX: single bulk query for all result users instead of one per participant
    user_ids = [p.user_id for p in participants]
    users_res = await db.execute(select(User).where(User.id.in_(user_ids)))
    users = {u.id: u for u in users_res.scalars().all()}

    rows = []
    for pos, p in enumerate(participants, 1):
        u = users.get(p.user_id)
        rows.append({
            "position": pos,
            "user_id": p.user_id,
            "name": u.name if u else "?",
            "rank": u.rank if u else "?",
            "score": p.score,
            "total": p.total,
            "accuracy": round(p.score / p.total, 3) if p.total else 0.0,
            "xp_earned": p.xp_earned,
            "finished_at": str(p.finished_at) if p.finished_at else None,
        })
    return {"competition": {"id": c.id, "title": c.title, "status": c.status}, "results": rows}


@router.post("/competitions/join/{join_code}")
async def join_competition_by_code(
    join_code: str,
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    res = await db.execute(select(Competition).where(Competition.join_code == join_code))
    c = res.scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Competition not found")
    
    if c.status != "open":
        raise HTTPException(400, "Competition is not open for joining")
    
    ep = await db.execute(
        select(CompetitionParticipant).where(
            and_(CompetitionParticipant.competition_id == c.id,
                 CompetitionParticipant.user_id == me.id)
        )
    )
    if ep.scalar_one_or_none():
        raise HTTPException(400, "Already joined")
    
    count_res = await db.execute(
        select(func.count(CompetitionParticipant.id))
        .where(CompetitionParticipant.competition_id == c.id)
    )
    if (count_res.scalar() or 0) >= c.max_players:
        raise HTTPException(400, "Competition is full")
    
    p = CompetitionParticipant(competition_id=c.id, user_id=me.id)
    db.add(p)
    await db.commit()
    
    return {"message": "Joined!", "competition_id": c.id, "title": c.title}