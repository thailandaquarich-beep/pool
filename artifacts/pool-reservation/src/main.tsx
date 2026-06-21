import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";

// Set up the API client token getter
setAuthTokenGetter(() => localStorage.getItem("pool_token"));
setBaseUrl(import.meta.env.BASE_URL);

// ── Franchise branch switcher (super_admin) ───────────────────────────────
// Tag every same-origin /api request with the chosen branch so existing raw
// fetch() calls are scoped without per-call edits. Non-super-admins: the server
// ignores this header and confines them to their own branch.
const ACTIVE_BRANCH_KEY = "aquarich_active_branch";
const _origFetch = window.fetch.bind(window);
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  try {
    const branch = localStorage.getItem(ACTIVE_BRANCH_KEY);
    if (branch) {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
      if (url && url.includes("/api/")) {
        const headers = new Headers(init?.headers || (input instanceof Request ? (input as Request).headers : undefined));
        headers.set("X-Branch-Id", branch);
        return _origFetch(input as RequestInfo, { ...(init || {}), headers });
      }
    }
  } catch { /* fall through to a normal fetch */ }
  return _origFetch(input as RequestInfo, init);
}) as typeof window.fetch;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);