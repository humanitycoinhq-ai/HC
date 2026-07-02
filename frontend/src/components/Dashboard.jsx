import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { shorten, fmtAmount } from "@/lib/wallet";
import { TID } from "@/constants/testIds";

/* ---------------- helpers ---------------- */
const cx = (...xs) => xs.filter(Boolean).join(" ");

function pad(n) { return String(n).padStart(2, "0"); }
function splitDuration(seconds) {
    const s = Math.max(0, Math.floor(seconds || 0));
    const days  = Math.floor(s / 86400);
    const hours = Math.floor((s % 86400) / 3600);
    const mins  = Math.floor((s % 3600) / 60);
    const secs  = s % 60;
    return { days, hours, mins, secs };
}
function fmtDate(iso) {
    if (!iso) return "—";
    try {
        const d = new Date(iso);
        return d.toLocaleDateString(undefined, { year:"numeric", month:"short", day:"numeric" }) +
               " · " + d.toLocaleTimeString(undefined, { hour:"2-digit", minute:"2-digit" });
    } catch { return iso; }
}
function txExplorerUrl(explorer, hash) {
    if (!hash || !explorer) return null;
    return `${explorer.replace(/\/$/, "")}/tx/${hash}`;
}

/* ---------------- countdown ticker ---------------- */
function useCountdown(unlockAtISO) {
    const target = useMemo(() => {
        if (!unlockAtISO) return 0;
        try { return new Date(unlockAtISO).getTime(); } catch { return 0; }
    }, [unlockAtISO]);
    const [tick, setTick] = useState(Date.now());
    useEffect(() => {
        if (!target) return;
        const id = setInterval(() => setTick(Date.now()), 1000);
        return () => clearInterval(id);
    }, [target]);
    const remaining = Math.max(0, Math.floor((target - tick) / 1000));
    return { remaining, unlocked: target > 0 && tick >= target };
}

/* ---------------- little stat block ---------------- */
function Stat({ label, value, sub, testid }) {
    return (
        <div data-testid={testid} className="hc-card p-4 md:p-5">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--hc-text-mute)]">{label}</div>
            <div className="font-display text-2xl md:text-3xl font-black mt-1 text-[var(--hc-text)]">{value}</div>
            {sub ? <div className="text-[12px] text-[var(--hc-text-dim)] mt-1">{sub}</div> : null}
        </div>
    );
}

