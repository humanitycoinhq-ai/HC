import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { TID } from "@/constants/testIds";
import { toast } from "sonner";
import { fmtAmount, shorten } from "@/lib/wallet";
import { RefreshIcon } from "@/components/Icons";

const TABS = [
    { k: "claims",    label: "Claims" },
    { k: "referrals", label: "Referrals" },
    { k: "credit",    label: "Credit" },
    { k: "content",   label: "Content" },
    { k: "campaign",  label: "Campaign" },
    { k: "social",    label: "Social" },
    { k: "onchain",   label: "On-Chain" },
];

export default function Admin() {
    const [token, setToken] = useState(() => localStorage.getItem("hc_admin_token") || "");
    if (!token) return <Login onSuccess={(t) => { localStorage.setItem("hc_admin_token", t); setToken(t); }} />;

    return <Dashboard onLogout={() => { localStorage.removeItem("hc_admin_token"); setToken(""); }} />;
}

function Login({ onSuccess }) {
    const [pwd, setPwd] = useState("");
    const [busy, setBusy] = useState(false);
    const submit = async (e) => {
        e?.preventDefault();
        setBusy(true);
        try {
            const r = await api.adminLogin(pwd);
            toast.success("Welcome back, admin");
            onSuccess(r.token);
        } catch (e) {
            toast.error(e?.response?.data?.error || "Login failed");
        } finally { setBusy(false); }
    };
    return (
        <section className="px-6 md:px-10 py-20 max-w-md mx-auto">
            <div className="hc-card-gold p-7 md:p-9">
                <div className="hc-pill">Admin Console</div>
                <h1 className="font-display text-3xl font-black mt-4">Sign in</h1>
                <p className="text-[var(--hc-text-dim)] mt-2 text-[14px]">Use the admin password set at install time. Default seed: <code className="font-mono text-[12px] text-[var(--hc-gold-hi)]">humanity-admin-2026</code>.</p>
                <form onSubmit={submit} className="mt-6 space-y-3">
                    <input data-testid={TID.adminLoginInput} type="password" autoFocus className="hc-input" placeholder="Admin password"
                           value={pwd} onChange={e => setPwd(e.target.value)} />
                    <button data-testid={TID.adminLoginBtn} disabled={busy || !pwd} className="hc-btn w-full">{busy ? "Signing in…" : "Sign in"}</button>
                </form>
            </div>
        </section>
    );
}

function Dashboard({ onLogout }) {
    const [tab, setTab] = useState("claims");
    return (
        <section className="px-6 md:px-10 py-10 max-w-7xl mx-auto">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <div>
                    <div className="hc-pill">Admin</div>
                    <h1 className="font-display text-3xl md:text-4xl font-black mt-3">Console</h1>
                    <div data-testid="admin-password-notice"
                         className="mt-3 inline-flex items-center gap-2 text-[11.5px] font-mono text-[var(--hc-gold-hi)] bg-[rgba(232,185,0,0.08)] border border-[var(--hc-line)] rounded-full px-3 py-1.5">
                        <span className="text-[var(--hc-text-mute)]">CURRENT ADMIN PASSWORD ·</span>
                        <code className="text-[var(--hc-gold-hi)]">humanity-admin-2026</code>
                        <span className="text-[var(--hc-text-mute)]">· change via re-install</span>
                    </div>
                </div>
                <button data-testid={TID.adminLogoutBtn} className="hc-btn-ghost" onClick={onLogout}>Sign out</button>
            </div>
            <div className="hc-card p-1.5 flex flex-wrap gap-1 mb-6">
                {TABS.map(t => (
                    <div key={t.k} className="tab" data-active={tab===t.k} data-testid={TID.adminTab(t.k)} onClick={() => setTab(t.k)}>{t.label}</div>
                ))}
            </div>
            {tab === "claims"    && <ClaimsTab />}
            {tab === "referrals" && <ReferralsTab />}
            {tab === "credit"    && <CreditTab />}
            {tab === "content"   && <ContentTab />}
            {tab === "campaign"  && <CampaignTab />}
            {tab === "social"    && <SocialTab />}
            {tab === "onchain"   && <OnchainTab />}
        </section>
    );
}

