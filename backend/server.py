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
LIQUIDITY_WALLET       = "0x1eE7dD9BCfbB335a34181275a50af4C92D4851F1"

logger = logging.getLogger("humanity_coin")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

app = FastAPI(title="Humanity Coin API")
api = APIRouter(prefix="/api")

# ---------- settings helpers (Mongo doc per key) ----------
DEFAULTS: dict[str, Any] = {
    # Claim economics (per HumanityCoin.sol)
    "claim_cost_usd":         6,
    "claim_reward_usd":       1000,
    "claim_reward_tokens":    2000,
    "token_price_usd":        0.50,
    "lock_days":              92,
    "referral_reward_tokens": 200,
    "referral_reward_usd":    100,
    "tx_tax_total_pct":       10,
    "tx_tax_reflection_pct":  4,
    "tx_tax_liquidity_pct":   3,
    "tx_tax_ngo_pct":         3,
    "claim_enabled":          1,
    # Chain
    "chain_id":               56,
    "chain_name":             "BNB Smart Chain",
    "rpc_url":                "https://bsc-dataseed.binance.org/",
    "explorer_url":           "https://bscscan.com",
    "contract_address":       "",
    "marketing_wallet":       MARKETING_WALLET,
    "liquidity_wallet":       LIQUIDITY_WALLET,
    "pancake_router":         "0x10ED43C718714eb63d5aA57B78B54704E256024E",
    "chainlink_bnb_usd":      "0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE",
    # Branding / copy (whitepaper-aligned)
    "hero_eyebrow":           "$HC · Official Whitepaper · v2.1",
    "hero_title":             "Join for $6 · Secure $1,000 Value",
    "hero_subtitle":          "Humanity Coin (HC) is the NGO-centric ecosystem that turns decentralized trading into perpetual aid. Pay $6, receive 2,000 HC ($1,000 of value) locked for 92 days, and help fund vetted NGOs around the world.",
    "stat_supply":            "1,000,000,000",
    "stat_tax":               "10%",
    "stat_network":           "BSC",
    "stat_seed":              "$4M",
    "about_title":            "Trading no longer just for profit — for purpose.",
    "about_text":             "Every $HC transaction fuels a vetted NGO. $4M in seed funding is secured, three initial NGO partners are vetted, and our mini-app beta is generating significant early traction. Humanity Coin is positioned to become the definitive standard for impact-driven DeFi.",
    "footer_note":            "Humanity Coin Ltd. (BVI) · Participation involves significant risk including total loss of $6 entry. Nothing here is investment advice.",
    # Optional homepage campaign (e.g. partner spotlight, KYC notice)
    "campaign_active":        0,
    "campaign_title":         "",
    "campaign_message":       "",
    "campaign_cta_label":     "",
    "campaign_cta_url":       "",
    # Social
    "social_facebook":  "",
    "social_x":         "",
    "social_instagram": "",
    "social_tiktok":    "",
    # Whitepaper extras (admin-editable)
    "ngo_partner_1_region":   "AFRICA",
    "ngo_partner_1_title":    "Clean Water Access",
    "ngo_partner_1_text":     "Borehole wells, filtration systems, and sanitation infrastructure in sub-Saharan Africa.",
    "ngo_partner_2_region":   "SE ASIA",
    "ngo_partner_2_title":    "Education Infrastructure",
    "ngo_partner_2_text":     "School construction, teacher training, and digital learning tools in Southeast Asia.",
    "ngo_partner_3_region":   "LATAM",
    "ngo_partner_3_title":    "Emergency Healthcare",
    "ngo_partner_3_text":     "Mobile clinics, essential medicines, and maternal care across Latin America.",
    "whitepaper_url":         "/Whitepaper.html",
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
            "name": "Humanity Coin", "symbol": "HC", "decimals": 18,
            "price_usd":         float(g("token_price_usd", 0.50)),
            "total_supply":      g("stat_supply", "1,000,000,000"),
            "chain_id":          int(g("chain_id", 56)),
            "chain_name":        g("chain_name", "BNB Smart Chain"),
            "rpc_url":           g("rpc_url"),
            "explorer_url":      g("explorer_url"),
            "contract_address":  g("contract_address", ""),
            "marketing_wallet":  g("marketing_wallet", MARKETING_WALLET),
            "liquidity_wallet":  g("liquidity_wallet", LIQUIDITY_WALLET),
            "pancake_router":    g("pancake_router", ""),
            "chainlink_bnb_usd": g("chainlink_bnb_usd", ""),
        },
        "claim": {
            "cost_usd":             float(g("claim_cost_usd", 6)),
            "reward_usd":           float(g("claim_reward_usd", 1000)),
            "reward_tokens":        float(g("claim_reward_tokens", 2000)),
            "lock_days":            int(g("lock_days", 92)),
            "referral_tokens":      float(g("referral_reward_tokens", 200)),
            "referral_usd":         float(g("referral_reward_usd", 100)),
            "enabled":              int(g("claim_enabled", 1)) == 1,
        },
        "tax": {
            "total":      int(g("tx_tax_total_pct", 10)),
            "reflection": int(g("tx_tax_reflection_pct", 4)),
            "liquidity":  int(g("tx_tax_liquidity_pct", 3)),
            "ngo":        int(g("tx_tax_ngo_pct", 3)),
        },
        "content": {
            "hero_eyebrow":  g("hero_eyebrow"),
            "hero_title":    g("hero_title"),
            "hero_subtitle": g("hero_subtitle"),
            "about_title":   g("about_title"),
            "about_text":    g("about_text"),
            "footer_note":   g("footer_note"),
            "stat_supply":   g("stat_supply"),
            "stat_tax":      g("stat_tax"),
            "stat_network":  g("stat_network"),
            "stat_seed":     g("stat_seed"),
            "whitepaper_url": g("whitepaper_url"),
        },
        "ngos": [
            {"region": g("ngo_partner_1_region"), "title": g("ngo_partner_1_title"), "text": g("ngo_partner_1_text")},
            {"region": g("ngo_partner_2_region"), "title": g("ngo_partner_2_title"), "text": g("ngo_partner_2_text")},
            {"region": g("ngo_partner_3_region"), "title": g("ngo_partner_3_title"), "text": g("ngo_partner_3_text")},
        ],
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
    tx_hash:  Optional[str] = ""        # on-chain claim tx (BNB sent)
    bnb_paid: Optional[float] = None    # client-reported BNB sent