/* ---------------- Lock Card ---------------- */
function LockCard({ wallet, cfg, onNotified }) {
    const { remaining, unlocked } = useCountdown(wallet?.unlock_at);
    const { days, hours, mins, secs } = splitDuration(remaining);
    const pct = unlocked ? 100 : Math.max(0, Math.min(100, Number(wallet?.lock_progress_pct || 0)));
    const total = Number(wallet?.lock_days_total || 92);
    const daysElapsed = Math.min(total, Math.round((pct / 100) * total));

    const [email, setEmail] = useState("");
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);

    const submitNotify = async (e) => {
        e.preventDefault();
        if (!email) return;
        setSending(true);
        try {
            await api.walletNotify(wallet.address, email);
            setSent(true);
            toast.success("We'll email you when your lock unlocks.");
            onNotified?.();
        } catch (err) {
            toast.error(err?.response?.data?.error || "Could not save email");
        } finally { setSending(false); }
    };

    if (!wallet?.exists || !wallet?.has_claimed) {
        return (
            <div data-testid={TID.dashLockCard} className="hc-card p-6 md:p-7">
                <div className="hc-pill">Lock status</div>
                <h3 className="font-display text-2xl md:text-3xl font-black mt-3">No claim yet</h3>
                <p className="text-[var(--hc-text-dim)] mt-2 max-w-md">
                    Head back to the home page and claim your 2,000 HC for $6 BNB. You'll see your {total}-day
                    lock countdown here right after.
                </p>
                <Link to="/" className="hc-btn mt-5 inline-flex">Go to claim</Link>
            </div>
        );
    }

    return (
        <div data-testid={TID.dashLockCard} className="hc-card-gold p-6 md:p-8">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <div className="hc-pill">92-day lock</div>
                    <h3 className="font-display text-2xl md:text-3xl font-black mt-3">
                        {unlocked ? "Unlocked · you can swap now" : "Time until unlock"}
                    </h3>
                </div>
                <div className="hc-pill !text-[11px]" data-testid={TID.dashLockUnlockDate}>
                    Unlocks: {fmtDate(wallet.unlock_at)}
                </div>
            </div>

            {/* countdown digits */}
            <div data-testid={TID.dashLockCountdown} className="mt-6 grid grid-cols-4 gap-2 md:gap-3 max-w-lg">
                {[["Days", days], ["Hours", pad(hours)], ["Mins", pad(mins)], ["Secs", pad(secs)]].map(([lbl, v]) => (
                    <div key={lbl} className="hc-card p-3 md:p-4 text-center">
                        <div className="font-display text-2xl md:text-4xl font-black text-[var(--hc-gold-hi)]">{v}</div>
                        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--hc-text-mute)] mt-1">{lbl}</div>
                    </div>
                ))}
            </div>

            {/* progress bar */}
            <div className="mt-6">
                <div className="flex items-center justify-between text-[12px] text-[var(--hc-text-dim)]">
                    <span className="font-mono uppercase tracking-[0.14em]">{daysElapsed} / {total} days</span>
                    <span className="font-mono">{pct}%</span>
                </div>
                <div data-testid={TID.dashLockProgress}
                     className="mt-2 h-2 w-full bg-white/[0.06] rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-[var(--hc-gold)] to-[var(--hc-gold-hi)] transition-all duration-500"
                         style={{ width: `${pct}%` }} />
                </div>
            </div>

            {/* notify me form (only if still locked) */}
            {!unlocked && (
                <form onSubmit={submitNotify} className="mt-7 border-t border-white/[0.06] pt-5">
                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--hc-text-mute)]">
                        Notify me when unlocked
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 mt-2">
                        <input
                            data-testid={TID.dashNotifyEmail}
                            type="email" required
                            placeholder="you@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            disabled={sent}
                            className="flex-1 bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm text-[var(--hc-text)] placeholder:text-[var(--hc-text-mute)] focus:outline-none focus:border-[var(--hc-gold)]"
                        />
                        <button
                            data-testid={TID.dashNotifySubmit}
                            type="submit" disabled={sending || sent}
                            className="hc-btn !py-2 !px-4 !text-[13px]">
                            {sent ? "Saved" : (sending ? "Saving…" : "Notify me")}
                        </button>
                    </div>
                    <p className="text-[11px] text-[var(--hc-text-mute)] mt-2">
                        We'll only email you once — at unlock. No newsletters.
                    </p>
                </form>
            )}
        </div>
    );
}

