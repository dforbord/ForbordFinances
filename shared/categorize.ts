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
  /**
   * Merchant Category Code from the card network, when the source supplies one
   * (SimpleFIN does; a CSV export does not). Far more reliable than matching
   * the merchant's name, and it covers merchants no hand-written list knows.
   */
  mcc?: string;
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
// Canonical spending categories, and the bucket names that count as each one.
// A household that calls it "Eating Out" or "Restaurants" still matches.
export const CATEGORY_BUCKET_KEYWORDS: Record<string, string[]> = {
  Groceries: ["grocer", "food"],
  "Dining Out": ["dining", "restaurant", "eating"],
  Transportation: ["car", "transport", "gas", "auto", "fuel"],
  Utilities: ["utilit"],
  Housing: ["housing", "rent", "mortgage"],
  Shopping: ["shopping", "household", "misc"],
  Subscriptions: ["subscription", "streaming"],
  Travel: ["travel", "vacation"],
  Health: ["health", "medical", "pharmacy", "dental"],
  Entertainment: ["entertain", "fun", "hobby"],
};

/**
 * Merchant Category Code → category.
 *
 * These are assigned by the card networks, so they identify a corner cafe just
 * as well as a national chain. Codes we don't map (banks, transfers) return
 * undefined deliberately rather than guessing.
 */
function mccCategory(mcc?: string): string | undefined {
  const n = mcc ? parseInt(mcc, 10) : NaN;
  if (!isFinite(n)) return undefined;
  if (n >= 3000 && n <= 3299) return "Travel"; // airlines
  if (n >= 3300 && n <= 3499) return "Transportation"; // car rental
  if (n >= 3500 && n <= 3999) return "Travel"; // hotels
  switch (n) {
    case 5411: case 5422: case 5441: case 5451: case 5462: case 5499:
      return "Groceries";
    case 5812: case 5813: case 5814:
      return "Dining Out";
    case 5541: case 5542: case 5983: case 7523: case 7538: case 7542:
    case 4111: case 4121: case 4131: case 4784: case 4789:
      return "Transportation";
    case 4814: case 4816: case 4899: case 4900:
      return "Utilities";
    case 5912: case 8011: case 8021: case 8031: case 8041: case 8042:
    case 8043: case 8049: case 8062: case 8071: case 8099:
      return "Health";
    case 4411: case 4511: case 4722: case 7011:
      return "Travel";
    case 5200: case 5211: case 5231: case 5251: case 5261: case 5310:
    case 5311: case 5331: case 5399: case 5651: case 5661: case 5691:
    case 5732: case 5734: case 5735: case 5941: case 5942: case 5943:
    case 5945: case 5947: case 5977: case 5999:
      return "Shopping";
    case 5815: case 5816: case 5817: case 5818:
      return "Subscriptions";
    case 7832: case 7841: case 7922: case 7929: case 7991: case 7994:
    case 7995: case 7996: case 7998: case 7999:
      return "Entertainment"; // includes 7995 betting / gambling
    case 6513:
      return "Housing";
    default:
      return undefined; // banks, transfers, anything unmapped — don't guess
  }
}

// Fallback for sources with no MCC (CSV/OFX imports) and for merchants whose
// code is missing. Names only — the category decides the bucket.
const MERCHANT_HINTS: { match: string[]; category: string }[] = [
  { match: ["trader joe", "safeway", "kroger", "king soopers", "sprouts", "costco", "whole foods", "aldi", "publix", "grocer", "walmart", "wal mart", "instacart", "natural grocers"], category: "Groceries" },
  { match: ["restaurant", "cafe", "coffee", "starbucks", "chipotle", "mcdonald", "doordash", "grubhub", "ubereats", "uber eats", "taco", "pizza", "bakery", "brewing", "grill", "kitchen", "sushi", "panera", "subway", "wendy", "chick fil"], category: "Dining Out" },
  { match: ["shell", "chevron", "exxon", "arco", "conoco", "sinclair", "fuel", "gas station", "uber", "lyft", "parking", "dmv", "toll", "jiffy lube", "les schwab", "discount tire"], category: "Transportation" },
  { match: ["xcel", "comcast", "xfinity", "century link", "centurylink", "verizon", "t mobile", "tmobile", "electric", "water", "utility", "internet", "sewer", "waste management"], category: "Utilities" },
  { match: ["rent", "mortgage", "zillow", "apartment", "hoa", "property"], category: "Housing" },
  { match: ["netflix", "spotify", "hulu", "disney", "hbo", "apple com", "prime video", "youtube", "patreon", "icloud", "audible"], category: "Subscriptions" },
  { match: ["amazon", "amzn", "target", "ebay", "etsy", "best buy", "home depot", "lowes", "ikea", "chewy", "rei"], category: "Shopping" },
  { match: ["walgreens", "cvs", "pharmacy", "dentist", "medical", "clinic", "vision"], category: "Health" },
  { match: ["delta", "united airlines", "american air", "southwest air", "frontier air", "airbnb", "hotel", "expedia", "marriott", "hilton", "airline", "vrbo"], category: "Travel" },
  { match: ["draftkings", "fanduel", "casino", "bet365", "steam games", "playstation", "xbox", "nintendo", "ticketmaster", "stubhub", "amc ", "cinemark"], category: "Entertainment" },
];

function hintCategory(norm: string): string | undefined {
  for (const h of MERCHANT_HINTS) {
    if (h.match.some((m) => norm.includes(m))) return h.category;
  }
  return undefined;
}

/**
 * Does `keyword` name this bucket?
 *
 * Matched per WORD, never as a bare substring. A plain `includes` let "fun"
 * match "Emergency **Fun**d" — filing gambling as savings — and would let
 * "car" match "Health**car**e" or "Child**car**e". Short words must match
 * exactly; four characters and up may also match a word's prefix, so "utilit"
 * still finds "Utilities" and "transport" finds "Transportation".
 */
function keywordNamesBucket(keyword: string, bucketName: string): boolean {
  const words = bucketName.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return words.some((w) => w === keyword || (keyword.length >= 4 && w.startsWith(keyword)));
}

/** An existing bucket that means `category`, if the household has one. */
export function findBucketForCategory<T extends CategorizableBucket>(
  category: string,
  buckets: T[],
): T | undefined {
  const keywords = CATEGORY_BUCKET_KEYWORDS[category] ?? [];
  const wanted = category.toLowerCase();
  return buckets.find(
    (b) =>
      b.name.toLowerCase() === wanted ||
      keywords.some((k) => keywordNamesBucket(k, b.name)),
  );
}

export interface Suggestion {
  kind: "income" | "expense";
  bucketId?: string;
  /**
   * The category we're confident about even when no bucket matches it yet.
   * The caller may create that bucket rather than dumping it in Uncategorized.
   */
  category?: string;
}

export function suggestCategory(
  t: ParsedTxn,
  buckets: CategorizableBucket[],
  rules: CategorizableRule[],
): Suggestion {
  if (t.amount > 0) return { kind: "income" };
  const norm = normalizeDesc(t.description);

  // What the household explicitly taught us always wins.
  for (const r of rules) {
    if (r.keyword && norm.includes(r.keyword) && buckets.some((b) => b.id === r.bucketId)) {
      return { kind: "expense", bucketId: r.bucketId };
    }
  }

  // Then the card network's own classification, then the merchant's name.
  const category = mccCategory(t.mcc) ?? hintCategory(norm);
  if (!category) return { kind: "expense" };

  const bucket = findBucketForCategory(category, buckets);
  return bucket
    ? { kind: "expense", bucketId: bucket.id, category }
    : { kind: "expense", category };
}
