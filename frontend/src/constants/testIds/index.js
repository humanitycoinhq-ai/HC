export const TID = {
    // header
    headerLogo:         "header-logo",
    headerAdminLink:    "header-admin-link",
    headerConnect:      "header-connect-wallet-btn",
    headerWalletPill:   "header-wallet-pill",

    // campaign banner
    campaignBanner:     "campaign-banner",
    campaignCta:        "campaign-cta-btn",
    campaignClose:      "campaign-close-btn",

    // hero
    heroTitle:          "hero-title",
    heroSubtitle:       "hero-subtitle",
    heroConnect:        "hero-connect-btn",
    heroClaim:          "hero-claim-btn",
    heroCountdown:      "hero-cooldown-timer",

    // wallet card
    walletCard:         "wallet-summary-card",
    walletAddress:      "wallet-address",
    walletTotalClaimed: "wallet-total-claimed",
    walletPending:      "wallet-pending-balance",
    walletCredited:     "wallet-credited-balance",
    walletReferrals:    "wallet-total-referrals",

    // referrals
    referralLink:       "referral-link-input",
    referralCopyBtn:    "referral-copy-btn",
    referralListItem:   (i) => `referral-row-${i}`,

    // stats
    statsCard:          "global-stats-card",

    // social
    socialFacebook:     "social-facebook-link",
    socialX:            "social-x-link",
    socialInstagram:    "social-instagram-link",
    socialTiktok:       "social-tiktok-link",

    // admin
    adminLoginInput:    "admin-login-password-input",
    adminLoginBtn:      "admin-login-submit-btn",
    adminLogoutBtn:     "admin-logout-btn",
    adminTab:           (k) => `admin-tab-${k}`,
    adminClaimsTable:   "admin-claims-table",
    adminClaimRow:      (id) => `admin-claim-row-${id}`,
    adminClaimMark:     (id, s) => `admin-claim-${id}-mark-${s}`,
    adminClaimTxInput:  (id) => `admin-claim-${id}-tx-input`,
    adminReferralsTable:"admin-referrals-table",
    adminCreditAddr:    "admin-credit-address-input",
    adminCreditAmount:  "admin-credit-amount-input",
    adminCreditNote:    "admin-credit-note-input",
    adminCreditTx:      "admin-credit-tx-input",
    adminCreditSubmit:  "admin-credit-submit-btn",
    adminCreditsTable:  "admin-credits-table",
    adminContentSave:   "admin-content-save-btn",
    adminContentField:  (k) => `admin-content-${k}`,
    adminCampaignSave:  "admin-campaign-save-btn",
    adminCampaignField: (k) => `admin-campaign-${k}`,
    adminSocialSave:    "admin-social-save-btn",
    adminSocialField:   (k) => `admin-social-${k}`,
    adminOnchainRefresh:"admin-onchain-refresh-btn",
};
