/** EVM helpers (no ethers dependency — works with any injected provider). */

export const shorten = (a, n = 6) => (a ? `${a.slice(0, n)}…${a.slice(-4)}` : "");

export function getProvider() {
    if (typeof window === "undefined") return null;
    return window.ethereum || null;
}

export async function connectWallet() {
    const p = getProvider();
    if (!p) throw new Error("No EVM wallet found. Install MetaMask or Trust Wallet.");
    const accounts = await p.request({ method: "eth_requestAccounts" });
    return accounts && accounts[0] ? accounts[0].toLowerCase() : null;
}

export async function currentAccount() {
    const p = getProvider();
    if (!p) return null;
    try {
        const accounts = await p.request({ method: "eth_accounts" });
        return accounts && accounts[0] ? accounts[0].toLowerCase() : null;
    } catch { return null; }
}

export async function switchToChain(chainIdNum, chainName, rpcUrl, explorer) {
    const p = getProvider();
    if (!p) return;
    const chainIdHex = "0x" + Number(chainIdNum).toString(16);
    try {
        await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainIdHex }] });
    } catch (e) {
        if (e?.code === 4902) {
            await p.request({
                method: "wallet_addEthereumChain",
                params: [{
                    chainId: chainIdHex,
                    chainName: chainName || "EVM",
                    rpcUrls: [rpcUrl],
                    blockExplorerUrls: explorer ? [explorer] : [],
                    nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
                }],
            });
        } else { throw e; }
    }
}

export function onAccountsChanged(cb) {
    const p = getProvider();
    if (!p?.on) return () => {};
    const handler = (accs) => cb(accs && accs[0] ? accs[0].toLowerCase() : null);
    p.on("accountsChanged", handler);
    return () => p.removeListener?.("accountsChanged", handler);
}

export function fmtAmount(n, d = 2) {
    const x = Number(n || 0);
    if (!Number.isFinite(x)) return "0";
    if (Math.abs(x) >= 1_000_000) return (x / 1_000_000).toFixed(2) + "M";
    if (Math.abs(x) >= 1_000)     return (x / 1_000).toFixed(2) + "K";
    return x.toLocaleString(undefined, { maximumFractionDigits: d });
}

export function fmtDuration(seconds) {
    const s = Math.max(0, Math.floor(seconds || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${sec}s`;
    return `${sec}s`;
}