@api.post("/claim")
async def claim(body: ClaimIn):
    if not is_addr(body.address): raise HTTPException(400, "invalid_address")
    if body.referrer and not is_addr(body.referrer): raise HTTPException(400, "invalid_referrer")
    addr = norm(body.address); ref = norm(body.referrer) if body.referrer else ""
    if ref == addr: ref = ""

    enabled = int(await get_setting("claim_enabled", 1))
    if enabled != 1: raise HTTPException(403, "claim_disabled")

    reward_tokens = float(await get_setting("claim_reward_tokens", 2000))
    cost_usd      = float(await get_setting("claim_cost_usd", 6))
    lock_days     = int(await get_setting("lock_days", 92))
    ref_tokens    = float(await get_setting("referral_reward_tokens", 200))

    # one-time-only claim (mirrors contract require(locks[msg.sender].amount==0))
    existing = await db.claims.find_one({"wallet_address": addr})
    if existing:
        return _err_resp(409, "already_claimed", {"claim_id": int(existing.get("_seq", 0))})

    # upsert wallet
    base = {"total_claimed":0,"total_referrals":0,"total_referral_bonus":0,
            "pending_balance":0,"credited_balance":0,
            "last_claim_at": None, "created_at": iso(now())}
    await db.wallets.update_one({"_id": addr}, {"$setOnInsert": base}, upsert=True)

    cid_seq = await _next_seq("claims")
    unlock_at = int(now().timestamp()) + lock_days * 86400
    claim_doc = {
        "_seq": cid_seq, "wallet_address": addr, "amount": reward_tokens,
        "cost_usd": cost_usd, "bnb_paid": float(body.bnb_paid or 0),
        "tx_hash": body.tx_hash or None,
        "status": "pending" if not body.tx_hash else "submitted",
        "claimed_at": iso(now()), "credited_at": None,
        "unlock_at": iso(datetime.fromtimestamp(unlock_at, tz=timezone.utc)),
    }
    await db.claims.insert_one(claim_doc)

    await db.wallets.update_one({"_id": addr}, {
        "$set": {"last_claim_at": iso(now()), "unlock_at": claim_doc["unlock_at"]},
        "$inc": {"total_claimed": reward_tokens, "pending_balance": reward_tokens},
    })

    # referral: one-time per referee, instant 200 HC bonus, no lock
    if ref:
        existing_ref = await db.referrals.find_one({"referee_address": addr})
        if not existing_ref:
            await db.wallets.update_one({"_id": ref}, {"$setOnInsert": base}, upsert=True)
            rid = await _next_seq("referrals")
            await db.referrals.insert_one({
                "_seq": rid, "referrer_address": ref, "referee_address": addr,
                "bonus_amount": ref_tokens, "status": "pending", "created_at": iso(now()),
            })
            await db.wallets.update_one({"_id": ref}, {"$inc": {
                "total_referrals": 1, "total_referral_bonus": ref_tokens, "pending_balance": ref_tokens,
            }})

    return {
        "ok": True, "claim_id": cid_seq, "address": addr,
        "reward_tokens": reward_tokens, "cost_usd": cost_usd, "lock_days": lock_days,
        "unlock_at": claim_doc["unlock_at"], "status": claim_doc["status"],
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
    if not w:
        return {
            "address": addr, "exists": False, "has_claimed": False,
            "total_claimed": 0, "total_referrals": 0, "total_referral_bonus": 0,
            "pending_balance": 0, "credited_balance": 0,
            "last_claim_at": None, "unlock_at": None, "seconds_until_unlock": 0, "unlocked": False,
        }
    unlock = w.get("unlock_at")
    unlock_ts = int(datetime.fromisoformat(unlock.replace("Z","+00:00")).timestamp()) if isinstance(unlock, str) and unlock else 0
    now_ts = int(now().timestamp())
    unlocked = unlock_ts and now_ts >= unlock_ts
    return {
        "address": addr, "exists": True, "has_claimed": bool(w.get("last_claim_at")),
        "total_claimed":        float(w.get("total_claimed", 0)),
        "total_referrals":      int(w.get("total_referrals", 0)),
        "total_referral_bonus": float(w.get("total_referral_bonus", 0)),
        "pending_balance":      float(w.get("pending_balance", 0)),
        "credited_balance":     float(w.get("credited_balance", 0)),
        "last_claim_at":        w.get("last_claim_at"),
        "unlock_at":            unlock,
        "seconds_until_unlock": max(0, unlock_ts - now_ts) if unlock_ts else 0,
        "unlocked":             bool(unlocked),
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

@api.get("/leaderboard")
async def leaderboard(limit: int = 10):
    limit = max(1, min(50, limit))
    cursor = db.referrals.aggregate([
        {"$group": {"_id": "$referrer_address", "referrals": {"$sum": 1}, "bonus_total": {"$sum": "$bonus_amount"}}},
        {"$sort": {"referrals": -1, "bonus_total": -1}},
        {"$limit": limit},
    ])
    items = []
    rank = 1
    async for r in cursor:
        items.append({"rank": rank, "address": r["_id"], "referrals": int(r["referrals"]), "bonus_total": float(r["bonus_total"])})
        rank += 1
    total_referrers = len(await db.referrals.distinct("referrer_address"))
    return {"items": items, "total_referrers": total_referrers}

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
            "bnb_paid": float(r.get("bnb_paid") or 0), "unlock_at": r.get("unlock_at"),
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
    # Hero / about / footer / stats
    "hero_eyebrow","hero_title","hero_subtitle","about_title","about_text","footer_note",
    "stat_supply","stat_tax","stat_network","stat_seed","whitepaper_url",
    # Economics
    "claim_cost_usd","claim_reward_usd","claim_reward_tokens","token_price_usd","lock_days",
    "referral_reward_tokens","referral_reward_usd","claim_enabled",
    # Tax
    "tx_tax_total_pct","tx_tax_reflection_pct","tx_tax_liquidity_pct","tx_tax_ngo_pct",
    # Chain
    "contract_address","marketing_wallet","liquidity_wallet","chain_id","chain_name","rpc_url","explorer_url",
    "pancake_router","chainlink_bnb_usd",
    # NGO partners
    "ngo_partner_1_region","ngo_partner_1_title","ngo_partner_1_text",
    "ngo_partner_2_region","ngo_partner_2_title","ngo_partner_2_text",
    "ngo_partner_3_region","ngo_partner_3_title","ngo_partner_3_text",
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
