"""
Backend API tests for Humanity Coin - Phase 3 Dashboard endpoints
Tests the 3 new/extended endpoints:
1. GET /api/wallet/{address} - extended fields
2. GET /api/wallet/{address}/history - merged timeline
3. POST /api/wallet/{address}/notify - email notifications
"""
import os
import time
import requests
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv

# Load frontend .env to get REACT_APP_BACKEND_URL
load_dotenv("/app/frontend/.env")

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"
ADMIN_PW = "humanity-admin-2026"

print(f"Testing API at: {API}")

class TestRunner:
    def __init__(self):
        self.session = requests.Session()
        self.admin_token = None
        self.passed = 0
        self.failed = 0
        self.errors = []
        
    def login_admin(self):
        """Get admin token for authenticated endpoints"""
        try:
            r = self.session.post(f"{API}/admin/login", json={"password": ADMIN_PW}, timeout=15)
            if r.status_code != 200:
                raise Exception(f"Admin login failed: {r.status_code} {r.text}")
            self.admin_token = r.json()["token"]
            print("✓ Admin login successful")
            return True
        except Exception as e:
            print(f"✗ Admin login failed: {e}")
            self.errors.append(f"Admin login: {e}")
            return False
    
    def admin_headers(self):
        return {"Authorization": f"Bearer {self.admin_token}"}
    
    def assert_equal(self, actual, expected, msg):
        if actual == expected:
            self.passed += 1
            return True
        else:
            self.failed += 1
            error = f"{msg}: expected {expected}, got {actual}"
            self.errors.append(error)
            print(f"  ✗ {error}")
            return False
    
    def assert_true(self, condition, msg):
        if condition:
            self.passed += 1
            return True
        else:
            self.failed += 1
            error = f"{msg}: condition failed"
            self.errors.append(error)
            print(f"  ✗ {error}")
            return False
    
    def assert_in_range(self, value, min_val, max_val, msg):
        if min_val <= value <= max_val:
            self.passed += 1
            return True
        else:
            self.failed += 1
            error = f"{msg}: {value} not in range [{min_val}, {max_val}]"
            self.errors.append(error)
            print(f"  ✗ {error}")
            return False

    def test_wallet_fresh_address(self):
        """Test GET /api/wallet/{address} for a fresh (non-existent) address"""
        print("\n=== Test 1: GET /api/wallet/{address} - Fresh Address ===")
        
        # Use a fresh random address that has never claimed
        fresh_addr = "0xBB00000000000000000000000000000000000001"
        
        try:
            r = self.session.get(f"{API}/wallet/{fresh_addr}", timeout=15)
            self.assert_equal(r.status_code, 200, "Status code")
            
            data = r.json()
            
            # Verify all required fields for non-existent wallet
            self.assert_equal(data.get("exists"), False, "exists")
            self.assert_equal(data.get("has_claimed"), False, "has_claimed")
            self.assert_equal(data.get("total_claimed"), 0, "total_claimed")
            self.assert_equal(data.get("total_referrals"), 0, "total_referrals")
            self.assert_equal(data.get("total_referral_bonus"), 0, "total_referral_bonus")
            self.assert_equal(data.get("pending_balance"), 0, "pending_balance")
            self.assert_equal(data.get("credited_balance"), 0, "credited_balance")
            self.assert_equal(data.get("seconds_until_unlock"), 0, "seconds_until_unlock")
            self.assert_equal(data.get("unlocked"), False, "unlocked")
            self.assert_equal(data.get("lock_progress_pct"), 0, "lock_progress_pct")
            self.assert_equal(data.get("lock_days_total"), 92, "lock_days_total")
            self.assert_equal(data.get("claim_tx_hash"), None, "claim_tx_hash")
            self.assert_equal(data.get("claim_bnb_paid"), 0, "claim_bnb_paid")
            self.assert_equal(data.get("claim_cost_usd"), 0, "claim_cost_usd")
            self.assert_equal(data.get("claim_status"), None, "claim_status")
            self.assert_equal(data.get("leaderboard_rank"), None, "leaderboard_rank")
            
            print("✓ Fresh address test passed")
            
        except Exception as e:
            self.failed += 1
            error = f"Fresh address test failed: {e}"
            self.errors.append(error)
            print(f"✗ {error}")

    def test_wallet_claimed_address(self):
        """Test GET /api/wallet/{address} for a claimed address with referral"""
        print("\n=== Test 2: GET /api/wallet/{address} - Claimed Address ===")
        
        # Create two wallets: referrer and referee
        referrer = "0xBB0000000000000000000000000000000000000A"
        referee = "0xBB0000000000000000000000000000000000000B"
        
        try:
            # First claim by referrer
            r1 = self.session.post(f"{API}/claim", 
                                   json={"address": referrer, "bnb_paid": 0.012},
                                   timeout=15)
            self.assert_equal(r1.status_code, 200, "Referrer claim status")
            
            # Second claim by referee with referrer
            r2 = self.session.post(f"{API}/claim",
                                   json={"address": referee, "referrer": referrer, "bnb_paid": 0.012},
                                   timeout=15)
            self.assert_equal(r2.status_code, 200, "Referee claim status")
            
            # Now get the referrer wallet details
            r = self.session.get(f"{API}/wallet/{referrer}", timeout=15)
            self.assert_equal(r.status_code, 200, "Wallet GET status")
            
            data = r.json()
            
            # Verify basic fields
            self.assert_equal(data.get("exists"), True, "exists")
            self.assert_equal(data.get("has_claimed"), True, "has_claimed")
            self.assert_equal(data.get("total_claimed"), 2000, "total_claimed")
            self.assert_equal(data.get("total_referrals"), 1, "total_referrals")
            self.assert_equal(data.get("total_referral_bonus"), 200, "total_referral_bonus")
            self.assert_equal(data.get("pending_balance"), 2200, "pending_balance (2000 + 200)")
            
            # Verify unlock timing (92 days out, ±60s tolerance)
            unlock_at = data.get("unlock_at")
            self.assert_true(unlock_at is not None, "unlock_at exists")
            
            if unlock_at:
                unlock_dt = datetime.fromisoformat(unlock_at.replace("Z", "+00:00"))
                now_dt = datetime.now(timezone.utc)
                delta = unlock_dt - now_dt
                expected_seconds = 92 * 86400
                actual_seconds = int(delta.total_seconds())
                
                # Allow ±60 seconds tolerance
                self.assert_in_range(actual_seconds, expected_seconds - 60, expected_seconds + 60,
                                   "unlock_at is 92 days out")
            
            # Verify seconds_until_unlock
            seconds_until = data.get("seconds_until_unlock", 0)
            self.assert_true(seconds_until > 7_800_000, 
                           f"seconds_until_unlock > 7.8M (got {seconds_until})")
            
            # Verify lock status
            self.assert_equal(data.get("unlocked"), False, "unlocked")
            
            # Verify lock_progress_pct (should be 0 or 1 for just claimed)
            progress = data.get("lock_progress_pct", -1)
            self.assert_true(progress in [0, 1], f"lock_progress_pct is 0 or 1 (got {progress})")
            
            # Verify lock_days_total
            self.assert_equal(data.get("lock_days_total"), 92, "lock_days_total")
            
            # Verify claim details
            self.assert_equal(data.get("claim_tx_hash"), None, "claim_tx_hash (no tx_hash provided)")
            self.assert_equal(data.get("claim_bnb_paid"), 0.012, "claim_bnb_paid")
            self.assert_equal(data.get("claim_cost_usd"), 6, "claim_cost_usd")
            self.assert_equal(data.get("claim_status"), "pending", "claim_status")
            
            # Verify claimed_at
            claimed_at = data.get("claimed_at")
            self.assert_true(claimed_at is not None and claimed_at.endswith("Z"), 
                           "claimed_at is ISO Z-string")
            
            # Verify leaderboard_rank (should be 1 if this is the only referrer)
            rank = data.get("leaderboard_rank")
            self.assert_true(rank is not None and rank >= 1, 
                           f"leaderboard_rank is positive integer (got {rank})")
            
            print("✓ Claimed address test passed")
            
        except Exception as e:
            self.failed += 1
            error = f"Claimed address test failed: {e}"
            self.errors.append(error)
            print(f"✗ {error}")

    def test_wallet_history(self):
        """Test GET /api/wallet/{address}/history"""
        print("\n=== Test 3: GET /api/wallet/{address}/history ===")
        
        # Use the same referrer from previous test
        referrer = "0xBB0000000000000000000000000000000000000A"
        
        try:
            # Get history
            r = self.session.get(f"{API}/wallet/{referrer}/history", timeout=15)
            self.assert_equal(r.status_code, 200, "History GET status")
            
            data = r.json()
            
            # Verify response shape
            self.assert_true("address" in data, "Response has 'address'")
            self.assert_true("count" in data, "Response has 'count'")
            self.assert_true("items" in data, "Response has 'items'")
            
            # Should have 2 items: 1 claim + 1 referral
            count = data.get("count", 0)
            self.assert_equal(count, 2, "count = 2 (1 claim + 1 referral)")
            
            items = data.get("items", [])
            
            # Find claim and referral items
            claim_item = None
            referral_item = None
            
            for item in items:
                if item.get("type") == "claim":
                    claim_item = item
                elif item.get("type") == "referral":
                    referral_item = item
            
            # Verify claim item
            if claim_item:
                self.assert_equal(claim_item.get("label"), "Claim", "Claim label")
                self.assert_equal(claim_item.get("amount"), 2000, "Claim amount")
                self.assert_equal(claim_item.get("status"), "pending", "Claim status")
                self.assert_equal(claim_item.get("bnb_paid"), 0.012, "Claim bnb_paid")
                self.assert_equal(claim_item.get("cost_usd"), 6, "Claim cost_usd")
                self.assert_true(claim_item.get("unlock_at") is not None, "Claim has unlock_at")
                print("  ✓ Claim item verified")
            else:
                self.failed += 1
                self.errors.append("No claim item found in history")
                print("  ✗ No claim item found")
            
            # Verify referral item
            if referral_item:
                self.assert_equal(referral_item.get("label"), "Referral bonus", "Referral label")
                self.assert_equal(referral_item.get("amount"), 200, "Referral amount")
                self.assert_equal(referral_item.get("status"), "pending", "Referral status")
                referee_addr = referral_item.get("referee_address", "")
                self.assert_equal(referee_addr, "0xbb0000000000000000000000000000000000000b",
                                "Referral referee_address (lowercased)")
                print("  ✓ Referral item verified")
            else:
                self.failed += 1
                self.errors.append("No referral item found in history")
                print("  ✗ No referral item found")
            
            # Verify sorting (created_at desc)
            if len(items) >= 2:
                created_times = [item.get("created_at", "") for item in items]
                is_sorted = all(created_times[i] >= created_times[i+1] 
                              for i in range(len(created_times)-1))
                self.assert_true(is_sorted, "Items sorted by created_at desc")
            
            # Test limit parameter
            r_limit = self.session.get(f"{API}/wallet/{referrer}/history?limit=1", timeout=15)
            self.assert_equal(r_limit.status_code, 200, "History with limit status")
            data_limit = r_limit.json()
            self.assert_equal(data_limit.get("count"), 1, "limit=1 returns count=1")
            
            # Test invalid address
            r_invalid = self.session.get(f"{API}/wallet/0xinvalid/history", timeout=15)
            self.assert_equal(r_invalid.status_code, 400, "Invalid address returns 400")
            
            print("✓ Wallet history test passed")
            
        except Exception as e:
            self.failed += 1
            error = f"Wallet history test failed: {e}"
            self.errors.append(error)
            print(f"✗ {error}")

    def test_wallet_history_with_credit(self):
        """Test GET /api/wallet/{address}/history with admin credit"""
        print("\n=== Test 4: GET /api/wallet/{address}/history with Credit ===")
        
        # Create a new wallet for this test
        test_addr = "0xBB0000000000000000000000000000000000000C"
        
        try:
            # First claim
            r1 = self.session.post(f"{API}/claim",
                                   json={"address": test_addr, "bnb_paid": 0.012},
                                   timeout=15)
            self.assert_equal(r1.status_code, 200, "Claim status")
            
            # Add admin credit
            r2 = self.session.post(f"{API}/admin/credit",
                                   json={"address": test_addr, "amount": 500, 
                                        "note": "test credit", "tx_hash": "0xabc123"},
                                   headers=self.admin_headers(),
                                   timeout=15)
            self.assert_equal(r2.status_code, 200, "Admin credit status")
            
            # Get history
            r = self.session.get(f"{API}/wallet/{test_addr}/history", timeout=15)
            self.assert_equal(r.status_code, 200, "History GET status")
            
            data = r.json()
            items = data.get("items", [])
            
            # Find credit item
            credit_item = None
            for item in items:
                if item.get("type") == "credit":
                    credit_item = item
                    break
            
            if credit_item:
                self.assert_equal(credit_item.get("label"), "Admin credit", "Credit label")
                self.assert_equal(credit_item.get("amount"), 500, "Credit amount")
                self.assert_equal(credit_item.get("status"), "credited", "Credit status")
                self.assert_equal(credit_item.get("note"), "test credit", "Credit note")
                self.assert_equal(credit_item.get("tx_hash"), "0xabc123", "Credit tx_hash")
                print("  ✓ Credit item verified")
            else:
                self.failed += 1
                self.errors.append("No credit item found in history")
                print("  ✗ No credit item found")
            
            print("✓ Wallet history with credit test passed")
            
        except Exception as e:
            self.failed += 1
            error = f"Wallet history with credit test failed: {e}"
            self.errors.append(error)
            print(f"✗ {error}")

    def test_wallet_notify(self):
        """Test POST /api/wallet/{address}/notify"""
        print("\n=== Test 5: POST /api/wallet/{address}/notify ===")
        
        test_addr = "0xBB0000000000000000000000000000000000000A"
        
        try:
            # Test invalid email
            r_invalid = self.session.post(f"{API}/wallet/{test_addr}/notify",
                                         json={"email": "invalid"},
                                         timeout=15)
            self.assert_equal(r_invalid.status_code, 400, "Invalid email returns 400")
            error_data = r_invalid.json()
            self.assert_equal(error_data.get("error"), "invalid_email", "Error is 'invalid_email'")
            
            # Test empty email
            r_empty = self.session.post(f"{API}/wallet/{test_addr}/notify",
                                       json={"email": ""},
                                       timeout=15)
            self.assert_equal(r_empty.status_code, 400, "Empty email returns 400")
            
            # Test missing body (should be 422 Pydantic validation error)
            r_missing = self.session.post(f"{API}/wallet/{test_addr}/notify",
                                         json={},
                                         timeout=15)
            self.assert_equal(r_missing.status_code, 422, "Missing email returns 422")
            
            # Test valid email
            r_valid = self.session.post(f"{API}/wallet/{test_addr}/notify",
                                       json={"email": "me@example.com"},
                                       timeout=15)
            self.assert_equal(r_valid.status_code, 200, "Valid email returns 200")
            
            data = r_valid.json()
            self.assert_equal(data.get("ok"), True, "Response ok=true")
            self.assert_equal(data.get("address"), test_addr.lower(), "Response has address")
            self.assert_equal(data.get("email"), "me@example.com", "Response has email")
            self.assert_true(data.get("unlock_at") is not None, "Response has unlock_at")
            
            # Test idempotency - call again with same email
            r_repeat = self.session.post(f"{API}/wallet/{test_addr}/notify",
                                        json={"email": "me@example.com"},
                                        timeout=15)
            self.assert_equal(r_repeat.status_code, 200, "Repeat call returns 200 (idempotent)")
            
            # Test invalid address in path
            r_bad_addr = self.session.post(f"{API}/wallet/0xinvalid/notify",
                                          json={"email": "test@example.com"},
                                          timeout=15)
            self.assert_equal(r_bad_addr.status_code, 400, "Invalid address returns 400")
            
            print("✓ Wallet notify test passed")
            
        except Exception as e:
            self.failed += 1
            error = f"Wallet notify test failed: {e}"
            self.errors.append(error)
            print(f"✗ {error}")

    def test_regression_endpoints(self):
        """Test existing endpoints for regression"""
        print("\n=== Test 6: Regression - Existing Endpoints ===")
        
        try:
            # GET /api/config
            r = self.session.get(f"{API}/config", timeout=15)
            self.assert_equal(r.status_code, 200, "GET /api/config")
            
            # GET /api/stats
            r = self.session.get(f"{API}/stats", timeout=15)
            self.assert_equal(r.status_code, 200, "GET /api/stats")
            
            # GET /api/leaderboard
            r = self.session.get(f"{API}/leaderboard", timeout=15)
            self.assert_equal(r.status_code, 200, "GET /api/leaderboard")
            
            # GET /api/referrals/{address}
            test_addr = "0xBB0000000000000000000000000000000000000A"
            r = self.session.get(f"{API}/referrals/{test_addr}", timeout=15)
            self.assert_equal(r.status_code, 200, "GET /api/referrals/{address}")
            
            # Admin endpoints with token
            r = self.session.get(f"{API}/admin/claims", 
                               headers=self.admin_headers(),
                               timeout=15)
            self.assert_equal(r.status_code, 200, "GET /api/admin/claims")
            
            r = self.session.get(f"{API}/admin/referrals",
                               headers=self.admin_headers(),
                               timeout=15)
            self.assert_equal(r.status_code, 200, "GET /api/admin/referrals")
            
            r = self.session.get(f"{API}/admin/credits",
                               headers=self.admin_headers(),
                               timeout=15)
            self.assert_equal(r.status_code, 200, "GET /api/admin/credits")
            
            r = self.session.get(f"{API}/admin/content",
                               headers=self.admin_headers(),
                               timeout=15)
            self.assert_equal(r.status_code, 200, "GET /api/admin/content")
            
            r = self.session.get(f"{API}/admin/campaign",
                               headers=self.admin_headers(),
                               timeout=15)
            self.assert_equal(r.status_code, 200, "GET /api/admin/campaign")
            
            r = self.session.get(f"{API}/admin/social",
                               headers=self.admin_headers(),
                               timeout=15)
            self.assert_equal(r.status_code, 200, "GET /api/admin/social")
            
            r = self.session.get(f"{API}/admin/onchain",
                               headers=self.admin_headers(),
                               timeout=15)
            self.assert_equal(r.status_code, 200, "GET /api/admin/onchain")
            
            print("✓ Regression tests passed")
            
        except Exception as e:
            self.failed += 1
            error = f"Regression test failed: {e}"
            self.errors.append(error)
            print(f"✗ {error}")

    def run_all_tests(self):
        """Run all tests"""
        print("\n" + "="*70)
        print("HUMANITY COIN BACKEND API TESTS - Phase 3 Dashboard")
        print("="*70)
        
        # Login first
        if not self.login_admin():
            print("\n✗ Cannot proceed without admin token")
            return False
        
        # Run all tests
        self.test_wallet_fresh_address()
        self.test_wallet_claimed_address()
        self.test_wallet_history()
        self.test_wallet_history_with_credit()
        self.test_wallet_notify()
        self.test_regression_endpoints()
        
        # Summary
        print("\n" + "="*70)
        print("TEST SUMMARY")
        print("="*70)
        print(f"Passed: {self.passed}")
        print(f"Failed: {self.failed}")
        
        if self.errors:
            print("\nERRORS:")
            for i, error in enumerate(self.errors, 1):
                print(f"{i}. {error}")
        
        print("="*70)
        
        return self.failed == 0


if __name__ == "__main__":
    runner = TestRunner()
    success = runner.run_all_tests()
    exit(0 if success else 1)
