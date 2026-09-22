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
    // Card networks prefix the real merchant with the processor that handled
    // it ("TST* THE COFFEE HOUSE", "SQ *LOCAL BAKERY"). Drop it or every such
    // charge looks like a different merchant.
    .replace(/^(tst|sq|sp|py|pp|ch|in)\s*\*\s*/i, "")
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

// Each hint may only resolve to a bucket that genuinely means that category.
// Deliberately NOT cross-listed: if someone has no "Dining" bucket, a
// restaurant charge must fall through to Uncategorized rather than being
// dumped into Groceries. A wrong bucket silently corrupts the budget, while
// Uncategorized is visible and one correction fixes it for good.
const MERCHANT_HINTS: { match: string[]; bucket: string[] }[] = [
  { match: ["trader joe", "safeway", "kroger", "king soopers", "sprouts", "costco", "whole foods", "aldi", "publix", "grocer", "walmart", "wal mart", "instacart", "natural grocers"], bucket: ["grocer", "food"] },
  { match: ["restaurant", "cafe", "coffee", "starbucks", "chipotle", "mcdonald", "doordash", "grubhub", "ubereats", "uber eats", "taco", "pizza", "bakery", "brewing", "grill", "kitchen", "sushi", "panera", "subway", "wendy", "chick fil"], bucket: ["dining", "restaurant", "eating"] },
  // "gas" alone is too greedy — it matches "las vegas". Brands and "fuel" only.
  { match: ["shell", "chevron", "exxon", "arco", "conoco", "sinclair", "fuel", "gas station", "uber", "lyft", "parking", "dmv", "toll", "jiffy lube", "les schwab", "discount tire"], bucket: ["car", "transport", "gas", "auto"] },
  { match: ["xcel", "comcast", "xfinity", "century link", "centurylink", "verizon", "t mobile", "tmobile", "electric", "water", "utility", "internet", "sewer", "waste management"], bucket: ["utilit"] },
  { match: ["rent", "mortgage", "zillow", "apartment", "hoa", "property"], bucket: ["housing", "rent", "mortgage"] },
  { match: ["netflix", "spotify", "hulu", "disney", "hbo", "apple com", "prime video", "youtube", "patreon", "icloud", "audible"], bucket: ["subscription", "entertain", "streaming"] },
  { match: ["amazon", "amzn", "target", "ebay", "etsy", "best buy", "home depot", "lowes", "ikea", "chewy", "rei"], bucket: ["shopping", "household", "misc"] },
  { match: ["walgreens", "cvs", "pharmacy", "dentist", "medical", "clinic", "vision"], bucket: ["health", "medical", "pharmacy"] },
  { match: ["delta", "united airlines", "american air", "southwest air", "frontier air", "airbnb", "hotel", "expedia", "marriott", "hilton", "airline", "vrbo"], bucket: ["travel", "vacation"] },
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
