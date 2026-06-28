# Humanity Coin — PRD

## Original Problem Statement
Rebuild Humanity Coin as a PHP 8 + MySQL + React stack for FTP-upload deployment to DirectAdmin shared hosting. Reuse the existing React frontend (Tailwind + Shadcn) and the HumanityCoin.sol contract from `/app/exports/humanity-coin/`. The PHP backend must mirror all current FastAPI endpoints (config, claim, wallet, referrals, stats, admin login/JWT, admin claims/referrals/credit/credits/content/campaign/onchain/social). Add a Social Media admin tab + public social icons (Facebook, X, Instagram, TikTok). Ship an `install.php` that creates the MySQL schema on first run, and a single ZIP for FTP extraction into `public_html`.

> Note: The referenced legacy assets (`/app/exports/humanity-coin/`, the previous Solidity / FastAPI / React build) did not exist in the pod when the task started, so the entire stack was rebuilt from the spec. Admin password preserved: `humanity-admin-2026`. Marketing wallet baked into the contract: `0x1eE7dD9BCfbB335a34181275a50af4C92D4851F1`.

## Architecture
- **Solidity** — `/app/contracts/HumanityCoin.sol`: BEP-20 token, 1 B max supply, hard-codes marketing wallet, 5% pre-mint to marketing, 95% to deployer. `distributeClaim()` helper for the backend, plus `burn()`.
- **Deliverable (PHP + MySQL)** — `/app/dist/humanity-coin/` packed into `/app/dist/humanity-coin.zip` (161 KB):
  - `install.php` web-form installer → schema + seed + JWT secret + `config.php`, then self-renames to `install.locked.php`.
  - `api/index.php` front controller + 19 route files + `bootstrap.php` (PDO, HS256 JWT, helpers).
  - `.htaccess` Apache rewrites for `/api/*` → `api/index.php` and SPA fallback.
  - Built React in `/static/` + `index.html`.
  - `contracts/HumanityCoin.sol` shipped alongside.
- **Live preview** — `/app/backend/server.py` (FastAPI + MongoDB) mirrors the same endpoint surface so the React app runs in the Emergent preview without PHP.
- **Frontend** — React 19 + Tailwind + Sonner. Routes `/` (home) and `/admin` (login + 7-tab dashboard). All interactive elements carry `data-testid` (catalog in `/app/frontend/src/constants/testIds/index.js`).

## Personas
1. **Visitor** — lands on `/`, sees hero / claim CTA / live stats / social footer.
2. **Holder** — connects wallet, claims daily, shares referral link, monitors balances.
3. **Admin** — signs in at `/admin`, manages claims, credits, content, campaigns, social URLs, on-chain stats.

## Core Requirements (static)
- All public + admin endpoints under `/api/*`, exact mirror in PHP and FastAPI.
- 24h claim cooldown, configurable in admin.
- Referral bonus on first claim only, no duplicates.
- JWT (HS256, 12h) for admin auth, bcrypt password storage.
- Live BSC RPC reads for on-chain dashboard (chainId, block, marketing BNB, totalSupply, marketing token balance).
- Social tab (Facebook / X / Instagram / TikTok) wired to public footer icons.
- Campaign banner toggle on homepage.

## Implemented (2026-06-28)
- ✅ Solidity HumanityCoin.sol with 5%-to-marketing pre-mint and `distributeClaim()`.
- ✅ Full PHP 8 backend (19 route files + bootstrap + front controller) on MySQL via PDO.
- ✅ `install.php` web installer (schema + seed + JWT secret + config.php) with self-lock.
- ✅ `.htaccess` rewrites + SPA fallback + static-asset cache + denied access to `config.php`.
- ✅ FastAPI mirror against MongoDB for live preview (same endpoint surface).
- ✅ React SPA: hero, marquee, stats card, About spec grid, wallet card, referrals table, footer with 4 social icons.
- ✅ Admin console: 7 tabs (Claims / Referrals / Credit / Content / Campaign / Social / On-Chain).
- ✅ Live BSC RPC reads in admin → verified vs CAKE contract (totalSupply 1.16 B).
- ✅ `?ref=0x…` referral attribution from landing page.
- ✅ Distinctive gold-on-black design with Fraunces serif display, JetBrains Mono accents, spinning coin, grain texture.
- ✅ Tested: 17/17 backend pytest passing + frontend Playwright (1 missing onClick on Credit submit → fixed in same iteration).
- ✅ Single FTP-ready ZIP at `/app/dist/humanity-coin.zip` (161 KB).

## Prioritized Backlog
- P1 — Cron / worker that auto-pushes pending claims on-chain via the marketing wallet (currently admin marks credited + tx_hash manually).
- P1 — Anti-sybil: device-fingerprint or hCaptcha on `/api/claim`.
- P2 — Admin user accounts (multi-admin with audit log).
- P2 — Email/Discord webhook on claim-credited events.
- P2 — Token gating: claim only if wallet holds ≥ X of an NFT.
- P3 — Re-implement frontend as Next.js for SSR/SEO if marketing needs it.

## Key Files
- `/app/contracts/HumanityCoin.sol`
- `/app/dist/humanity-coin/` and `/app/dist/humanity-coin.zip`
- `/app/backend/server.py` (live preview mirror)
- `/app/frontend/src/App.js`, `src/components/Home.jsx`, `src/components/Admin.jsx`
- `/app/frontend/src/constants/testIds/index.js`
