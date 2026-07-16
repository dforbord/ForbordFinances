import { useMemo, useRef, useState } from "react";
import { useStore, uid, ImportItem } from "../store";
import { fmt, parseDate, dateKey, todayKey, daysBetween } from "../format";
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

export function ImportPanel() {
  const { state, dispatch } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

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
    const parsed = parseStatement(name, text);
    if (parsed.length === 0) {
      setFileName(name);
      setRows([]);
      setMsg("Couldn't find any transactions in that file. Try a CSV or an OFX/QFX export.");
      return;
    }
    const built: Row[] = parsed.map((p) => {
      const dup = existingKeys.has(fingerprint(p));
      const s = suggestCategory(p, state.buckets, state.categoryRules);
      const choice = dup ? IGNORE : s.kind === "income" ? INCOME : (s.bucketId ?? "");
      return { id: uid(), parsed: p, dup, choice };
    });
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
    }
    // Record what this file covered — the full span of every row it held, not
    // just the new ones — so the next upload knows where to pick up from.
    const dates = rows.map((r) => r.parsed.date).sort();
    const upload: UploadRecord = {
      id: uid(),
      fileName: fileName ?? "statement",
      importedAt: Date.now(),
      added: items.length,
      total: rows.length,
      coverageStart: dates[0],
      coverageEnd: dates[dates.length - 1],
    };

    dispatch({ type: "IMPORT_BATCH", items, rules, upload });
    setRows([]);
    setFileName(null);
    setMsg(`Imported ${items.length} ${items.length === 1 ? "transaction" : "transactions"} into your buckets.`);
  }

  return (
    <div className="section">
      <div className="card">
        <h2>Import from bank</h2>
        <p className="subtle" style={{ marginTop: -4 }}>
          Drop a <strong>.csv</strong>, <strong>.ofx</strong>, or <strong>.qfx</strong> export from
          Chase, Wells Fargo, or Schwab. Spending is sorted into buckets, deposits become income.
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

        {rows.length > 0 && (
          <>
            <table className="table" style={{ marginTop: 14 }}>
              <thead>
                <tr>
                  <th style={{ width: 70 }}>Date</th>
                  <th>Description</th>
                  <th className="num" style={{ width: 100 }}>Amount</th>
                  <th style={{ width: 190 }}>Bucket</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
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
                            {BUCKET_GROUPS.map((g) => {
                              const bs = state.buckets.filter((b) => b.type === g.type);
                              return bs.length ? (
                                <optgroup key={g.type} label={g.label}>
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
            </table>

            <div className="toolbar" style={{ marginTop: 14, alignItems: "center" }}>
              <button className="primary" onClick={doImport} disabled={importable.length === 0}>
                Import {importable.length} {importable.length === 1 ? "transaction" : "transactions"}
              </button>
              <span className="subtle" style={{ fontSize: 13 }}>
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
