# ExamAI — Deploy Guide (GitHub → Supabase → Render → Vercel)

---

## 1. Push to GitHub

```bash
cd examai          # this folder
git init
git add .
git commit -m "initial commit"
```

Go to **github.com → New repository** → name it `examai` → **Create**.

```bash
git remote add origin https://github.com/YOUR_USERNAME/examai.git
git branch -M main
git push -u origin main
```

---

## 2. Create Supabase Database

1. Go to **supabase.com** → New project (pick a region close to your users).
2. Wait ~1 min for it to provision.
3. Go to **Project Settings → Database → Connection string**.
4. Pick **"Transaction pooler"** tab → copy the URI, it looks like:
   ```
   postgresql://postgres.[ref]:[password]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
   ```
5. Keep this URI — you'll paste it into Render next.

> **Note:** Your app auto-creates all tables on first startup via `create_tables()`, so no manual SQL needed.

---

## 3. Deploy Backend on Render

1. Go to **render.com** → New → **Web Service**.
2. Connect your GitHub repo → select `examai`.
3. Settings:
   - **Root Directory:** `backend`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Region:** Same as Supabase for lowest latency
4. Under **Environment Variables**, add all of these:

| Key | Value |
|-----|-------|
| `DATABASE_URL` | Your Supabase Transaction pooler URI from step 2 |
| `SECRET_KEY` | Any long random string (e.g. `openssl rand -hex 32`) |
| `OPENAI_API_KEY` | Your Groq API key |
| `BREVO_API_KEY` | Your Brevo API key |
| `FROM_EMAIL` | `tansu001zz@gmail.com` |
| `GOOGLE_CLIENT_ID` | From your Google OAuth app |
| `GOOGLE_CLIENT_SECRET` | From your Google OAuth app |
| `GITHUB_CLIENT_ID` | From your GitHub OAuth app |
| `GITHUB_CLIENT_SECRET` | From your GitHub OAuth app |
| `BACKEND_URL` | `https://YOUR-APP.onrender.com` (fill after deploy) |
| `FRONTEND_URL` | `https://YOUR-APP.vercel.app` (fill after Vercel deploy) |

5. Click **Deploy** → wait ~3 min.
6. Test: open `https://YOUR-APP.onrender.com/` — should return `{"status":"ok"}`.

---

## 4. Deploy Frontend on Vercel

1. Go to **vercel.com** → New Project → Import your GitHub repo.
2. Settings:
   - **Framework Preset:** Vite
   - **Root Directory:** `frontend`
3. Under **Environment Variables**, add:

| Key | Value |
|-----|-------|
| `VITE_API_URL` | `https://YOUR-RENDER-APP.onrender.com` |

4. Click **Deploy** → wait ~1 min.
5. Copy your Vercel URL (e.g. `https://examai.vercel.app`).

---

## 5. Wire everything together

After both are deployed:

1. **Render → Environment → Edit** `FRONTEND_URL` → paste your Vercel URL → Save → Redeploy.
2. **Render → Environment → Edit** `BACKEND_URL` → paste your Render URL if not already set.
3. Update **Google OAuth** allowed redirect URIs to include your Render backend URL.
4. Update **GitHub OAuth** callback URL similarly.

---

## 6. Verify

- Open your Vercel URL → register an account → all features should work.
- Check Render logs if anything fails: **Dashboard → your service → Logs**.
- Check Supabase **Table Editor** — tables like `users`, `materials`, etc. will appear after first request.

---

## Local Development (after all this)

```bash
# Backend
cd backend
cp .env.example .env   # fill in your values
pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend
cd frontend
cp .env.example .env.local   # set VITE_API_URL=http://localhost:8000
npm install
npm run dev
```
