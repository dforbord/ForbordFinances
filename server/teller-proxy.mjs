#!/usr/bin/env node
// ── Option A: local Teller proxy (mTLS sidecar) ──────────────────────────────
//
// Holds Teller's client certificate on THIS Mac and forwards read-only Teller
// API calls to https://api.teller.io. The browser app never sees the
// certificate, and your bank data flows Mac → Teller → Mac — never through the
// cloud. Started automatically by Budget.command on port 5181.
//
// Zero dependencies — Node built-ins only.
//
// Certificate: download `certificate.pem` + `private_key.pem` from the Teller
// dashboard and drop them here (paths overridable via env vars):
//     ~/.forbord/teller/certificate.pem
//     ~/.forbord/teller/private_key.pem
// Keeping them outside the repo means they can never be committed by accident.

import http from "node:http";
import https from "node:https";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PORT = Number(process.env.TELLER_PROXY_PORT || 5181);
const CERT_PATH = process.env.TELLER_CERT || join(homedir(), ".forbord", "teller", "certificate.pem");
const KEY_PATH = process.env.TELLER_KEY || join(homedir(), ".forbord", "teller", "private_key.pem");
const TELLER_HOST = "api.teller.io";

// Only these path prefixes may be forwarded — this is NOT an open proxy.
const ALLOWED_PREFIXES = ["/accounts", "/identity"];

function loadCert() {
  if (!existsSync(CERT_PATH) || !existsSync(KEY_PATH)) return null;
  try {
    return { cert: readFileSync(CERT_PATH), key: readFileSync(KEY_PATH) };
  } catch {
    return null;
  }
}

let agent = null;
function getAgent() {
  if (agent) return agent;
  const creds = loadCert();
  if (!creds) return null;
  agent = new https.Agent({ cert: creds.cert, key: creds.key, keepAlive: true });
  return agent;
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  res.setHeader("Access-Control-Allow-Origin", origin || "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Teller-Access-Token, Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function json(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

const server = http.createServer((req, res) => {
  applyCors(req, res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  if (path === "/health") {
    json(res, 200, { ok: true, certLoaded: !!loadCert(), certDir: CERT_PATH.replace(/certificate\.pem$/, "") });
    return;
  }

  if (req.method !== "GET") {
    json(res, 405, { error: "Only GET is supported." });
    return;
  }

  if (!ALLOWED_PREFIXES.some((p) => path === p || path.startsWith(p + "/"))) {
    json(res, 403, { error: `Path not allowed: ${path}` });
    return;
  }

  const token = req.headers["teller-access-token"];
  if (!token || typeof token !== "string") {
    json(res, 400, { error: "Missing Teller-Access-Token header." });
    return;
  }

  const ag = getAgent();
  if (!ag) {
    json(res, 503, {
      error:
        `Teller client certificate not found. Put certificate.pem + private_key.pem in ` +
        `${CERT_PATH.replace(/certificate\.pem$/, "")} (or set TELLER_CERT / TELLER_KEY), then restart.`,
    });
    return;
  }

  const auth = "Basic " + Buffer.from(token + ":").toString("base64");
  const upstream = https.request(
    {
      host: TELLER_HOST,
      method: "GET",
      path: path + url.search,
      agent: ag,
      headers: { Authorization: auth, Accept: "application/json" },
    },
    (up) => {
      res.writeHead(up.statusCode || 502, {
        "Content-Type": up.headers["content-type"] || "application/json",
      });
      up.pipe(res);
    },
  );
  upstream.on("error", (e) => {
    json(res, 502, { error: `Upstream Teller request failed: ${e.message}` });
  });
  upstream.end();
});

server.listen(PORT, "127.0.0.1", () => {
  const loaded = !!loadCert();
  console.log(`[teller-proxy] listening on http://localhost:${PORT}`);
  console.log(
    `[teller-proxy] certificate: ${loaded ? "loaded ✓" : `NOT found — data calls will 503 until you add it to ${CERT_PATH.replace(/certificate\.pem$/, "")}`}`,
  );
});
