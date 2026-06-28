import { useEffect, useState, useCallback, useMemo } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Link, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { connectWallet, currentAccount, onAccountsChanged, shorten, switchToChain } from "@/lib/wallet";
import { TID } from "@/constants/testIds";
import { Toaster, toast } from "sonner";
import Home from "@/components/Home";
import Admin from "@/components/Admin";
import { CoinMark } from "@/components/Icons";

function Header({ account, onConnect, social }) {
    return (
        <header className="relative z-10 flex items-center justify-between px-6 md:px-10 py-5 border-b border-white/[0.05]">
            <Link to="/" data-testid={TID.headerLogo} className="flex items-center gap-3 group">
                <CoinMark size={36} className="coin" />
                <div className="leading-tight">
                    <div className="font-display text-[19px] md:text-[22px] font-black tracking-tight">Humanity Coin</div>
                    <div className="font-mono text-[10px] text-[var(--hc-text-mute)] uppercase tracking-[0.18em]">$HUMAN · BEP-20</div>
                </div>
            </Link>
            <div className="flex items-center gap-2 md:gap-3">
                <Link to="/admin" data-testid={TID.headerAdminLink} className="hidden md:inline-flex hc-btn-ghost !py-2 !px-4 !text-[12.5px]">Admin</Link>
                {account
                    ? <div data-testid={TID.headerWalletPill} className="hc-pill !text-[11px]">● {shorten(account)}</div>
                    : <button data-testid={TID.headerConnect} className="hc-btn !py-2 !px-4 !text-[13px]" onClick={onConnect}>Connect Wallet</button>}
            </div>
        </header>
    );
}

