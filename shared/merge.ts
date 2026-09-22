// ─────────────────────────────────────────────────────────────────────────
//  Merging automatically-synced bank transactions into a budget.
//
//  Pure and side-effect free so it can be unit-tested without Firestore, and
//  so the nightly Cloud Function and any future client-side sync agree
//  exactly. Keep free of browser and node APIs.
// ─────────────────────────────────────────────────────────────────────────

import {
  CategorizableBucket,
  CategorizableRule,
  fingerprint,
  suggestCategory,
} from "./categorize";

/** One transaction arriving from an automatic source (SimpleFIN today). */
export interface IncomingTxn {
  /** Stable per-source id, already namespaced, e.g. "sfin:abc123". */
  sourceId: string;
  /** YYYY-MM-DD */
  date: string;
  description: string;
  /** Signed: negative = money out. */
  amount: number;
}

interface EntryLike {
  id: string;
  label: string;
  amount: number;
  date?: string;
  importKey?: string;
  sourceId?: string;
}

interface TxnLike extends EntryLike {
  bucketId: string;
}

interface MonthLike {
  income: EntryLike[];
  txns: TxnLike[];
}

/** Structural subset of AppState — only what merging reads or writes. */
export interface MergeableState {
  buckets: (CategorizableBucket & Record<string, unknown>)[];
  months: Record<string, MonthLike>;
  categoryRules: CategorizableRule[];
  lastModified: number;
  [k: string]: unknown;
}

export interface MergeResult {
  state: MergeableState;
  added: number;
  /** Already present — same source id, or same content as a file import. */
  skipped: number;
}

const UNCATEGORIZED = "Uncategorized";

/**
 * Add `incoming` to `state`, skipping anything already there.
 *
 * Two independent dedup keys, because each covers a case the other misses:
 *   • sourceId  — survives a pending→posted change of description or amount
 *   • importKey — the same content fingerprint a CSV/OFX upload writes, so a
 *     transaction imported by hand is not added again by the nightly sync
 *
 * Returns a NEW state; the input is not mutated.
 */
export function mergeBankTxns(
  state: MergeableState,
  incoming: IncomingTxn[],
  makeId: () => string,
  now: number = Date.now(),
): MergeResult {
  const seenKeys = new Set<string>();
  const seenSources = new Set<string>();
  for (const m of Object.values(state.months)) {
    for (const t of m.txns) {
      if (t.importKey) seenKeys.add(t.importKey);
      if (t.sourceId) seenSources.add(t.sourceId);
    }
    for (const i of m.income) {
      if (i.importKey) seenKeys.add(i.importKey);
      if (i.sourceId) seenSources.add(i.sourceId);
    }
  }

  const months: Record<string, MonthLike> = {};
  for (const [k, m] of Object.entries(state.months)) {
    months[k] = { income: [...m.income], txns: [...m.txns] };
  }
  let buckets = state.buckets;
  let added = 0;
  let skipped = 0;

  // Oldest first so same-day ordering stays stable across runs.
  const sorted = [...incoming].sort((a, b) => a.date.localeCompare(b.date));

  for (const t of sorted) {
    const key = fingerprint(t);
    if (seenSources.has(t.sourceId) || seenKeys.has(key)) {
      skipped++;
      continue;
    }
    seenSources.add(t.sourceId);
    seenKeys.add(key);

    const monthKey = t.date.slice(0, 7);
    const month = (months[monthKey] ??= { income: [], txns: [] });
    const label = t.description.trim() || "Transaction";
    // The app stores magnitudes; the sign only decides income vs expense.
    const amount = Math.abs(t.amount);
    const entry: EntryLike = {
      id: makeId(),
      label,
      amount,
      date: t.date,
      importKey: key,
      sourceId: t.sourceId,
    };

    const suggestion = suggestCategory(t, buckets, state.categoryRules);
    if (suggestion.kind === "income") {
      month.income.push(entry);
    } else {
      let bucketId = suggestion.bucketId;
      if (!bucketId) {
        // Never drop a transaction just because we couldn't classify it — park
        // it somewhere visible so it can be re-filed by hand.
        let fallback = buckets.find((b) => b.name === UNCATEGORIZED);
        if (!fallback) {
          fallback = { id: makeId(), name: UNCATEGORIZED, type: "expense", planned: 0, color: "#94a3b8" };
          buckets = [...buckets, fallback];
        }
        bucketId = fallback.id;
      }
      month.txns.push({ ...entry, bucketId });
    }
    added++;
  }

  if (added === 0) return { state, added: 0, skipped };
  return {
    state: { ...state, buckets, months, lastModified: now },
    added,
    skipped,
  };
}
