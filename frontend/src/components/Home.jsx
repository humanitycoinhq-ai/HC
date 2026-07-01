import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { fmtAmount, fmtDuration, shorten } from "@/lib/wallet";
import { TID } from "@/constants/testIds";
import { toast } from "sonner";
import { Arrow, CopyIcon, ExternalIcon } from "@/components/Icons";

/* ===================== bits ===================== */

function Stat({ label, value, sub, testid }) {
    const long = String(value ?? "").length > 8;
    return (
        <div className="hc-card p-5 md:p-6 min-w-0" data-testid={testid}>
            <div className="font-mono text-[10.5px] text-[var(--hc-text-mute)] uppercase tracking-[0.18em]">{label}</div>
            <div className={`font-display font-black mt-2 leading-tight ${long ? "text-lg md:text-xl xl:text-2xl" : "text-2xl md:text-3xl xl:text-4xl"}`}>{value}</div>
            {sub && <div className="text-[12px] text-[var(--hc-text-dim)] mt-1 truncate">{sub}</div>}
        </div>
    );
}

function Spec({ label, value, hint }) {
    return (
        <div className="rounded-xl border border-white/[0.06] p-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--hc-text-mute)]">{label}</div>
            <div className="mt-1.5 font-mono text-[13.5px] text-white break-all">{value}</div>
            {hint && <div className="text-[11px] text-[var(--hc-text-dim)] mt-0.5">{hint}</div>}
        </div>
    );
}

function Campaign({ cfg, onClose }) {
    if (!cfg?.campaign?.active) return null;
    const c = cfg.campaign;
    return (
        <div data-testid={TID.campaignBanner}
             className="relative mx-4 md:mx-10 mt-4 hc-card-gold px-5 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
                <div className="hc-pill !text-[10px]">CAMPAIGN</div>
                <div className="truncate">
                    <span className="font-semibold">{c.title}</span>
                    {c.message && <span className="text-[var(--hc-text-dim)]"> — {c.message}</span>}
                </div>
            </div>
            <div className="flex items-center gap-2">
                {c.cta_url && c.cta_label && (
                    <a data-testid={TID.campaignCta} href={c.cta_url} target="_blank" rel="noopener noreferrer"
                       className="hc-btn !py-2 !px-4 !text-[12px] gap-1.5">{c.cta_label} <ExternalIcon /></a>
                )}
                <button data-testid={TID.campaignClose} onClick={onClose} aria-label="dismiss"
                        className="w-8 h-8 rounded-full border border-white/10 text-[var(--hc-text-dim)] hover:text-white hover:border-white/30">×</button>
            </div>
        </div>
    );
}

function Marquee({ items }) {
    const text = items.map(i => `${i.label}  ${i.value}`).join("   •   ");
    return (
        <div className="overflow-hidden border-y border-white/[0.04] bg-black/30 py-2 text-[var(--hc-text-dim)] text-[12.5px] font-mono">
            <div className="marquee-track whitespace-nowrap"><span>{text}   •   {text}</span></div>
        </div>
    );
}

/* ===================== home ===================== */

