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
