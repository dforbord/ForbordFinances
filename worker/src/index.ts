// ── Option B: Cloudflare Worker Teller proxy (mTLS via binding) ──────────────
//
// The Teller client certificate is uploaded to Cloudflare and attached to
// outbound requests through the TELLER_CERT binding, so it is never exposed to
// the browser. Because it's hosted, the deployed app (and your phone) can sync
// too — unlike the local sidecar which only works while your Mac is running.
//
// Contract is identical to the local sidecar (server/teller-proxy.mjs):
//   GET /accounts
//   GET /accounts/:id/transactions
//   GET /accounts/:id/balances
// each with a `Teller-Access-Token` header. Point the app's Proxy URL at this
// Worker's URL in ⚙ Teller setup.
//
// Deploy:  cd worker && npm install && npx wrangler deploy

export interface Env {
  // mtls_certificate binding — exposes .fetch() that presents the client cert.
  TELLER_CERT: { fetch: typeof fetch };
  // Comma-separated list of Origins allowed to call this Worker.
  ALLOWED_ORIGINS?: string;
}

const TELLER_BASE = "https://api.teller.io";
const ALLOWED_PREFIXES = ["/accounts", "/identity"];

function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  const permit = origin && (allowed.length === 0 || allowed.includes(origin));
  return {
    "Access-Control-Allow-Origin": permit ? origin! : (allowed[0] ?? "*"),
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Teller-Access-Token, Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function json(obj: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const allowed = (env.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const cors = corsHeaders(req.headers.get("Origin"), allowed);

    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    const url = new URL(req.url);
    const path = url.pathname;

    if (path === "/health") return json({ ok: true, proxy: "cloudflare-worker" }, 200, cors);

    if (req.method !== "GET") return json({ error: "Only GET is supported." }, 405, cors);

    if (!ALLOWED_PREFIXES.some((p) => path === p || path.startsWith(p + "/"))) {
      return json({ error: `Path not allowed: ${path}` }, 403, cors);
    }

    const token = req.headers.get("Teller-Access-Token");
    if (!token) return json({ error: "Missing Teller-Access-Token header." }, 400, cors);

    const auth = "Basic " + btoa(token + ":");
    let upstream: Response;
    try {
      upstream = await env.TELLER_CERT.fetch(`${TELLER_BASE}${path}${url.search}`, {
        method: "GET",
        headers: { Authorization: auth, Accept: "application/json" },
      });
    } catch (e) {
      return json({ error: `Upstream Teller request failed: ${(e as Error).message}` }, 502, cors);
    }

    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: { ...cors, "Content-Type": upstream.headers.get("Content-Type") ?? "application/json" },
    });
  },
};
