import { useMemo, useState } from "react";
import { useStore, uid } from "../store";
import { fmt } from "../format";
import { WalletAccount, WalletAccountType } from "../types";

const TYPE_META: Record<
  WalletAccountType,
  { label: string; plural: string; color: string }
> = {
  checking: { label: "Checking", plural: "Checking", color: "green" },
  savings: { label: "Savings", plural: "Savings", color: "blue" },
  taxes: { label: "Taxes", plural: "Tax Reserves", color: "amber" },
  credit: { label: "Credit Card", plural: "Credit Cards", color: "red" },
};

const TYPE_ORDER: WalletAccountType[] = ["checking", "savings", "taxes", "credit"];

export function Wallet() {
  const { state, dispatch } = useStore();
  const accounts = state.walletAccounts;

  const [name, setName] = useState("");
  const [type, setType] = useState<WalletAccountType>("checking");
  const [owner, setOwner] = useState("");
  const [balance, setBalance] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  // Headline totals: assets vs. credit-card debt, plus the savings+taxes pool.
  const totals = useMemo(() => {
    const byType: Record<WalletAccountType, number> = {
      checking: 0,
      savings: 0,
      taxes: 0,
      credit: 0,
    };
    for (const a of accounts) byType[a.type] += a.balance;
    const assets = byType.checking + byType.savings + byType.taxes;
    const debt = byType.credit;
    return {
      byType,
      assets,
      debt,
      savingsPlusTaxes: byType.savings + byType.taxes,
      net: assets - debt,
    };
  }, [accounts]);

  // Net position per person (his / hers / joint) — assets minus their card debt.
  const byOwner = useMemo(() => {
    const map = new Map<string, { assets: number; debt: number }>();
    for (const a of accounts) {
      const key = a.owner.trim() || "Unassigned";
      const cur = map.get(key) ?? { assets: 0, debt: 0 };
      if (a.type === "credit") cur.debt += a.balance;
      else cur.assets += a.balance;
      map.set(key, cur);
    }
    return [...map.entries()]
      .map(([o, v]) => ({ owner: o, ...v, net: v.assets - v.debt }))
      .sort((a, b) => b.net - a.net);
  }, [accounts]);

  // Existing owner names, for the add-form autocomplete.
  const owners = useMemo(
    () => [...new Set(accounts.map((a) => a.owner.trim()).filter(Boolean))],
    [accounts],
  );

  function add() {
    const bal = parseFloat(balance);
    if (!name.trim() || Number.isNaN(bal)) return;
    dispatch({
      type: "ADD_WALLET_ACCOUNT",
      account: { id: uid(), name: name.trim(), type, owner: owner.trim(), balance: bal },
    });
    setName("");
    setBalance("");
    // Keep type + owner so adding several of the same kind stays quick.
  }

  const netClass = totals.net >= 0 ? "green" : "red";

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Wallet</h1>
          <div className="subtle">
            Current balances across every account and card — yours and your spouse&rsquo;s
          </div>
        </div>
      </div>

      <div className="cards">
        <div className="card stat">
          <div className="label">Savings + Taxes</div>
          <div className="value blue">{fmt(totals.savingsPlusTaxes)}</div>
        </div>
        <div className="card stat">
          <div className="label">Checking</div>
          <div className="value green">{fmt(totals.byType.checking)}</div>
        </div>
        <div className="card stat">
          <div className="label">Credit Cards</div>
          <div className="value red">{fmt(totals.debt)}</div>
        </div>
        <div className="card stat">
          <div className="label">Net Worth</div>
          <div className={`value ${netClass}`}>{fmt(totals.net)}</div>
        </div>
      </div>

      <div className="section">
        <div className="card">
          <div className="row-form">
            <div className="field grow">
              <label>Account / card name</label>
              <input
                placeholder="e.g. Chase Checking, Amex Gold"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && add()}
              />
            </div>
            <div className="field type">
              <label>Type</label>
              <select value={type} onChange={(e) => setType(e.target.value as WalletAccountType)}>
                {TYPE_ORDER.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_META[t].label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field type">
              <label>Owner</label>
              <input
                list="wallet-owners"
                placeholder="e.g. Dylan"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && add()}
              />
              <datalist id="wallet-owners">
                {owners.map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
            </div>
            <div className="field amt">
              <label>Balance</label>
              <input
                type="number"
                placeholder="0.00"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && add()}
              />
            </div>
            <button className="primary" onClick={add}>
              Add
            </button>
          </div>
          <div className="help">
            For credit cards, enter the current balance <strong>owed</strong> — it&rsquo;s
            subtracted from your net worth.
          </div>
        </div>
      </div>

      {accounts.length === 0 ? (
        <div className="section">
          <div className="card">
            <div className="empty">
              No accounts yet. Add your checking, savings, tax reserve, and credit cards above to
              see everything add up.
            </div>
          </div>
        </div>
      ) : (
        <>
          {TYPE_ORDER.map((t) => {
            const rows = accounts.filter((a) => a.type === t);
            if (rows.length === 0) return null;
            const subtotal = rows.reduce((s, a) => s + a.balance, 0);
            const meta = TYPE_META[t];
            return (
              <div className="section" key={t}>
                <div className="card">
                  <div className="page-head" style={{ marginBottom: 12 }}>
                    <h2 style={{ margin: 0 }}>{meta.plural}</h2>
                    <div className={`value ${meta.color}`} style={{ fontSize: 20, fontWeight: 700 }}>
                      {fmt(subtotal)}
                    </div>
                  </div>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Account</th>
                        <th>Owner</th>
                        <th className="num">{t === "credit" ? "Owed" : "Balance"}</th>
                        <th className="actions"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((a) =>
                        editingId === a.id ? (
                          <EditRow
                            key={a.id}
                            account={a}
                            onSave={(updated) => {
                              dispatch({ type: "UPDATE_WALLET_ACCOUNT", account: updated });
                              setEditingId(null);
                            }}
                            onCancel={() => setEditingId(null)}
                          />
                        ) : (
                          <tr key={a.id}>
                            <td>{a.name}</td>
                            <td>{a.owner.trim() || <span className="subtle">—</span>}</td>
                            <td className="num">{fmt(a.balance)}</td>
                            <td className="actions">
                              <button className="small" onClick={() => setEditingId(a.id)}>
                                Edit
                              </button>{" "}
                              <button
                                className="danger small"
                                onClick={() => {
                                  if (confirm(`Delete “${a.name}”?`)) {
                                    dispatch({ type: "DELETE_WALLET_ACCOUNT", id: a.id });
                                  }
                                }}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ),
                      )}
                      <tr className="muted-row">
                        <td>
                          <strong>Subtotal</strong>
                        </td>
                        <td />
                        <td className="num">
                          <strong>{fmt(subtotal)}</strong>
                        </td>
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          <div className="section">
            <div className="card">
              <div className="page-head" style={{ marginBottom: 12 }}>
                <h2 style={{ margin: 0 }}>By person</h2>
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Person</th>
                    <th className="num">Cash</th>
                    <th className="num">Card debt</th>
                    <th className="num">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {byOwner.map((o) => (
                    <tr key={o.owner}>
                      <td>{o.owner}</td>
                      <td className="num">{fmt(o.assets)}</td>
                      <td className="num">{fmt(o.debt)}</td>
                      <td className="num">
                        <strong>{fmt(o.net)}</strong>
                      </td>
                    </tr>
                  ))}
                  <tr className="muted-row">
                    <td>
                      <strong>Total</strong>
                    </td>
                    <td className="num">{fmt(totals.assets)}</td>
                    <td className="num">{fmt(totals.debt)}</td>
                    <td className="num">
                      <strong>{fmt(totals.net)}</strong>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function EditRow({
  account,
  onSave,
  onCancel,
}: {
  account: WalletAccount;
  onSave: (a: WalletAccount) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(account.name);
  const [owner, setOwner] = useState(account.owner);
  const [balance, setBalance] = useState(String(account.balance));

  function save() {
    onSave({
      ...account,
      name: name.trim() || account.name,
      owner: owner.trim(),
      balance: parseFloat(balance) || 0,
    });
  }

  return (
    <tr>
      <td>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </td>
      <td>
        <input value={owner} onChange={(e) => setOwner(e.target.value)} style={{ width: 120 }} />
      </td>
      <td className="num">
        <input
          type="number"
          value={balance}
          onChange={(e) => setBalance(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          style={{ width: 110 }}
        />
      </td>
      <td className="actions">
        <button className="primary small" onClick={save}>
          Save
        </button>{" "}
        <button className="small ghost" onClick={onCancel}>
          Cancel
        </button>
      </td>
    </tr>
  );
}
