"""Backend tests for Humanity Coin FastAPI mirror."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hc-php-rebuild.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_PASSWORD = "humanity-admin-2026"

ADDR_A = "0xabCDEF0123456789abcdef0123456789abCDEF01"
ADDR_B = "0x1111111111111111111111111111111111111111"
ADDR_REF = "0x2222222222222222222222222222222222222222"


@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="session")
def admin_token(s):
    r = s.post(f"{API}/admin/login", json={"password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_s(admin_token):
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {admin_token}"})
    return sess


# ---------- public ----------
class TestPublic:
    def test_health(self, s):
        r = s.get(f"{API}/")
        assert r.status_code == 200
        d = r.json()
        assert d.get("name") == "Humanity Coin API"

    def test_config(self, s):
        r = s.get(f"{API}/config")
        assert r.status_code == 200
        d = r.json()
        assert d["token"]["chain_id"] == 56
        assert d["token"]["marketing_wallet"].lower() == "0x1ee7dd9bcfbb335a34181275a50af4c92d4851f1"
        assert d["claim"]["amount"] == 10
        assert d["claim"]["referral_bonus"] == 5
        for k in ("facebook", "x", "instagram", "tiktok"):
            assert k in d["social"]
        assert "campaign" in d
        assert "content" in d

    def test_stats(self, s):
        r = s.get(f"{API}/stats")
        assert r.status_code == 200
        d = r.json()
        for k in ("wallets", "claims_total", "referrals"):
            assert k in d

    def test_wallet_new(self, s):
        r = s.get(f"{API}/wallet/{ADDR_B}")
        # wallet B may have been touched by previous runs; if exists, that's ok. test address fresh
        assert r.status_code == 200
        d = r.json()
        assert d["address"] == ADDR_B.lower()

    def test_claim_invalid_addr(self, s):
        r = s.post(f"{API}/claim", json={"address": "notanaddress"})
        assert r.status_code == 400
        assert r.json().get("error") == "invalid_address"


# ---------- claim flow ----------
class TestClaim:
    def test_claim_creates(self, s):
        # Use a fresh address each run
        addr = "0x" + format(int(time.time()) & 0xffffffff, "08x").rjust(40, "a")
        r = s.post(f"{API}/claim", json={"address": addr, "referrer": ADDR_REF})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is True
        assert "claim_id" in d
        assert "next_claim_at" in d
        assert d["amount"] == 10

        # verify wallet
        w = s.get(f"{API}/wallet/{addr}").json()
        assert w["exists"] is True
        assert w["total_claimed"] == 10
        assert w["pending_balance"] == 10
        assert w["seconds_left"] > 0

        # cooldown
        r2 = s.post(f"{API}/claim", json={"address": addr})
        assert r2.status_code == 429
        body = r2.json()
        assert body.get("error") == "cooldown"
        assert "next_claim_at" in body

        # referrals list contains
        rr = s.get(f"{API}/referrals/{ADDR_REF}")
        assert rr.status_code == 200
        ref_items = rr.json()["items"]
        assert any(item["referee_address"] == addr.lower() for item in ref_items)


# ---------- admin auth ----------
class TestAdminAuth:
    def test_login_wrong(self, s):
        r = s.post(f"{API}/admin/login", json={"password": "wrong"})
        assert r.status_code == 401

    def test_login_ok(self, s):
        r = s.post(f"{API}/admin/login", json={"password": ADMIN_PASSWORD})
        assert r.status_code == 200
        assert r.json().get("token")

    def test_admin_claims_no_token(self, s):
        r = s.get(f"{API}/admin/claims")
        assert r.status_code == 401

    def test_admin_claims_with_token(self, admin_s):
        r = admin_s.get(f"{API}/admin/claims")
        assert r.status_code == 200
        d = r.json()
        assert "items" in d


# ---------- admin claim update ----------
class TestAdminClaimUpdate:
    def test_credit_claim(self, s, admin_s):
        addr = "0x" + format(int(time.time() * 1000) & 0xffffffff, "08x").rjust(40, "b")
        r = s.post(f"{API}/claim", json={"address": addr})
        assert r.status_code == 200
        cid = r.json()["claim_id"]

        # Credit it
        u = admin_s.post(f"{API}/admin/claims/{cid}", json={"status": "credited", "tx_hash": "0xdeadbeef"})
        assert u.status_code == 200, u.text

        # verify wallet credited_balance
        w = s.get(f"{API}/wallet/{addr}").json()
        assert w["credited_balance"] == 10
        assert w["pending_balance"] == 0

        # verify status in list
        lst = admin_s.get(f"{API}/admin/claims", params={"address": addr}).json()
        assert any(it["id"] == cid and it["status"] == "credited" for it in lst["items"])


# ---------- admin credit ----------
class TestAdminCredit:
    def test_credit(self, admin_s, s):
        addr = "0x" + format(int(time.time() * 1000) & 0xffffffff, "08x").rjust(40, "c")
        r = admin_s.post(f"{API}/admin/credit", json={
            "address": addr, "amount": 50, "note": "bug bounty"
        })
        assert r.status_code == 200, r.text
        cid = r.json()["id"]

        lst = admin_s.get(f"{API}/admin/credits", params={"address": addr}).json()
        assert any(it["id"] == cid and it["amount"] == 50 for it in lst["items"])

        w = s.get(f"{API}/wallet/{addr}").json()
        assert w["credited_balance"] == 50


# ---------- admin referrals ----------
class TestAdminReferrals:
    def test_list(self, admin_s):
        r = admin_s.get(f"{API}/admin/referrals")
        assert r.status_code == 200
        assert "items" in r.json()


# ---------- content ----------
class TestAdminContent:
    def test_get_and_set(self, admin_s, s):
        before = admin_s.get(f"{API}/admin/content").json()
        orig = before.get("claim_amount", 10)

        r = admin_s.post(f"{API}/admin/content", json={"claim_amount": 12})
        assert r.status_code == 200
        cfg = s.get(f"{API}/config").json()
        assert float(cfg["claim"]["amount"]) == 12

        # revert
        admin_s.post(f"{API}/admin/content", json={"claim_amount": orig})


# ---------- campaign ----------
class TestAdminCampaign:
    def test_get_and_set(self, admin_s, s):
        r = admin_s.post(f"{API}/admin/campaign", json={
            "active": True, "title": "Genesis", "message": "5 days only",
            "cta_label": "Learn", "cta_url": "https://example.com"
        })
        assert r.status_code == 200

        cfg = s.get(f"{API}/config").json()
        assert cfg["campaign"]["active"] is True
        assert cfg["campaign"]["title"] == "Genesis"
        assert cfg["campaign"]["cta_url"] == "https://example.com"


# ---------- social ----------
class TestAdminSocial:
    def test_set_normalizes(self, admin_s, s):
        r = admin_s.post(f"{API}/admin/social", json={
            "facebook": "facebook.com/hc", "x": "x.com/hc",
            "instagram": "instagram.com/hc", "tiktok": "tiktok.com/@hc"
        })
        assert r.status_code == 200

        cfg = s.get(f"{API}/config").json()
        social = cfg["social"]
        assert social["facebook"].startswith("https://")
        assert "facebook.com/hc" in social["facebook"]
        assert social["x"].startswith("https://")
        assert social["instagram"].startswith("https://")
        assert social["tiktok"].startswith("https://")


# ---------- onchain ----------
class TestAdminOnchain:
    def test_onchain(self, admin_s):
        r = admin_s.get(f"{API}/admin/onchain")
        assert r.status_code == 200
        d = r.json()
        assert d.get("marketing_wallet", "").lower() == "0x1ee7dd9bcfbb335a34181275a50af4c92d4851f1"
        # chain_id and block_number should come from live BSC RPC, may fail if no internet
        # don't hard-fail just check shape
        assert "chain_id" in d
        assert "block_number" in d
