const API_UPSTREAM = "https://student-testimony-radiation-female.trycloudflare.com";
const AI_UPSTREAM = "https://rendered-minimal-elections-banana.trycloudflare.com";

function corsHeaders(request) {
  return {
    "Access-Control-Allow-Origin": request.headers.get("Origin") || "*",
    "Access-Control-Allow-Methods": "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers":
      request.headers.get("Access-Control-Request-Headers") ||
      "authorization,content-type,x-branch-id",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function withCors(response, request) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(request))) {
    headers.set(key, value);
  }
  headers.delete("Cross-Origin-Resource-Policy");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function proxyUpstream(request, upstream, rewritePath) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  const url = new URL(request.url);
  const upstreamUrl = new URL(rewritePath(url.pathname) + url.search, upstream);
  const headers = new Headers(request.headers);
  headers.set("X-Forwarded-Host", url.host);
  headers.set("X-Forwarded-Proto", "https");

  const init = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
  }

  const response = await fetch(new Request(upstreamUrl, init));
  return withCors(response, request);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      return proxyUpstream(request, API_UPSTREAM, (pathname) => pathname);
    }
    if (url.pathname === "/ai" || url.pathname.startsWith("/ai/")) {
      return proxyUpstream(request, AI_UPSTREAM, (pathname) => pathname.replace(/^\/ai/, "/api"));
    }
    return env.ASSETS.fetch(request);
  },
};