function useList(loader) {
    const [data, setData] = useState({ items: [], total: 0 });
    const [busy, setBusy] = useState(false);
    const [filter, setFilter] = useState({ status: "", address: "" });
    const refresh = async () => {
        setBusy(true);
        try { setData(await loader(filter)); }
        catch (e) { toast.error(e?.response?.data?.error || "Failed to load"); }
        finally { setBusy(false); }
    };
    useEffect(() => { refresh(); /* eslint-disable-next-line */ }, []);
    return { data, busy, filter, setFilter, refresh };
}

function ClaimsTab() {
    const { data, filter, setFilter, refresh, busy } = useList((f) => api.adminClaims({ ...f, limit: 200 }));
    const update = async (id, status, tx_hash) => {
        try { await api.adminClaimSet(id, { status, tx_hash: tx_hash || null }); toast.success(`#${id} → ${status}`); refresh(); }
        catch (e) { toast.error(e?.response?.data?.error || "Update failed"); }
    };
    return (
        <div className="hc-card overflow-hidden" data-testid={TID.adminClaimsTable}>
            <div className="px-5 py-4 border-b border-white/[0.05] flex flex-wrap items-center gap-2 justify-between">
                <div className="flex items-center gap-2">
                    <select className="hc-input !w-auto" value={filter.status} onChange={e=>setFilter({...filter, status:e.target.value})}>
                        <option value="">All statuses</option><option value="pending">Pending</option><option value="credited">Credited</option><option value="rejected">Rejected</option>
                    </select>
                    <input className="hc-input !w-auto font-mono" placeholder="Filter by 0x address" value={filter.address}
                           onChange={e=>setFilter({...filter, address:e.target.value})}/>
                    <button onClick={refresh} className="hc-btn-ghost !py-2 !px-3"><RefreshIcon /></button>
                </div>
                <div className="text-[12px] text-[var(--hc-text-mute)] font-mono">{busy ? "loading…" : `${data.total} total`}</div>
            </div>
            <div className="overflow-x-auto">
                <table className="hc-table">
                    <thead><tr><th>ID</th><th>Wallet</th><th>Amount</th><th>Status</th><th>tx_hash</th><th>Claimed</th><th>Actions</th></tr></thead>
                    <tbody>
                        {data.items.map(c => <ClaimRow key={c.id} c={c} onUpdate={update} />)}
                        {!data.items.length && <tr><td colSpan="7" className="text-center text-[var(--hc-text-mute)] py-10">No claims yet.</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function ClaimRow({ c, onUpdate }) {
    const [tx, setTx] = useState(c.tx_hash || "");
    return (
        <tr data-testid={TID.adminClaimRow(c.id)}>
            <td className="font-mono">#{c.id}</td>
            <td className="font-mono">{shorten(c.wallet_address, 7)}</td>
            <td>{fmtAmount(c.amount)} <span className="text-[var(--hc-text-mute)] text-[11px]">HUMAN</span></td>
            <td><span className={`chip chip-${c.status}`}>{c.status}</span></td>
            <td>
                <input data-testid={TID.adminClaimTxInput(c.id)} className="hc-input !py-1.5 !text-[11.5px] font-mono !w-[260px]"
                       placeholder="0x… (optional)" value={tx} onChange={e=>setTx(e.target.value)}/>
            </td>
            <td className="text-[var(--hc-text-dim)] text-[12px]">{new Date(c.claimed_at).toLocaleString()}</td>
            <td className="whitespace-nowrap">
                <button data-testid={TID.adminClaimMark(c.id,"credited")} onClick={()=>onUpdate(c.id,"credited",tx)} className="hc-btn !py-1.5 !px-3 !text-[11.5px] mr-1">Credit</button>
                <button data-testid={TID.adminClaimMark(c.id,"rejected")} onClick={()=>onUpdate(c.id,"rejected",tx)} className="hc-btn-ghost !py-1.5 !px-3 !text-[11.5px]">Reject</button>
            </td>
        </tr>
    );
}

function ReferralsTab() {
    const { data, filter, setFilter, refresh, busy } = useList((f) => api.adminReferrals({ ...f, limit: 200 }));
    return (
        <div className="hc-card overflow-hidden" data-testid={TID.adminReferralsTable}>
            <div className="px-5 py-4 border-b border-white/[0.05] flex flex-wrap items-center gap-2 justify-between">
                <div className="flex items-center gap-2">
                    <select className="hc-input !w-auto" value={filter.status} onChange={e=>setFilter({...filter, status:e.target.value})}>
                        <option value="">All statuses</option><option value="pending">Pending</option><option value="credited">Credited</option><option value="rejected">Rejected</option>
                    </select>
                    <input className="hc-input !w-auto font-mono" placeholder="Wallet (referrer or referee)" value={filter.address}
                           onChange={e=>setFilter({...filter, address:e.target.value})}/>
                    <button onClick={refresh} className="hc-btn-ghost !py-2 !px-3"><RefreshIcon /></button>
                </div>
                <div className="text-[12px] text-[var(--hc-text-mute)] font-mono">{busy ? "loading…" : `${data.total} total`}</div>
            </div>
            <div className="overflow-x-auto">
                <table className="hc-table">
                    <thead><tr><th>ID</th><th>Referrer</th><th>Referee</th><th>Bonus</th><th>Status</th><th>When</th></tr></thead>
                    <tbody>
                        {data.items.map(r => (
                            <tr key={r.id}>
                                <td className="font-mono">#{r.id}</td>
                                <td className="font-mono">{shorten(r.referrer_address, 7)}</td>
                                <td className="font-mono">{shorten(r.referee_address, 7)}</td>
                                <td>+{fmtAmount(r.bonus_amount)} HUMAN</td>
                                <td><span className={`chip chip-${r.status}`}>{r.status}</span></td>
                                <td className="text-[var(--hc-text-dim)] text-[12px]">{new Date(r.created_at).toLocaleString()}</td>
                            </tr>
                        ))}
                        {!data.items.length && <tr><td colSpan="6" className="text-center text-[var(--hc-text-mute)] py-10">No referrals yet.</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function CreditTab() {
    const [form, setForm]   = useState({ address: "", amount: "", note: "", tx_hash: "" });
    const [list, setList]   = useState({ items: [], total: 0 });
    const [busy, setBusy]   = useState(false);
    const reload = async () => { try { setList(await api.adminCredits({ limit: 200 })); } catch{} };
    useEffect(() => { reload(); }, []);
    const submit = async () => {
        setBusy(true);
        try {
            await api.adminCredit({ ...form, amount: Number(form.amount) });
            toast.success("Credit recorded");
            setForm({ address: "", amount: "", note: "", tx_hash: "" });
            reload();
        } catch (e) { toast.error(e?.response?.data?.error || "Failed"); }
        finally { setBusy(false); }
    };
    return (
        <div className="grid lg:grid-cols-[1fr_1.4fr] gap-5">
            <div className="hc-card-gold p-6">
                <h3 className="font-display text-2xl font-black">Manual credit</h3>
                <p className="text-[13px] text-[var(--hc-text-dim)] mt-1">Record an off-chain payout or correction. Updates the wallet's credited balance.</p>
                <div className="mt-5 space-y-3">
                    <input data-testid={TID.adminCreditAddr}   className="hc-input font-mono" placeholder="0x… address" value={form.address} onChange={e=>setForm({...form, address:e.target.value})}/>
                    <input data-testid={TID.adminCreditAmount} className="hc-input" placeholder="Amount (HUMAN)" type="number" step="0.01" value={form.amount} onChange={e=>setForm({...form, amount:e.target.value})}/>
                    <input data-testid={TID.adminCreditNote}   className="hc-input" placeholder="Note (optional)" value={form.note} onChange={e=>setForm({...form, note:e.target.value})}/>
                    <input data-testid={TID.adminCreditTx}     className="hc-input font-mono !text-[12px]" placeholder="tx_hash (optional)" value={form.tx_hash} onChange={e=>setForm({...form, tx_hash:e.target.value})}/>
                    <button data-testid={TID.adminCreditSubmit} disabled={busy || !form.address || !form.amount} onClick={submit} className="hc-btn w-full">{busy ? "Saving…" : "Record credit"}</button>
                </div>
            </div>
            <div className="hc-card overflow-hidden" data-testid={TID.adminCreditsTable}>
                <div className="px-5 py-4 border-b border-white/[0.05] flex items-center justify-between">
                    <div className="font-display text-[18px] font-bold">Credit history</div>
                    <button onClick={reload} className="hc-btn-ghost !py-2 !px-3"><RefreshIcon /></button>
                </div>
                <div className="overflow-x-auto">
                    <table className="hc-table">
                        <thead><tr><th>ID</th><th>Wallet</th><th>Amount</th><th>Note</th><th>tx_hash</th><th>When</th></tr></thead>
                        <tbody>
                            {list.items.map(r => (
                                <tr key={r.id}>
                                    <td className="font-mono">#{r.id}</td>
                                    <td className="font-mono">{shorten(r.wallet_address, 7)}</td>
                                    <td>{fmtAmount(r.amount)} HUMAN</td>
                                    <td className="text-[var(--hc-text-dim)]">{r.note || "—"}</td>
                                    <td className="font-mono text-[11.5px] text-[var(--hc-text-dim)]">{r.tx_hash ? shorten(r.tx_hash, 7) : "—"}</td>
                                    <td className="text-[var(--hc-text-dim)] text-[12px]">{new Date(r.created_at).toLocaleString()}</td>
                                </tr>
                            ))}
                            {!list.items.length && <tr><td colSpan="6" className="text-center text-[var(--hc-text-mute)] py-10">No credits yet.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

function ContentTab() {
    const [data, setData] = useState({});
    const [busy, setBusy] = useState(false);
    useEffect(() => { api.adminContentGet().then(setData).catch(()=>{}); }, []);
    const set = (k,v) => setData(s => ({...s, [k]:v}));
    const save = async () => {
        setBusy(true);
        try {
            const payload = { ...data };
            ["claim_cost_usd","claim_reward_usd","claim_reward_tokens","token_price_usd","lock_days",
             "referral_reward_tokens","referral_reward_usd","chain_id",
             "tx_tax_total_pct","tx_tax_reflection_pct","tx_tax_liquidity_pct","tx_tax_ngo_pct"
            ].forEach(k => { if (payload[k] !== undefined && payload[k] !== "") payload[k] = Number(payload[k]); });
            payload.claim_enabled = data.claim_enabled === "1" || data.claim_enabled === 1 || data.claim_enabled === true ? "1" : "0";
            await api.adminContentSet(payload);
            toast.success("Saved");
        } catch (e) { toast.error(e?.response?.data?.error || "Failed"); }
        finally { setBusy(false); }
    };
    const Field = ({ label, k, type="text", textarea=false, hint=null, mono=false }) => (
        <div>
            <label className="block font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--hc-text-mute)] mb-1.5">{label}</label>
            {textarea
                ? <textarea data-testid={TID.adminContentField(k)} rows={3} className={`hc-input ${mono?"font-mono":""}`} value={data[k] ?? ""} onChange={e=>set(k,e.target.value)}/>
                : <input data-testid={TID.adminContentField(k)} type={type} className={`hc-input ${mono?"font-mono":""}`} value={data[k] ?? ""} onChange={e=>set(k,e.target.value)}/>}
            {hint && <div className="text-[11px] text-[var(--hc-text-mute)] mt-1">{hint}</div>}
        </div>
    );
    return (
        <div className="space-y-5">
            <div className="grid lg:grid-cols-2 gap-5">
                <div className="hc-card p-6">
                    <h3 className="font-display text-2xl font-black mb-5">Site copy</h3>
                    <div className="space-y-4">
                        <Field label="Hero eyebrow"   k="hero_eyebrow" hint="Small label above the hero title"/>
                        <Field label="Hero title"     k="hero_title"/>
                        <Field label="Hero subtitle"  k="hero_subtitle" textarea/>
                        <Field label="About title"    k="about_title"/>
                        <Field label="About text"     k="about_text" textarea/>
                        <Field label="Footer note"    k="footer_note"/>
                        <Field label="Whitepaper URL" k="whitepaper_url" mono hint="Public path or full URL"/>
                    </div>
                </div>
                <div className="hc-card p-6">
                    <h3 className="font-display text-2xl font-black mb-5">Hero stats row</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Total supply" k="stat_supply"/>
                        <Field label="Tx tax"       k="stat_tax"/>
                        <Field label="Network"      k="stat_network"/>
                        <Field label="Seed raised"  k="stat_seed"/>
                    </div>
                    <h3 className="font-display text-2xl font-black mt-8 mb-5">Token & claim economics</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Token price (USD)"      k="token_price_usd"      type="number"/>
                        <Field label="Claim cost (USD)"       k="claim_cost_usd"       type="number"/>
                        <Field label="Claim reward (USD)"     k="claim_reward_usd"     type="number"/>
                        <Field label="Claim reward (HC)"      k="claim_reward_tokens"  type="number"/>
                        <Field label="Lock days"              k="lock_days"            type="number"/>
                        <Field label="Referral reward (HC)"   k="referral_reward_tokens" type="number"/>
                        <Field label="Referral reward (USD)"  k="referral_reward_usd"  type="number"/>
                        <Field label="Claim enabled (0/1)"    k="claim_enabled"/>
                    </div>
                    <h3 className="font-display text-2xl font-black mt-8 mb-5">10% transaction engine</h3>
                    <div className="grid grid-cols-4 gap-4">
                        <Field label="Total %"     k="tx_tax_total_pct"      type="number"/>
                        <Field label="Reflect %"   k="tx_tax_reflection_pct" type="number"/>
                        <Field label="Liquidity %" k="tx_tax_liquidity_pct"  type="number"/>
                        <Field label="NGO %"       k="tx_tax_ngo_pct"        type="number"/>
                    </div>
                </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-5">
                <div className="hc-card p-6">
                    <h3 className="font-display text-2xl font-black mb-5">Chain configuration</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Chain ID"            k="chain_id" type="number"/>
                        <Field label="Chain name"          k="chain_name"/>
                        <Field label="RPC URL"             k="rpc_url" mono/>
                        <Field label="Explorer URL"        k="explorer_url" mono/>
                        <Field label="Contract address"    k="contract_address" mono/>
                        <Field label="Marketing wallet"    k="marketing_wallet" mono/>
                        <Field label="Liquidity wallet"    k="liquidity_wallet" mono/>
                        <Field label="PancakeSwap router"  k="pancake_router" mono/>
                        <Field label="Chainlink BNB/USD"   k="chainlink_bnb_usd" mono/>
                    </div>
                </div>
                <div className="hc-card p-6">
                    <h3 className="font-display text-2xl font-black mb-5">NGO partner cards (whitepaper §13)</h3>
                    {[1,2,3].map(i => (
                        <div key={i} className="mb-5 last:mb-0 rounded-xl border border-white/[0.06] p-4">
                            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--hc-gold-hi)] mb-3">Partner {i}</div>
                            <div className="grid grid-cols-3 gap-3">
                                <Field label="Region label" k={`ngo_partner_${i}_region`} hint="AFRICA / SE ASIA / LATAM"/>
                                <div className="col-span-2">
                                    <Field label="Title" k={`ngo_partner_${i}_title`}/>
                                </div>
                            </div>
                            <div className="mt-3">
                                <Field label="Description" k={`ngo_partner_${i}_text`} textarea/>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div>
                <button data-testid={TID.adminContentSave} className="hc-btn" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save all content"}</button>
            </div>
        </div>
    );
}

function CampaignTab() {
    const [d, setD] = useState({active:false, title:"", message:"", cta_label:"", cta_url:""});
    const [busy, setBusy] = useState(false);
    useEffect(() => { api.adminCampaignGet().then(setD).catch(()=>{}); }, []);
    const save = async () => {
        setBusy(true);
        try { await api.adminCampaignSet(d); toast.success("Campaign saved"); }
        catch (e) { toast.error(e?.response?.data?.error || "Failed"); }
        finally { setBusy(false); }
    };
    return (
        <div className="hc-card p-6 max-w-2xl">
            <h3 className="font-display text-2xl font-black mb-4">Top-of-site campaign banner</h3>
            <label className="flex items-center gap-2 mb-4 text-[14px]">
                <input type="checkbox" data-testid={TID.adminCampaignField("active")} checked={!!d.active} onChange={e=>setD({...d, active:e.target.checked})}/>
                Show banner on homepage
            </label>
            <div className="space-y-3">
                <input data-testid={TID.adminCampaignField("title")}     className="hc-input" placeholder="Banner title (short)" value={d.title}     onChange={e=>setD({...d, title:e.target.value})}/>
                <input data-testid={TID.adminCampaignField("message")}   className="hc-input" placeholder="Message"               value={d.message}   onChange={e=>setD({...d, message:e.target.value})}/>
                <div className="grid grid-cols-2 gap-3">
                    <input data-testid={TID.adminCampaignField("cta_label")} className="hc-input" placeholder="CTA label" value={d.cta_label} onChange={e=>setD({...d, cta_label:e.target.value})}/>
                    <input data-testid={TID.adminCampaignField("cta_url")}   className="hc-input font-mono" placeholder="CTA URL"   value={d.cta_url}   onChange={e=>setD({...d, cta_url:e.target.value})}/>
                </div>
            </div>
            <button data-testid={TID.adminCampaignSave} className="hc-btn mt-5" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save banner"}</button>
        </div>
    );
}

function SocialTab() {
    const [d, setD] = useState({facebook:"", x:"", instagram:"", tiktok:""});
    const [busy, setBusy] = useState(false);
    useEffect(() => { api.adminSocialGet().then(setD).catch(()=>{}); }, []);
    const save = async () => {
        setBusy(true);
        try { await api.adminSocialSet(d); toast.success("Social links saved"); }
        catch (e) { toast.error(e?.response?.data?.error || "Failed"); }
        finally { setBusy(false); }
    };
    return (
        <div className="hc-card p-6 max-w-2xl">
            <h3 className="font-display text-2xl font-black mb-2">Social media</h3>
            <p className="text-[13px] text-[var(--hc-text-dim)] mb-5">Public icons appear in the site footer. Leave blank to hide.</p>
            <div className="space-y-3">
                {[
                    {k:"facebook",  label:"Facebook"},
                    {k:"x",         label:"X (Twitter)"},
                    {k:"instagram", label:"Instagram"},
                    {k:"tiktok",    label:"TikTok"},
                ].map(it => (
                    <div key={it.k}>
                        <label className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--hc-text-mute)]">{it.label}</label>
                        <input data-testid={TID.adminSocialField(it.k)} className="hc-input mt-1 font-mono"
                               placeholder={`https://${it.k}.com/yourhandle`} value={d[it.k] || ""}
                               onChange={e=>setD({...d, [it.k]: e.target.value})}/>
                    </div>
                ))}
            </div>
            <button data-testid={TID.adminSocialSave} className="hc-btn mt-5" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save social links"}</button>
        </div>
    );
}

function OnchainTab() {
    const [d, setD] = useState(null);
    const [busy, setBusy] = useState(false);
    const load = async () => {
        setBusy(true);
        try { setD(await api.adminOnchain()); }
        catch (e) { toast.error(e?.response?.data?.error || "RPC failed"); }
        finally { setBusy(false); }
    };
    useEffect(() => { load(); }, []);
    return (
        <div className="hc-card p-6">
            <div className="flex items-center justify-between">
                <h3 className="font-display text-2xl font-black">On-chain snapshot</h3>
                <button data-testid={TID.adminOnchainRefresh} onClick={load} className="hc-btn-ghost !py-2 !px-4">{busy ? "Loading…" : "Refresh"}</button>
            </div>
            {!d ? <div className="text-[var(--hc-text-mute)] mt-6 font-mono text-[12px]">Reading RPC…</div> : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-5">
                    <KV label="Chain ID"          value={d.chain_id ?? "—"}/>
                    <KV label="Block number"      value={d.block_number ?? "—"}/>
                    <KV label="RPC"               value={d.rpc_url} mono/>
                    <KV label="Contract"          value={d.contract_address || "Not set"} mono/>
                    <KV label="Total supply"      value={d.total_supply ? `${fmtAmount(Number(d.total_supply))} HUMAN` : "—"}/>
                    <KV label="Marketing wallet"  value={d.marketing_wallet} mono/>
                    <KV label="Marketing balance" value={d.marketing_balance ? `${fmtAmount(Number(d.marketing_balance))} HUMAN` : "—"}/>
                    <KV label="Native BNB"        value={d.bnb_balance ? `${fmtAmount(Number(d.bnb_balance), 4)} BNB` : "—"}/>
                </div>
            )}
            {d?.errors?.length > 0 && (
                <div className="mt-5 rounded-lg border border-[rgba(255,90,90,0.3)] bg-[rgba(255,90,90,0.05)] p-4 text-[12px] text-[var(--hc-red)]">
                    <div className="font-mono uppercase tracking-[0.16em] text-[10px] mb-2">RPC notes</div>
                    {d.errors.map((e, i) => <div key={i} className="font-mono">· {e}</div>)}
                </div>
            )}
        </div>
    );
}
function KV({ label, value, mono }) {
    return (
        <div className="rounded-xl border border-white/[0.06] p-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--hc-text-mute)]">{label}</div>
            <div className={`mt-1.5 text-[14px] ${mono?"font-mono break-all":""}`}>{value}</div>
        </div>
    );
}
