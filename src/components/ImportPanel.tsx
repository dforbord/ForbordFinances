import { useMemo, useRef, useState } from "react";
import { useStore, uid, ImportItem } from "../store";
import { fmt, parseDate, dateKey, todayKey, daysBetween, monthLabel } from "../format";
import { BucketType, CategoryRule, UploadRecord } from "../types";
import { deriveKeyword, fingerprint, parseStatement, suggestCategory, ParsedTxn } from "../import";

/** "Jun 3, 2026" for a YYYY-MM-DD key. */
function fmtDay(key: string): string {
  return parseDate(key).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const INCOME = "__income__";
const IGNORE = "__ignore__";

const BUCKET_GROUPS: { type: BucketType; label: string }[] = [
  { type: "expense", label: "Expenses" },
  { type: "tax", label: "Taxes" },
  { type: "savings", label: "Savings" },
];

interface Row {
  id: string;
  parsed: ParsedTxn;
  dup: boolean;
  choice: string; // bucketId | INCOME | IGNORE | ""
}

/** One calendar month found inside the uploaded statement, with its own tallies. */
interface MonthGroup {
  month: string; // YYYY-MM
  rows: Row[];
  dup: number;
  needCat: number;
  willImport: number;
  moneyIn: number;
  moneyOut: number;
}

export function ImportPanel({ setMonth }: { setMonth?: (m: string) => void }) {
  const { state, dispatch } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  // Months the user has collapsed in the review table (YYYY-MM keys).
  const [collapsed, setCollapsed] = useState<string[]>([]);
  // What the last import filed where, so a multi-month statement shows its split.
  const [result, setResult] = useState<{ months: { month: string; added: number }[] } | null>(null);
  // Required per upload: the statement period, confirmed on the calendar.
  const [coverFrom, setCoverFrom] = useState("");
  const [coverTo, setCoverTo] = useState("");

  const existingKeys = useMemo(() => {
    const s = new Set<string>();
    for (const m of Object.values(state.months)) {
      for (const t of m.txns) if (t.importKey) s.add(t.importKey);
      for (const i of m.income) if (i.importKey) s.add(i.importKey);
    }
    return s;
  }, [state.months]);

  function ingest(name: string, text: string) {
    setMsg(null);
    setResult(null);
    setCollapsed([]);
    const parsed = parseStatement(name, text);
    if (parsed.length === 0) {
      setFileName(name);
      setRows([]);
      setCoverFrom("");
      setCoverTo("");
      setMsg("Couldn't find any transactions in that file. Try a CSV or an OFX/QFX export.");
      return;
    }
    const built: Row[] = parsed.map((p) => {
      const dup = existingKeys.has(fingerprint(p));
      const s = suggestCategory(p, state.buckets, state.categoryRules);
      const choice = dup ? IGNORE : s.kind === "income" ? INCOME : (s.bucketId ?? "");
      return { id: uid(), parsed: p, dup, choice };
    });
    // Pre-fill the covered range from the transactions found; the user confirms
    // or widens it to the true statement period before importing.
    const dates = parsed.map((p) => p.date).sort();
    setCoverFrom(dates[0]);
    setCoverTo(dates[dates.length - 1]);
    setFileName(name);
    setRows(built);
  }

  function onFiles(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => ingest(f.name, String(reader.result));
    reader.readAsText(f);
  }

  function setChoice(id: string, choice: string) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, choice } : r)));
  }

  // A statement can span any number of months. Split the review by the month each
  // transaction's own date falls in — that's exactly how it gets filed on import.
  const monthGroups: MonthGroup[] = useMemo(() => {
    const byMonth = new Map<string, Row[]>();
    for (const r of rows) {
      const key = r.parsed.date.slice(0, 7);
      const bucket = byMonth.get(key);
      if (bucket) bucket.push(r);
      else byMonth.set(key, [r]);
    }
    return [...byMonth.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([month, rs]) => {
        const g: MonthGroup = { month, rows: rs, dup: 0, needCat: 0, willImport: 0, moneyIn: 0, moneyOut: 0 };
        for (const r of rs) {
          if (r.dup) g.dup++;
          else if (r.choice === "") g.needCat++;
          else if (r.choice !== IGNORE) {
            g.willImport++;
            if (r.parsed.amount > 0) g.moneyIn += r.parsed.amount;
            else g.moneyOut += Math.abs(r.parsed.amount);
          }
        }
        return g;
      });
  }, [rows]);

  function toggleMonth(month: string) {
    setCollapsed((c) => (c.includes(month) ? c.filter((m) => m !== month) : [...c, month]));
  }

  // Coverage summary from the upload log: what the last file covered, and what
  // date range the next upload still needs so nothing slips through the cracks.
  const coverage = useMemo(() => {
    const uploads = state.uploads;
    if (uploads.length === 0) return null;
    const lastUpload = uploads[uploads.length - 1];
    const coveredThrough = uploads.reduce(
      (max, u) => (u.coverageEnd > max ? u.coverageEnd : max),
      uploads[0].coverageEnd,
    );
    const dayAfter = parseDate(coveredThrough);
    dayAfter.setDate(dayAfter.getDate() + 1);
    const nextStart = dateKey(dayAfter);
    const today = todayKey();
    // Whole days still uncovered between the last statement and today.
    const gapDays = daysBetween(parseDate(nextStart), parseDate(today)) + 1;
    return { lastUpload, coveredThrough, nextStart, today, gapDays };
  }, [state.uploads]);

  const importable = rows.filter((r) => !r.dup && r.choice !== IGNORE && r.choice !== "");
  const needCat = rows.filter((r) => !r.dup && r.choice === "").length;

  function doImport() {
    const items: ImportItem[] = [];
    const rules: CategoryRule[] = [];
    // month key -> how many entries landed in it, for the split summary below.
    const perMonth = new Map<string, number>();
    for (const r of importable) {
      const p = r.parsed;
      const month = p.date.slice(0, 7);
      const key = fingerprint(p);
      const label = p.description;
      if (r.choice === INCOME) {
        items.push({ month, income: { id: uid(), label, amount: Math.abs(p.amount), date: p.date, importKey: key } });
      } else {
        items.push({
          month,
          txn: { id: uid(), bucketId: r.choice, label, amount: Math.abs(p.amount), date: p.date, importKey: key },
        });
        const kw = deriveKeyword(p.description);
        if (kw) rules.push({ keyword: kw, bucketId: r.choice });
      }
      perMonth.set(month, (perMonth.get(month) ?? 0) + 1);
    }
    const months = [...perMonth.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([month, added]) => ({ month, added }));
    // Record the statement period the user confirmed on the calendar — this is
    // what the coverage tracker uses to know which dates are already accounted
    // for and where the next upload should pick up.
    const start = coverFrom <= coverTo ? coverFrom : coverTo;
    const end = coverFrom <= coverTo ? coverTo : coverFrom;
    const upload: UploadRecord = {
      id: uid(),
      fileName: fileName ?? "statement",
      importedAt: Date.now(),
      added: items.length,
      total: rows.length,
      coverageStart: start,
      coverageEnd: end,
      months,
    };

    dispatch({ type: "IMPORT_BATCH", items, rules, upload });
    setRows([]);
    setFileName(null);
    setCoverFrom("");
    setCoverTo("");
    setCollapsed([]);
    setResult({ months });
    setMsg(null);
  }

  return (
    <div className="section">
      <div className="card">
        <h2>Import from bank</h2>
        <p className="subtle" style={{ marginTop: -4 }}>
          Drop a <strong>.csv</strong>, <strong>.ofx</strong>, or <strong>.qfx</strong> export from
          Chase, Wells Fargo, or Schwab. Spending is sorted into buckets, deposits become income.
          A statement covering several months is split into those months automatically.
        </p>

        {coverage && (
          <div
            style={{
              border: "1px solid var(--border)",
              borderLeft: "3px solid var(--accent)",
              borderRadius: "var(--radius)",
              background: "var(--surface-2)",
              padding: "11px 14px",
              margin: "0 0 14px",
              fontSize: 14,
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between" }}>
              <span>
                <strong>Last upload:</strong> {coverage.lastUpload.fileName}
              </span>
              <span className="subtle">
                uploaded{" "}
                {new Date(coverage.lastUpload.importedAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>
            <div className="subtle" style={{ marginTop: 3 }}>
              Covered {fmtDay(coverage.lastUpload.coverageStart)} → {fmtDay(coverage.lastUpload.coverageEnd)} ·{" "}
              {coverage.lastUpload.added} added
            </div>
            {(coverage.lastUpload.months?.length ?? 0) > 1 && (
              <div className="subtle" style={{ marginTop: 3 }}>
                Filed into{" "}
                {coverage.lastUpload.months!.map((m, i) => (
                  <span key={m.month}>
                    {i > 0 && " · "}
                    {monthLabel(m.month)} ({m.added})
                  </span>
                ))}
              </div>
            )}
            <div
              style={{
                marginTop: 9,
                paddingTop: 9,
                borderTop: "1px solid var(--border)",
              }}
            >
              {coverage.gapDays > 0 ? (
                <>
                  You have statements through <strong>{fmtDay(coverage.coveredThrough)}</strong>. Your next
                  upload should cover{" "}
                  <strong style={{ color: "var(--accent)" }}>
                    {fmtDay(coverage.nextStart)} → {fmtDay(coverage.today)}
                  </strong>{" "}
                  <span className="subtle">
                    ({coverage.gapDays} {coverage.gapDays === 1 ? "day" : "days"})
                  </span>
                  .
                </>
              ) : (
                <span style={{ color: "var(--green)" }}>
                  You're covered through today — nothing new to upload yet.
                </span>
              )}
            </div>
          </div>
        )}

        <div
          className={`import-drop ${dragOver ? "over" : ""}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            onFiles(e.dataTransfer.files);
          }}
        >
          ⬆ Drop a file here, or click to choose
          {fileName && <div className="subtle" style={{ marginTop: 6 }}>{fileName}</div>}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.ofx,.qfx,text/csv,application/x-ofx"
          style={{ display: "none" }}
          onChange={(e) => {
            onFiles(e.target.files);
            e.target.value = "";
          }}
        />

        {msg && <div className="help">{msg}</div>}

        {result && (
          <div className="import-result">
            <strong>
              Imported {result.months.reduce((s, m) => s + m.added, 0)}{" "}
              {result.months.reduce((s, m) => s + m.added, 0) === 1 ? "transaction" : "transactions"} into{" "}
              {result.months.length} {result.months.length === 1 ? "month" : "months"}.
            </strong>
            <ul className="import-result-months">
              {result.months.map((m) => (
                <li key={m.month}>
                  <span>
                    {monthLabel(m.month)} — {m.added} {m.added === 1 ? "entry" : "entries"}
                  </span>
                  {setMonth && (
                    <button className="ghost small" onClick={() => setMonth(m.month)}>
                      View
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {rows.length > 0 && (
          <>
            {monthGroups.length > 1 && (
              <div className="import-span">
                📆 This statement spans <strong>{monthGroups.length} months</strong> —{" "}
                {monthGroups.map((g) => monthLabel(g.month)).join(", ")}. Each transaction is filed into
                the month its own date falls in.
                <button
                  className="ghost small"
                  style={{ marginLeft: "auto" }}
                  onClick={() =>
                    setCollapsed((c) => (c.length === monthGroups.length ? [] : monthGroups.map((g) => g.month)))
                  }
                >
                  {collapsed.length === monthGroups.length ? "Expand all" : "Collapse all"}
                </button>
              </div>
            )}

            <table className="table" style={{ marginTop: 14 }}>
              <thead>
                <tr>
                  <th style={{ width: 70 }}>Date</th>
                  <th>Description</th>
                  <th className="num" style={{ width: 100 }}>Amount</th>
                  <th style={{ width: 190 }}>Bucket</th>
                </tr>
              </thead>
              {monthGroups.map((g) => {
                const isCollapsed = collapsed.includes(g.month);
                return (
                  <tbody key={g.month}>
                    <tr className="month-group">
                      <td colSpan={4}>
                        <button className="month-group-head" onClick={() => toggleMonth(g.month)}>
                          <span className="month-group-caret">{isCollapsed ? "▸" : "▾"}</span>
                          <strong>{monthLabel(g.month)}</strong>
                          <span className="subtle">
                            {g.rows.length} {g.rows.length === 1 ? "row" : "rows"} · {g.willImport} to import
                            {g.needCat > 0 && ` · ${g.needCat} need a bucket`}
                            {g.dup > 0 && ` · ${g.dup} duplicate${g.dup === 1 ? "" : "s"}`}
                          </span>
                          <span className="month-group-totals">
                            {g.moneyIn > 0 && <span style={{ color: "var(--green)" }}>+{fmt(g.moneyIn)}</span>}
                            {g.moneyOut > 0 && <span>−{fmt(g.moneyOut)}</span>}
                          </span>
                        </button>
                      </td>
                    </tr>
                    {!isCollapsed &&
                      g.rows.map((r) => {
                        const inc = r.parsed.amount > 0;
                        return (
                          <tr key={r.id} style={r.dup ? { opacity: 0.5 } : undefined}>
                            <td className="subtle">{r.parsed.date.slice(5)}</td>
                            <td style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 0 }}>
                              {r.parsed.description}
                            </td>
                            <td className="num" style={{ color: inc ? "var(--green)" : undefined }}>
                              {inc ? "+" : "-"}{fmt(Math.abs(r.parsed.amount))}
                            </td>
                            <td>
                              {r.dup ? (
                                <span className="subtle">Already imported</span>
                              ) : (
                                <select value={r.choice} onChange={(e) => setChoice(r.id, e.target.value)}>
                                  <option value="">— choose —</option>
                                  <option value={INCOME}>Income</option>
                                  {BUCKET_GROUPS.map((grp) => {
                                    const bs = state.buckets.filter((b) => b.type === grp.type);
                                    return bs.length ? (
                                      <optgroup key={grp.type} label={grp.label}>
                                        {bs.map((b) => (
                                          <option key={b.id} value={b.id}>
                                            {b.name}
                                          </option>
                                        ))}
                                      </optgroup>
                                    ) : null;
                                  })}
                                  <option value={IGNORE}>Ignore / transfer</option>
                                </select>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                );
              })}
            </table>

            <div
              style={{
                marginTop: 14,
                padding: "12px 14px",
                border: "1px solid var(--border)",
                borderLeft: "3px solid var(--accent)",
                borderRadius: "var(--radius)",
                background: "var(--surface-2)",
              }}
            >
              <label style={{ fontSize: 13, fontWeight: 600 }}>
                Dates covered by this statement <span style={{ color: "var(--red)" }}>*</span>
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
                <input
                  type="date"
                  value={coverFrom}
                  max={coverTo || undefined}
                  onChange={(e) => setCoverFrom(e.target.value)}
                  style={{ width: 160 }}
                />
                <span className="subtle">→</span>
                <input
                  type="date"
                  value={coverTo}
                  min={coverFrom || undefined}
                  onChange={(e) => setCoverTo(e.target.value)}
                  style={{ width: 160 }}
                />
              </div>
              <div className="help" style={{ marginTop: 6 }}>
                Pre-filled from the transactions found — widen it to the full statement period if the
                statement starts or ends on a day with no activity.
              </div>
            </div>

            <div className="toolbar" style={{ marginTop: 14, alignItems: "center" }}>
              <button
                className="primary"
                onClick={doImport}
                disabled={importable.length === 0 || !coverFrom || !coverTo}
              >
                Import {importable.length} {importable.length === 1 ? "transaction" : "transactions"}
                {monthGroups.length > 1 && ` into ${monthGroups.length} months`}
              </button>
              <span className="subtle" style={{ fontSize: 13 }}>
                {(!coverFrom || !coverTo) && "set the dates covered · "}
                {rows.filter((r) => r.dup).length > 0 && `${rows.filter((r) => r.dup).length} duplicate(s) skipped · `}
                {needCat > 0 && `${needCat} need a bucket · `}
                categories are remembered next time
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
