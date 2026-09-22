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
  /** Merchant Category Code, when the source provides one. */
  mcc?: string;
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

/** Colors for buckets created automatically, so they don't all look alike. */
const CATEGORY_COLORS: Record<string, string> = {
  Groceries: "#10b981",
  "Dining Out": "#f59e0b",
  Transportation: "#3b82f6",
  Utilities: "#8b5cf6",
  Housing: "#6366f1",
  Shopping: "#ec4899",
  Subscriptions: "#14b8a6",
  Travel: "#0ea5e9",
  Health: "#ef4444",
  Entertainment: "#a855f7",
};

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
  const seenSources = new Set<string>();
  // Fingerprints of entries that arrived WITHOUT a source id — typed by hand or
  // loaded from a CSV/OFX file. Only these may be matched by content, and each
  // may absorb at most one incoming transaction (see the loop below).
  const manualKeys = new Map<string, number>();
  const noteManual = (e: { importKey?: string; sourceId?: string }) => {
    if (e.importKey && !e.sourceId) manualKeys.set(e.importKey, (manualKeys.get(e.importKey) ?? 0) + 1);
  };
  for (const m of Object.values(state.months)) {
    for (const t of m.txns) {
      if (t.sourceId) seenSources.add(t.sourceId);
      noteManual(t);
    }
    for (const i of m.income) {
      if (i.sourceId) seenSources.add(i.sourceId);
      noteManual(i);
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

    // A source id we've already stored is the same transaction, full stop.
    if (seenSources.has(t.sourceId)) {
      skipped++;
      continue;
    }
    // Otherwise this is a transaction the bank considers distinct, so it may
    // only be rejected for matching something entered by hand or from a file.
    // Each such entry absorbs ONE incoming transaction and is then used up:
    // three $50 DraftKings charges on the same day are three real charges, not
    // one repeated three times, and collapsing them loses real spending.
    const manual = manualKeys.get(key);
    if (manual) {
      if (manual === 1) manualKeys.delete(key);
      else manualKeys.set(key, manual - 1);
      skipped++;
      continue;
    }
    seenSources.add(t.sourceId);

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
        // When we DO know the category but the household has no bucket for it
        // yet, create that bucket rather than burying the charge in a junk
        // drawer — "Dining Out" is useful, a pile of Uncategorized is not.
        // Only genuinely unknown merchants land in Uncategorized.
        const name = suggestion.category ?? UNCATEGORIZED;
        let target = buckets.find((b) => b.name === name);
        if (!target) {
          target = {
            id: makeId(),
            name,
            type: "expense",
            planned: 0,
            color: CATEGORY_COLORS[name] ?? "#94a3b8",
          };
          buckets = [...buckets, target];
        }
        bucketId = target.id;
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