function Footer({ cfg }) {
    const s = cfg?.social || {};
    const SocialLink = ({ href, label, testid, path }) => {
        const enabled = !!href && href !== "#";
        const cls = "w-9 h-9 rounded-full border border-white/10 inline-flex items-center justify-center transition hover:border-[var(--hc-gold)] hover:bg-[rgba(232,185,0,0.08)]";
        const inner = <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-[var(--hc-text-dim)]">{path}</svg>;
        return enabled
            ? <a data-testid={testid} href={href} target="_blank" rel="noopener noreferrer" aria-label={label} className={cls}>{inner}</a>
            : <span aria-label={label + " (not set)"} className={cls + " opacity-30 cursor-not-allowed"}>{inner}</span>;
    };
    return (
        <footer className="relative z-10 mt-24 border-t border-white/[0.05]">
            <div className="max-w-6xl mx-auto px-6 md:px-10 py-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-3">
                    <CoinMark size={28} />
                    <div className="text-sm text-[var(--hc-text-dim)]">{cfg?.content?.footer_note || "Humanity Coin · Community-driven BEP-20."}</div>
                </div>
                <div className="flex items-center gap-3">
                    <SocialLink testid={TID.socialFacebook}  href={s.facebook}  label="Facebook"  path={<path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5 3.66 9.16 8.44 9.94v-7.03H7.9v-2.91h2.54V9.84c0-2.51 1.49-3.9 3.78-3.9 1.1 0 2.24.2 2.24.2v2.47h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.44 2.91h-2.34V22c4.78-.78 8.44-4.94 8.44-9.94Z"/>}/>
                    <SocialLink testid={TID.socialX}         href={s.x}         label="X (Twitter)" path={<path d="M18.244 2H21l-6.52 7.45L22 22h-6.78l-4.84-6.32L4.6 22H1.84l6.98-7.98L2 2h6.92l4.37 5.78L18.244 2Zm-1.18 18h1.72L7.04 4H5.2l11.86 16Z"/>}/>
                    <SocialLink testid={TID.socialInstagram} href={s.instagram} label="Instagram" path={<path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.95.25 2.4.42.6.23 1.04.51 1.5.97.45.45.74.89.97 1.5.17.45.37 1.23.42 2.4.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.95-.42 2.4-.23.6-.52 1.04-.97 1.5a4.04 4.04 0 0 1-1.5.97c-.45.17-1.23.37-2.4.42-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.95-.25-2.4-.42a4.04 4.04 0 0 1-1.5-.97 4.04 4.04 0 0 1-.97-1.5c-.17-.45-.37-1.23-.42-2.4C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.95.42-2.4.23-.6.52-1.04.97-1.5.46-.45.9-.74 1.5-.97.45-.17 1.23-.37 2.4-.42C8.42 2.17 8.8 2.16 12 2.16Zm0 1.95c-3.15 0-3.52.01-4.76.07-1.07.05-1.65.23-2.04.38-.51.2-.88.44-1.27.82-.39.39-.62.76-.82 1.27-.15.39-.33.97-.38 2.04-.06 1.24-.07 1.61-.07 4.76s.01 3.52.07 4.76c.05 1.07.23 1.65.38 2.04.2.51.44.88.82 1.27.39.39.76.62 1.27.82.39.15.97.33 2.04.38 1.24.06 1.61.07 4.76.07s3.52-.01 4.76-.07c1.07-.05 1.65-.23 2.04-.38.51-.2.88-.44 1.27-.82.39-.39.62-.76.82-1.27.15-.39.33-.97.38-2.04.06-1.24.07-1.61.07-4.76s-.01-3.52-.07-4.76c-.05-1.07-.23-1.65-.38-2.04a3.43 3.43 0 0 0-.82-1.27 3.43 3.43 0 0 0-1.27-.82c-.39-.15-.97-.33-2.04-.38-1.24-.06-1.61-.07-4.76-.07Zm0 3.32a4.57 4.57 0 1 1 0 9.14 4.57 4.57 0 0 1 0-9.14Zm0 7.54a2.97 2.97 0 1 0 0-5.94 2.97 2.97 0 0 0 0 5.94Zm5.82-7.73a1.07 1.07 0 1 1-2.14 0 1.07 1.07 0 0 1 2.14 0Z"/>}/>
                    <SocialLink testid={TID.socialTiktok}    href={s.tiktok}    label="TikTok"    path={<path d="M16.5 3a5.5 5.5 0 0 0 4.5 5v3a8.5 8.5 0 0 1-4.5-1.3v6.05a6.25 6.25 0 1 1-6.25-6.25c.3 0 .6.02.88.07v3.06a3.2 3.2 0 1 0 2.37 3.12V3h3Z"/>}/>
                </div>
            </div>
        </footer>
    );
}

function Shell({ children }) {
    const [account, setAccount] = useState(null);
    const [cfg, setCfg]         = useState(null);

    const refreshCfg = useCallback(async () => {
        try { const c = await api.config(); setCfg(c); } catch (e) { console.error(e); }
    }, []);

    useEffect(() => {
        refreshCfg();
        currentAccount().then(setAccount);
        const off = onAccountsChanged(setAccount);
        return off;
    }, [refreshCfg]);

    const onConnect = useCallback(async () => {
        try {
            const acc = await connectWallet();
            setAccount(acc);
            if (cfg?.token?.chain_id) {
                try { await switchToChain(cfg.token.chain_id, cfg.token.chain_name, cfg.token.rpc_url, cfg.token.explorer_url); }
                catch { /* user declined */ }
            }
            toast.success("Wallet connected");
        } catch (e) { toast.error(e.message || "Failed to connect"); }
    }, [cfg]);

    return (
        <div className="App grain">
            <Header account={account} onConnect={onConnect} social={cfg?.social} />
            <main className="relative z-10">{typeof children === "function" ? children({ cfg, account, onConnect, refreshCfg, setAccount }) : children}</main>
            <Footer cfg={cfg} />
            <Toaster theme="dark" position="bottom-right" richColors />
        </div>
    );
}

function HomeRoute() {
    const [params] = useSearchParams();
    const ref = useMemo(() => {
        const r = params.get("ref") || "";
        return /^0x[a-fA-F0-9]{40}$/.test(r) ? r.toLowerCase() : "";
    }, [params]);
    return (
        <Shell>
            {(ctx) => <Home {...ctx} initialReferrer={ref} />}
        </Shell>
    );
}

function AdminRoute() {
    return (
        <Shell>
            {() => <Admin />}
        </Shell>
    );
}

export default function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/"      element={<HomeRoute />} />
                <Route path="/admin" element={<AdminRoute />} />
                <Route path="*"      element={<HomeRoute />} />
            </Routes>
        </BrowserRouter>
    );
}
