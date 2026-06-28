"""
Humanity Coin — FastAPI mirror of the PHP backend.

The deliverable is PHP + MySQL (see /app/dist/humanity-coin/). This module simply
mirrors the same endpoint surface against MongoDB so the React app can run in the
Emergent live-preview environment that ships with FastAPI + Mongo.
"""
from __future__ import annotations
import os, time, asyncio, secrets, hashlib, hmac, base64, json, logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional, List

from fastapi import FastAPI, APIRouter, HTTPException, Header, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import bcrypt
import httpx

# ---- env ----
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME   = os.environ["DB_NAME"]
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

ADMIN_DEFAULT_PASSWORD = "humanity-admin-2026"
MARKETING_WALLET       = "0x1eE7dD9BCfbB335a34181275a50af4C92D4851F1"

logger = logging.getLogger("humanity_coin")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

app = FastAPI(title="Humanity Coin API")
api = APIRouter(prefix="/api")

# ---------- settings helpers (Mongo doc per key) ----------
DEFAULTS: dict[str, Any] = {
    "claim_amount": 10,
    "claim_interval_seconds": 86400,
    "referral_bonus": 5,
    "claim_enabled": 1,
    "chain_id": 56,
    "chain_name": "BNB Smart Chain",
    "rpc_url": "https://bsc-dataseed.binance.org/",
    "explorer_url": "https://bscscan.com",
    "contract_address": "",
    "marketing_wallet": MARKETING_WALLET,
    "hero_title": "Earn Humanity Coin every day. Build a kinder economy.",
    "hero_subtitle": "Connect your wallet, claim your daily HUMAN, and invite friends to grow the movement.",
    "about_title": "What is Humanity Coin?",
    "about_text": "Humanity Coin (HUMAN) is a community-driven BEP-20 token rewarding everyday people for showing up. 5% of supply funds the daily claim treasury — yours, simply for being human.",
    "footer_note": "Humanity Coin is an experimental community token. Nothing here is financial advice.",
    "campaign_active": 0,
    "campaign_title": "",
    "campaign_message": "",
    "campaign_cta_label": "",
    "campaign_cta_url": "",
    "social_facebook": "",
    "social_x": "",
    "social_instagram": "",
    "social_tiktok": "",
}

async def get_setting(key: str, default: Any = None) -> Any:
    doc = await db.settings.find_one({"_id": key})
    if doc is None: return default if default is not None else DEFAULTS.get(key, None)
    return doc.get("v")

async def set_setting(key: str, value: Any) -> None:
    await db.settings.update_one({"_id": key}, {"$set": {"v": value}}, upsert=True)

async def all_settings() -> dict:
    out: dict[str, Any] = {}
    async for doc in db.settings.find({}):
        out[doc["_id"]] = doc.get("v")
    return out

async def ensure_seed():
    existing = await all_settings()
    for k, v in DEFAULTS.items():
        if k not in existing: await set_setting(k, v)
    if "admin_password_hash" not in existing:
        h = bcrypt.hashpw(ADMIN_DEFAULT_PASSWORD.encode(), bcrypt.gensalt()).decode()
        await set_setting("admin_password_hash", h)
    if "jwt_secret" not in existing:
        await set_setting("jwt_secret", secrets.token_hex(32))

# ---------- JWT (HS256, same scheme as the PHP backend) ----------
def _b64u(b: bytes) -> str: return base64.urlsafe_b64encode(b).rstrip(b"=").decode()
def _b64u_dec(s: str) -> bytes:
    pad = "=" * (-len(s) % 4); return base64.urlsafe_b64decode(s + pad)

