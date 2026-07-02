#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  Extend the existing Humanity Coin app with a dedicated /dashboard page:
    - Claim status + 92-day lock countdown timer and unlock date
    - Full referral center
    - Credit/transaction history
    - Post-unlock swap deep-link to PancakeSwap (BNB or USDT)
  Also: apply the 1-line reentrancy fix to HumanityCoin.sol.

backend:
  - task: "GET /api/wallet/{address} — extended with lock_progress_pct, claim_tx_hash, claim_bnb_paid, claim_cost_usd, claim_status, claimed_at, leaderboard_rank, lock_days_total"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Extended existing endpoint. Manual curl showed the new fields populate correctly for a seeded wallet (0xAA…01) with lock_progress_pct=0, unlock_at set 92 days out, leaderboard_rank=1, claim_bnb_paid=0.012, claim_cost_usd=6."
      - working: true
        agent: "testing"
        comment: "Comprehensive testing completed. Tested both fresh (non-existent) and claimed addresses. Fresh address returns all fields with correct defaults (exists:false, has_claimed:false, all counters 0, lock_days_total:92). Claimed address with referral correctly shows: exists:true, has_claimed:true, total_claimed:2000, pending_balance:2200, total_referrals:1, total_referral_bonus:200, unlock_at 92 days out (±60s), seconds_until_unlock > 7.8M, unlocked:false, lock_progress_pct:0-1, claim_bnb_paid:0.012, claim_cost_usd:6, claim_status:pending, claimed_at ISO Z-string, leaderboard_rank:1. All 87 assertions passed."

  - task: "GET /api/wallet/{address}/history — merged desc timeline of claim + credit + referral"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Returns {address, count, items:[...]}. Each item carries type ∈ {claim,credit,referral}, label, amount, status, tx_hash, created_at + type-specific fields (unlock_at/bnb_paid/cost_usd for claim, note for credit, referee_address for referral). Sorted desc by created_at."
      - working: true
        agent: "testing"
        comment: "Comprehensive testing completed. Verified response shape {address, count, items}. Tested with wallet having claim + referral: count=2, claim item has type:claim, amount:2000, bnb_paid:0.012, cost_usd:6, unlock_at set, status:pending; referral item has type:referral, amount:200, referee_address lowercased, status:pending. Items correctly sorted by created_at desc. Tested with admin credit: credit item has type:credit, amount:500, status:credited, note and tx_hash present. limit=1 parameter works correctly. Invalid address returns 400 with invalid_address error. All assertions passed."

  - task: "POST /api/wallet/{address}/notify — persist email to be notified at unlock"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Validates address + email regex, upserts into unlock_notifications with unique compound index on (wallet_address, email). Email DELIVERY is NOT implemented in this iteration — this endpoint only records intent (MOCKED DELIVERY, to be wired to a worker + email provider later)."
      - working: true
        agent: "testing"
        comment: "Comprehensive testing completed. Invalid email (email:invalid) returns 400 with error:invalid_email. Empty email returns 400. Missing body returns 422 (Pydantic validation). Valid email (me@example.com) returns 200 with {ok:true, address, email, unlock_at}. Idempotency verified: repeat call with same email returns 200 (upsert behavior). Invalid address in path returns 400 with invalid_address. All assertions passed. NOTE: Email delivery is MOCKED - only records intent, actual email sending not implemented."

  - task: "HumanityCoin.sol reentrancy fix"
    implemented: true
    working: "NA"
    file: "contracts/HumanityCoin.sol"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Moved `locks[msg.sender] = Lock({...})` to immediately after the `require(locks[msg.sender].amount == 0)` guard, before the marketing/liquidity external calls. Not on the backend test surface — Solidity change only. Runtime verification requires a Foundry/Hardhat suite, not backend pytest."

frontend:
  - task: "/dashboard route — connect-wallet prompt state"
    implemented: true
    working: "NA"
    file: "frontend/src/components/Dashboard.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Manually screenshotted the disconnected state (data-testid=dash-connect-prompt) and the connected state with all sub-cards. Frontend testing agent has NOT been invoked yet — pending user permission."

  - task: "/dashboard route — connected state (LockCard + SwapCard + ReferralCard + HistoryTable)"
    implemented: true
    working: "NA"
    file: "frontend/src/components/Dashboard.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Manual browser screenshot with injected window.ethereum (address 0xAA…01) confirmed: live countdown (91d 23h 54m …), progress bar, unlock-date pill, notify form, disabled swap buttons with 'LOCKED' pill, referral share link + QR, leaderboard rank #1 pill, referee row for 0xAA…02, and transaction history rows for both the claim (+2.00K HC) and referral bonus (+200 HC)."

metadata:
  created_by: "main_agent"
  version: "1.2"
  test_sequence: 4
  run_ui: false

test_plan:
  current_focus: []
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      Backend Phase 1 done. Please test the three new/extended endpoints only:
        1. GET /api/wallet/{address} — verify the new fields are present and correct for both
           a fresh (non-existent) address and a claimed address. Seed data if needed via POST /api/claim.
        2. GET /api/wallet/{address}/history — verify it merges claims + admin credits + referral bonuses (as referrer),
           sorted by created_at desc, honors ?limit (1..500).
        3. POST /api/wallet/{address}/notify — 400 on invalid email, 200 + upsert on valid email, idempotent when
           called twice with the same (wallet,email).
      Existing endpoints (config, claim, wallet, referrals, stats, leaderboard, admin/*) should still work — please
      run the previous suite (backend/tests/test_phase2_tokenomics.py exists) to catch regressions.
      Admin password: humanity-admin-2026. No CORS or auth changes were made.
  - agent: "testing"
    message: |
      ✅ ALL BACKEND TESTS PASSED - Phase 3 Dashboard endpoints fully functional.
      
      Comprehensive testing completed on all 3 focus tasks:
      
      1. ✅ GET /api/wallet/{address} - WORKING
         - Fresh address: All fields return correct defaults (exists:false, all counters 0)
         - Claimed address: All new fields working (lock_progress_pct, claim_tx_hash, claim_bnb_paid, 
           claim_cost_usd, claim_status, claimed_at, leaderboard_rank, lock_days_total)
         - Unlock timing accurate (92 days ±60s)
         - Leaderboard rank calculation working
      
      2. ✅ GET /api/wallet/{address}/history - WORKING
         - Correctly merges claims, credits, and referrals
         - All type-specific fields present (unlock_at/bnb_paid/cost_usd for claims, note/tx_hash for credits,
           referee_address for referrals)
         - Sorted by created_at desc
         - limit parameter working
         - Invalid address validation working
      
      3. ✅ POST /api/wallet/{address}/notify - WORKING
         - Email validation working (invalid/empty emails return 400)
         - Valid emails return 200 with correct response shape
         - Idempotent (upsert behavior confirmed)
         - Invalid address validation working
         - NOTE: Email delivery is MOCKED (only records intent, actual sending not implemented)
      
      4. ✅ REGRESSION TESTS - ALL PASSING
         - Ran existing pytest suite: 16/16 tests passed
         - All existing endpoints working: /api/config, /api/stats, /api/leaderboard, /api/referrals,
           /api/admin/login, /api/admin/claims, /api/admin/referrals, /api/admin/credits,
           /api/admin/content, /api/admin/campaign, /api/admin/social, /api/admin/onchain
      
      Test Results: 87 assertions passed in custom tests + 16 pytest tests passed = 100% success rate
      No critical issues found. All endpoints functioning as specified.