// Teller bank-sync — Connect widget + data fetch through your proxy.
//
// Deliberately kept OUT of AppState: the bank access token never touches
// Firestore, the synced budget.json, or another device. It lives only in this
// browser's localStorage under a dedicated key. The only thing that flows into
// the shared budget state is the resulting transactions, via the existing
// IMPORT_BATCH pipeline (see ImportPanel for the same shape).
//
// The proxy (local Node sidecar = Option A, or a Cloudflare Worker = Option B)
// is what holds Teller's mTLS client certificate — that can't live in the
// browser. Both proxies expose the same contract, so this file is identical for
// either one; only `proxyUrl` differs.

import { ParsedTxn } from "./import";

const STORE_KEY = "forbord.teller.v1"; // NOT synced — local to this browser only.
const CONNECT_SRC = "https://cdn.teller.io/connect/connect.js";
export const DEFAULT_PROXY_URL = "http://localhost:5181";

export type TellerEnv = "sandbox" | "development" | "production";

export interface TellerAccount {
  id: string;
  name: string;
  type: string; // "depository" | "credit"
  subtype?: string; // "checking" | "savings" | "credit_card" | …
  lastFour?: string;
  institution?: string;
}

export interface TellerEnrollment {
  accessToken: string; // sensitive — local only, never synced
  enrollmentId: string;
  institution: string;
  connectedAt: number;
  lastSync?: number;
  accounts: TellerAccount[];
}

export interface TellerConfig {
  applicationId: string;
  environment: TellerEnv;
  proxyUrl: string;
  enrollments: TellerEnrollment[];
}

function emptyConfig(): TellerConfig {
  return {
    applicationId: "",
    environment: "development",
    proxyUrl: DEFAULT_PROXY_URL,
    enrollments: [],
  };
}

export function loadTeller(): TellerConfig {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return emptyConfig();
    const p = JSON.parse(raw) as Partial<TellerConfig>;
    return {
      applicationId: p.applicationId ?? "",
      environment: p.environment ?? "development",
      proxyUrl: p.proxyUrl || DEFAULT_PROXY_URL,
      enrollments: Array.isArray(p.enrollments) ? p.enrollments : [],
    };
  } catch {
    return emptyConfig();
  }
}

export function saveTeller(cfg: TellerConfig): void {
  localStorage.setItem(STORE_KEY, JSON.stringify(cfg));
}

// ── Teller Connect (front-end widget; no server needed to obtain the token) ──

interface TellerConnectSuccess {
  accessToken: string;
  enrollment?: { id?: string; institution?: { name?: string } };
  user?: { id?: string };
}

declare global {
  interface Window {
    TellerConnect?: {
      setup(opts: {
        applicationId: string;
        environment: TellerEnv;
        onSuccess: (e: TellerConnectSuccess) => void;
        onExit?: () => void;
        onFailure?: (f: unknown) => void;
      }): { open: () => void };
    };
  }
}

let connectLoading: Promise<void> | null = null;
function loadConnectScript(): Promise<void> {
  if (window.TellerConnect) return Promise.resolve();
  if (connectLoading) return connectLoading;
  connectLoading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = CONNECT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      connectLoading = null;
      reject(new Error("Could not load Teller Connect — check your internet connection."));
    };
    document.head.appendChild(s);
  });
  return connectLoading;
}

/** Open Teller Connect. Resolves with the enrollment on success, or null if the
 *  user closes the dialog without connecting. */
export async function openTellerConnect(cfg: TellerConfig): Promise<TellerConnectSuccess | null> {
  if (!cfg.applicationId.trim()) {
    throw new Error("Add your Teller Application ID first (open ⚙ Teller setup).");
  }
  await loadConnectScript();
  const TC = window.TellerConnect;
  if (!TC) throw new Error("Teller Connect failed to initialize.");
  return new Promise((resolve) => {
    let settled = false;
    const done = (v: TellerConnectSuccess | null) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };
    const handle = TC.setup({
      applicationId: cfg.applicationId.trim(),
      environment: cfg.environment,
      onSuccess: (e) => done(e),
      onExit: () => done(null),
      onFailure: () => done(null),
    });
    handle.open();
  });
}

/** Fold a fresh Connect success into the config, replacing any prior enrollment
 *  for the same institution/enrollment id. Accounts are filled in separately. */
