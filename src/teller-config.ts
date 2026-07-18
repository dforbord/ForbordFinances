import type { TellerEnv } from "./teller";

// ─────────────────────────────────────────────────────────────────────────
//  TELLER BANK-SYNC CONFIG  (see SETUP-TELLER.md for the full walkthrough)
//
//  You fill this in ONCE, exactly like firebase-config.ts. Nothing here is a
//  secret: the Application ID is safe in the shipped app, and the only real
//  secret — the mTLS client certificate — lives on the proxy, never in the
//  browser.
//
//  • Leave applicationId BLANK  → bank auto-sync stays hidden; the app still
//    supports manual file import (drag a CSV/OFX), exactly as before.
//  • Paste your Teller Application ID → the "Connect a bank" button appears in
//    Log Entries. Each person then links their own bank once and syncs from
//    then on; their access token stays in their own browser.
// ─────────────────────────────────────────────────────────────────────────

export const tellerConfig: {
  applicationId: string;
  environment: TellerEnv;
  proxyUrl: string;
} = {
  // From the Teller dashboard (looks like "app_xxxxxxxxxxxxxxxxxx").
  applicationId: "",

  // "development" = real bank data, free (up to 100 banks). "sandbox" = fake
  // data, no certificate needed (handy for a dry run). "production" = live app.
  environment: "development",

  // Where the proxy that holds your certificate lives:
  //   Option A (local sidecar):  http://localhost:5181   ← default, started by Budget.command
  //   Option B (Cloudflare Worker): https://forbord-teller-proxy.<you>.workers.dev
  proxyUrl: "http://localhost:5181",
};
