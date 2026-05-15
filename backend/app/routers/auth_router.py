from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models import User
from app.schemas import UserRegister, UserLogin, OTPVerify, OTPResend, Token, UserOut
from app.auth import hash_password, verify_password, create_access_token, get_current_user
from app.services.email_service import generate_otp, send_otp_email

router = APIRouter()

@router.post("/register")
async def register(data: UserRegister, db: AsyncSession = Depends(get_db)):
    result   = await db.execute(select(User).where(User.email == data.email.lower().strip()))
    existing = result.scalar_one_or_none()
    otp_code, otp_expires = generate_otp()
    if existing:
        if existing.is_verified:
            raise HTTPException(status_code=400, detail="Email already registered. Please sign in.")
        existing.otp_code=otp_code; existing.otp_expires_at=otp_expires
        existing.password_hash=hash_password(data.password); existing.name=data.name
        await db.commit()
        send_otp_email(data.email, data.name, otp_code)
        return {"message":"Verification code sent.", "email":data.email}
    user = User(email=data.email.lower().strip(), name=data.name,
                password_hash=hash_password(data.password),
                is_verified=False, otp_code=otp_code, otp_expires_at=otp_expires)
    db.add(user); await db.commit()
    send_otp_email(data.email, data.name, otp_code)
    return {"message":"Verification code sent.", "email":data.email}

@router.post("/verify-otp", response_model=Token)
async def verify_otp(data: OTPVerify, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email.lower().strip()))
    user   = result.scalar_one_or_none()
    if not user: raise HTTPException(status_code=404, detail="Account not found.")
    if user.is_verified: raise HTTPException(status_code=400, detail="Already verified.")
    if user.otp_code != data.code: raise HTTPException(status_code=400, detail="Invalid code.")
    if user.otp_expires_at and datetime.utcnow() > user.otp_expires_at:
        raise HTTPException(status_code=400, detail="Code expired. Request a new one.")
    user.is_verified=True; user.otp_code=None; user.otp_expires_at=None
    await db.commit()
    return {"access_token":create_access_token(user.id), "token_type":"bearer"}

@router.post("/resend-otp")
async def resend_otp(data: OTPResend, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email.lower().strip()))
    user   = result.scalar_one_or_none()
    if not user: raise HTTPException(status_code=404, detail="Account not found.")
    if user.is_verified: raise HTTPException(status_code=400, detail="Already verified.")
    otp_code, otp_expires = generate_otp()
    user.otp_code=otp_code; user.otp_expires_at=otp_expires
    await db.commit()
    send_otp_email(user.email, user.name, otp_code)
    return {"message":"New code sent."}

@router.post("/login", response_model=Token)
async def login(data: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email.lower().strip()))
    user   = result.scalar_one_or_none()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    if not user.is_verified:
        raise HTTPException(status_code=403, detail="Please verify your email first.")
    return {"access_token":create_access_token(user.id), "token_type":"bearer"}

@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user