export function enrollmentFromConnect(e: TellerConnectSuccess): TellerEnrollment {
  return {
    accessToken: e.accessToken,
    enrollmentId: e.enrollment?.id ?? "",
    institution: e.enrollment?.institution?.name ?? "Bank",
    connectedAt: Date.now(),
    accounts: [],
  };
}

export function upsertEnrollment(cfg: TellerConfig, next: TellerEnrollment): TellerConfig {
  const others = cfg.enrollments.filter(
    (x) => x.accessToken !== next.accessToken && x.enrollmentId !== next.enrollmentId,
  );
  return { ...cfg, enrollments: [...others, next] };
}

// ── Teller API — routed through your proxy, which attaches the mTLS cert ──────

async function proxyGet<T>(cfg: TellerConfig, token: string, path: string): Promise<T> {
  const base = cfg.proxyUrl.replace(/\/+$/, "");
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, { headers: { "Teller-Access-Token": token } });
  } catch {
    throw new Error(
      `Can't reach the Teller proxy at ${base}. ` +
        `For the local sidecar, make sure it started with the app; for the Cloudflare Worker, check its URL in ⚙ Teller setup.`,
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) {
      throw new Error("This bank connection needs to be re-authorized — click Reconnect on that bank.");
    }
    if (res.status === 503) {
      throw new Error(`Proxy is up but can't call Teller — is the client certificate installed? ${body.slice(0, 160)}`);
    }
    throw new Error(`Teller request failed (${res.status}). ${body.slice(0, 160)}`);
  }
  return (await res.json()) as T;
}

interface RawTellerAccount {
  id: string;
  name: string;
  type: string;
  subtype?: string;
  last_four?: string;
  institution?: { name?: string };
}

export async function fetchAccounts(cfg: TellerConfig, token: string): Promise<TellerAccount[]> {
  const raw = await proxyGet<RawTellerAccount[]>(cfg, token, "/accounts");
  return raw.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    subtype: a.subtype,
    lastFour: a.last_four,
    institution: a.institution?.name,
  }));
}

interface RawTellerTxn {
  id: string;
  account_id: string;
  date: string; // YYYY-MM-DD
  description: string;
  amount: string; // signed string, negative = money out
  status: "posted" | "pending";
  type?: string;
  details?: { category?: string; counterparty?: { name?: string; type?: string } };
}

/** A Teller transaction normalized to the app's ParsedTxn, plus the extras we
 *  use for dedup (stable id), category hinting, and pending filtering. */
export interface TellerSyncTxn extends ParsedTxn {
  tellerId: string;
  accountId: string;
  category?: string;
  pending: boolean;
}

export async function fetchTransactions(
  cfg: TellerConfig,
  token: string,
  accountId: string,
  count = 250,
): Promise<TellerSyncTxn[]> {
  const raw = await proxyGet<RawTellerTxn[]>(
    cfg,
    token,
    `/accounts/${encodeURIComponent(accountId)}/transactions?count=${count}`,
  );
  return raw
    .map((t) => ({
      tellerId: t.id,
      accountId: t.account_id,
      date: t.date,
      description: (t.details?.counterparty?.name || t.description || "Transaction").trim(),
      amount: parseFloat(t.amount),
      category: t.details?.category,
      pending: t.status === "pending",
    }))
    .filter((t) => !!t.date && !isNaN(t.amount));
}

// ── Teller's own category → your nearest-named bucket (fallback hint) ─────────

const CATEGORY_HINTS: Record<string, string[]> = {
  dining: ["dining", "food", "restaurant"],
  groceries: ["grocer", "food"],
  transportation: ["transport", "car", "auto"],
  fuel: ["gas", "fuel", "car", "transport"],
  transport: ["transport", "car", "auto", "gas"],
  utilities: ["utilit"],
  entertainment: ["entertain", "subscription", "misc"],
  shopping: ["shopping", "misc"],
  travel: ["travel"],
  health: ["health", "medical"],
  insurance: ["insurance"],
  home: ["housing", "rent", "mortgage", "home"],
  rent: ["housing", "rent"],
  utilitiesandbills: ["utilit"],
};

/** Best-effort map from Teller's category to one of the user's buckets by name. */
export function bucketFromTellerCategory(
  category: string | undefined,
  buckets: { id: string; name: string }[],
): string | undefined {
  if (!category) return undefined;
  const hints = CATEGORY_HINTS[category.toLowerCase().replace(/[^a-z]/g, "")];
  if (!hints) return undefined;
  const b = buckets.find((x) => hints.some((h) => x.name.toLowerCase().includes(h)));
  return b?.id;
}
