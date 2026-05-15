import json
import os
import random
from datetime import datetime, timedelta
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

def generate_otp():
    """Generate a 6-digit OTP code and its expiration time (10 minutes from now)."""
    otp_code = str(random.randint(100000, 999999))
    otp_expires = datetime.utcnow() + timedelta(minutes=10)
    return otp_code, otp_expires

BREVO_API_KEY = os.getenv("BREVO_API_KEY")
FROM_EMAIL = os.getenv("FROM_EMAIL", "noreply@example.com")

def send_otp_email(email: str, name: str, otp_code: str):
    """Send OTP email using Brevo / Sendinblue SMTP API."""
    if not BREVO_API_KEY:
        print(f"[OTP] No BREVO_API_KEY configured. OTP for {email}: {otp_code}")
        return

    payload = {
        "sender": {"name": "ExamAI", "email": FROM_EMAIL},
        "to": [{"email": email, "name": name}],
        "subject": "Your ExamAI verification code",
        "textContent": (
            f"Hello {name},\n\n"
            f"Your ExamAI verification code is: {otp_code}\n\n"
            "Enter this code in the app to verify your email."
        ),
        "htmlContent": (
            f"<p>Hello {name},</p>"
            f"<p>Your ExamAI verification code is: <strong>{otp_code}</strong></p>"
            "<p>Enter this code in the app to verify your email.</p>"
        ),
    }

    request = Request(
        "https://api.brevo.com/v3/smtp/email",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "api-key": BREVO_API_KEY,
        },
        method="POST",
    )

    try:
        with urlopen(request) as response:
            response.read()
    except HTTPError as exc:
        print(f"[OTP] Brevo HTTP error: {exc.code} {exc.reason}")
    except URLError as exc:
        print(f"[OTP] Brevo URL error: {exc.reason}")