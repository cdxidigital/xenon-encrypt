from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import secrets
import string
import hashlib
import asyncio
from pathlib import Path
from pydantic import BaseModel, Field, field_validator, model_validator
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


# Root + health endpoints (required for Kubernetes liveness/readiness probes)
@app.get("/")
async def root():
    return {"service": "Xenon Messenger Relay", "status": "ok"}


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}

# -------------------- helpers --------------------

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def gen_xid() -> str:
    alphabet = string.ascii_uppercase + string.digits
    part1 = ''.join(secrets.choice(alphabet) for _ in range(4))
    part2 = ''.join(secrets.choice(alphabet) for _ in range(4))
    return f"XEN-{part1}-{part2}"

def gen_hexkey(n: int = 32) -> str:
    return ''.join(secrets.choice('0123456789ABCDEF') for _ in range(n))

def fingerprint_for(chat_id: str, participants: List[str]) -> str:
    base = '|'.join(sorted(participants)) + '::' + chat_id
    h = hashlib.sha256(base.encode()).hexdigest().upper()
    # format as 8 groups of 5 chars
    groups = [h[i:i+5] for i in range(0, 40, 5)]
    return ' '.join(groups)



XID_RE = r"^XEN-[A-Z0-9]{4}-[A-Z0-9]{4}$"
MAX_CHAT_PARTICIPANTS = 128
MAX_CIPHERTEXT_BYTES = 64 * 1024
MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024
MAX_MESSAGE_LIMIT = 500


def require_xid(value: str) -> str:
    import re
    normalized = value.strip().upper()
    if not re.fullmatch(XID_RE, normalized):
        raise ValueError("XID must match XEN-XXXX-XXXX")
    return normalized


def require_non_empty(value: str, field_name: str, max_length: int) -> str:
    normalized = value.strip()
    if not normalized:
        raise ValueError(f"{field_name} cannot be empty")
    if len(normalized) > max_length:
        raise ValueError(f"{field_name} must be <= {max_length} characters")
    return normalized


def normalize_xid_param(value: str) -> str:
    try:
        return require_xid(value)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

# -------------------- models --------------------

class Identity(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    xid: str
    name: str
    avatar_seed: str = Field(default_factory=lambda: str(secrets.randbelow(9999) + 1))
    public_key: str = Field(default_factory=lambda: gen_hexkey(64))
    disposable: bool = False
    created_at: str = Field(default_factory=now_iso)

class CreateIdentityRequest(BaseModel):
    name: str
    disposable: bool = False

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        return require_non_empty(value, "name", 80)

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

    @field_validator("owner_xid", "peer_xid")
    @classmethod
    def validate_xids(cls, value: str) -> str:
        return require_xid(value)

    @field_validator("peer_name")
    @classmethod
    def validate_peer_name(cls, value: Optional[str]) -> Optional[str]:
        return None if value is None else require_non_empty(value, "peer_name", 80)

    @model_validator(mode="after")
    def validate_not_self(self):
        if self.owner_xid == self.peer_xid:
            raise ValueError("Cannot add yourself as a contact")
        return self

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

    @field_validator("created_by_xid")
    @classmethod
    def validate_creator(cls, value: str) -> str:
        return require_xid(value)

    @field_validator("participant_xids")
    @classmethod
    def validate_participants(cls, value: List[str]) -> List[str]:
        normalized = [require_xid(xid) for xid in value]
        if len(normalized) != len(set(normalized)):
            raise ValueError("participant_xids cannot contain duplicates")
        if len(normalized) > MAX_CHAT_PARTICIPANTS:
            raise ValueError(f"participant_xids cannot exceed {MAX_CHAT_PARTICIPANTS}")
        return normalized

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: Optional[str]) -> Optional[str]:
        return None if value is None else require_non_empty(value, "name", 100)

    @model_validator(mode="after")
    def validate_shape(self):
        if self.created_by_xid not in self.participant_xids:
            raise ValueError("created_by_xid must be included in participant_xids")
        if self.type == "direct" and len(self.participant_xids) != 2:
            raise ValueError("direct chats require exactly 2 participants")
        if self.type in {"group", "broadcast"} and len(self.participant_xids) < 2:
            raise ValueError(f"{self.type} chats require at least 2 participants")
        return self

