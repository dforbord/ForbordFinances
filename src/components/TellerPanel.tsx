import { useMemo, useState } from "react";
import { useStore, uid, ImportItem } from "../store";
import { fmt } from "../format";
import { BucketType, CategoryRule, UploadRecord } from "../types";
import { deriveKeyword, fingerprint, suggestCategory } from "../import";
import {
  bucketFromTellerCategory,
  enrollmentFromConnect,
  fetchAccounts,
  fetchTransactions,
  isTellerConfigured,
  loadTeller,
  openTellerConnect,
  saveTeller,
  TellerConfig,
  TellerSyncTxn,
  upsertEnrollment,
} from "../teller";

const INCOME = "__income__";
const IGNORE = "__ignore__";

const BUCKET_GROUPS: { type: BucketType; label: string }[] = [
  { type: "expense", label: "Expenses" },
  { type: "tax", label: "Taxes" },
  { type: "savings", label: "Savings" },
];

interface Row {
  id: string;
  txn: TellerSyncTxn;
  dup: boolean;
  choice: string; // bucketId | INCOME | IGNORE | ""
}

export function TellerPanel() {
  const { state, dispatch } = useStore();
  const [cfg, setCfg] = useState<TellerConfig>(loadTeller);
  const [includePending, setIncludePending] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);

  const existingKeys = useMemo(() => {
    const s = new Set<string>();
    for (const m of Object.values(state.months)) {
      for (const t of m.txns) if (t.importKey) s.add(t.importKey);
      for (const i of m.income) if (i.importKey) s.add(i.importKey);
    }
    return s;
  }, [state.months]);

  // Not set up yet → a one-liner so the feature is discoverable, nothing more.
  // All operator config lives in src/teller-config.ts (see SETUP-TELLER.md).
  if (!isTellerConfigured()) {
    return (
      <div className="section">
        <div className="card">
          <h2 style={{ margin: 0 }}>🏦 Auto-sync from your bank</h2>
          <p className="subtle" style={{ marginTop: 4, marginBottom: 0 }}>
            Optional one-time setup lets you link a bank and pull transactions automatically. Add your
            Teller Application ID in <strong>src/teller-config.ts</strong> (see SETUP-TELLER.md). Until then,
            use <strong>Import from bank</strong> below.
          </p>
        </div>
      </div>
    );
  }

  function persist(next: TellerConfig) {
    setCfg(next);
    saveTeller(next);
  }

  // ── Connect a new bank ──────────────────────────────────────────────────
  async function connect() {
    setErr(null);
    setMsg(null);
    try {
      const success = await openTellerConnect(cfg);
      if (!success) return; // user closed the dialog
      let enrollment = enrollmentFromConnect(success);
      let next = upsertEnrollment(cfg, enrollment);
      persist(next);
      // Best-effort: enumerate accounts now so we can show them. If the proxy /
      // certificate isn't ready yet this fails quietly — "Sync now" retries it.
      try {
        const accounts = await fetchAccounts(next, enrollment.accessToken);
        enrollment = { ...enrollment, accounts };
        next = upsertEnrollment(next, enrollment);
        persist(next);
      } catch {
        /* accounts will be filled in on first sync */
      }
      setMsg(`Connected ${enrollment.institution}. Click “Sync now” to pull transactions.`);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  function removeEnrollment(enrollmentId: string, token: string) {
    persist({
      ...cfg,
      enrollments: cfg.enrollments.filter(
        (x) => !(x.enrollmentId === enrollmentId && x.accessToken === token),
      ),
    });
  }

  // ── Sync: pull transactions from every connected account ────────────────
  async function syncNow() {
    setErr(null);
    setMsg(null);
    if (cfg.enrollments.length === 0) {
      setErr("Connect a bank first.");
      return;
    }
    setBusy("Syncing…");
    try {
      const collected: TellerSyncTxn[] = [];
      let working = cfg;
      for (const enr of cfg.enrollments) {
        // Refresh accounts each sync (also back-fills any that failed at connect).
        let accounts = enr.accounts;
        try {
          accounts = await fetchAccounts(working, enr.accessToken);
        } catch {
          /* fall back to whatever we already had */
        }
        const updated = { ...enr, accounts, lastSync: Date.now() };
        working = upsertEnrollment(working, updated);
        for (const acct of accounts) {
          const txns = await fetchTransactions(working, enr.accessToken, acct.id);
          collected.push(...txns);
        }
      }
      persist(working);

      const filtered = includePending ? collected : collected.filter((t) => !t.pending);
      // De-dup within this batch by Teller id (pending→posted can list twice).
      const seen = new Set<string>();
      const unique = filtered.filter((t) => (seen.has(t.tellerId) ? false : (seen.add(t.tellerId), true)));

      const built: Row[] = unique.map((t) => {
        const dup = existingKeys.has(t.tellerId) || existingKeys.has(fingerprint(t));
        const s = suggestCategory(t, state.buckets, state.categoryRules);
        const bucketId = s.bucketId ?? bucketFromTellerCategory(t.category, state.buckets);
        const choice = dup ? IGNORE : s.kind === "income" ? INCOME : (bucketId ?? "");
        return { id: uid(), txn: t, dup, choice };
      });
      built.sort((a, b) => b.txn.date.localeCompare(a.txn.date));
      setRows(built);

      const fresh = built.filter((r) => !r.dup).length;
      setMsg(
        fresh === 0
          ? "You're already up to date — no new transactions."
          : `Found ${fresh} new transaction${fresh === 1 ? "" : "s"}. Review the buckets below, then import.`,
      );
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function setChoice(id: string, choice: string) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, choice } : r)));
  }

  const importable = rows.filter((r) => !r.dup && r.choice !== IGNORE && r.choice !== "");
  const needCat = rows.filter((r) => !r.dup && r.choice === "").length;
  const dupCount = rows.filter((r) => r.dup).length;

  function doImport() {
    const items: ImportItem[] = [];
    const rules: CategoryRule[] = [];
    for (const r of importable) {
      const t = r.txn;
      const month = t.date.slice(0, 7);
      const label = t.description;
      if (r.choice === INCOME) {
        items.push({
          month,
          income: { id: uid(), label, amount: Math.abs(t.amount), date: t.date, importKey: t.tellerId },
        });
      } else {
        items.push({
          month,
          txn: {
            id: uid(),
            bucketId: r.choice,
            label,
            amount: Math.abs(t.amount),
            date: t.date,
            importKey: t.tellerId,
          },
        });
        const kw = deriveKeyword(t.description);
        if (kw) rules.push({ keyword: kw, bucketId: r.choice });
      }
    }

    const dates = importable.map((r) => r.txn.date).sort();
    const upload: UploadRecord = {
      id: uid(),
      fileName: `Teller · synced ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
      importedAt: Date.now(),
      added: items.length,
      total: rows.length,
      coverageStart: dates[0] ?? new Date().toISOString().slice(0, 10),
      coverageEnd: dates[dates.length - 1] ?? new Date().toISOString().slice(0, 10),
    };

    dispatch({ type: "IMPORT_BATCH", items, rules, upload });
    setRows([]);
    setMsg(`Imported ${items.length} transaction${items.length === 1 ? "" : "s"} into your buckets.`);
  }

  return (
    <div className="section">
      <div className="card">
        <h2 style={{ margin: 0 }}>🏦 Auto-sync from your bank</h2>
        <p className="subtle" style={{ marginTop: 4 }}>
          Link a bank once, then pull transactions with a click — they run through the same bucketing and
          duplicate-skipping as file import. Your access token stays in this browser only.
        </p>

        {/* Connected banks */}
        {cfg.enrollments.length > 0 && (
          <div style={{ display: "grid", gap: 8, margin: "4px 0 14px" }}>
            {cfg.enrollments.map((enr) => (
              <div
                key={enr.enrollmentId || enr.accessToken}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  padding: "10px 12px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <strong>{enr.institution}</strong>
                  <div className="subtle" style={{ fontSize: 13, marginTop: 2 }}>
                    {enr.accounts.length > 0
                      ? enr.accounts
                          .map((a) => `${a.name}${a.lastFour ? ` ••${a.lastFour}` : ""}`)
                          .join(" · ")
                      : "No accounts loaded yet — Sync to fetch them."}
                    {enr.lastSync
                      ? ` · last sync ${new Date(enr.lastSync).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                      : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="ghost small" onClick={connect} title="Re-authorize this bank">
                    Reconnect
                  </button>
                  <button
                    className="ghost small"
                    onClick={() => removeEnrollment(enr.enrollmentId, enr.accessToken)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="toolbar" style={{ alignItems: "center", gap: 10 }}>
          <button className="primary" onClick={connect} disabled={!!busy}>
            + Connect a bank
          </button>
          <button onClick={syncNow} disabled={!!busy || cfg.enrollments.length === 0}>
            {busy ?? "Sync now"}
          </button>
          <label className="subtle" style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={includePending}
              onChange={(e) => setIncludePending(e.target.checked)}
            />
            include pending
          </label>
        </div>

        {msg && <div className="help" style={{ marginTop: 10 }}>{msg}</div>}
        {err && (
          <div className="help" style={{ marginTop: 10, color: "var(--red)" }}>
            {err}
          </div>
        )}

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
                  const inc = r.txn.amount > 0;
                  return (
                    <tr key={r.id} style={r.dup ? { opacity: 0.5 } : undefined}>
                      <td className="subtle">{r.txn.date.slice(5)}</td>
                      <td style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 0 }}>
                        {r.txn.description}
                        {r.txn.pending && <span className="subtle"> · pending</span>}
                      </td>
                      <td className="num" style={{ color: inc ? "var(--green)" : undefined }}>
                        {inc ? "+" : "-"}
                        {fmt(Math.abs(r.txn.amount))}
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
                {dupCount > 0 && `${dupCount} already imported · `}
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
