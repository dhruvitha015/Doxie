from datetime import datetime, timedelta, timezone
import os
import re
import secrets
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

load_dotenv()
MONGODB_URI = os.getenv("MONGODB_URI", "")
MONGODB_DATABASE = os.getenv("MONGODB_DATABASE", "doxie")
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "")
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_FROM_NUMBER = os.getenv("TWILIO_FROM_NUMBER", "")
client = AsyncIOMotorClient(MONGODB_URI, serverSelectionTimeoutMS=5000) if MONGODB_URI else None
memory_orders: list[dict[str, Any]] = []

app = FastAPI(title="Doxie API", version="0.1.0")
allowed_origins = ["http://localhost:5173", "http://127.0.0.1:5173"] + [origin.strip() for origin in FRONTEND_ORIGIN.split(",") if origin.strip()]
app.add_middleware(CORSMiddleware, allow_origins=allowed_origins, allow_methods=["*"], allow_headers=["*"])


class ChatRequest(BaseModel):
    message: str
    files: list[dict[str, Any]] = Field(default_factory=list)
    paid: bool = False


class OrderRequest(BaseModel):
    mobile: str = Field(pattern=r"^\d{10}$")
    total: int = Field(ge=0)
    files: list[dict[str, Any]] = Field(min_length=1)


def local_reply(message: str, files: list[dict[str, Any]], paid: bool) -> str:
    text = message.lower()
    if paid:
        return "Your order is already paid. Show the pickup token in this chat at the counter."
    if re.search(r"price|cost|charge|rate|how much", text):
        return "I charge ₹3 per page for single-sided printing and ₹4 per page for double-sided printing. I’ll show the exact total before payment."
    if re.search(r"bulk|all together|multiple", text):
        return "Great, I’ll apply the same settings to all your files. You can still change any file before finalizing."
    if re.search(r"one by one|separate|individual|custom", text):
        return "Absolutely. I’ll keep each file separate so you can customize pages, copies, and sides."
    if re.search(r"delete|privacy|secure", text):
        return "Your files are private and scheduled for automatic deletion 24 hours after the order is created."
    return "I’m with you. Check the file settings below, then tell me when you’re ready to finalize the order." if files else "Tell me what you need printed, or upload your files to get started."


@app.on_event("startup")
async def create_indexes() -> None:
    if client:
        await client[MONGODB_DATABASE].orders.create_index("expires_at", expireAfterSeconds=0)


@app.on_event("shutdown")
async def close_database() -> None:
    if client:
        client.close()


@app.get("/api/health")
async def health() -> dict[str, str]:
    if not client:
        return {"status": "ok", "database": "memory"}
    await client.admin.command("ping")
    return {"status": "ok", "database": "mongodb"}


@app.post("/api/chat")
async def chat(request: ChatRequest) -> dict[str, str]:
    return {"reply": local_reply(request.message, request.files, request.paid)}


@app.post("/api/orders")
async def create_order(request: OrderRequest) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    order = {"token": f"DX-{secrets.randbelow(9000) + 1000}", "mobile": request.mobile, "total": request.total, "files": request.files, "status": "paid", "created_at": now, "expires_at": now + timedelta(hours=24)}
    if client:
        await client[MONGODB_DATABASE].orders.insert_one(order)
    else:
        memory_orders.append(order)
    sms_sent = await send_token_sms(request.mobile, order["token"])
    return {"token": order["token"], "status": order["status"], "sms": {"sent": sms_sent, "provider": "twilio" if sms_sent else "not_configured"}}


async def send_token_sms(mobile: str, token: str) -> bool:
    if not all((TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER)):
        return False
    from twilio.rest import Client
    Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN).messages.create(body=f"Doxie pickup token: {token}. Your files will be deleted after 24 hours.", from_=TWILIO_FROM_NUMBER, to=f"+91{mobile}")
    return True


@app.get("/api/orders/{token}")
async def get_order(token: str) -> dict[str, Any]:
    order = await client[MONGODB_DATABASE].orders.find_one({"token": token}, {"_id": 0}) if client else next((item for item in memory_orders if item["token"] == token), None)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order
