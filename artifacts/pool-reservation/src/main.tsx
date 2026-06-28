import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";

const appBaseUrl = import.meta.env.BASE_URL.replace(/\/+$/, "");
const configuredApiBaseUrl = (
  (import.meta.env.VITE_API_BASE_URL as string | undefined) || ""
).replace(/\/+$/, "");
const apiBaseUrl = configuredApiBaseUrl || appBaseUrl;

// Set up the API client token getter
setAuthTokenGetter(() => localStorage.getItem("pool_token"));
setBaseUrl(apiBaseUrl || null);

function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function isSameAppApiRequest(url: string): boolean {
  if (url === "/api" || url.startsWith("/api/")) return true;

  if (appBaseUrl && (url === `${appBaseUrl}/api` || url.startsWith(`${appBaseUrl}/api/`))) {
    return true;
  }

  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.origin !== window.location.origin) return false;
    return parsed.pathname === "/api" || parsed.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

function withApiBase(input: RequestInfo | URL): RequestInfo | URL {
  if (!configuredApiBaseUrl) return input;

  const url = getRequestUrl(input);
  if (!isSameAppApiRequest(url)) return input;

  const parsed = new URL(url, window.location.origin);
  const apiPath =
    appBaseUrl && parsed.pathname.startsWith(`${appBaseUrl}/api`)
      ? parsed.pathname.slice(appBaseUrl.length)
      : parsed.pathname;
  const nextUrl = `${configuredApiBaseUrl}${apiPath}${parsed.search}${parsed.hash}`;

  if (typeof input === "string") return nextUrl;
  if (input instanceof URL) return new URL(nextUrl);
  return new Request(nextUrl, input);
}

// ── Franchise branch switcher (super_admin) ───────────────────────────────
// Tag every same-origin /api request with the chosen branch so existing raw
// fetch() calls are scoped without per-call edits. Non-super-admins: the server
// ignores this header and confines them to their own branch.
const ACTIVE_BRANCH_KEY = "aquarich_active_branch";
const _origFetch = window.fetch.bind(window);
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const nextInput = withApiBase(input);
  try {
    const branch = localStorage.getItem(ACTIVE_BRANCH_KEY);
    if (branch) {
      const url = getRequestUrl(nextInput);
      if (url && url.includes("/api/")) {
        const headers = new Headers(init?.headers || (nextInput instanceof Request ? nextInput.headers : undefined));
        headers.set("X-Branch-Id", branch);
        return _origFetch(nextInput as RequestInfo, { ...(init || {}), headers });
      }
    }
  } catch { /* fall through to a normal fetch */ }
  return _origFetch(nextInput as RequestInfo, init);
}) as typeof window.fetch;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
