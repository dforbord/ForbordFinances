// ─────────────────────────────────────────────────────────────────────────
//  Shared transaction categorization.
//
//  Imported by BOTH the browser app (src/import.ts, for file uploads) and the
//  nightly Cloud Function (functions/, for SimpleFIN sync) so a transaction
//  lands in the same bucket no matter which way it arrived. Keep this file
//  free of browser and node APIs.
// ─────────────────────────────────────────────────────────────────────────

/** A bank transaction, however it reached us. Negative amount = money out. */
export interface ParsedTxn {
  /** YYYY-MM-DD */
  date: string;
  description: string;
  /** Signed: negative = money out, positive = money in. */
  amount: number;
}

/** Structural subset of AppState's Bucket — anything with an id and a name. */
export interface CategorizableBucket {
  id: string;
  name: string;
}

/** Structural subset of AppState's CategoryRule. */
export interface CategorizableRule {
  keyword: string;
  bucketId: string;
}

export function normalizeDesc(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A short, stable keyword for a merchant (first ~2 words), used to learn rules. */
export function deriveKeyword(desc: string): string {
  const words = normalizeDesc(desc)
    .split(" ")
    .filter((w) => w.length > 1 && !/^\d+$/.test(w));
  return words.slice(0, 2).join(" ") || normalizeDesc(desc).slice(0, 12);
}

/**
 * Content fingerprint used to spot the same transaction arriving twice from
 * different sources (a CSV upload and a SimpleFIN sync of the same week).
 */
export function fingerprint(t: ParsedTxn): string {
  return `${t.date}|${t.amount.toFixed(2)}|${normalizeDesc(t.description).slice(0, 32)}`;
}

const MERCHANT_HINTS: { match: string[]; bucket: string[] }[] = [
  { match: ["trader joe", "safeway", "kroger", "costco", "whole foods", "aldi", "publix", "grocer", "walmart", "wal mart", "instacart"], bucket: ["food", "grocer"] },
  { match: ["restaurant", "cafe", "coffee", "starbucks", "chipotle", "mcdonald", "doordash", "grubhub", "ubereats", "uber eats", "taco", "pizza"], bucket: ["dining", "food", "restaurant"] },
  { match: ["shell", "chevron", "exxon", "arco", "conoco", "gas", "uber", "lyft", "parking", "dmv", "auto", "toll"], bucket: ["car", "transport", "gas", "auto"] },
  { match: ["xcel", "comcast", "xfinity", "at t", "att", "verizon", "t mobile", "tmobile", "electric", "water", "utility", "internet", "sewer"], bucket: ["utilit"] },
  { match: ["rent", "mortgage", "zillow", "apartment", "hoa", "property"], bucket: ["housing", "rent", "mortgage"] },
  { match: ["netflix", "spotify", "hulu", "disney", "hbo", "apple com", "prime video"], bucket: ["subscription", "entertain", "misc"] },
  { match: ["amazon", "amzn", "target", "ebay", "etsy", "best buy"], bucket: ["misc", "shopping"] },
  { match: ["delta", "united", "american air", "airbnb", "hotel", "expedia", "marriott", "hilton", "airline"], bucket: ["travel"] },
];

export interface Suggestion {
  kind: "income" | "expense";
  bucketId?: string;
}

export function suggestCategory(
  t: ParsedTxn,
  buckets: CategorizableBucket[],
  rules: CategorizableRule[],
): Suggestion {
  if (t.amount > 0) return { kind: "income" };
  const norm = normalizeDesc(t.description);

  // Learned rules win.
  for (const r of rules) {
    if (r.keyword && norm.includes(r.keyword) && buckets.some((b) => b.id === r.bucketId)) {
      return { kind: "expense", bucketId: r.bucketId };
    }
  }

  // Built-in merchant hints → the user's closest-named bucket.
  for (const h of MERCHANT_HINTS) {
    if (h.match.some((m) => norm.includes(m))) {
      const b = buckets.find((x) => h.bucket.some((name) => x.name.toLowerCase().includes(name)));
      if (b) return { kind: "expense", bucketId: b.id };
    }
  }

  return { kind: "expense" };
}
