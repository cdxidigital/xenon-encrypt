from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import random
import string
import hashlib
import asyncio
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
import uuid
from datetime import datetime, timezone, timedelta


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Logging setup (must be before routes that use logger)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="Xenon Messenger Relay")
api_router = APIRouter(prefix="/api")

# -------------------- helpers --------------------

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def gen_xid() -> str:
    alphabet = string.ascii_uppercase + string.digits
    part1 = ''.join(random.choices(alphabet, k=4))
    part2 = ''.join(random.choices(alphabet, k=4))
    return f"XEN-{part1}-{part2}"

def gen_hexkey(n: int = 32) -> str:
    return ''.join(random.choices('0123456789ABCDEF', k=n))

def fingerprint_for(chat_id: str, participants: List[str]) -> str:
    base = '|'.join(sorted(participants)) + '::' + chat_id
    h = hashlib.sha256(base.encode()).hexdigest().upper()
    # format as 8 groups of 5 chars
    groups = [h[i:i+5] for i in range(0, 40, 5)]
    return ' '.join(groups)

# -------------------- models --------------------

class Identity(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    xid: str
    name: str
    avatar_seed: str = Field(default_factory=lambda: str(random.randint(1, 9999)))
    public_key: str = Field(default_factory=lambda: gen_hexkey(64))
    disposable: bool = False
    created_at: str = Field(default_factory=now_iso)

class CreateIdentityRequest(BaseModel):
    name: str
    disposable: bool = False

class Contact(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    owner_xid: str
    peer_xid: str
    peer_name: str
    verified: bool = False
    trust_score: int = 50
    fingerprint: str = ""
    created_at: str = Field(default_factory=now_iso)

class AddContactRequest(BaseModel):
    owner_xid: str
    peer_xid: str
    peer_name: Optional[str] = None

class Chat(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: Literal["direct", "group", "broadcast"] = "direct"
    name: Optional[str] = None
    participant_xids: List[str]
    created_by_xid: str
    vault: bool = False
    ghost: bool = False
    burn_seconds: Optional[int] = None
    decoy: bool = False
    last_message_preview: Optional[str] = None
    last_sender_xid: Optional[str] = None
    last_message_at: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)

class CreateChatRequest(BaseModel):
    type: Literal["direct", "group", "broadcast"] = "direct"
    name: Optional[str] = None
    participant_xids: List[str]
    created_by_xid: str

class UpdateChatRequest(BaseModel):
    vault: Optional[bool] = None
    ghost: Optional[bool] = None
    burn_seconds: Optional[int] = None
    decoy: Optional[bool] = None
    name: Optional[str] = None

class Message(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    chat_id: str
    sender_xid: str
    ciphertext: str  # base64 encoded simulated ciphertext
    content_type: Literal["text", "image", "audio", "file"] = "text"
    attachment_data: Optional[str] = None  # base64 for image/audio/file
    attachment_name: Optional[str] = None
    self_destruct_seconds: Optional[int] = None
    destroyed: bool = False
    delivered: bool = True
    read_by: List[str] = []
    created_at: str = Field(default_factory=now_iso)

class SendMessageRequest(BaseModel):
    chat_id: str
    sender_xid: str
    ciphertext: str
    content_type: Literal["text", "image", "audio", "file"] = "text"
    attachment_data: Optional[str] = None
    attachment_name: Optional[str] = None
    self_destruct_seconds: Optional[int] = None

class TypingRequest(BaseModel):
    chat_id: str
    xid: str
    typing: bool

class AISummarizeRequest(BaseModel):
    messages: List[dict]  # [{sender, text}]

class AISmartReplyRequest(BaseModel):
    messages: List[dict]

class PanicRequest(BaseModel):
    xid: str

# -------------------- routes --------------------

@api_router.get("/")
async def root():
    return {"service": "Xenon Messenger Relay", "status": "stateless-forwarding", "version": "1.0.0"}

# Identities
@api_router.post("/identities", response_model=Identity)
async def create_identity(req: CreateIdentityRequest):
    # ensure unique xid
    for _ in range(10):
        xid = gen_xid()
        existing = await db.identities.find_one({"xid": xid}, {"_id": 0})
        if not existing:
            break
    identity = Identity(xid=xid, name=req.name, disposable=req.disposable)
    await db.identities.insert_one(identity.model_dump())
    return identity

@api_router.get("/identities", response_model=List[Identity])
async def list_identities():
    docs = await db.identities.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [Identity(**d) for d in docs]

@api_router.get("/identities/{xid}", response_model=Identity)
async def get_identity(xid: str):
    doc = await db.identities.find_one({"xid": xid}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Identity not found")
    return Identity(**doc)

@api_router.delete("/identities/{xid}")
async def delete_identity(xid: str):
    await db.identities.delete_one({"xid": xid})
    await db.contacts.delete_many({"$or": [{"owner_xid": xid}, {"peer_xid": xid}]})
    await db.chats.delete_many({"participant_xids": xid})
    await db.messages.delete_many({"sender_xid": xid})
    return {"ok": True}

# Contacts
@api_router.post("/contacts", response_model=Contact)
async def add_contact(req: AddContactRequest):
    peer = await db.identities.find_one({"xid": req.peer_xid}, {"_id": 0})
    if not peer:
        raise HTTPException(status_code=404, detail="Peer XID not found")
    name = req.peer_name or peer["name"]
    existing = await db.contacts.find_one({"owner_xid": req.owner_xid, "peer_xid": req.peer_xid}, {"_id": 0})
    if existing:
        return Contact(**existing)
    fp = fingerprint_for(req.owner_xid + ":" + req.peer_xid, [req.owner_xid, req.peer_xid])
    contact = Contact(
        owner_xid=req.owner_xid,
        peer_xid=req.peer_xid,
        peer_name=name,
        fingerprint=fp,
        trust_score=random.randint(40, 95),
    )
    await db.contacts.insert_one(contact.model_dump())
    return contact

@api_router.get("/contacts", response_model=List[Contact])
async def list_contacts(owner_xid: str):
    docs = await db.contacts.find({"owner_xid": owner_xid}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [Contact(**d) for d in docs]

@api_router.post("/contacts/{contact_id}/verify")
async def verify_contact(contact_id: str):
    await db.contacts.update_one({"id": contact_id}, {"$set": {"verified": True, "trust_score": 100}})
    return {"ok": True}

# Chats
@api_router.post("/chats", response_model=Chat)
async def create_chat(req: CreateChatRequest):
    # For direct chats, ensure both participants exist
    for p in req.participant_xids:
        ident = await db.identities.find_one({"xid": p}, {"_id": 0})
        if not ident:
            raise HTTPException(status_code=404, detail=f"Participant {p} not found")
    # For direct, reuse existing chat
    if req.type == "direct" and len(req.participant_xids) == 2:
        existing = await db.chats.find_one({
            "type": "direct",
            "participant_xids": {"$all": req.participant_xids, "$size": 2},
        }, {"_id": 0})
        if existing:
            return Chat(**existing)
    chat = Chat(**req.model_dump())
    await db.chats.insert_one(chat.model_dump())
    return chat

@api_router.get("/chats", response_model=List[Chat])
async def list_chats(xid: str, include_vault: bool = False):
    query = {"participant_xids": xid}
    if not include_vault:
        query["vault"] = False
    docs = await db.chats.find(query, {"_id": 0}).sort("last_message_at", -1).to_list(500)
    # sort: last_message_at nulls last
    docs.sort(key=lambda d: d.get("last_message_at") or d.get("created_at") or "", reverse=True)
    return [Chat(**d) for d in docs]

@api_router.get("/chats/{chat_id}", response_model=Chat)
async def get_chat(chat_id: str):
    doc = await db.chats.find_one({"id": chat_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Chat not found")
    return Chat(**doc)

@api_router.patch("/chats/{chat_id}", response_model=Chat)
async def update_chat(chat_id: str, req: UpdateChatRequest):
    update = {k: v for k, v in req.model_dump().items() if v is not None}
    if update:
        await db.chats.update_one({"id": chat_id}, {"$set": update})
    doc = await db.chats.find_one({"id": chat_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Chat not found")
    return Chat(**doc)

@api_router.delete("/chats/{chat_id}")
async def delete_chat(chat_id: str):
    await db.chats.delete_one({"id": chat_id})
    await db.messages.delete_many({"chat_id": chat_id})
    return {"ok": True}

@api_router.get("/chats/{chat_id}/fingerprint")
async def chat_fingerprint(chat_id: str):
    doc = await db.chats.find_one({"id": chat_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Chat not found")
    fp = fingerprint_for(chat_id, doc["participant_xids"])
    return {"chat_id": chat_id, "fingerprint": fp, "participants": doc["participant_xids"]}

# Messages
@api_router.post("/messages", response_model=Message)
async def send_message(req: SendMessageRequest):
    chat = await db.chats.find_one({"id": req.chat_id}, {"_id": 0})
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    # apply burn_seconds from chat if not provided
    sds = req.self_destruct_seconds
    if sds is None and chat.get("burn_seconds"):
        sds = chat["burn_seconds"]
    msg = Message(
        chat_id=req.chat_id,
        sender_xid=req.sender_xid,
        ciphertext=req.ciphertext,
        content_type=req.content_type,
        attachment_data=req.attachment_data,
        attachment_name=req.attachment_name,
        self_destruct_seconds=sds,
    )
    await db.messages.insert_one(msg.model_dump())
    # update chat preview
    preview = req.ciphertext[:80]
    if req.content_type == "image":
        preview = "[encrypted image]"
    elif req.content_type == "audio":
        preview = "[encrypted voice note]"
    elif req.content_type == "file":
        preview = f"[file: {req.attachment_name or 'encrypted'}]"
    await db.chats.update_one(
        {"id": req.chat_id},
        {"$set": {
            "last_message_preview": preview,
            "last_sender_xid": req.sender_xid,
            "last_message_at": msg.created_at,
        }},
    )
    return msg

@api_router.get("/messages", response_model=List[Message])
async def list_messages(chat_id: str, since: Optional[str] = None, limit: int = 200):
    query = {"chat_id": chat_id}
    if since:
        query["created_at"] = {"$gt": since}
    docs = await db.messages.find(query, {"_id": 0}).sort("created_at", 1).to_list(limit)
    # purge self-destructed messages based on age
    now = datetime.now(timezone.utc)
    out: List[Message] = []
    for d in docs:
        sds = d.get("self_destruct_seconds")
        if sds and not d.get("destroyed"):
            try:
                created = datetime.fromisoformat(d["created_at"])
                if (now - created).total_seconds() > sds + 2:
                    await db.messages.update_one({"id": d["id"]}, {"$set": {"destroyed": True, "ciphertext": "", "attachment_data": None}})
                    d["destroyed"] = True
                    d["ciphertext"] = ""
                    d["attachment_data"] = None
            except Exception:
                pass
        out.append(Message(**d))
    return out

@api_router.post("/messages/{msg_id}/read")
async def mark_read(msg_id: str, xid: str):
    await db.messages.update_one(
        {"id": msg_id},
        {"$addToSet": {"read_by": xid}},
    )
    return {"ok": True}

@api_router.post("/messages/{msg_id}/destroy")
async def destroy_message(msg_id: str):
    await db.messages.update_one(
        {"id": msg_id},
        {"$set": {"destroyed": True, "ciphertext": "", "attachment_data": None}},
    )
    return {"ok": True}

# Typing indicators (in-memory)
_typing_state: dict = {}  # { chat_id: { xid: expires_epoch } }

@api_router.post("/typing")
async def set_typing(req: TypingRequest):
    import time as _t
    state = _typing_state.setdefault(req.chat_id, {})
    if req.typing:
        state[req.xid] = _t.time() + 4
    else:
        state.pop(req.xid, None)
    return {"ok": True}

@api_router.get("/typing")
async def get_typing(chat_id: str, exclude_xid: Optional[str] = None):
    import time as _t
    state = _typing_state.get(chat_id, {})
    now = _t.time()
    active = [x for x, exp in state.items() if exp > now and x != exclude_xid]
    return {"chat_id": chat_id, "typing_xids": active}

# Panic mode
@api_router.post("/panic")
async def panic(req: PanicRequest):
    # Wipe everything for this xid
    await db.identities.delete_one({"xid": req.xid})
    await db.contacts.delete_many({"$or": [{"owner_xid": req.xid}, {"peer_xid": req.xid}]})
    # For chats where user was, remove user; if direct or only participant, delete
    chats = await db.chats.find({"participant_xids": req.xid}, {"_id": 0}).to_list(500)
    for c in chats:
        remaining = [p for p in c["participant_xids"] if p != req.xid]
        if len(remaining) < 2 or c["type"] == "direct":
            await db.chats.delete_one({"id": c["id"]})
            await db.messages.delete_many({"chat_id": c["id"]})
        else:
            await db.chats.update_one({"id": c["id"]}, {"$set": {"participant_xids": remaining}})
    await db.messages.delete_many({"sender_xid": req.xid})
    return {"ok": True, "wiped": True}

# AI features
@api_router.post("/ai/summarize")
async def ai_summarize(req: AISummarizeRequest):
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="EMERGENT_LLM_KEY not configured")
        transcript = "\n".join([f"{m.get('sender','?')}: {m.get('text','')}" for m in req.messages[-40:]])
        chat = LlmChat(
            api_key=api_key,
            session_id=f"xenon-summary-{uuid.uuid4()}",
            system_message="You summarize private encrypted chats for the user's eyes only. Be concise, neutral, under 80 words. No preamble.",
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        resp = await chat.send_message(UserMessage(text=f"Summarize this conversation:\n\n{transcript}"))
        return {"summary": str(resp).strip()}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("AI summarize failed")
        return JSONResponse(status_code=500, content={"detail": f"AI summarize failed: {e}"})

@api_router.post("/ai/smart-reply")
async def ai_smart_reply(req: AISmartReplyRequest):
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="EMERGENT_LLM_KEY not configured")
        transcript = "\n".join([f"{m.get('sender','?')}: {m.get('text','')}" for m in req.messages[-10:]])
        chat = LlmChat(
            api_key=api_key,
            session_id=f"xenon-reply-{uuid.uuid4()}",
            system_message="You suggest 3 ultra-short smart replies (<=6 words each) for a private chat. Respond as a JSON array of 3 strings only. No extra text, no keys.",
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        resp = await chat.send_message(UserMessage(text=f"Last messages:\n{transcript}\n\nReturn ONLY a JSON array of 3 short replies."))
        text = str(resp).strip()
        import json
        import re
        # extract array
        m = re.search(r"\[.*\]", text, re.S)
        if m:
            try:
                arr = json.loads(m.group(0))
                arr = [str(x).strip() for x in arr if isinstance(x, (str, int, float))][:3]
                if arr:
                    return {"suggestions": arr}
            except Exception:
                pass
        # fallback: split by newline
        lines = [ln.strip("-•* \t\"'") for ln in text.splitlines() if ln.strip()]
        return {"suggestions": lines[:3] if lines else ["Got it", "Thanks", "On it"]}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("AI smart-reply failed")
        return JSONResponse(status_code=500, content={"detail": f"AI smart-reply failed: {e}"})

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