/* ---------------- Swap Card ---------------- */
function SwapCard({ wallet, cfg }) {
    const { unlocked } = useCountdown(wallet?.unlock_at);
    const canSwap = unlocked && wallet?.has_claimed;
    const token = cfg?.token?.contract_address || "";
    const explorer = cfg?.token?.explorer_url || "https://bscscan.com";

    // BSC canonical addresses
    const USDT_BSC = "0x55d398326f99059fF775485246999027B3197955"; // USDT on BSC
    const WBNB     = "BNB"; // PancakeSwap accepts "BNB" as the native shortcut

    const pancakeUrl = (outputAddr) => {
        // Prefer swapping FROM the user's HC token TO the requested output
        const from = token || "BNB";
        return `https://pancakeswap.finance/swap?inputCurrency=${from}&outputCurrency=${outputAddr}`;
    };

    return (
        <div data-testid={TID.dashSwapCard} className="hc-card p-6 md:p-7">
            <div className="hc-pill">Post-unlock swap</div>
            <h3 className="font-display text-2xl md:text-3xl font-black mt-3">Swap HC → BNB or USDT</h3>
            <p className="text-[var(--hc-text-dim)] mt-2 max-w-md text-sm">
                Once your 92-day lock ends, swap your HC on PancakeSwap. We'll deep-link you in with the
                right token pre-selected.
            </p>

            {!canSwap && (
                <div className="mt-4 hc-pill !text-[11px] !text-[var(--hc-coral)] !bg-[rgba(255,122,76,0.08)] !border-[rgba(255,122,76,0.25)]">
                    ⏳ Locked — swap unlocks at end of countdown above
                </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
                <a
                    data-testid={TID.dashSwapBtnBnb}
                    href={canSwap ? pancakeUrl("BNB") : undefined}
                    target={canSwap ? "_blank" : undefined}
                    rel="noopener noreferrer"
                    aria-disabled={!canSwap}
                    onClick={(e) => { if (!canSwap) e.preventDefault(); }}
                    className={cx("hc-btn justify-center", !canSwap && "opacity-50 !cursor-not-allowed")}>
                    Swap HC → BNB
                </a>
                <a
                    data-testid={TID.dashSwapBtnUsdt}
                    href={canSwap ? pancakeUrl(USDT_BSC) : undefined}
                    target={canSwap ? "_blank" : undefined}
                    rel="noopener noreferrer"
                    aria-disabled={!canSwap}
                    onClick={(e) => { if (!canSwap) e.preventDefault(); }}
                    className={cx("hc-btn-ghost justify-center", !canSwap && "opacity-50 !cursor-not-allowed")}>
                    Swap HC → USDT
                </a>
            </div>

            {token && (
                <div className="text-[11px] text-[var(--hc-text-mute)] mt-3 font-mono">
                    Contract: <a href={`${explorer}/token/${token}`} target="_blank" rel="noopener noreferrer"
                                 className="text-[var(--hc-gold-hi)] hover:underline">{shorten(token, 8)}</a>
                </div>
            )}
        </div>
    );
}

/* ---------------- Referral Card ---------------- */
function ReferralCard({ wallet, referrals }) {
    const link = useMemo(() => {
        if (!wallet?.address) return "";
        const base = window.location.origin.replace(/\/$/, "");
        return `${base}/?ref=${wallet.address}`;
    }, [wallet?.address]);

    const copy = useCallback(async () => {
        try { await navigator.clipboard.writeText(link); toast.success("Referral link copied"); }
        catch { toast.error("Copy failed"); }
    }, [link]);

    const items = referrals?.items || [];

    return (
        <div data-testid={TID.dashRefCard} className="hc-card p-6 md:p-7">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <div className="hc-pill">Referrals</div>
                    <h3 className="font-display text-2xl md:text-3xl font-black mt-3">Your referral center</h3>
                </div>
                <div className="hc-pill !text-[11px]" data-testid={TID.dashRefRank}>
                    {wallet?.leaderboard_rank
                        ? `Leaderboard rank #${wallet.leaderboard_rank}`
                        : "Not yet ranked"}
                </div>
            </div>

            <div className="grid md:grid-cols-[1fr_auto] gap-6 mt-5">
                <div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--hc-text-mute)]">
                        Your share link (earns 200 HC per first-time claimer)
                    </div>
                    <div className="flex gap-2 mt-2">
                        <input
                            data-testid={TID.dashRefLink}
                            readOnly value={link}
                            className="flex-1 bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm font-mono text-[var(--hc-text-dim)]"
                        />
                        <button data-testid={TID.dashRefCopy} onClick={copy} className="hc-btn-ghost !py-2 !px-3">Copy</button>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mt-5">
                        <Stat testid="dash-ref-count" label="Total referrals" value={wallet?.total_referrals ?? 0} />
                        <Stat testid="dash-ref-bonus" label="Bonus earned" value={fmtAmount(wallet?.total_referral_bonus)} sub="HC (200 per first-time claim)" />
                    </div>
                </div>

                <div className="flex flex-col items-center gap-2">
                    <div data-testid={TID.dashRefQr} className="bg-white p-3 rounded-md">
                        <QRCodeSVG value={link || "https://humanity-coin.example"} size={132} bgColor="#ffffff" fgColor="#100b00" level="M" />
                    </div>
                    <div className="text-[10px] text-[var(--hc-text-mute)] font-mono uppercase tracking-[0.18em]">Scan to share</div>
                </div>
            </div>

            {/* referee list */}
            <div className="mt-6">
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--hc-text-mute)] mb-2">
                    Wallets you've referred
                </div>
                {items.length === 0 ? (
                    <div className="text-sm text-[var(--hc-text-dim)] py-6 text-center border border-dashed border-white/10 rounded-md">
                        No referrals yet. Share your link above to start earning 200 HC per new claimer.
                    </div>
                ) : (
                    <div className="overflow-hidden border border-white/[0.06] rounded-md">
                        <table className="w-full text-sm">
                            <thead className="bg-white/[0.03] text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--hc-text-mute)]">
                                <tr>
                                    <th className="text-left px-4 py-2.5">Referee</th>
                                    <th className="text-right px-4 py-2.5">Bonus</th>
                                    <th className="text-right px-4 py-2.5">Status</th>
                                    <th className="text-right px-4 py-2.5">Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.slice(0, 25).map((r, i) => (
                                    <tr key={i} data-testid={TID.dashRefRow(i)} className="border-t border-white/[0.05] hover:bg-white/[0.02]">
                                        <td className="px-4 py-2.5 font-mono text-[12px]">{shorten(r.referee_address, 8)}</td>
                                        <td className="px-4 py-2.5 text-right">{fmtAmount(r.bonus_amount)} HC</td>
                                        <td className="px-4 py-2.5 text-right">
                                            <span className={cx(
                                                "hc-pill !text-[10px] !py-0.5 !px-2",
                                                r.status === "credited" && "!text-[var(--hc-mint)] !bg-[rgba(111,226,168,0.08)] !border-[rgba(111,226,168,0.25)]"
                                            )}>{r.status}</span>
                                        </td>
                                        <td className="px-4 py-2.5 text-right text-[12px] text-[var(--hc-text-dim)]">{fmtDate(r.created_at)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

/* ---------------- History Table ---------------- */
function HistoryTable({ history, cfg }) {
    const items = history?.items || [];
    const explorer = cfg?.token?.explorer_url || "https://bscscan.com";

    return (
        <div className="hc-card p-6 md:p-7">
            <div className="hc-pill">Activity</div>
            <h3 className="font-display text-2xl md:text-3xl font-black mt-3">Transaction history</h3>
            <p className="text-[var(--hc-text-dim)] mt-2 text-sm">
                Claims, admin credits, and referral bonuses tied to this wallet.
            </p>

            <div className="mt-5 overflow-hidden border border-white/[0.06] rounded-md">
                <table data-testid={TID.dashHistoryTable} className="w-full text-sm">
                    <thead className="bg-white/[0.03] text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--hc-text-mute)]">
                        <tr>
                            <th className="text-left px-4 py-2.5">Type</th>
                            <th className="text-right px-4 py-2.5">Amount</th>
                            <th className="text-right px-4 py-2.5">Status</th>
                            <th className="text-right px-4 py-2.5">Tx</th>
                            <th className="text-right px-4 py-2.5">Date</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.length === 0 ? (
                            <tr><td colSpan={5} className="px-4 py-8 text-center text-[var(--hc-text-dim)]">No activity yet.</td></tr>
                        ) : items.map((h, i) => {
                            const url = txExplorerUrl(explorer, h.tx_hash);
                            const badge = h.type === "claim" ? "!text-[var(--hc-gold-hi)]"
                                        : h.type === "credit" ? "!text-[var(--hc-mint)] !bg-[rgba(111,226,168,0.08)] !border-[rgba(111,226,168,0.25)]"
                                        : "!text-[var(--hc-coral)] !bg-[rgba(255,122,76,0.08)] !border-[rgba(255,122,76,0.25)]";
                            return (
                                <tr key={`${h.type}-${h.id}-${i}`} data-testid={TID.dashHistoryRow(i)} className="border-t border-white/[0.05] hover:bg-white/[0.02]">
                                    <td className="px-4 py-2.5">
                                        <span className={cx("hc-pill !text-[10px] !py-0.5 !px-2", badge)}>{h.label}</span>
                                    </td>
                                    <td className="px-4 py-2.5 text-right font-mono">
                                        {h.type === "claim" ? "+" : h.type === "credit" ? "+" : "+"}{fmtAmount(h.amount)} HC
                                        {h.type === "claim" && h.bnb_paid ? (
                                            <div className="text-[11px] text-[var(--hc-text-mute)]">− {h.bnb_paid} BNB (${h.cost_usd || 6})</div>
                                        ) : null}
                                    </td>
                                    <td className="px-4 py-2.5 text-right text-[12px] capitalize">{h.status || "—"}</td>
                                    <td className="px-4 py-2.5 text-right text-[12px] font-mono">
                                        {url ? <a href={url} target="_blank" rel="noopener noreferrer" className="text-[var(--hc-gold-hi)] hover:underline">{shorten(h.tx_hash, 6)}</a> : "—"}
                                    </td>
                                    <td className="px-4 py-2.5 text-right text-[12px] text-[var(--hc-text-dim)]">{fmtDate(h.created_at)}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

/* ---------------- Main ---------------- */
export default function Dashboard({ account, onConnect, cfg }) {
    const [wallet, setWallet] = useState(null);
    const [history, setHistory] = useState(null);
    const [referrals, setReferrals] = useState(null);
    const [loading, setLoading] = useState(false);
    const timerRef = useRef(null);

    const refresh = useCallback(async () => {
        if (!account) { setWallet(null); setHistory(null); setReferrals(null); return; }
        setLoading(true);
        try {
            const [w, h, r] = await Promise.all([
                api.wallet(account),
                api.walletHistory(account),
                api.referrals(account),
            ]);
            setWallet(w); setHistory(h); setReferrals(r);
        } catch (e) { console.error("dashboard refresh", e); }
        finally { setLoading(false); }
    }, [account]);

    useEffect(() => { refresh(); }, [refresh]);
    // Refresh wallet+countdown periodically (every 30s)
    useEffect(() => {
        if (!account) return;
        timerRef.current = setInterval(() => { refresh(); }, 30000);
        return () => clearInterval(timerRef.current);
    }, [account, refresh]);

    if (!account) {
        return (
            <div data-testid={TID.dashConnectPrompt} className="max-w-2xl mx-auto px-6 md:px-10 py-24 text-center">
                <div className="hc-pill mx-auto">Dashboard</div>
                <h1 className="font-display text-4xl md:text-6xl font-black mt-5 leading-[1.02]">
                    Connect your wallet
                </h1>
                <p className="text-[var(--hc-text-dim)] mt-4 max-w-md mx-auto">
                    Your Humanity Coin dashboard shows your claim status, 92-day lock countdown, referral center,
                    and full activity — all keyed to the connected wallet address.
                </p>
                <button
                    data-testid={TID.dashConnectBtn}
                    onClick={onConnect}
                    className="hc-btn mt-8">
                    Connect wallet
                </button>
                <div className="mt-8">
                    <Link to="/" className="hc-btn-ghost">Back to home</Link>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto px-6 md:px-10 py-12 md:py-16">
            {/* Header */}
            <div data-testid={TID.dashHeader} className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <div className="hc-pill">Dashboard</div>
                    <h1 className="font-display text-3xl md:text-5xl font-black mt-3 leading-[1.05]">
                        Welcome, <span className="text-[var(--hc-gold-hi)] font-mono">{shorten(account, 6)}</span>
                    </h1>
                    <p className="text-[var(--hc-text-dim)] mt-2 max-w-lg">
                        Your claim, lock countdown, referrals, and history — live from the Humanity Coin backend.
                    </p>
                </div>
                <button onClick={refresh} disabled={loading} className="hc-btn-ghost !py-2 !px-4 !text-[13px]">
                    {loading ? "Refreshing…" : "↻ Refresh"}
                </button>
            </div>

            {/* Balance summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mt-8">
                <Stat testid={TID.dashBalanceTotal}   label="Total HC" value={fmtAmount(wallet?.total_claimed)} sub="Claimed + referral bonuses" />
                <Stat testid={TID.dashBalancePending} label="Pending"  value={fmtAmount(wallet?.pending_balance)} sub="Awaiting on-chain credit" />
                <Stat testid={TID.dashBalanceCred}    label="Credited" value={fmtAmount(wallet?.credited_balance)} sub="On-chain / admin distributed" />
                <Stat testid="dash-balance-referrals" label="Referrals" value={wallet?.total_referrals ?? 0} sub={`+ ${fmtAmount(wallet?.total_referral_bonus)} HC bonus`} />
            </div>

            {/* Lock + Swap */}
            <div className="grid lg:grid-cols-2 gap-5 mt-6">
                <LockCard wallet={wallet} cfg={cfg} onNotified={() => {}} />
                <SwapCard wallet={wallet} cfg={cfg} />
            </div>

            {/* Referrals */}
            <div className="mt-6">
                <ReferralCard wallet={wallet} referrals={referrals} />
            </div>

            {/* History */}
            <div className="mt-6">
                <HistoryTable history={history} cfg={cfg} />
            </div>
        </div>
    );
}
