from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, JSON, Text, Float
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


class User(Base):
    __tablename__ = "users"
    id               = Column(Integer, primary_key=True, index=True)
    email            = Column(String, unique=True, index=True, nullable=False)
    name             = Column(String, nullable=False)
    password_hash    = Column(String, nullable=False)
    is_verified      = Column(Boolean, default=False)
    otp_code         = Column(String, nullable=True)
    otp_expires_at   = Column(DateTime, nullable=True)
    xp               = Column(Integer, default=0)
    streak_days      = Column(Integer, default=0)
    last_active_date = Column(String, nullable=True)
    rank             = Column(String, default="Apprentice")
    created_at       = Column(DateTime, default=datetime.utcnow)

    materials    = relationship("Material",     back_populates="user",  cascade="all, delete")
    attempts     = relationship("QuizAttempt",  back_populates="user",  cascade="all, delete")
    user_badges  = relationship("UserBadge",    back_populates="user",  cascade="all, delete")
    masteries    = relationship("TopicMastery", back_populates="user",  cascade="all, delete")
    monster_log  = relationship("MonsterLog",   back_populates="user",  cascade="all, delete")
    daily_quests = relationship("DailyQuest",   back_populates="user",  cascade="all, delete")


class Material(Base):
    __tablename__ = "materials"
    id             = Column(Integer, primary_key=True, index=True)
    user_id        = Column(Integer, ForeignKey("users.id"), nullable=False)
    title          = Column(String, nullable=False)
    content        = Column(Text, nullable=False)
    question_count = Column(Integer, default=0)
    dungeon_order  = Column(Integer, default=0)
    created_at     = Column(DateTime, default=datetime.utcnow)

    user      = relationship("User",          back_populates="materials")
    questions = relationship("Question",      back_populates="material", cascade="all, delete")
    masteries = relationship("TopicMastery",  back_populates="material", cascade="all, delete")


class Question(Base):
    __tablename__ = "questions"
    id             = Column(Integer, primary_key=True, index=True)
    material_id    = Column(Integer, ForeignKey("materials.id"), nullable=False)
    user_id        = Column(Integer, ForeignKey("users.id"),     nullable=False)
    question_text  = Column(Text,    nullable=False)
    options        = Column(JSON,    nullable=False)
    correct_answer = Column(Integer, nullable=False)
    explanation    = Column(Text,    nullable=False)
    topic          = Column(String,  nullable=False)
    difficulty     = Column(Integer, default=1)
    question_type  = Column(String,  default="mcq", nullable=False)
    matching_pairs = Column(JSON,    nullable=True)
    created_at     = Column(DateTime, default=datetime.utcnow)

    material    = relationship("Material",    back_populates="questions")
    attempts    = relationship("QuizAttempt", back_populates="question", cascade="all, delete")
    monster_log = relationship("MonsterLog",  back_populates="question", cascade="all, delete")


class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"
    id              = Column(Integer, primary_key=True, index=True)
    user_id         = Column(Integer, ForeignKey("users.id"),     nullable=False)
    question_id     = Column(Integer, ForeignKey("questions.id"), nullable=False)
    selected_answer = Column(Integer, nullable=False)
    is_correct      = Column(Boolean, nullable=False)
    mode            = Column(String, default="adaptive")
    quiz_mode       = Column(String, default="normal", nullable=True)
    created_at      = Column(DateTime, default=datetime.utcnow)

    user     = relationship("User",     back_populates="attempts")
    question = relationship("Question", back_populates="attempts")


class TopicMastery(Base):
    __tablename__ = "topic_mastery"
    id          = Column(Integer, primary_key=True, index=True)
    user_id     = Column(Integer, ForeignKey("users.id"), nullable=False)
    material_id = Column(Integer, ForeignKey("materials.id"), nullable=False)
    topic       = Column(String, nullable=False)
    correct     = Column(Integer, default=0)  # Keep for backward compatibility
    total       = Column(Integer, default=0)  # Keep for backward compatibility
    mastered_questions = Column(Integer, default=0)  # NEW
    total_questions = Column(Integer, default=0)     # NEW
    mastery     = Column(Float, default=0.0)
    state       = Column(String, default="locked")   # NEW
    updated_at  = Column(DateTime, default=datetime.utcnow)

    user     = relationship("User",     back_populates="masteries")
    material = relationship("Material", back_populates="masteries")
    
