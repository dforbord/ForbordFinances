// ─────────────────────────────────────────────────────────────────────────
//  SimpleFIN Bridge client.
//
//  Wire format verified against the published demo token:
//    • claim  = base64-decode the setup token → POST that URL (one time only)
//               → body is the access URL, with credentials in its userinfo
//    • fetch  = GET {access}/accounts?start-date=<EPOCH SECONDS>
//               Without start-date you only get transactions since yesterday.
//    • amounts are STRINGS and signed (negative = money out)
//    • posted is EPOCH SECONDS
//
//  Rate limit is ~24 requests/day per access URL, so callers make exactly one
//  request per connection per run and never poll.
// ─────────────────────────────────────────────────────────────────────────

import { IncomingTxn } from "../../shared/merge";

/**
 * Widest window we ask for in one request.
 *
 * The docs say 90 days, but the live API answers a 89-day query with
 * "Requested date range exceeds recommended range of 45 days. In the future,
 * this may be capped." We stay inside the range it actually recommends;
 * deeper history is still available through the CSV/OFX file import.
 */
export const MAX_RANGE_DAYS = 45;

export interface SimplefinAccount {
  id: string;
  name: string;
  balance: string;
  "balance-date"?: number;
  org?: { name?: string; domain?: string };
  transactions?: SimplefinTxn[];
}

export interface SimplefinTxn {
  id: string;
  posted: number;
  amount: string;
  description?: string;
  payee?: string;
  memo?: string;
  mcc?: string;
  pending?: boolean;
}

export interface AccountsResponse {
  errors: string[];
  accounts: SimplefinAccount[];
}

/**
 * Exchange a one-time setup token for a durable access URL.
 *
 * The returned URL embeds credentials — it is a bearer secret and must never
 * reach a client or a log.
 */
export async function claimSetupToken(setupToken: string): Promise<string> {
  const trimmed = setupToken.trim();
  if (!trimmed) throw new Error("Paste the setup token from SimpleFIN first.");

  let claimUrl: string;
  try {
    claimUrl = Buffer.from(trimmed, "base64").toString("utf8").trim();
  } catch {
    throw new Error("That doesn't look like a SimpleFIN setup token.");
  }
  if (!/^https:\/\//i.test(claimUrl)) {
    throw new Error("That doesn't look like a SimpleFIN setup token.");
  }

  // A POST with no body; SimpleFIN requires the claim to be a POST and it
  // works exactly once.
  const res = await fetch(claimUrl, { method: "POST" });
  if (!res.ok) {
    throw new Error(
      res.status === 403
        ? "That setup token has already been used. Create a new one in SimpleFIN."
        : `SimpleFIN rejected the setup token (HTTP ${res.status}).`,
    );
  }
  const accessUrl = (await res.text()).trim();
  if (!/^https:\/\/[^/]*:[^/]*@/.test(accessUrl)) {
    throw new Error("SimpleFIN did not return a usable access URL.");
  }
  return accessUrl;
}

/** Split the credentials out of an access URL into a Basic auth header. */
function splitAccessUrl(accessUrl: string): { base: string; authorization: string } {
  const u = new URL(accessUrl);
  const user = decodeURIComponent(u.username);
  const pass = decodeURIComponent(u.password);
  u.username = "";
  u.password = "";
  return {
    base: u.toString().replace(/\/+$/, ""),
    authorization: "Basic " + Buffer.from(`${user}:${pass}`).toString("base64"),
  };
}

/** One request. `startDate`/`endDate` are JS epoch ms; converted to seconds. */
export async function fetchAccounts(
  accessUrl: string,
  startDate: number,
  endDate: number,
): Promise<AccountsResponse> {
  const { base, authorization } = splitAccessUrl(accessUrl);
  const qs = new URLSearchParams({
    "start-date": String(Math.floor(startDate / 1000)),
    "end-date": String(Math.floor(endDate / 1000)),
  });
  const res = await fetch(`${base}/accounts?${qs}`, {
    headers: { Authorization: authorization, Accept: "application/json" },
  });
  if (res.status === 403) {
    throw new Error("SimpleFIN refused the connection — it needs to be set up again.");
  }
  if (res.status === 429) {
    throw new Error("SimpleFIN rate limit reached; the next scheduled run will retry.");
  }
  if (!res.ok) {
    throw new Error(`SimpleFIN request failed (HTTP ${res.status}).`);
  }
  const body = (await res.json()) as Partial<AccountsResponse>;
  return {
    errors: Array.isArray(body.errors) ? body.errors : [],
    accounts: Array.isArray(body.accounts) ? body.accounts : [],
  };
}

/** Epoch seconds → YYYY-MM-DD in UTC (SimpleFIN posts at UTC day boundaries). */
function toDateString(epochSeconds: number): string {
  const d = new Date(epochSeconds * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;
}

/**
 * Flatten a response into transactions ready for merging.
 *
 * Pending transactions are skipped: their amount and description can still
 * change, and the posted version arrives with the same id anyway.
 */
export interface Extracted {
  txns: IncomingTxn[];
  /** Counts for logging — a bare "added 0" can't tell you WHY nothing landed. */
  seen: number;
  pendingSkipped: number;
  zeroSkipped: number;
  /** Newest transaction the bank has sent, epoch seconds (0 if none). */
  newestPosted: number;
  /** Oldest "as of" across accounts — how current the upstream data is. */
  asOf: number;
  /** "<org> <name>: <n> txns" per account, so a missing account is obvious. */
  perAccount: string[];
}

export function toIncomingTxns(res: AccountsResponse): Extracted {
  const out: IncomingTxn[] = [];
  let seen = 0;
  let pendingSkipped = 0;
  let zeroSkipped = 0;
  let newestPosted = 0;
  let asOf = 0;
  const perAccount: string[] = [];
  for (const account of res.accounts) {
    const list = account.transactions ?? [];
    // How CURRENT is the upstream data? SimpleFIN refreshes ~daily and Chase
    // can lag by days, so "newest transaction" and the balance timestamp are
    // what distinguish "the bank hasn't sent it yet" from a bug in here.
    const newest = list.reduce((m, t) => (t.posted > m ? t.posted : m), 0);
    if (newest > newestPosted) newestPosted = newest;
    const stamp = account["balance-date"] ?? 0;
    // Oldest wins: the feed is only as current as its laggiest account.
    if (stamp && (asOf === 0 || stamp < asOf)) asOf = stamp;
    const iso = (e: number) => (e ? new Date(e * 1000).toISOString().slice(0, 10) : "none");
    perAccount.push(
      `${account.name}:${list.length} newest=${iso(newest)} asOf=${iso(account["balance-date"] ?? 0)}`,
    );
    for (const t of list) {
      seen++;
      if (t.pending) {
        pendingSkipped++;
        continue;
      }
      const amount = parseFloat(t.amount);
      if (!isFinite(amount) || amount === 0) {
        zeroSkipped++;
        continue;
      }
      out.push({
        // Scoped to the account: SimpleFIN ids are unique only WITHIN an
        // account. Real data collides across them — the demo returns id
        // "1790064000" on both Savings (-110.00) and Checking (-143.39) — so a
        // bare id would silently discard the second, real transaction.
        sourceId: `sfin:${account.id}:${t.id}`,
        date: toDateString(t.posted),
        description: (t.payee || t.description || t.memo || "Transaction").trim(),
        amount,
        // The card network's own classification — the strongest signal we get,
        // and it works for merchants no name list would know.
        mcc: t.mcc,
      });
    }
  }
  return { txns: out, seen, pendingSkipped, zeroSkipped, newestPosted, asOf, perAccount };
}
