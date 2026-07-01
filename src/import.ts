import { Bucket, CategoryRule } from "./types";

export interface ParsedTxn {
  date: string; // YYYY-MM-DD
  description: string;
  amount: number; // signed: negative = money out, positive = money in
}

// ── Text helpers ────────────────────────────────────────────────────────────

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

export function fingerprint(t: ParsedTxn): string {
  return `${t.date}|${t.amount.toFixed(2)}|${normalizeDesc(t.description).slice(0, 32)}`;
}

function parseAmount(raw: string): number {
  if (!raw) return NaN;
  let s = raw.trim().replace(/[$,\s]/g, "");
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  const n = parseFloat(s);
  if (isNaN(n)) return NaN;
  return neg ? -Math.abs(n) : n;
}

function normalizeDate(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(s);
  if (m) {
    let [, mm, dd, yy] = m;
    if (yy.length === 2) yy = (Number(yy) > 70 ? "19" : "20") + yy;
    return `${yy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
  }
  return null;
}

// ── OFX / QFX ────────────────────────────────────────────────────────────────

function parseOFX(text: string): ParsedTxn[] {
  const out: ParsedTxn[] = [];
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  for (const raw of blocks) {
    const chunk = raw.split(/<\/STMTTRN>/i)[0];
    const amt = /<TRNAMT>\s*(-?[\d.,]+)/i.exec(chunk);
    const dt = /<DTPOSTED>\s*(\d{8})/i.exec(chunk);
    if (!amt || !dt) continue;
    const name = /<NAME>\s*([^\r\n<]+)/i.exec(chunk);
    const memo = /<MEMO>\s*([^\r\n<]+)/i.exec(chunk);
    const amount = parseFloat(amt[1].replace(/,/g, ""));
    if (isNaN(amount)) continue;
    out.push({
      date: `${dt[1].slice(0, 4)}-${dt[1].slice(4, 6)}-${dt[1].slice(6, 8)}`,
      description: (name?.[1] || memo?.[1] || "Transaction").trim(),
      amount,
    });
  }
  return out;
}

// ── CSV ──────────────────────────────────────────────────────────────────────

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      fields.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  fields.push(cur);
  return fields.map((f) => f.trim());
}

function parseCSV(text: string): ParsedTxn[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const rows = lines.map(parseCsvLine);

  const first = rows[0].map((h) => h.toLowerCase());
  const looksLikeHeader = first.some((h) => /date|description|amount|withdrawal|deposit|debit|credit|payee/.test(h));

  const out: ParsedTxn[] = [];

  if (looksLikeHeader) {
    const col = (...names: string[]) =>
      first.findIndex((h) => names.some((n) => h.includes(n)));
    const iDate = col("transaction date", "posting date", "post date", "date");
    const iDesc = col("description", "payee", "name", "memo");
    const iAmount = col("amount");
    const iDebit = col("withdrawal", "debit");
    const iCredit = col("deposit", "credit");

    for (const r of rows.slice(1)) {
      const date = normalizeDate(r[iDate] ?? "");
      if (!date) continue;
      let amount = NaN;
      if (iAmount >= 0) amount = parseAmount(r[iAmount] ?? "");
      else if (iCredit >= 0 || iDebit >= 0) {
        const credit = iCredit >= 0 ? Math.abs(parseAmount(r[iCredit] ?? "") || 0) : 0;
        const debit = iDebit >= 0 ? Math.abs(parseAmount(r[iDebit] ?? "") || 0) : 0;
        amount = credit - debit;
      }
      if (isNaN(amount) || amount === 0) continue;
      out.push({ date, description: (r[iDesc] ?? "Transaction").trim() || "Transaction", amount });
    }
  } else {
    // Headerless (e.g. Wells Fargo): date, amount, *, *, description
    for (const r of rows) {
      const date = normalizeDate(r[0] ?? "");
      const amount = parseAmount(r[1] ?? "");
      if (!date || isNaN(amount)) continue;
      const desc = (r[4] ?? r[r.length - 1] ?? "Transaction").trim();
      out.push({ date, description: desc || "Transaction", amount });
    }
  }
  return out;
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function parseStatement(fileName: string, text: string): ParsedTxn[] {
  const isOfx = /\.(ofx|qfx)$/i.test(fileName) || /<OFX>|<STMTTRN>/i.test(text);
  const txns = isOfx ? parseOFX(text) : parseCSV(text);
  // Newest first.
  return txns.sort((a, b) => b.date.localeCompare(a.date));
}

// ── Categorization ─────────────────────────────────────────────────────────────

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
  buckets: Bucket[],
  rules: CategoryRule[],
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
