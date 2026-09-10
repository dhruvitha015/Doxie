# Doxie

Mobile-first print ordering chatbot for students.

## Run the frontend

```powershell
npm install
npm run dev
```

## Run the FastAPI backend

Create a virtual environment, install the backend dependencies, then start the API:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --port 8000
```

Copy `backend/.env.example` to `backend/.env` and set `MONGODB_URI` to a MongoDB Atlas or local MongoDB connection string. The API creates a TTL index on `expires_at`, so order records expire after 24 hours. Without a MongoDB URI, development orders use in-memory storage.

Set the Twilio variables in the same environment to send real pickup-token SMS messages. Without them, the API returns `sms.sent: false` while the frontend still completes mock payment.

The Vite dev server proxies `/api` requests to `http://127.0.0.1:8000`.

## Deploy With Render and MongoDB Atlas

1. In MongoDB Atlas, create a database user, create a database named `doxie`, and add Render's outbound access. For a quick first deployment, add `0.0.0.0/0` under **Network Access** and secure the database with a strong password.
2. Push this repository to GitHub.
3. In Render, create a **Web Service** for the backend:
	- Root directory: leave blank
	- Runtime: `Python 3`
	- Build command: `pip install -r backend/requirements.txt`
	- Start command: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
	- Environment variables: `MONGODB_URI`, `MONGODB_DATABASE=doxie`, `FRONTEND_ORIGIN` (set this after creating the frontend)
4. Copy the backend Render URL, for example `https://doxie-api.onrender.com`.
5. In Render, create a **Static Site** for the same GitHub repository:
	- Build command: `npm install && npm run build`
	- Publish directory: `dist`
	- Environment variable: `VITE_API_URL=https://doxie-api.onrender.com`
6. Copy the frontend Render URL into the backend's `FRONTEND_ORIGIN`, redeploy the backend, and open the frontend URL.
7. Test `https://your-backend.onrender.com/api/health`. It should return `{"status":"ok","database":"mongodb"}`.

Keep `backend/.env` local. Add MongoDB and Twilio values through Render's Environment settings, never in GitHub.
