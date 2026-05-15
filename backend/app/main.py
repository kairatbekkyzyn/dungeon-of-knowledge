import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from app.database import create_tables
from app.routers import auth_router, materials, quizzes, stats, dungeons, quests, social


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_tables()
    yield


app = FastAPI(
    title="ExamAI – Dungeon of Knowledge",
    version="2.0.0",
    lifespan=lifespan,
)

# Build allowed origins from env + local dev defaults
_frontend_url = os.getenv("FRONTEND_URL", "")
allowed_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
if _frontend_url:
    allowed_origins.append(_frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"https://.*\.vercel\.app",   # covers all Vercel preview URLs
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router, prefix="/api/auth",     tags=["Auth"])
app.include_router(materials.router,   prefix="/api/materials", tags=["Materials"])
app.include_router(quizzes.router,     prefix="/api/quizzes",   tags=["Quizzes"])
app.include_router(stats.router,       prefix="/api/stats",     tags=["Stats"])
app.include_router(dungeons.router,    prefix="/api/dungeons",  tags=["Dungeons"])
app.include_router(quests.router,      prefix="/api/quests",    tags=["Quests"])
app.include_router(social.router, prefix="/api/social", tags=["Social"])


@app.get("/")
async def root():
    return {"status": "ok", "service": "ExamAI Dungeon of Knowledge", "version": "2.0.0"}