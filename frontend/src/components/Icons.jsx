/* Custom icons for Humanity Coin (no external icon font / no emojis). */
import React from "react";

export function CoinMark({ size = 40, className = "" }) {
    return (
        <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true">
            <defs>
                <radialGradient id="hc-rad" cx="35%" cy="30%" r="70%">
                    <stop offset="0%"   stopColor="#ffe680"/>
                    <stop offset="55%"  stopColor="#e8b900"/>
                    <stop offset="100%" stopColor="#9d7a00"/>
                </radialGradient>
            </defs>
            <circle cx="32" cy="32" r="29" fill="url(#hc-rad)" stroke="#3a2a00" strokeWidth="2"/>
            <circle cx="32" cy="32" r="24" fill="none" stroke="#3a2a00" strokeOpacity="0.35"/>
            {/* simple human/heart mark */}
            <path d="M32 47s-12-7.6-12-16.2c0-4.2 3.4-7.4 7.4-7.4 2.5 0 4.7 1.3 5.6 3 .9-1.7 3.1-3 5.6-3 4 0 7.4 3.2 7.4 7.4C46 39.4 32 47 32 47Z"
                  fill="#2a1d00" fillOpacity="0.85"/>
        </svg>
    );
}

export function Arrow({ className = "" }) {
    return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M5 12h14M13 6l6 6-6 6"/></svg>;
}
export function CopyIcon({ className = "" }) {
    return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>;
}
export function ExternalIcon({ className = "" }) {
    return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M15 3h6v6"/><path d="M10 14L21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>;
}
export function RefreshIcon({ className = "" }) {
    return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M20.49 15A9 9 0 0 1 5.64 18.36L1 14"/></svg>;
}
