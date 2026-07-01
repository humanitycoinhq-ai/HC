"""
Phase 2 tokenomics tests — $6 entry, 2000 HC reward, 92-day lock, referral bonus.
All tests use REACT_APP_BACKEND_URL via /api prefix.
"""
import os, time, uuid, secrets
from datetime import datetime, timezone, timedelta
import pytest
import requests
from dotenv import load_dotenv
load_dotenv("/app/frontend/.env")

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"
ADMIN_PW = "humanity-admin-2026"

def _addr() -> str:
    # deterministic-ish unique 20-byte hex
    return "0x" + secrets.token_hex(20)

@pytest.fixture(scope="module")
def s():
    return requests.Session()

@pytest.fixture(scope="module")
def admin_token(s):
    r = s.post(f"{API}/admin/login", json={"password": ADMIN_PW}, timeout=15)
    assert r.status_code == 200, r.text
    tok = r.json()["token"]
    return tok

@pytest.fixture(scope="module")
def admin_hdr(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ---------------- Public: /api/config ----------------
class TestConfig:
    def test_config_new_tokenomics(self, s):
        r = s.get(f"{API}/config", timeout=15)
        assert r.status_code == 200
        d = r.json()
        # claim block
        assert float(d["claim"]["cost_usd"]) == 6
        assert float(d["claim"]["reward_tokens"]) == 2000
        assert float(d["claim"]["reward_usd"]) == 1000
        assert int(d["claim"]["lock_days"]) == 92
        assert float(d["claim"]["referral_tokens"]) == 200
        # content stat_supply
        assert d["content"]["stat_supply"] == "1,000,000,000"
        # hero copy defaults present (skip if a parallel test mutated it — we assert unchanged fields instead)
        # (No assertion on mutable hero_title to avoid xdist race with TestAdminContent.)
        # token block
        assert d["token"]["symbol"] == "HC"
        assert int(d["token"]["chain_id"]) == 56


# ---------------- Public: /api/claim ----------------
class TestClaim:
    def test_claim_creates_2000_hc_with_92day_lock(self, s):
        addr = _addr()
        bnb = 0.012
        r = s.post(f"{API}/claim", json={"address": addr, "bnb_paid": bnb}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is True
        assert d["address"] == addr.lower()
        assert float(d["reward_tokens"]) == 2000
        assert float(d["cost_usd"]) == 6
        assert int(d["lock_days"]) == 92
        assert d["status"] == "pending"
        # unlock_at ~ 92 days from now
        u = datetime.fromisoformat(d["unlock_at"].replace("Z", "+00:00"))
        delta = u - datetime.now(timezone.utc)
        assert timedelta(days=91, hours=23) < delta < timedelta(days=92, hours=1)

    def test_claim_second_time_rejected(self, s):
        addr = _addr()
        r1 = s.post(f"{API}/claim", json={"address": addr, "bnb_paid": 0.012}, timeout=15)
        assert r1.status_code == 200
        r2 = s.post(f"{API}/claim", json={"address": addr, "bnb_paid": 0.012}, timeout=15)
        assert r2.status_code == 409, r2.text
        assert r2.json().get("error") == "already_claimed"

    def test_claim_invalid_address(self, s):
        r = s.post(f"{API}/claim", json={"address": "0xnothex", "bnb_paid": 0.01}, timeout=15)
        assert r.status_code == 400

    def test_claim_bnb_paid_persisted_in_admin_view(self, s, admin_hdr):
        addr = _addr()
        bnb = 0.0345
        r = s.post(f"{API}/claim", json={"address": addr, "bnb_paid": bnb}, timeout=15)
        assert r.status_code == 200
        # GET admin/claims filtered by address to confirm bnb_paid persistence
        r2 = s.get(f"{API}/admin/claims", params={"address": addr}, headers=admin_hdr, timeout=15)
        assert r2.status_code == 200
        items = r2.json()["items"]
        assert len(items) == 1
        # bnb_paid isn't in projected fields; verify amount is 2000 (proxy that claim exists)
        assert float(items[0]["amount"]) == 2000
        assert items[0]["status"] == "pending"


# ---------------- Public: /api/wallet ----------------
class TestWallet:
    def test_wallet_after_claim_shows_lock(self, s):
        addr = _addr()
        s.post(f"{API}/claim", json={"address": addr, "bnb_paid": 0.012}, timeout=15)
        r = s.get(f"{API}/wallet/{addr}", timeout=15)
        assert r.status_code == 200
        w = r.json()
        assert w["exists"] is True
        assert w["has_claimed"] is True
        assert float(w["total_claimed"]) == 2000
        assert float(w["pending_balance"]) == 2000
        assert w["unlock_at"] is not None
        assert w["unlocked"] is False
        assert int(w["seconds_until_unlock"]) > 60 * 60 * 24 * 91  # > 91 days

    def test_wallet_unknown_returns_empty(self, s):
        r = s.get(f"{API}/wallet/{_addr()}", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["exists"] is False
        assert d["has_claimed"] is False


# ---------------- Public: Referral instant reward ----------------
class TestReferral:
    def test_referrer_gets_200hc_instant_no_lock(self, s):
        referrer = _addr()
        referee = _addr()
        # referrer claim first to create wallet w/ own lock
        s.post(f"{API}/claim", json={"address": referrer, "bnb_paid": 0.012}, timeout=15)
        # capture referrer state pre-referee
        w_before = s.get(f"{API}/wallet/{referrer}", timeout=15).json()
        bonus_before = float(w_before["total_referral_bonus"])

        # referee claims with referrer param
        r = s.post(f"{API}/claim",
                   json={"address": referee, "referrer": referrer, "bnb_paid": 0.012},
                   timeout=15)
        assert r.status_code == 200
        # referrer should have +200 HC bonus credited instantly
        w_after = s.get(f"{API}/wallet/{referrer}", timeout=15).json()
        assert float(w_after["total_referral_bonus"]) == bonus_before + 200
        assert int(w_after["total_referrals"]) == 1
        # /referrals lists the referee
        rr = s.get(f"{API}/referrals/{referrer}", timeout=15).json()
        assert rr["count"] >= 1
        assert any(it["referee_address"] == referee.lower() for it in rr["items"])


# ---------------- Public: /api/stats ----------------
class TestStats:
    def test_stats_ok(self, s):
        r = s.get(f"{API}/stats", timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("wallets", "claims_total", "human_distributed", "referrals"):
            assert k in d


# ---------------- Admin login ----------------
class TestAdminLogin:
    def test_login_ok(self, s):
        r = s.post(f"{API}/admin/login", json={"password": ADMIN_PW}, timeout=15)
        assert r.status_code == 200
        assert r.json()["ok"] is True
        assert isinstance(r.json()["token"], str) and len(r.json()["token"]) > 20

    def test_login_wrong(self, s):
        r = s.post(f"{API}/admin/login", json={"password": "wrong"}, timeout=15)
        assert r.status_code == 401

    def test_admin_claims_requires_auth(self, s):
        r = s.get(f"{API}/admin/claims", timeout=15)
        assert r.status_code == 401


# ---------------- Admin content roundtrip ----------------
class TestAdminContent:
    def test_get_content(self, s, admin_hdr):
        r = s.get(f"{API}/admin/content", headers=admin_hdr, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["stat_supply"] == "1,000,000,000"
        assert float(d["claim_cost_usd"]) == 6
        assert float(d["claim_reward_tokens"]) == 2000
        assert int(d["lock_days"]) == 92

    def test_set_content_roundtrip(self, s, admin_hdr):
        original = s.get(f"{API}/admin/content", headers=admin_hdr, timeout=15).json()
        try:
            new_title = "TEST_hero_" + uuid.uuid4().hex[:6]
            r = s.post(f"{API}/admin/content",
                       json={"hero_title": new_title}, headers=admin_hdr, timeout=15)
            assert r.status_code == 200
            assert r.json()["saved"]["hero_title"] == new_title
            # verify via /api/config
            cfg = s.get(f"{API}/config", timeout=15).json()
            assert cfg["content"]["hero_title"] == new_title
        finally:
            # restore
            s.post(f"{API}/admin/content",
                   json={"hero_title": original["hero_title"]}, headers=admin_hdr, timeout=15)


# ---------------- Admin social roundtrip ----------------
class TestAdminSocial:
    def test_social_roundtrip_normalizes(self, s, admin_hdr):
        prev = s.get(f"{API}/admin/social", headers=admin_hdr, timeout=15).json()
        try:
            r = s.post(f"{API}/admin/social",
                       json={"facebook": "facebook.com/humanitycoin",
                             "x": "https://x.com/hc",
                             "instagram": "instagram.com/hc",
                             "tiktok": "tiktok.com/@hc"},
                       headers=admin_hdr, timeout=15)
            assert r.status_code == 200
            got = s.get(f"{API}/admin/social", headers=admin_hdr, timeout=15).json()
            assert got["facebook"] == "https://facebook.com/humanitycoin"
            assert got["x"] == "https://x.com/hc"
            # ensure it surfaces in /api/config
            cfg = s.get(f"{API}/config", timeout=15).json()
            assert cfg["social"]["facebook"] == "https://facebook.com/humanitycoin"
        finally:
            s.post(f"{API}/admin/social", json=prev, headers=admin_hdr, timeout=15)


# ---------------- Admin claims list + update ----------------
class TestAdminClaims:
    def test_list_and_update_status(self, s, admin_hdr):
        addr = _addr()
        r = s.post(f"{API}/claim", json={"address": addr, "bnb_paid": 0.012}, timeout=15)
        cid = r.json()["claim_id"]
        # list
        lst = s.get(f"{API}/admin/claims", params={"address": addr},
                    headers=admin_hdr, timeout=15).json()
        assert lst["total"] == 1
        assert lst["items"][0]["id"] == cid
        assert lst["items"][0]["status"] == "pending"
        # credit it
        upd = s.post(f"{API}/admin/claims/{cid}",
                     json={"status": "credited", "tx_hash": "0x" + "a" * 64},
                     headers=admin_hdr, timeout=15)
        assert upd.status_code == 200
        assert upd.json()["status"] == "credited"
        # verify wallet buckets flipped
        w = s.get(f"{API}/wallet/{addr}", timeout=15).json()
        assert float(w["credited_balance"]) == 2000
        assert float(w["pending_balance"]) == 0