class UpdateChatRequest(BaseModel):
    vault: Optional[bool] = None
    ghost: Optional[bool] = None
    burn_seconds: Optional[int] = None
    decoy: Optional[bool] = None
    name: Optional[str] = None

    @field_validator("burn_seconds")
    @classmethod
    def validate_burn_seconds(cls, value: Optional[int]) -> Optional[int]:
        if value is not None and (value < 1 or value > 604800):
            raise ValueError("burn_seconds must be between 1 and 604800")
        return value

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: Optional[str]) -> Optional[str]:
        return None if value is None else require_non_empty(value, "name", 100)

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

    @field_validator("sender_xid")
    @classmethod
    def validate_sender(cls, value: str) -> str:
        return require_xid(value)

    @field_validator("ciphertext")
    @classmethod
    def validate_ciphertext(cls, value: str) -> str:
        if not value:
            raise ValueError("ciphertext cannot be empty")
        if len(value.encode("utf-8")) > MAX_CIPHERTEXT_BYTES:
            raise ValueError("ciphertext exceeds maximum size")
        return value

    @field_validator("attachment_data")
    @classmethod
    def validate_attachment_data(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and len(value.encode("utf-8")) > MAX_ATTACHMENT_BYTES:
            raise ValueError("attachment_data exceeds maximum size")
        return value

    @field_validator("attachment_name")
    @classmethod
    def validate_attachment_name(cls, value: Optional[str]) -> Optional[str]:
        return None if value is None else require_non_empty(value, "attachment_name", 160)

    @field_validator("self_destruct_seconds")
    @classmethod
    def validate_self_destruct_seconds(cls, value: Optional[int]) -> Optional[int]:
        if value is not None and (value < 1 or value > 604800):
            raise ValueError("self_destruct_seconds must be between 1 and 604800")
        return value

class TypingRequest(BaseModel):
    chat_id: str
    xid: str
    typing: bool

    @field_validator("xid")
    @classmethod
    def validate_xid(cls, value: str) -> str:
        return require_xid(value)

class AISummarizeRequest(BaseModel):
    messages: List[dict]  # [{sender, text}]

class AISmartReplyRequest(BaseModel):
    messages: List[dict]

class PanicRequest(BaseModel):
    xid: str

    @field_validator("xid")
    @classmethod
    def validate_xid(cls, value: str) -> str:
        return require_xid(value)

# -------------------- routes --------------------

@api_router.get("/")
async def api_root():
    return {"service": "Xenon Messenger Relay", "status": "stateless-forwarding", "version": "1.0.0"}

# Identities
@api_router.post("/identities", response_model=Identity)
async def create_identity(req: CreateIdentityRequest):
    # ensure unique xid
    for _ in range(10):
        xid = gen_xid()
        existing = await db.identities.find_one({"xid": xid}, {"_id": 0})
        if not existing:
            identity = Identity(xid=xid, name=req.name, disposable=req.disposable)
            await db.identities.insert_one(identity.model_dump())
            return identity
    raise HTTPException(status_code=503, detail="Unable to allocate unique XID")


@api_router.get("/identities", response_model=List[Identity])
async def list_identities():
    docs = await db.identities.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [Identity(**d) for d in docs]

@api_router.get("/identities/{xid}", response_model=Identity)
async def get_identity(xid: str):
    xid = normalize_xid_param(xid)
    doc = await db.identities.find_one({"xid": xid}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Identity not found")
    return Identity(**doc)

@api_router.delete("/identities/{xid}")
async def delete_identity(xid: str):
    xid = normalize_xid_param(xid)
    await db.identities.delete_one({"xid": xid})
    await db.contacts.delete_many({"$or": [{"owner_xid": xid}, {"peer_xid": xid}]})
    await db.chats.delete_many({"participant_xids": xid})
    await db.messages.delete_many({"sender_xid": xid})
    return {"ok": True}

# Contacts
@api_router.post("/contacts", response_model=Contact)
async def add_contact(req: AddContactRequest):
    owner = await db.identities.find_one({"xid": req.owner_xid}, {"_id": 0})
    if not owner:
        raise HTTPException(status_code=404, detail="Owner XID not found")
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
        trust_score=40 + secrets.randbelow(56),
    )
    await db.contacts.insert_one(contact.model_dump())
    return contact

@api_router.get("/contacts", response_model=List[Contact])
async def list_contacts(owner_xid: str):
    owner_xid = normalize_xid_param(owner_xid)
    docs = await db.contacts.find({"owner_xid": owner_xid}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [Contact(**d) for d in docs]

@api_router.post("/contacts/{contact_id}/verify")
async def verify_contact(contact_id: str):
    await db.contacts.update_one({"id": contact_id}, {"$set": {"verified": True, "trust_score": 100}})
    return {"ok": True}

# Chats
@api_router.post("/chats", response_model=Chat)
async def create_chat(req: CreateChatRequest):
    # Batch-validate all participants in a single query
    if req.participant_xids:
        found = await db.identities.find(
            {"xid": {"$in": req.participant_xids}}, {"_id": 0, "xid": 1}
        ).to_list(len(req.participant_xids))
        found_xids = {d["xid"] for d in found}
        missing = [p for p in req.participant_xids if p not in found_xids]
        if missing:
            raise HTTPException(status_code=404, detail=f"Participant {missing[0]} not found")
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
    xid = normalize_xid_param(xid)
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
    if req.sender_xid not in chat.get("participant_xids", []):
        raise HTTPException(status_code=403, detail="Sender is not a chat participant")
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
    bounded_limit = min(max(limit, 1), MAX_MESSAGE_LIMIT)
    query = {"chat_id": chat_id}
    if since:
        query["created_at"] = {"$gt": since}
    docs = await db.messages.find(query, {"_id": 0}).sort("created_at", 1).to_list(bounded_limit)
    # Identify self-destructed messages and batch-update them
    now = datetime.now(timezone.utc)
    expired_ids: List[str] = []
    for d in docs:
        sds = d.get("self_destruct_seconds")
        if sds and not d.get("destroyed"):
            try:
                created = datetime.fromisoformat(d["created_at"])
                if (now - created).total_seconds() > sds + 2:
                    expired_ids.append(d["id"])
                    d["destroyed"] = True
                    d["ciphertext"] = ""
                    d["attachment_data"] = None
            except Exception:
                pass
    if expired_ids:
        await db.messages.update_many(
            {"id": {"$in": expired_ids}},
            {"$set": {"destroyed": True, "ciphertext": "", "attachment_data": None}},
        )
    return [Message(**d) for d in docs]

@api_router.post("/messages/{msg_id}/read")
async def mark_read(msg_id: str, xid: str):
    xid = normalize_xid_param(xid)
    msg = await db.messages.find_one({"id": msg_id}, {"_id": 0})
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    chat = await db.chats.find_one({"id": msg["chat_id"]}, {"_id": 0, "participant_xids": 1})
    if not chat or xid not in chat.get("participant_xids", []):
        raise HTTPException(status_code=403, detail="Reader is not a chat participant")
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
    chat = await db.chats.find_one({"id": req.chat_id}, {"_id": 0, "participant_xids": 1})
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    if req.xid not in chat.get("participant_xids", []):
        raise HTTPException(status_code=403, detail="Typer is not a chat participant")
    import time as _t
    state = _typing_state.setdefault(req.chat_id, {})
    if req.typing:
        state[req.xid] = _t.time() + 4
    else:
        state.pop(req.xid, None)
    return {"ok": True}

@api_router.get("/typing")
async def get_typing(chat_id: str, exclude_xid: Optional[str] = None):
    if exclude_xid is not None:
        exclude_xid = normalize_xid_param(exclude_xid)
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
    delete_ids: List[str] = []
    for c in chats:
        remaining = [p for p in c["participant_xids"] if p != req.xid]
        if len(remaining) < 2 or c["type"] == "direct":
            delete_ids.append(c["id"])
        else:
            await db.chats.update_one({"id": c["id"]}, {"$set": {"participant_xids": remaining}})
    if delete_ids:
        await db.chats.delete_many({"id": {"$in": delete_ids}})
        await db.messages.delete_many({"chat_id": {"$in": delete_ids}})
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
