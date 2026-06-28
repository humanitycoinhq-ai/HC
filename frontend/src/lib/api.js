import axios from "axios";

// In dev: REACT_APP_BACKEND_URL (e.g. https://....preview.emergentagent.com)
// In prod (PHP build): we ship as same-origin, so empty string -> /api/...
const RAW = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");
export const API_BASE = `${RAW}/api`;

const http = axios.create({
    baseURL: API_BASE,
    timeout: 20000,
});

http.interceptors.request.use((cfg) => {
    const token = localStorage.getItem("hc_admin_token");
    if (token && cfg.url && cfg.url.startsWith("/admin")) {
        cfg.headers = cfg.headers || {};
        cfg.headers.Authorization = `Bearer ${token}`;
    }
    return cfg;
});

export const api = {
    config:     ()                    => http.get("/config").then(r => r.data),
    claim:      (address, referrer)   => http.post("/claim", { address, referrer }).then(r => r.data),
    wallet:     (address)             => http.get(`/wallet/${address}`).then(r => r.data),
    referrals:  (address)             => http.get(`/referrals/${address}`).then(r => r.data),
    stats:      ()                    => http.get("/stats").then(r => r.data),

    adminLogin:    (password)         => http.post("/admin/login", { password }).then(r => r.data),
    adminClaims:   (params)           => http.get("/admin/claims", { params }).then(r => r.data),
    adminClaimSet: (id, body)         => http.post(`/admin/claims/${id}`, body).then(r => r.data),
    adminReferrals:(params)           => http.get("/admin/referrals", { params }).then(r => r.data),
    adminCredit:   (body)             => http.post("/admin/credit", body).then(r => r.data),
    adminCredits:  (params)           => http.get("/admin/credits", { params }).then(r => r.data),
    adminContentGet: ()               => http.get("/admin/content").then(r => r.data),
    adminContentSet: (body)           => http.post("/admin/content", body).then(r => r.data),
    adminCampaignGet:()               => http.get("/admin/campaign").then(r => r.data),
    adminCampaignSet:(body)           => http.post("/admin/campaign", body).then(r => r.data),
    adminOnchain: ()                  => http.get("/admin/onchain").then(r => r.data),
    adminSocialGet: ()                => http.get("/admin/social").then(r => r.data),
    adminSocialSet: (body)            => http.post("/admin/social", body).then(r => r.data),
};

export default http;