def jwt_sign(payload: dict, secret: str, ttl: int = 12 * 3600) -> str:
    payload = {**payload, "iat": int(time.time()), "exp": int(time.time()) + ttl}
    header_b = _b64u(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    body_b   = _b64u(json.dumps(payload, separators=(",", ":")).encode())
    sig      = _b64u(hmac.new(secret.encode(), f"{header_b}.{body_b}".encode(), hashlib.sha256).digest())
    return f"{header_b}.{body_b}.{sig}"

def jwt_verify(token: str, secret: str) -> Optional[dict]:
    try:
        h, b, s = token.split(".")
        exp = _b64u(hmac.new(secret.encode(), f"{h}.{b}".encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(exp, s): return None
        payload = json.loads(_b64u_dec(b))
        if payload.get("exp", 0) < int(time.time()): return None
        return payload
    except Exception:
        return None

async def require_admin(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="unauthorized")
    secret = await get_setting("jwt_secret")
    p = jwt_verify(authorization.split(None, 1)[1].strip(), secret or "")
    if not p or p.get("role") != "admin":
        raise HTTPException(status_code=401, detail="unauthorized")
    return p

# ---------- utilities ----------
import re
_ADDR_RX = re.compile(r"^0x[a-fA-F0-9]{40}$")
def is_addr(a: Optional[str]) -> bool: return bool(a) and bool(_ADDR_RX.match(a))
def norm(a: str) -> str: return a.lower()
def iso(dt: datetime) -> str: return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
def now() -> datetime: return datetime.now(timezone.utc)

# ---------- public routes ----------
@api.get("/")
async def health(): return {"name": "Humanity Coin API", "version": "1.0.0", "time": iso(now())}

@api.get("/config")
async def config():
    s = await all_settings()
    g = lambda k, d=None: s.get(k, DEFAULTS.get(k, d))
    return {
        "token": {
            "name": "Humanity Coin", "symbol": "HUMAN", "decimals": 18,
            "chain_id": int(g("chain_id", 56)),
            "chain_name": g("chain_name", "BNB Smart Chain"),
            "rpc_url": g("rpc_url"),
            "explorer_url": g("explorer_url"),
            "contract_address": g("contract_address", ""),
            "marketing_wallet": g("marketing_wallet", MARKETING_WALLET),
        },
        "claim": {
            "amount": float(g("claim_amount", 10)),
            "interval_seconds": int(g("claim_interval_seconds", 86400)),
            "referral_bonus": float(g("referral_bonus", 5)),
            "enabled": int(g("claim_enabled", 1)) == 1,
        },
        "content": {k: g(k) for k in ("hero_title","hero_subtitle","about_title","about_text","footer_note")},
        "campaign": {
            "active": int(g("campaign_active", 0)) == 1,
            "title": g("campaign_title", ""), "message": g("campaign_message", ""),
            "cta_label": g("campaign_cta_label", ""), "cta_url": g("campaign_cta_url", ""),
        },
        "social": {k: g(f"social_{k}", "") for k in ("facebook","x","instagram","tiktok")},
    }

class ClaimIn(BaseModel):
    address: str
    referrer: Optional[str] = ""

@api.post("/claim")
async def claim(body: ClaimIn):
    if not is_addr(body.address): raise HTTPException(400, "invalid_address")
    if body.referrer and not is_addr(body.referrer): raise HTTPException(400, "invalid_referrer")
    addr = norm(body.address); ref = norm(body.referrer) if body.referrer else ""
    if ref == addr: ref = ""

    enabled = int(await get_setting("claim_enabled", 1))
    if enabled != 1: raise HTTPException(403, "claim_disabled")

    amount    = float(await get_setting("claim_amount", 10))
    cooldown  = int(await get_setting("claim_interval_seconds", 86400))
    ref_bonus = float(await get_setting("referral_bonus", 5))

    w = await db.wallets.find_one({"_id": addr})
    last = w.get("last_claim_at") if w else None
    last_ts = int(datetime.fromisoformat(last.replace("Z","+00:00")).timestamp()) if isinstance(last, str) and last else 0
    now_ts = int(now().timestamp())
    if last_ts and (now_ts - last_ts) < cooldown:
        return _err_resp(429, "cooldown", {
            "next_claim_at": iso(datetime.fromtimestamp(last_ts + cooldown, tz=timezone.utc)),
            "seconds_left":  (last_ts + cooldown) - now_ts,
        })

    # upsert wallet defaults
    base = {"total_claimed":0,"total_referrals":0,"total_referral_bonus":0,"pending_balance":0,"credited_balance":0,
            "last_claim_at": None, "created_at": iso(now())}
    if not w:
        await db.wallets.insert_one({"_id": addr, **base})

    # record claim doc
    claim_doc = {
        "wallet_address": addr, "amount": amount, "status": "pending",
        "tx_hash": None, "claimed_at": iso(now()), "credited_at": None,
        "_seq": await _next_seq("claims"),
    }
    r = await db.claims.insert_one(claim_doc)
    claim_id = claim_doc["_seq"]

    # update wallet tallies
    await db.wallets.update_one({"_id": addr}, {
        "$set": {"last_claim_at": iso(now())},
        "$inc": {"total_claimed": amount, "pending_balance": amount},
    })

    # referral (only on first claim and only if no existing referral for this referee)
    if ref:
        already = await db.claims.count_documents({"wallet_address": addr, "_id": {"$ne": r.inserted_id}})
        existing_ref = await db.referrals.find_one({"referee_address": addr})
        if already == 0 and not existing_ref:
            await db.wallets.update_one({"_id": ref}, {"$setOnInsert": {**base}}, upsert=True)
            await db.referrals.insert_one({
                "referrer_address": ref, "referee_address": addr, "bonus_amount": ref_bonus,
                "status": "pending", "created_at": iso(now()),
                "_seq": await _next_seq("referrals"),
            })
            await db.wallets.update_one({"_id": ref}, {"$inc": {
                "total_referrals": 1, "total_referral_bonus": ref_bonus, "pending_balance": ref_bonus,
            }})

    return {
        "ok": True, "claim_id": claim_id, "address": addr, "amount": amount, "status": "pending",
        "next_claim_at": iso(datetime.fromtimestamp(now_ts + cooldown, tz=timezone.utc)),
    }

async def _next_seq(coll: str) -> int:
    doc = await db.counters.find_one_and_update(
        {"_id": coll}, {"$inc": {"seq": 1}}, upsert=True, return_document=True
    )
    if not doc: doc = await db.counters.find_one({"_id": coll})
    return int(doc.get("seq", 1))

def _err_resp(status: int, code: str, extra: dict | None = None):
    raise HTTPException(status_code=status, detail={"error": code, **(extra or {})})

@api.get("/wallet/{address}")
async def wallet(address: str):
    if not is_addr(address): raise HTTPException(400, "invalid_address")
    addr = norm(address)
    w = await db.wallets.find_one({"_id": addr})
    cooldown = int(await get_setting("claim_interval_seconds", 86400))
    if not w:
        return {
            "address": addr, "exists": False, "total_claimed": 0, "total_referrals": 0,
            "total_referral_bonus": 0, "pending_balance": 0, "credited_balance": 0,
            "last_claim_at": None, "can_claim_now": True, "next_claim_at": None, "seconds_left": 0,
        }
    last = w.get("last_claim_at")
    last_ts = int(datetime.fromisoformat(last.replace("Z","+00:00")).timestamp()) if isinstance(last, str) and last else 0
    now_ts = int(now().timestamp())
    can = (not last_ts) or (now_ts - last_ts) >= cooldown
    next_at = iso(datetime.fromtimestamp(last_ts + cooldown, tz=timezone.utc)) if last_ts else None
    return {
        "address": addr, "exists": True,
        "total_claimed":        float(w.get("total_claimed", 0)),
        "total_referrals":      int(w.get("total_referrals", 0)),
        "total_referral_bonus": float(w.get("total_referral_bonus", 0)),
        "pending_balance":      float(w.get("pending_balance", 0)),
        "credited_balance":     float(w.get("credited_balance", 0)),
        "last_claim_at":        last,
        "can_claim_now":        can,
        "next_claim_at":        next_at,
        "seconds_left":         0 if can else max(0, (last_ts + cooldown) - now_ts),
    }

@api.get("/referrals/{address}")
async def referrals(address: str):
    if not is_addr(address): raise HTTPException(400, "invalid_address")
    addr = norm(address)
    cursor = db.referrals.find({"referrer_address": addr}).sort("_seq", -1).limit(200)
    items = []
    total = 0.0; paid = 0.0
    async for r in cursor:
        items.append({
            "referee_address": r["referee_address"], "bonus_amount": float(r["bonus_amount"]),
            "status": r["status"], "created_at": r["created_at"],
        })
        total += float(r["bonus_amount"])
        if r["status"] == "credited": paid += float(r["bonus_amount"])
    return {"address": addr, "count": len(items), "total_bonus": total, "credited_bonus": paid, "items": items}

@api.get("/stats")
async def stats():
    wallets = await db.wallets.count_documents({})
    claims_total = await db.claims.count_documents({})
    claims_credited_cur = db.claims.aggregate([{"$match":{"status":"credited"}},{"$group":{"_id":None,"c":{"$sum":1},"s":{"$sum":"$amount"}}}])
    cc = await claims_credited_cur.to_list(1); cc = cc[0] if cc else {"c":0,"s":0}
    claims_all_cur = db.claims.aggregate([{"$group":{"_id":None,"s":{"$sum":"$amount"}}}])
    ca = await claims_all_cur.to_list(1); ca = ca[0] if ca else {"s":0}
    refs_cur = db.referrals.aggregate([{"$group":{"_id":None,"c":{"$sum":1},"s":{"$sum":"$bonus_amount"}}}])
    rs = await refs_cur.to_list(1); rs = rs[0] if rs else {"c":0,"s":0}
    return {
        "wallets": wallets, "claims_total": claims_total, "claims_total_human": float(ca.get("s",0)),
        "claims_credited": int(cc.get("c",0)), "human_distributed": float(cc.get("s",0)),
        "referrals": int(rs.get("c",0)), "referral_bonus_total": float(rs.get("s",0)),
    }

# ---------- admin ----------
class LoginIn(BaseModel): password: str

@api.post("/admin/login")
async def admin_login(body: LoginIn):
    h = await get_setting("admin_password_hash")
    if not h: raise HTTPException(503, "not_installed")
    try: ok = bcrypt.checkpw(body.password.encode(), h.encode())
    except Exception: ok = False
    if not ok:
        await asyncio.sleep(0.25)
        raise HTTPException(401, "invalid_credentials")
    secret = await get_setting("jwt_secret")
    token = jwt_sign({"role": "admin", "sub": "humanity-admin"}, secret, ttl=12*3600)
    return {"ok": True, "token": token, "expires_in": 12*3600}

@api.get("/admin/claims")
async def admin_claims(status: str = "", address: str = "", limit: int = 100, offset: int = 0,
                       _admin: dict = Depends(require_admin)):
    q: dict = {}
    if status in ("pending","credited","rejected"): q["status"] = status
    if is_addr(address): q["wallet_address"] = norm(address)
    total = await db.claims.count_documents(q)
    items = []
    cursor = db.claims.find(q).sort("_seq", -1).skip(max(0,offset)).limit(max(1, min(500, limit)))
    async for r in cursor:
        items.append({
            "id": int(r.get("_seq", 0)), "wallet_address": r["wallet_address"],
            "amount": float(r["amount"]), "status": r["status"], "tx_hash": r.get("tx_hash"),
            "claimed_at": r["claimed_at"], "credited_at": r.get("credited_at"),
        })
    return {"total": total, "limit": limit, "offset": offset, "items": items}

class ClaimUpdateIn(BaseModel):
    status: str
    tx_hash: Optional[str] = None

@api.post("/admin/claims/{cid}")
async def admin_claim_update(cid: int, body: ClaimUpdateIn, _admin: dict = Depends(require_admin)):
    if body.status not in ("pending","credited","rejected"): raise HTTPException(400, "invalid_status")
    cur = await db.claims.find_one({"_seq": cid})
    if not cur: raise HTTPException(404, "not_found")
    if cur["status"] == body.status:
        return {"ok": True, "unchanged": True}
    amount = float(cur["amount"]); addr = cur["wallet_address"]
    was = cur["status"]
    # adjust wallet buckets
    inc = {}
    if was == "pending":   inc["pending_balance"]  = -amount
    elif was == "credited":inc["credited_balance"] = -amount
    if body.status == "pending":   inc["pending_balance"]  = inc.get("pending_balance", 0)  + amount
    elif body.status == "credited":inc["credited_balance"] = inc.get("credited_balance", 0) + amount
    if inc: await db.wallets.update_one({"_id": addr}, {"$inc": inc})
    await db.claims.update_one({"_seq": cid}, {"$set": {
        "status": body.status, "tx_hash": body.tx_hash or None,
        "credited_at": iso(now()) if body.status == "credited" else None,
    }})
    return {"ok": True, "id": cid, "status": body.status, "tx_hash": body.tx_hash}

@api.get("/admin/referrals")
async def admin_referrals(status: str = "", address: str = "", limit: int = 100, offset: int = 0,
                          _admin: dict = Depends(require_admin)):
    q: dict = {}
    if status in ("pending","credited","rejected"): q["status"] = status
    if is_addr(address):
        q["$or"] = [{"referrer_address": norm(address)}, {"referee_address": norm(address)}]
    total = await db.referrals.count_documents(q)
    items = []
    async for r in db.referrals.find(q).sort("_seq", -1).skip(max(0,offset)).limit(max(1, min(500, limit))):
        items.append({"id": int(r.get("_seq",0)), "referrer_address": r["referrer_address"],
                      "referee_address": r["referee_address"], "bonus_amount": float(r["bonus_amount"]),
                      "status": r["status"], "created_at": r["created_at"]})
    return {"total": total, "limit": limit, "offset": offset, "items": items}

class CreditIn(BaseModel):
    address: str
    amount: float
    note: Optional[str] = ""
    tx_hash: Optional[str] = ""

@api.post("/admin/credit")
async def admin_credit(body: CreditIn, _admin: dict = Depends(require_admin)):
    if not is_addr(body.address): raise HTTPException(400, "invalid_address")
    if body.amount == 0: raise HTTPException(400, "invalid_amount")
    addr = norm(body.address)
    base = {"total_claimed":0,"total_referrals":0,"total_referral_bonus":0,"pending_balance":0,"credited_balance":0,
            "last_claim_at": None, "created_at": iso(now())}
    await db.wallets.update_one({"_id": addr}, {"$setOnInsert": base}, upsert=True)
    cid = await _next_seq("credits")
    await db.credits.insert_one({
        "_seq": cid, "wallet_address": addr, "amount": float(body.amount),
        "note": body.note or None, "tx_hash": body.tx_hash or None, "created_at": iso(now()),
    })
    await db.wallets.update_one({"_id": addr}, {"$inc": {"credited_balance": float(body.amount)}})
    return {"ok": True, "id": cid, "address": addr, "amount": float(body.amount)}

@api.get("/admin/credits")
async def admin_credits(address: str = "", limit: int = 100, offset: int = 0,
                        _admin: dict = Depends(require_admin)):
    q: dict = {}
    if is_addr(address): q["wallet_address"] = norm(address)
    total = await db.credits.count_documents(q)
    items = []
    async for r in db.credits.find(q).sort("_seq", -1).skip(max(0,offset)).limit(max(1, min(500, limit))):
        items.append({"id": int(r.get("_seq",0)), "wallet_address": r["wallet_address"],
                      "amount": float(r["amount"]), "note": r.get("note"),
                      "tx_hash": r.get("tx_hash"), "created_at": r["created_at"]})
    return {"total": total, "limit": limit, "offset": offset, "items": items}

ALLOWED_CONTENT_KEYS = [
    "hero_title","hero_subtitle","about_title","about_text","footer_note",
    "claim_amount","claim_interval_seconds","referral_bonus","claim_enabled",
    "contract_address","marketing_wallet","chain_id","chain_name","rpc_url","explorer_url",
]

@api.get("/admin/content")
async def admin_content_get(_admin: dict = Depends(require_admin)):
    s = await all_settings()
    return {k: s.get(k, DEFAULTS.get(k, "")) for k in ALLOWED_CONTENT_KEYS}

@api.post("/admin/content")
async def admin_content_set(body: dict, _admin: dict = Depends(require_admin)):
    saved = {}
    for k in ALLOWED_CONTENT_KEYS:
        if k in body:
            v = body[k]
            await set_setting(k, v)
            saved[k] = v
    return {"ok": True, "saved": saved}

class CampaignIn(BaseModel):
    active: bool = False
    title: str = ""
    message: str = ""
    cta_label: str = ""
    cta_url: str = ""

@api.get("/admin/campaign")
async def admin_campaign_get(_admin: dict = Depends(require_admin)):
    s = await all_settings()
    return {
        "active":    int(s.get("campaign_active", 0)) == 1,
        "title":     s.get("campaign_title", ""),
        "message":   s.get("campaign_message", ""),
        "cta_label": s.get("campaign_cta_label", ""),
        "cta_url":   s.get("campaign_cta_url", ""),
    }

@api.post("/admin/campaign")
async def admin_campaign_set(body: CampaignIn, _admin: dict = Depends(require_admin)):
    await set_setting("campaign_active", 1 if body.active else 0)
    await set_setting("campaign_title",  body.title)
    await set_setting("campaign_message", body.message)
    await set_setting("campaign_cta_label", body.cta_label)
    await set_setting("campaign_cta_url",   body.cta_url)
    return {"ok": True}

class SocialIn(BaseModel):
    facebook:  Optional[str] = None
    x:         Optional[str] = None
    instagram: Optional[str] = None
    tiktok:    Optional[str] = None

def _normalize_social(s: Optional[str]) -> str:
    if not s: return ""
    s = s.strip()
    if not s or s == "#": return ""
    if not s.lower().startswith(("http://","https://")):
        return "https://" + s.lstrip("/")
    return s

@api.get("/admin/social")
async def admin_social_get(_admin: dict = Depends(require_admin)):
    s = await all_settings()
    return {k: s.get(f"social_{k}", "") for k in ("facebook","x","instagram","tiktok")}

@api.post("/admin/social")
async def admin_social_set(body: SocialIn, _admin: dict = Depends(require_admin)):
    payload = body.model_dump()
    for k in ("facebook","x","instagram","tiktok"):
        if payload.get(k) is not None:
            await set_setting(f"social_{k}", _normalize_social(payload[k]))
    return {"ok": True}

# ---------- on-chain ----------
def _hex_to_dec(h: str) -> int:
    return int(h, 16) if h and h.startswith("0x") else (int("0x"+h, 16) if h else 0)

def _from_wei(dec: int, decimals: int = 18) -> str:
    s = str(int(dec)); pad = s.zfill(decimals+1)
    i, f = pad[:-decimals], pad[-decimals:].rstrip("0")
    return i if not f else f"{i}.{f}"

async def _rpc(url: str, method: str, params: list) -> dict:
    try:
        async with httpx.AsyncClient(timeout=8.0) as cli:
            r = await cli.post(url, json={"jsonrpc":"2.0","id":1,"method":method,"params":params})
            r.raise_for_status()
            return r.json()
    except Exception as e:
        return {"error": str(e)}

@api.get("/admin/onchain")
async def admin_onchain(_admin: dict = Depends(require_admin)):
    s = await all_settings()
    rpc = s.get("rpc_url", DEFAULTS["rpc_url"])
    contract = s.get("contract_address", "")
    marketing = s.get("marketing_wallet", MARKETING_WALLET)
    out: dict = {"rpc_url": rpc, "contract_address": contract, "marketing_wallet": marketing,
                 "chain_id": None, "block_number": None, "bnb_balance": None,
                 "total_supply": None, "marketing_balance": None, "errors": []}
    r = await _rpc(rpc, "eth_chainId", [])
    if r.get("result"): out["chain_id"] = int(r["result"], 16)
    elif r.get("error"): out["errors"].append(f"chainId: {r['error']}")
    r = await _rpc(rpc, "eth_blockNumber", [])
    if r.get("result"): out["block_number"] = int(r["result"], 16)
    r = await _rpc(rpc, "eth_getBalance", [marketing, "latest"])
    if r.get("result"): out["bnb_balance"] = _from_wei(_hex_to_dec(r["result"]), 18)
    if is_addr(contract):
        r = await _rpc(rpc, "eth_call", [{"to": contract, "data": "0x18160ddd"}, "latest"])
        if r.get("result"): out["total_supply"] = _from_wei(_hex_to_dec(r["result"]), 18)
        elif r.get("error"): out["errors"].append(f"totalSupply: {r['error']}")
        padded = marketing[2:].lower().rjust(64, "0")
        r = await _rpc(rpc, "eth_call", [{"to": contract, "data": "0x70a08231" + padded}, "latest"])
        if r.get("result"): out["marketing_balance"] = _from_wei(_hex_to_dec(r["result"]), 18)
        elif r.get("error"): out["errors"].append(f"balanceOf: {r['error']}")
    else:
        out["errors"].append("No contract_address configured.")
    return out

# ---------- wire & startup ----------
app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

@app.on_event("startup")
async def _startup():
    # indexes
    await db.claims.create_index([("_seq", -1)])
    await db.claims.create_index("wallet_address")
    await db.claims.create_index("status")
    await db.referrals.create_index([("_seq", -1)])
    await db.referrals.create_index("referrer_address")
    await db.referrals.create_index("referee_address", unique=True)
    await db.credits.create_index([("_seq", -1)])
    await ensure_seed()
    logger.info("Humanity Coin API ready · marketing=%s", MARKETING_WALLET)

@app.on_event("shutdown")
async def _shutdown(): client.close()

# Custom 4xx for cooldown to surface { error, next_claim_at, seconds_left }
from fastapi.responses import JSONResponse
@app.exception_handler(HTTPException)
async def _http_exc(_req: Request, exc: HTTPException):
    detail = exc.detail
    if isinstance(detail, dict):
        return JSONResponse(detail, status_code=exc.status_code)
    return JSONResponse({"error": detail if isinstance(detail, str) else "error"}, status_code=exc.status_code)
