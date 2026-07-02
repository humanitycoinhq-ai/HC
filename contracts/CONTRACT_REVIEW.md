# HumanityCoin.sol — Contract review vs. Whitepaper v2.1 vs. Website

The contract you provided is **internally consistent and safe for a $6 paid-claim model with 92-day lock**, but it does **not yet implement several mechanics described in the v2.1 whitepaper**. This note flags the gaps so you can decide whether to ship as-is, amend the contract, or amend the whitepaper.

## ✅ What the contract correctly implements
| Whitepaper | Contract | Notes |
|---|---|---|
| Token name "Humanity Coin" / symbol HC / 18 decimals / BEP-20 | ✅ | `name`, `symbol`, `decimals` constants. |
| Fixed total supply 1,000,000,000 HC | ✅ | Minted to `address(this)` in constructor. |
| $6 BNB entry → $1,000 of HC | ✅ | `CLAIM_COST_USD = 6`, `CLAIM_REWARD_TOKENS = 2000 × 1e18` at $0.50/HC. |
| Chainlink BNB/USD pricing | ✅ | `getBnbUsdPrice()` / `claimCostInWei()` with 2% slippage tolerance. |
| BNB split: $3 marketing + $3 liquidity | ✅ | `claim()` `msg.value / 2`. |
| Auto-add liquidity to PancakeSwap (6 HC paired) | ✅ | `_autoAddLiquidity()` with try/catch fallback. |
| One-time-only claim per wallet | ✅ | `require(locks[msg.sender].amount == 0)`. |
| 200 HC ($100) instant referral reward | ✅ | `REFERRAL_REWARD`, no lock applied to referrer. |
| Owner can rotate wallets / oracle / router | ✅ | `setWallets` / `setOracle` / `setRouter`. |
| Receive BNB to fund fallback / LP top-ups | ✅ | `receive()` payable. |

## ⚠️ Gaps vs. Whitepaper v2.1
| Whitepaper section | Spec | Contract status | Recommended action |
|---|---|---|---|
| §4 Claim Entry Model | **90-day linear vesting** (1/90th unlocks daily) | Contract uses **92-day all-or-nothing cliff** (`LOCK_DURATION = 92 days`). | Decide: align the whitepaper to a 92-day cliff (simpler, matches contract) OR rewrite `_enforceLock` to compute `released = amount × elapsed / 90 days`. |
| §8 10% Transaction Tax | 4% reflections / 3% auto-LP / 3% NGO Humanity Vault on **every transfer** | **No tax in `_move`** — transfers are plain ERC-20. | Add a `_taxedTransfer()` path with whitelisting (claim contract, vault, router) to avoid tax-on-tax. This is significant scope; budget an additional audit. |
| §5 Humanity Vault | A separate timelocked multisig vault accumulating 3% of every trade | Not present in this contract | Deploy as a separate `HumanityVault` contract; route tax there. |
| §7 Tokenomics | Supply minted to **5 buckets** (Community 20%, Liquidity 20%, NGO 15%, Seed 15%, Team 30%) with per-bucket vesting | All 1B HC minted to `address(this)` | Either keep current design (token contract is the bucket and the team controls distribution off-chain) OR mint directly to bucket-vesting wallets at deploy time. |
| §10 KYC / sybil | Tiered KYC + middleware sybil filter | Out-of-scope for the contract (this is backend) | Already wired into the PHP/FastAPI backend (admin-flagged claims). |
| §11 DAO Governance | Governor Alpha + 48h timelock + 67% supermajority | Not in this contract | Add `GovernorAlpha` + `TimelockController` (OpenZeppelin) in a second contract. |

## 🔒 Security observations
1. **Reentrancy** — ~~`claim()` performs external calls (`marketingWallet.call`, `pancakeRouter.addLiquidityETH`, `liquidityWallet.call`) *before* setting `locks[msg.sender]`.~~ **✅ Fixed 2026-07:** `locks[msg.sender]` is now set immediately after the `require(locks[msg.sender].amount == 0)` guard and *before* any external call. A malicious `marketingWallet` calling back into `claim()` will hit the `require` and revert. Verify in `HumanityCoin.sol` around line 205.
2. **Slippage check** — `addLiquidityETH(... 0, 0, ...)` accepts unlimited slippage. Acceptable when LP is empty/new, but front-runnable once a pool exists. Once pool depth > $5k, switch the mins to a non-zero floor.
3. **Owner is single EOA** — `onlyOwner` controls wallet rotation, oracle, router, and `addLiquidityManual`. Move ownership to a 3-of-5 Gnosis Safe before mainnet.
4. **No pause** — there is no `pause()` for emergencies. Add OpenZeppelin `Pausable` if regulators ever knock.
5. **Oracle freshness** — `getBnbUsdPrice()` reads only `answer`, never checks `updatedAt`. If Chainlink stalls, claims could mis-price. Add `require(updatedAt > block.timestamp - 1 hours)`.
6. **Referrer = claimer-of-record only** — anyone can pass any address as `referrer` (sybil farm). The backend already tracks first-claim-only and unique-referee; ensure the on-chain `claim()` path matches by recording the referrer relationship in the backend before the user signs.

## 📱 Website mismatches (now being corrected)
The first website build assumed the *old* daily-airdrop model (HUMAN symbol, free claim). It will be re-aligned with this contract to:
- Symbol **HC**, not HUMAN
- Headline: **"Join for $6 · Secure $1,000 Value"**
- Claim CTA → wallet send-BNB → backend records pending claim + referral → On-chain lock for 92 days
- Token price $0.50, BSC mainnet (chainId 56)
- Public site: tokenomics donut, 4-step claim model, NGO partner cards, roadmap (Q1-Q2 done, Q3 launch, Q4 unlock, 2027 expansion), 10% tax explainer (kept as roadmap item since contract does not yet enforce it)
- Admin: extra Tokenomics / NGOs / Roadmap content tabs

## TL;DR
Ship the contract **after** the one-line reentrancy fix and the Chainlink staleness check; the rest of the whitepaper gaps (linear vesting, 10% tax, vault, DAO) are a **phase 2** scope and should be implemented as additional contracts, not retrofitted into this one.
