// ─────────────────────────────────────────────────────────────────────────
//  Bank sync backend.
//
//    claimConnection  callable  — exchange a SimpleFIN setup token for an
//                                 access URL and store it server-side
//    syncNow          callable  — pull immediately (used right after connecting)
//    dailyRefresh     scheduled — one pull per connection, every morning
//
//  The access URL is a bearer credential for reading someone's bank data. It
//  lives ONLY in connections/{uid}, which firestore.rules denies to every
//  client; these functions reach it through the Admin SDK, which bypasses
//  rules. It is never returned to the caller and never logged.
// ─────────────────────────────────────────────────────────────────────────

import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";

import { mergeBankTxns, MergeableState } from "../../shared/merge";
import { claimSetupToken, fetchAccounts, toIncomingTxns, MAX_RANGE_DAYS } from "./simplefin";

initializeApp();
const db = getFirestore();

const DAY_MS = 24 * 60 * 60 * 1000;
/** Re-request a few days we've already seen; banks post late and dedup is safe. */
const OVERLAP_DAYS = 3;

interface ConnectionDoc {
  accessUrl: string;
  householdId: string;
  ownerEmail: string;
  lastSyncAt?: number;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/** The household this signed-in user belongs to, or null. */
async function householdForEmail(email: string): Promise<string | null> {
  const snap = await db
    .collection("households")
    .where("memberEmails", "array-contains", email.toLowerCase())
    .limit(1)
    .get();
  return snap.empty ? null : snap.docs[0].id;
}

function requireEmail(req: CallableRequest): string {
  const email = req.auth?.token?.email;
  if (!req.auth || !email) {
    throw new HttpsError("unauthenticated", "Sign in first.");
  }
  return email.toLowerCase();
}

// ── Claim ────────────────────────────────────────────────────────────────

export const claimConnection = onCall(async (req) => {
  const email = requireEmail(req);
  const setupToken = String((req.data as { setupToken?: string })?.setupToken ?? "");

  const householdId = await householdForEmail(email);
  if (!householdId) {
    throw new HttpsError("failed-precondition", "You're not in a household yet.");
  }

  const accessUrl = await claimSetupToken(setupToken).catch((e: Error) => {
    throw new HttpsError("invalid-argument", e.message);
  });

  await db.collection("connections").doc(req.auth!.uid).set({
    accessUrl,
    householdId,
    ownerEmail: email,
    createdAt: Timestamp.now(),
  });

  // Prove the connection works and report what we found, without ever
  // returning the credential itself.
  const res = await fetchAccounts(accessUrl, Date.now() - 7 * DAY_MS, Date.now());
  const accounts = res.accounts.map((a) => ({
    name: a.name,
    org: a.org?.name ?? "",
    balance: a.balance,
  }));

  await writeStatus(req.auth!.uid, {
    state: "ok",
    accounts: accounts.map((a) => `${a.org} ${a.name}`.trim()),
    lastSyncAt: null,
  });

  return { accounts };
});

// ── Sync ─────────────────────────────────────────────────────────────────

async function writeStatus(
  connectionUid: string,
  data: Record<string, unknown>,
): Promise<void> {
  await db.collection("connectionStatus").doc(connectionUid).set(data, { merge: true });
}

/**
 * Pull one connection and merge into its household budget.
 *
 * The read-modify-write runs in a Firestore transaction because the browser
 * saves the whole AppState blob; without it a save landing mid-sync would
 * drop the transactions we just added.
 */
async function syncConnection(
  connectionUid: string,
  conn: ConnectionDoc,
  opts: { full?: boolean } = {},
): Promise<number> {
  const now = Date.now();
  // "Sync now" always re-reads the whole window. It is user-initiated and rare,
  // it costs the same single request, and dedup makes re-reading free — so it
  // doubles as the way to recover transactions an earlier bug dropped. The
  // nightly run stays incremental.
  const since =
    opts.full || !conn.lastSyncAt
      ? now - MAX_RANGE_DAYS * DAY_MS
      : conn.lastSyncAt - OVERLAP_DAYS * DAY_MS;
  const start = Math.max(since, now - MAX_RANGE_DAYS * DAY_MS);

  const res = await fetchAccounts(conn.accessUrl, start, now);
  const incoming = toIncomingTxns(res);

  let added = 0;
  const budgetRef = db.collection("budgets").doc(conn.householdId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(budgetRef);
    if (!snap.exists) return; // household hasn't opened the app yet
    const state = snap.data() as MergeableState;
    const merged = mergeBankTxns(state, incoming, uid, now);
    added = merged.added;
    if (merged.added > 0) tx.set(budgetRef, merged.state);
  });

  await db.collection("connections").doc(connectionUid).update({ lastSyncAt: now });
  await writeStatus(connectionUid, {
    state: res.errors.length ? "needs_reauth" : "ok",
    message: res.errors[0] ?? null,
    lastSyncAt: now,
    lastAdded: added,
  });
  return added;
}

export const syncNow = onCall(async (req) => {
  const email = requireEmail(req);
  const ref = db.collection("connections").doc(req.auth!.uid);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("failed-precondition", "No bank is connected yet.");
  }
  const conn = snap.data() as ConnectionDoc;
  if (conn.ownerEmail !== email) {
    throw new HttpsError("permission-denied", "That connection isn't yours.");
  }
  try {
    return { added: await syncConnection(req.auth!.uid, conn, { full: true }) };
  } catch (e) {
    await writeStatus(req.auth!.uid, { state: "error", message: (e as Error).message });
    throw new HttpsError("unavailable", (e as Error).message);
  }
});

/**
 * Every morning, once per connection.
 *
 * SimpleFIN refreshes roughly daily and allows only ~24 requests/day, so one
 * pull per connection is both sufficient and well inside the limit. Failures
 * are recorded per connection and never abort the rest of the run.
 */
export const dailyRefresh = onSchedule(
  { schedule: "0 5 * * *", timeZone: "America/Denver", retryCount: 0 },
  async () => {
    const connections = await db.collection("connections").get();
    let ok = 0;
    let failed = 0;
    for (const doc of connections.docs) {
      try {
        const added = await syncConnection(doc.id, doc.data() as ConnectionDoc);
        ok++;
        logger.info(`synced ${doc.id}: +${added}`);
      } catch (e) {
        failed++;
        // Never log the access URL — only the message.
        logger.error(`sync failed for ${doc.id}: ${(e as Error).message}`);
        await writeStatus(doc.id, { state: "error", message: (e as Error).message });
      }
    }
    logger.info(`dailyRefresh done: ${ok} ok, ${failed} failed`);
  },
);