export default function Home({ cfg, account, onConnect, initialReferrer }) {
    const [wallet, setWallet]     = useState(null);
    const [stats, setStats]       = useState(null);
    const [refs, setRefs]         = useState({ items: [], total_bonus: 0, count: 0 });
    const [claiming, setClaiming] = useState(false);
    const [secondsLeft, setSecondsLeft] = useState(0);
    const tickRef = useRef(null);

    useEffect(() => { api.stats().then(setStats).catch(()=>{}); }, []);

    const refreshWallet = async () => {
        if (!account) { setWallet(null); setRefs({items:[],total_bonus:0,count:0}); return; }
        try {
            const [w, r] = await Promise.all([ api.wallet(account), api.referrals(account) ]);
            setWallet(w);
            setRefs(r);
            setSecondsLeft(Math.max(0, w?.seconds_until_unlock || 0));
        } catch (e) { console.error(e); }
    };
    useEffect(() => { refreshWallet(); /* eslint-disable-next-line */ }, [account]);

    // countdown on lock
    useEffect(() => {
        if (secondsLeft <= 0) { if (tickRef.current) clearInterval(tickRef.current); return; }
        tickRef.current = setInterval(() => setSecondsLeft(s => Math.max(0, s - 1)), 1000);
        return () => clearInterval(tickRef.current);
    }, [secondsLeft]);

    const onClaim = async () => {
        if (!account) { await onConnect(); return; }
        setClaiming(true);
        try {
            await api.claim(account, initialReferrer);
            toast.success(`Claim recorded — ${cfg?.claim?.reward_tokens || 2000} HC locked for ${cfg?.claim?.lock_days || 92} days`);
            await refreshWallet();
            api.stats().then(setStats).catch(()=>{});
        } catch (e) {
            const data = e?.response?.data;
            if (data?.error === "already_claimed") toast.error("You've already claimed — only one entry per wallet.");
            else toast.error(data?.error || e.message || "Claim failed");
        } finally { setClaiming(false); }
    };

    const referralUrl = useMemo(() => {
        if (!account) return "";
        const base = typeof window !== "undefined" ? window.location.origin : "";
        return `${base}/?ref=${account}`;
    }, [account]);

    const copyReferral = async () => {
        if (!referralUrl) return;
        try { await navigator.clipboard.writeText(referralUrl); toast.success("Referral link copied"); }
        catch { toast.error("Copy failed"); }
    };

    const hasClaimed = !!wallet?.has_claimed;
    const unlocked   = !!wallet?.unlocked;
    const reward     = cfg?.claim?.reward_tokens || 2000;
    const lockDays   = cfg?.claim?.lock_days || 92;
    const cost       = cfg?.claim?.cost_usd || 6;
    const refBonus   = cfg?.claim?.referral_tokens || 200;
    const refBonusUsd= cfg?.claim?.referral_usd || 100;

    const wp = cfg?.content?.whitepaper_url || "/Whitepaper.html";
    const logo = "/img/hc-coin.png";

    return (
        <div>
            <Campaign cfg={cfg} />

            {/* HERO */}
            <section className="px-6 md:px-10 pt-10 md:pt-16 pb-10 max-w-6xl mx-auto">
                <div className="grid lg:grid-cols-[1.1fr_1fr] gap-10 items-center">
                    <div>
                        <div className="hc-pill fadeup">{cfg?.content?.hero_eyebrow || "$HC · Whitepaper v2.1"}</div>
                        <h1 data-testid={TID.heroTitle}
                            className="font-display text-[44px] md:text-[68px] leading-[1.02] font-black mt-5 fadeup delay-1">
                            {cfg?.content?.hero_title || "Join for $6 · Secure $1,000 Value"}
                        </h1>
                        <p data-testid={TID.heroSubtitle}
                           className="text-[16px] md:text-[18px] text-[var(--hc-text-dim)] mt-5 max-w-[60ch] leading-relaxed fadeup delay-2">
                            {cfg?.content?.hero_subtitle}
                        </p>

                        <div className="mt-8 flex flex-wrap items-center gap-3 fadeup delay-3">
                            {!account ? (
                                <button data-testid={TID.heroConnect} onClick={onConnect} className="hc-btn">
                                    Connect Wallet <Arrow />
                                </button>
                            ) : hasClaimed ? (
                                unlocked ? (
                                    <div className="hc-pill !text-[12px] !text-[var(--hc-mint)] !bg-[rgba(111,226,168,0.08)] !border-[rgba(111,226,168,0.25)]">
                                        ✓ Tokens unlocked — fully transferable
                                    </div>
                                ) : (
                                    <div data-testid={TID.heroCountdown} className="hc-pill !text-[12px]">
                                        🔒 {fmtDuration(secondsLeft)} until {lockDays}-day unlock
                                    </div>
                                )
                            ) : (
                                <button data-testid={TID.heroClaim} disabled={claiming} onClick={onClaim} className="hc-btn">
                                    {claiming ? "Submitting…" : `Claim ${fmtAmount(reward, 0)} HC for $${cost}`}
                                </button>
                            )}
                            <a href={wp} target="_blank" rel="noopener noreferrer" className="hc-btn-ghost">Read whitepaper</a>
                        </div>

                        {initialReferrer && !hasClaimed && (
                            <div className="mt-4 text-[12px] text-[var(--hc-mint)] font-mono">
                                Referred by {shorten(initialReferrer)} — they earn +{fmtAmount(refBonus, 0)} HC (${refBonusUsd}) instantly when you claim.
                            </div>
                        )}
                    </div>

                    {/* coin visual — actual logo */}
                    <div className="relative h-[340px] md:h-[460px] flex items-center justify-center fadeup delay-4">
                        <div className="absolute inset-0 rounded-full blur-3xl opacity-40 pointer-events-none"
                             style={{background:"radial-gradient(circle at 50% 40%, #e8b900, transparent 60%)"}}/>
                        <img src={logo} alt="Humanity Coin" data-testid="hero-coin-image"
                             className="relative w-[80%] max-w-[420px] coin drop-shadow-[0_30px_60px_rgba(232,185,0,0.4)]"/>
                    </div>
                </div>

                {/* big-number row from whitepaper */}
                <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Stat label="Total supply" value={cfg?.content?.stat_supply || "1B"} sub="Fixed, BEP-20" />
                    <Stat label="Tx tax"       value={cfg?.content?.stat_tax    || "10%"} sub="4 / 3 / 3 split" />
                    <Stat label="Network"      value={cfg?.content?.stat_network|| "BSC"} sub={`Chain ${cfg?.token?.chain_id || 56}`} />
                    <Stat label="Seed raised"  value={cfg?.content?.stat_seed   || "$4M"} sub="Pre-launch" />
                </div>
            </section>

            <Marquee items={[
                { label: "JOIN FOR",     value: `$${cost}` },
                { label: "SECURE",       value: `${fmtAmount(reward, 0)} HC` },
                { label: "VALUE",        value: `$${fmtAmount(cfg?.claim?.reward_usd || 1000, 0)}` },
                { label: "LOCK",         value: `${lockDays} days` },
                { label: "REFERRAL",     value: `+${fmtAmount(refBonus, 0)} HC ($${refBonusUsd})` },
                { label: "TOTAL CLAIMS", value: stats?.claims_total ?? "—" },
                { label: "WALLETS",      value: stats?.wallets ?? "—" },
            ]}/>

            {/* WALLET CARD */}
            {account && (
                <section className="px-6 md:px-10 py-12 max-w-6xl mx-auto">
                    <div className="grid md:grid-cols-3 gap-5" data-testid={TID.walletCard}>
                        <div className="hc-card-gold p-6 md:p-7 md:col-span-2">
                            <div className="flex items-center justify-between gap-3 mb-5">
                                <div>
                                    <div className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-[var(--hc-gold-hi)]">Your wallet</div>
                                    <div data-testid={TID.walletAddress} className="font-mono text-[13px] mt-1">{shorten(account, 8)}</div>
                                </div>
                                {cfg?.token?.explorer_url && (
                                    <a className="hc-link inline-flex items-center gap-1.5 text-[12px]"
                                       href={`${cfg.token.explorer_url}/address/${account}`} target="_blank" rel="noopener noreferrer">
                                        View on explorer <ExternalIcon />
                                    </a>
                                )}
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <Mini label="Total claimed" value={`${fmtAmount(wallet?.total_claimed, 0)} HC`} testid={TID.walletTotalClaimed} />
                                <Mini label="Locked"        value={`${fmtAmount(wallet?.pending_balance, 0)} HC`} testid={TID.walletPending}      tone="warn" sub={wallet?.unlock_at ? `until ${new Date(wallet.unlock_at).toLocaleDateString()}` : null} />
                                <Mini label="Unlocked"      value={`${fmtAmount(wallet?.credited_balance, 0)} HC`} testid={TID.walletCredited}     tone="mint" />
                                <Mini label="Referrals"     value={wallet?.total_referrals ?? 0} testid={TID.walletReferrals} sub={`+${fmtAmount(wallet?.total_referral_bonus, 0)} HC earned`} />
                            </div>
                        </div>
                        <div className="hc-card p-6 md:p-7 flex flex-col">
                            <div className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-[var(--hc-text-dim)]">Refer &amp; earn</div>
                            <div className="text-[14px] mt-2">
                                Share your link. Earn <span className="text-[var(--hc-gold-hi)] font-semibold">+{fmtAmount(refBonus, 0)} HC (${refBonusUsd})</span> instantly each time a new wallet claims with your code.
                            </div>
                            <div className="mt-4 flex items-center gap-2">
                                <input data-testid={TID.referralLink} readOnly value={referralUrl} className="hc-input font-mono !text-[12px]" />
                                <button data-testid={TID.referralCopyBtn} onClick={copyReferral} className="hc-btn-ghost !py-2 !px-3" aria-label="Copy"><CopyIcon /></button>
                            </div>
                            <div className="mt-4 text-[12px] text-[var(--hc-text-mute)]">
                                Earned: <span className="text-[var(--hc-mint)]">+{fmtAmount(refs?.total_bonus, 0)} HC</span> · {refs?.count || 0} referrals
                            </div>
                        </div>
                    </div>

                    {refs?.items?.length > 0 && (
                        <div className="hc-card mt-5 overflow-hidden">
                            <div className="px-6 py-4 border-b border-white/[0.05] flex items-center justify-between">
                                <div className="font-display text-[18px] font-bold">Your referrals</div>
                                <div className="font-mono text-[11px] text-[var(--hc-text-mute)] uppercase tracking-[0.16em]">{refs.items.length} entries</div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="hc-table">
                                    <thead><tr><th>Referee</th><th>Bonus</th><th>Status</th><th>When</th></tr></thead>
                                    <tbody>
                                        {refs.items.map((r, i) => (
                                            <tr data-testid={TID.referralListItem(i)} key={i}>
                                                <td className="font-mono">{shorten(r.referee_address, 8)}</td>
                                                <td>+{fmtAmount(r.bonus_amount, 0)} HC</td>
                                                <td><span className={`chip chip-${r.status}`}>{r.status}</span></td>
                                                <td className="text-[var(--hc-text-dim)]">{new Date(r.created_at).toLocaleString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </section>
            )}

            {/* CLAIM MODEL — 4-step from whitepaper §3 */}
            <section id="how" className="px-6 md:px-10 py-12 md:py-20 max-w-6xl mx-auto">
                <div className="hc-pill">Section 003 · The Claim Entry Model</div>
                <h2 className="font-display text-3xl md:text-5xl font-black mt-4 max-w-3xl leading-[1.05]">
                    From <span className="text-[var(--hc-gold-hi)]">$6</span> to <span className="text-[var(--hc-gold-hi)]">$1,000</span> in four steps.
                </h2>
                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mt-10">
                    {[
                        {n:"01", t:"Connect", d:"Connect any Web3 wallet (MetaMask, Trust, WalletConnect) and pass anti-sybil verification in under 60 seconds."},
                        {n:"02", t:`Pay $${cost}`, d:`One-time, non-refundable entry fee paid in BNB or USDT. Half funds marketing, half is auto-paired with HC as PancakeSwap liquidity.`},
                        {n:"03", t:`Claim ${fmtAmount(reward,0)} HC`, d:`Fixed allocation worth $${fmtAmount(cfg?.claim?.reward_usd || 1000, 0)} at the $${cfg?.token?.price_usd || "0.50"} claim price — no VIP tiers, no priority queues.`},
                        {n:"04", t:`${lockDays}-day lock`, d:`Allocation is non-transferable for ${lockDays} days, protecting market depth as liquidity matures. Referral bonuses are instant — no lock.`},
                    ].map(s => (
                        <div key={s.n} className="hc-card p-6">
                            <div className="font-mono text-[11px] text-[var(--hc-gold-hi)] tracking-[0.18em]">STEP {s.n}</div>
                            <div className="font-display text-2xl font-black mt-2">{s.t}</div>
                            <div className="text-[13.5px] text-[var(--hc-text-dim)] mt-2 leading-relaxed">{s.d}</div>
                        </div>
                    ))}
                </div>
            </section>

            {/* 10% TX TAX */}
            <section className="px-6 md:px-10 py-12 max-w-6xl mx-auto">
                <div className="hc-card-gold p-7 md:p-10">
                    <div className="grid md:grid-cols-[1fr_1.5fr] gap-8 items-start">
                        <div>
                            <div className="hc-pill">Section 008</div>
                            <h2 className="font-display text-3xl md:text-4xl font-black mt-3 leading-[1.05]">
                                The 10% Transaction Engine
                            </h2>
                            <p className="text-[14px] text-[var(--hc-text-dim)] mt-4">
                                Every on-chain trade routes value three ways — to holders, to liquidity depth, and to vetted NGOs.
                            </p>
                        </div>
                        <div className="grid sm:grid-cols-3 gap-3">
                            {[
                                {pct: cfg?.tax?.reflection || 4, label:"Reflections",      desc:"Auto-distributed to every holder. The longer you hold, the more you earn."},
                                {pct: cfg?.tax?.liquidity  || 3, label:"Auto-Liquidity",   desc:"Permanently added to the HC/BNB PancakeSwap pool. Reduces slippage forever."},
                                {pct: cfg?.tax?.ngo        || 3, label:"NGO Humanity Vault", desc:"Routed to the timelocked vault. DAO-approved, converted to USDC, sent to NGOs."},
                            ].map(t => (
                                <div key={t.label} className="rounded-xl border border-white/[0.08] p-5 bg-black/30">
                                    <div className="font-display text-4xl font-black text-[var(--hc-gold-hi)]">{t.pct}%</div>
                                    <div className="mt-1 font-semibold">{t.label}</div>
                                    <div className="text-[12px] text-[var(--hc-text-dim)] mt-1.5 leading-relaxed">{t.desc}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* NGO PARTNERS */}
            <section className="px-6 md:px-10 py-12 max-w-6xl mx-auto">
                <div className="flex items-end justify-between flex-wrap gap-4 mb-8">
                    <div>
                        <div className="hc-pill">Section 013 · NGO Partners</div>
                        <h2 className="font-display text-3xl md:text-4xl font-black mt-3">Three causes. Three continents. Verified.</h2>
                    </div>
                    <a href={wp + "#ngo"} target="_blank" rel="noopener noreferrer" className="hc-link text-[13px] inline-flex items-center gap-1.5">Full NGO framework <ExternalIcon /></a>
                </div>
                <div className="grid md:grid-cols-3 gap-5">
                    {(cfg?.ngos || []).map((n, i) => (
                        <div key={i} className="hc-card p-6">
                            <div className="hc-pill !text-[10px]">PARTNER {i+1} · {n.region}</div>
                            <div className="font-display text-2xl font-black mt-4">{n.title}</div>
                            <div className="text-[13.5px] text-[var(--hc-text-dim)] mt-2 leading-relaxed">{n.text}</div>
                        </div>
                    ))}
                </div>
            </section>

            {/* ROADMAP */}
            <section className="px-6 md:px-10 py-12 max-w-6xl mx-auto">
                <div className="hc-pill">Section 015 · Roadmap</div>
                <h2 className="font-display text-3xl md:text-4xl font-black mt-3 mb-8">From foundation to global aid network.</h2>
                <div className="grid md:grid-cols-4 gap-4">
                    {[
                        {q:"Q1-Q2 2026", t:"Foundation", state:"COMPLETED", items:["$4M Seed Raised", "3 NGO Partners Vetted", "Mini App Beta (2,000+ testers)"]},
                        {q:"Q3 2026",    t:"Launch",     state:"UPCOMING",  items:["Public $6 Claim opens", "Viral Referral Engine live", "PancakeSwap DEX listing"]},
                        {q:"Q4 2026",    t:"Impact",     state:"PLANNED",   items:["92-day Unlock event", "First NGO disbursement", "Impact Dashboard v1"]},
                        {q:"2027",       t:"Global",     state:"VISION",    items:["25+ NGOs across 6 continents", "$10M+ vault disbursements", "2M+ unique holders"]},
                    ].map((r, i) => (
                        <div key={i} className="hc-card p-5">
                            <div className="font-mono text-[10px] tracking-[0.16em] text-[var(--hc-gold-hi)] uppercase">{r.q}</div>
                            <div className="font-display text-2xl font-black mt-1.5">{r.t}</div>
                            <div className="mt-1 inline-block font-mono text-[10px] px-2 py-0.5 rounded-full bg-white/[0.04] text-[var(--hc-text-dim)]">{r.state}</div>
                            <ul className="mt-3 space-y-1.5 text-[12.5px] text-[var(--hc-text-dim)]">
                                {r.items.map(it => <li key={it} className="flex gap-2"><span className="text-[var(--hc-gold-hi)]">›</span><span>{it}</span></li>)}
                            </ul>
                        </div>
                    ))}
                </div>
            </section>

            {/* TOKEN SPECS / ABOUT */}
            <section id="about" className="px-6 md:px-10 py-12 max-w-6xl mx-auto">
                <div className="hc-card p-7 md:p-10">
                    <div className="grid md:grid-cols-[1fr_1.6fr] gap-8 items-start">
                        <div>
                            <div className="hc-pill">Mission</div>
                            <h2 className="font-display text-3xl md:text-4xl font-black mt-4 leading-[1.05]">
                                {cfg?.content?.about_title}
                            </h2>
                        </div>
                        <div className="text-[15px] md:text-[16.5px] text-[var(--hc-text-dim)] leading-[1.7]">
                            {cfg?.content?.about_text}
                            <div className="mt-6 grid sm:grid-cols-3 gap-3">
                                <Spec label="Symbol"      value="HC"/>
                                <Spec label="Network"     value={cfg?.token?.chain_name || "BNB Smart Chain"} hint={`Chain ${cfg?.token?.chain_id || 56}`}/>
                                <Spec label="Token price" value={`$${cfg?.token?.price_usd || "0.50"}`} hint="At claim"/>
                                <Spec label="Claim cost"  value={`$${cost}`} hint="One-time"/>
                                <Spec label="Claim reward" value={`${fmtAmount(reward, 0)} HC`} hint={`$${fmtAmount(cfg?.claim?.reward_usd || 1000, 0)}`}/>
                                <Spec label="Lock"        value={`${lockDays} days`} hint="Non-transferable"/>
                                <Spec label="Marketing wallet" value={shorten(cfg?.token?.marketing_wallet || "")} hint="$3 of every claim"/>
                                <Spec label="Liquidity wallet" value={shorten(cfg?.token?.liquidity_wallet || "")} hint="$3 auto-LP"/>
                                <Spec label="Contract"    value={cfg?.token?.contract_address ? shorten(cfg.token.contract_address) : "TBD · Q3 2026"} hint={cfg?.token?.contract_address ? "deployed" : "set in admin after deploy"}/>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}

function Mini({ label, value, sub, testid, tone }) {
    const toneCls = tone === "warn" ? "text-[#ffce3a]" : tone === "mint" ? "text-[var(--hc-mint)]" : "text-white";
    return (
        <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--hc-text-mute)]">{label}</div>
            <div data-testid={testid} className={`font-display text-2xl md:text-3xl font-black mt-1 ${toneCls}`}>{value}</div>
            {sub && <div className="text-[11px] text-[var(--hc-text-mute)] mt-0.5">{sub}</div>}
        </div>
    );
}
