import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { fmtAmount, fmtDuration, shorten } from "@/lib/wallet";
import { TID } from "@/constants/testIds";
import { toast } from "sonner";
import { CoinMark, Arrow, CopyIcon, ExternalIcon } from "@/components/Icons";

function Stat({ label, value, sub, testid }) {
    return (
        <div className="hc-card p-5 md:p-6" data-testid={testid}>
            <div className="font-mono text-[10.5px] text-[var(--hc-text-mute)] uppercase tracking-[0.18em]">{label}</div>
            <div className="font-display text-3xl md:text-4xl font-black mt-2">{value}</div>
            {sub && <div className="text-[12px] text-[var(--hc-text-dim)] mt-1">{sub}</div>}
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
            <div className="marquee-track whitespace-nowrap">
                <span>{text}   •   {text}</span>
            </div>
        </div>
    );
}

export default function Home({ cfg, account, onConnect, initialReferrer }) {
    const [wallet, setWallet]     = useState(null);
    const [stats, setStats]       = useState(null);
    const [refs, setRefs]         = useState({ items: [], total_bonus: 0, count: 0 });
    const [claiming, setClaiming] = useState(false);
    const [cooldown, setCooldown] = useState(0);
    const [showCampaign, setShowCampaign] = useState(true);
    const tickRef = useRef(null);

    // hydrate stats
    useEffect(() => {
        api.stats().then(setStats).catch(()=>{});
    }, []);

    // refresh wallet + referrals when account changes
    const refreshWallet = async () => {
        if (!account) { setWallet(null); setRefs({items:[],total_bonus:0,count:0}); return; }
        try {
            const [w, r] = await Promise.all([ api.wallet(account), api.referrals(account) ]);
            setWallet(w);
            setRefs(r);
            setCooldown(Math.max(0, w?.seconds_left || 0));
        } catch (e) { console.error(e); }
    };
    useEffect(() => { refreshWallet(); /* eslint-disable-next-line */ }, [account]);

    // cooldown countdown
    useEffect(() => {
        if (cooldown <= 0) { if (tickRef.current) clearInterval(tickRef.current); return; }
        tickRef.current = setInterval(() => setCooldown(s => Math.max(0, s - 1)), 1000);
        return () => clearInterval(tickRef.current);
    }, [cooldown]);

    const onClaim = async () => {
        if (!account) { await onConnect(); return; }
        setClaiming(true);
        try {
            await api.claim(account, initialReferrer);
            toast.success(`Claim recorded: +${cfg?.claim?.amount || 10} HUMAN (pending payout)`);
            await refreshWallet();
            api.stats().then(setStats).catch(()=>{});
        } catch (e) {
            const data = e?.response?.data;
            if (data?.error === "cooldown") {
                setCooldown(data.seconds_left || 0);
                toast.error(`Cooldown active — next claim in ${fmtDuration(data.seconds_left)}`);
            } else toast.error(data?.error || e.message || "Claim failed");
        } finally { setClaiming(false); }
    };

    const referralUrl = useMemo(() => {
        if (!account) return "";
        const base = typeof window !== "undefined" ? window.location.origin : "";
        return `${base}/?ref=${account}`;
    }, [account]);

    const copyReferral = async () => {
        if (!referralUrl) return;
        try {
            await navigator.clipboard.writeText(referralUrl);
            toast.success("Referral link copied");
        } catch { toast.error("Copy failed — long-press to copy"); }
    };

    const canClaim = !!account && (wallet?.can_claim_now ?? true) && cooldown === 0;

    return (
        <div>
            <Campaign cfg={cfg} onClose={() => setShowCampaign(false)} />

            {/* HERO */}
            <section className="px-6 md:px-10 pt-12 md:pt-20 pb-10 md:pb-16 max-w-6xl mx-auto">
                <div className="grid lg:grid-cols-[1.2fr_1fr] gap-10 items-center">
                    <div>
                        <div className="hc-pill fadeup">$HUMAN · DAILY DROP</div>
                        <h1 data-testid={TID.heroTitle}
                            className="font-display text-[44px] md:text-[64px] leading-[1.02] font-black mt-5 fadeup delay-1">
                            {cfg?.content?.hero_title || "Earn Humanity Coin every day."}
                        </h1>
                        <p data-testid={TID.heroSubtitle}
                           className="text-[16px] md:text-[18px] text-[var(--hc-text-dim)] mt-5 max-w-[60ch] leading-relaxed fadeup delay-2">
                            {cfg?.content?.hero_subtitle || "Connect your wallet, claim your daily HUMAN, and invite friends to grow the movement."}
                        </p>

                        <div className="mt-8 flex flex-wrap items-center gap-3 fadeup delay-3">
                            {!account ? (
                                <button data-testid={TID.heroConnect} onClick={onConnect} className="hc-btn">
                                    Connect Wallet <Arrow />
                                </button>
                            ) : (
                                <button data-testid={TID.heroClaim} disabled={!canClaim || claiming} onClick={onClaim} className="hc-btn">
                                    {claiming ? "Claiming…" : canClaim ? `Claim ${cfg?.claim?.amount || 10} HUMAN` : `Cooldown · ${fmtDuration(cooldown)}`}
                                </button>
                            )}
                            <a href="#how" className="hc-btn-ghost">How it works</a>
                        </div>

                        {account && (
                            <div data-testid={TID.heroCountdown}
                                 className="mt-5 font-mono text-[12px] text-[var(--hc-text-mute)]">
                                {wallet?.last_claim_at
                                    ? <>Last claim: {new Date(wallet.last_claim_at).toLocaleString()} · Next in <span className="text-[var(--hc-gold-hi)]">{fmtDuration(cooldown)}</span></>
                                    : <>You haven't claimed yet — your first claim creates your wallet record.</>}
                            </div>
                        )}
                        {initialReferrer && (
                            <div className="mt-3 text-[12px] text-[var(--hc-mint)] font-mono">
                                Referred by {shorten(initialReferrer)} — they'll earn {cfg?.claim?.referral_bonus || 5} HUMAN on your first claim.
                            </div>
                        )}
                    </div>

                    {/* coin visual */}
                    <div className="relative h-[320px] md:h-[440px] hidden lg:flex items-center justify-center fadeup delay-4">
                        <div className="absolute inset-0 rounded-full blur-3xl opacity-30"
                             style={{background:"radial-gradient(circle at 50% 40%, #e8b900, transparent 60%)"}}/>
                        <CoinMark size={360} className="coin relative drop-shadow-[0_30px_60px_rgba(232,185,0,0.35)]"/>
                    </div>
                </div>
            </section>

            {/* live marquee */}
            <Marquee items={[
                { label: "WALLETS",         value: stats?.wallets ?? "—" },
                { label: "CLAIMS",          value: stats?.claims_total ?? "—" },
                { label: "HUMAN DISTRIBUTED", value: fmtAmount(stats?.human_distributed ?? 0) },
                { label: "REFERRALS",       value: stats?.referrals ?? "—" },
                { label: "MARKETING WALLET", value: shorten(cfg?.token?.marketing_wallet || "") },
            ]}/>

            {/* wallet & stats */}
            {account ? (
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
                                <Mini label="Total claimed"   value={fmtAmount(wallet?.total_claimed)}      testid={TID.walletTotalClaimed} />
                                <Mini label="Pending"         value={fmtAmount(wallet?.pending_balance)}    testid={TID.walletPending}      tone="warn" />
                                <Mini label="Credited"        value={fmtAmount(wallet?.credited_balance)}   testid={TID.walletCredited}     tone="mint" />
                                <Mini label="Referrals"       value={wallet?.total_referrals ?? 0}          testid={TID.walletReferrals} />
                            </div>
                        </div>
                        <div className="hc-card p-6 md:p-7 flex flex-col">
                            <div className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-[var(--hc-text-dim)]">Refer & earn</div>
                            <div className="text-[14px] mt-2">
                                Share your link. Earn <span className="text-[var(--hc-gold-hi)] font-semibold">{cfg?.claim?.referral_bonus || 5} HUMAN</span> each time a new wallet claims with your code.
                            </div>
                            <div className="mt-4 flex items-center gap-2">
                                <input data-testid={TID.referralLink} readOnly value={referralUrl} className="hc-input font-mono !text-[12px]" />
                                <button data-testid={TID.referralCopyBtn} onClick={copyReferral} className="hc-btn-ghost !py-2 !px-3" aria-label="Copy">
                                    <CopyIcon />
                                </button>
                            </div>
                            <div className="mt-4 text-[12px] text-[var(--hc-text-mute)]">
                                Total bonus earned: <span className="text-[var(--hc-mint)]">+{fmtAmount(refs?.total_bonus)} HUMAN</span> · {refs?.count || 0} referrals
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
                                                <td>+{fmtAmount(r.bonus_amount)} HUMAN</td>
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
            ) : null}

            {/* global stats */}
            <section id="how" className="px-6 md:px-10 py-12 md:py-16 max-w-6xl mx-auto">
                <div className="grid md:grid-cols-3 gap-5" data-testid={TID.statsCard}>
                    <Stat label="Total wallets"     value={fmtAmount(stats?.wallets ?? 0, 0)}        sub="and growing" />
                    <Stat label="HUMAN distributed" value={fmtAmount(stats?.human_distributed ?? 0)} sub={`${fmtAmount(stats?.claims_credited ?? 0, 0)} claims credited`} />
                    <Stat label="Referrals"         value={fmtAmount(stats?.referrals ?? 0, 0)}      sub={`+${fmtAmount(stats?.referral_bonus_total ?? 0)} HUMAN bonus paid`} />
                </div>

                {/* About */}
                <div className="hc-card mt-8 p-7 md:p-10">
                    <div className="grid md:grid-cols-[1fr_1.6fr] gap-8 items-start">
                        <div>
                            <div className="hc-pill">Mission</div>
                            <h2 className="font-display text-3xl md:text-4xl font-black mt-4 leading-[1.05]">
                                {cfg?.content?.about_title || "What is Humanity Coin?"}
                            </h2>
                        </div>
                        <div className="text-[15px] md:text-[16.5px] text-[var(--hc-text-dim)] leading-[1.7]">
                            {cfg?.content?.about_text || "Humanity Coin (HUMAN) is a community-driven BEP-20 token rewarding everyday people for showing up. 5% of supply funds the daily claim treasury — yours, simply for being human."}
                            <div className="mt-6 grid sm:grid-cols-3 gap-3">
                                <Spec label="Symbol"         value="HUMAN"/>
                                <Spec label="Network"        value={cfg?.token?.chain_name || "BNB Smart Chain"}/>
                                <Spec label="Claim"          value={`${cfg?.claim?.amount || 10}/day`}/>
                                <Spec label="Referral bonus" value={`+${cfg?.claim?.referral_bonus || 5}`}/>
                                <Spec label="Marketing wallet"
                                      value={shorten(cfg?.token?.marketing_wallet || "")}
                                      hint="5% of supply"/>
                                <Spec label="Contract"
                                      value={cfg?.token?.contract_address ? shorten(cfg.token.contract_address) : "TBD"}
                                      hint={cfg?.token?.contract_address ? "live" : "set in admin"}/>
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

function Spec({ label, value, hint }) {
    return (
        <div className="rounded-xl border border-white/[0.06] p-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--hc-text-mute)]">{label}</div>
            <div className="mt-1.5 font-mono text-[13.5px] text-white">{value}</div>
            {hint && <div className="text-[11px] text-[var(--hc-text-dim)] mt-0.5">{hint}</div>}
        </div>
    );
}
