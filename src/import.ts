// File-statement parsing (CSV / OFX / QFX). The categorization half lives in
// shared/categorize.ts so the nightly SimpleFIN sync buckets transactions
// exactly the same way this does.
export {
  normalizeDesc,
  deriveKeyword,
  fingerprint,
  suggestCategory,
} from "../shared/categorize";
export type { ParsedTxn, Suggestion } from "../shared/categorize";

import type { ParsedTxn } from "../shared/categorize";

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
