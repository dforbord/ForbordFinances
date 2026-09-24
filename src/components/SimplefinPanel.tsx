import { useEffect, useState } from "react";
import { useStore } from "../store";
import {
  claimBankConnection,
  subscribeConnectionStatus,
  syncBankNow,
  ClaimedAccount,
  ConnectionStatus,
} from "../cloudsync";

const BRIDGE_URL = "https://beta-bridge.simplefin.org/";

function whenLabel(ms?: number | null): string {
  if (!ms) return "not yet";
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 36) return `${hrs} hr ago`;
  return `${Math.round(hrs / 24)} days ago`;
}

/**
 * Connect a bank through SimpleFIN.
 *
 * SimpleFIN cannot be embedded — it has no iframe or OAuth callback — so the
 * bank login happens on their site and the user brings back a one-time setup
 * token. That token goes straight to a Cloud Function; the credential it
 * becomes is stored server-side and never touches this browser.
 */
export function SimplefinPanel() {
  const { cloud } = useStore();
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [token, setToken] = useState("");
  const [showConnect, setShowConnect] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [found, setFound] = useState<ClaimedAccount[] | null>(null);

  const uid = cloud.user?.uid;
  useEffect(() => {
    if (!uid) return;
    return subscribeConnectionStatus(uid, (s) => {
      setStatus(s);
      setLoaded(true);
    });
  }, [uid]);

  if (!cloud.configured || !cloud.user) return null;

  async function connect() {
    if (!token.trim()) return;
    setBusy("connect");
    setErr(null);
    setMsg(null);
    try {
      const accounts = await claimBankConnection(token.trim());
      setFound(accounts);
      setToken("");
      setShowConnect(false);
      setMsg(
        accounts.length
          ? "Connected. Pulling your transactions…"
          : "Connected, but no accounts were found yet.",
      );
      // First pull straight away so there's something to see.
      const added = await syncBankNow();
      setMsg(`Connected — ${added} transaction${added === 1 ? "" : "s"} imported.`);
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(null);
  }

  async function sync() {
    setBusy("sync");
    setErr(null);
    setMsg(null);
    try {
      const added = await syncBankNow();
      setMsg(
        added > 0
          ? `${added} new transaction${added === 1 ? "" : "s"} imported.`
          : "Already up to date.",
      );
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(null);
  }

  const connected = loaded && !!status;
  const needsAttention = status?.state === "needs_reauth" || status?.state === "error";

  return (
    <div className="section">
      <div className="card">
        <h2 style={{ margin: "0 0 4px" }}>Auto-sync from your bank</h2>

        {!connected && !showConnect && (
          <>
            <div className="subtle">
              Connect once and your transactions arrive on their own each morning —
              no statements to download.
            </div>
            <div className="row-form" style={{ marginTop: 14, marginBottom: 0 }}>
              <button className="primary" onClick={() => setShowConnect(true)}>
                Connect a bank
              </button>
            </div>
          </>
        )}

        {showConnect && (
          <>
            <div className="subtle" style={{ marginBottom: 12 }}>
              We use <strong>SimpleFIN</strong>, a read-only service ($15/year, paid to
              them). It can see your transactions but can never move money.
            </div>
            <ol style={{ margin: "0 0 12px 18px", padding: 0, lineHeight: 1.7 }}>
              <li>
                Open SimpleFIN, subscribe, and connect your bank.{" "}
                <a href={BRIDGE_URL} target="_blank" rel="noreferrer">
                  Open SimpleFIN ↗
                </a>
              </li>
              <li>
                There, go to <strong>My Account → Apps → New app connection</strong>,
                name it <em>Lumen Financials</em>, and click{" "}
                <strong>Create Setup Token</strong>.
              </li>
              <li>Paste that token below.</li>
            </ol>
            <div className="row-form" style={{ marginBottom: 0 }}>
              <div className="field grow">
                <label>Setup token</label>
                <input
                  value={token}
                  placeholder="Paste the token from SimpleFIN"
                  onChange={(e) => setToken(e.target.value)}
                />
              </div>
              <button className="primary" onClick={connect} disabled={!!busy || !token.trim()}>
                {busy === "connect" ? "Connecting…" : "Connect"}
              </button>
              <button className="ghost" onClick={() => setShowConnect(false)} disabled={!!busy}>
                Cancel
              </button>
            </div>
            <div className="help">
              The token is used once and never stored in this browser.
            </div>
          </>
        )}

        {connected && !showConnect && (
          <>
            <div className="subtle">
              {status?.accounts?.length
                ? status.accounts.join(" · ")
                : "Connected to SimpleFIN"}
            </div>
            <div className="row-form" style={{ marginTop: 14, marginBottom: 0 }}>
              <div className="field grow">
                <label>Last sync</label>
                <div style={{ paddingTop: 6 }}>
                  {whenLabel(status?.lastSyncAt)}
                  {status?.state === "ok" && (
                    <span className="subtle"> · refreshes automatically each morning</span>
                  )}
                </div>
                {status?.newestTxnDate && (
                  <div className="help" style={{ marginTop: 6 }}>
                    Your bank has sent transactions through{" "}
                    <strong>{status.newestTxnDate}</strong>
                    {status.bankAsOf && ` (data as of ${status.bankAsOf})`}. Anything
                    more recent hasn't reached SimpleFIN yet — banks often lag a few
                    days.
                  </div>
                )}
              </div>
              <button onClick={sync} disabled={!!busy}>
                {busy === "sync" ? "Syncing…" : "Sync now"}
              </button>
              {/* Always reachable: replacing a working connection is a normal
                  thing to do (demo → real bank, or switching banks), not only
                  a recovery path for a broken one. */}
              <button
                className={needsAttention ? "primary" : "ghost"}
                onClick={() => setShowConnect(true)}
                disabled={!!busy}
              >
                {needsAttention ? "Reconnect" : "Connect a different bank"}
              </button>
            </div>
          </>
        )}

        {needsAttention && (
          <div className="help" style={{ color: "var(--red)" }}>
            {status?.state === "needs_reauth"
              ? "This bank connection expired — reconnect it at SimpleFIN and paste a new token."
              : status?.message}
          </div>
        )}
        {found && found.length > 0 && (
          <div className="help">
            Found: {found.map((a) => `${a.org} ${a.name}`.trim()).join(", ")}
          </div>
        )}
        {err && (
          <div className="help" style={{ color: "var(--red)" }}>
            {err}
          </div>
        )}
        {msg && (
          <div className="help" style={{ color: "var(--green)" }}>
            {msg}
          </div>
        )}
      </div>
    </div>
  );
}