class MonsterLog(Base):
    __tablename__ = "monster_log"
    id          = Column(Integer, primary_key=True, index=True)
    user_id     = Column(Integer, ForeignKey("users.id"),     nullable=False)
    question_id = Column(Integer, ForeignKey("questions.id"), nullable=False)
    times_wrong = Column(Integer, default=1)
    defeated    = Column(Boolean, default=False)
    last_seen   = Column(DateTime, default=datetime.utcnow)

    user     = relationship("User",     back_populates="monster_log")
    question = relationship("Question", back_populates="monster_log")


class DailyQuest(Base):
    __tablename__ = "daily_quests"
    id            = Column(Integer, primary_key=True, index=True)
    user_id       = Column(Integer, ForeignKey("users.id"), nullable=False)
    date          = Column(String, nullable=False)
    quest_type    = Column(String, nullable=False)
    description   = Column(String, nullable=False)
    target_value  = Column(Integer, default=10)
    current_value = Column(Integer, default=0)
    completed     = Column(Boolean, default=False)
    xp_reward     = Column(Integer, default=50)
    topic         = Column(String, nullable=True)

    user = relationship("User", back_populates="daily_quests")


class Badge(Base):
    __tablename__ = "badges"
    id          = Column(Integer, primary_key=True, index=True)
    key         = Column(String, unique=True, nullable=False)
    name        = Column(String, nullable=False)
    description = Column(String, nullable=False)
    icon        = Column(String, nullable=False)
    rarity      = Column(String, default="common")
    user_badges = relationship("UserBadge", back_populates="badge")


class UserBadge(Base):
    __tablename__ = "user_badges"
    id        = Column(Integer, primary_key=True, index=True)
    user_id   = Column(Integer, ForeignKey("users.id"),  nullable=False)
    badge_id  = Column(Integer, ForeignKey("badges.id"), nullable=False)
    earned_at = Column(DateTime, default=datetime.utcnow)
    user      = relationship("User",  back_populates="user_badges")
    badge     = relationship("Badge", back_populates="user_badges")

class Friendship(Base):
    """
    Bidirectional friend relationship.
    requester → addressee, status: pending | accepted | rejected
    """
    __tablename__ = "friendships"
    id           = Column(Integer, primary_key=True, index=True)
    requester_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    addressee_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status       = Column(String, default="pending")   # pending | accepted | rejected
    created_at   = Column(DateTime, default=datetime.utcnow)
    updated_at   = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
 
    requester = relationship("User", foreign_keys=[requester_id], backref="sent_requests")
    addressee = relationship("User", foreign_keys=[addressee_id], backref="received_requests")
 
 
class Competition(Base):
    """
    A timed head-to-head or group quiz competition.
    material_id: which dungeon/material is being tested (nullable = global)
    """
    __tablename__ = "competitions"
    id          = Column(Integer, primary_key=True, index=True)
    title       = Column(String, nullable=False)
    creator_id  = Column(Integer, ForeignKey("users.id"), nullable=False)
    material_id = Column(Integer, ForeignKey("materials.id"), nullable=True)
    status      = Column(String, default="open")       # open | active | finished
    max_players = Column(Integer, default=10)
    duration_s  = Column(Integer, default=300)         # 5-min default
    starts_at   = Column(DateTime, nullable=True)
    ended_at    = Column(DateTime, nullable=True)
    join_code = Column(String(8), unique=True, index=True, nullable=True)
    created_at  = Column(DateTime, default=datetime.utcnow)
 
    creator      = relationship("User", foreign_keys=[creator_id])
    material     = relationship("Material")
    participants = relationship("CompetitionParticipant", back_populates="competition", cascade="all, delete")

 
 
class CompetitionParticipant(Base):
    """Score snapshot for each user in a competition."""
    __tablename__ = "competition_participants"
    id             = Column(Integer, primary_key=True, index=True)
    competition_id = Column(Integer, ForeignKey("competitions.id"), nullable=False)
    user_id        = Column(Integer, ForeignKey("users.id"), nullable=False)
    score          = Column(Integer, default=0)          # correct answers
    total          = Column(Integer, default=0)          # questions answered
    xp_earned      = Column(Integer, default=0)
    finished_at    = Column(DateTime, nullable=True)
    joined_at      = Column(DateTime, default=datetime.utcnow)
 
    competition = relationship("Competition", back_populates="participants")
    user        = relationship("User", foreign_keys=[user_id])