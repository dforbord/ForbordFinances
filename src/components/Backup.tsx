import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { exportState, parseImported, defaultState } from "../storage";

function timeAgo(ts: number | null): string {
  if (!ts) return "";
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return new Date(ts).toLocaleTimeString();
}

function FileSyncPanel() {
  const { file } = useStore();
  const [, forceTick] = useState(0);

  // Re-render the "saved Xs ago" label periodically.
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 15000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="card">
      <h2>Auto-save to a file</h2>
      <p className="subtle">
        Connect a <code>budget.json</code> file and every change writes to it automatically — so
        your data isn't trapped in this browser. Your file lives at{" "}
        <code>~/Desktop/ForbordFinances/Sync_ForbordFinances/budget.json</code> (the nightly backup
        reads from there).
      </p>

      {!file.supported ? (
        <div className="empty">
          Your browser doesn't support saving to a file. Open this app in <strong>Chrome</strong> or{" "}
          <strong>Edge</strong> to use auto-save. (Export/Import below still works everywhere.)
        </div>
      ) : (
        <>
          <div className="filestatus">
            {file.status === "connected" && (
              <span className="ok">
                ● Connected to <strong>{file.name}</strong>
                {file.lastSavedAt ? ` — saved ${timeAgo(file.lastSavedAt)}` : ""}
              </span>
            )}
            {file.status === "needs-permission" && (
              <span className="warn">● Permission needed to keep saving to {file.name}</span>
            )}
            {file.status === "disconnected" && <span className="warn">● Not connected</span>}
            {file.status === "error" && <span className="bad">● {file.error ?? "Error"}</span>}
          </div>

          <div className="toolbar" style={{ marginTop: 12 }}>
            {file.status === "needs-permission" ? (
              <button className="primary" onClick={file.reconnect}>
                Reconnect &amp; resume saving
              </button>
            ) : (
              <button className="primary" onClick={file.createFile}>
                ＋ Create / choose data file
              </button>
            )}
            <button onClick={file.openFile}>Open existing budget.json</button>
            {file.status === "connected" && (
              <button className="ghost" onClick={file.disconnect}>
                Disconnect
              </button>
            )}
          </div>
          <div className="help">
            Tip: keep this file in{" "}
            <code>Desktop/ForbordFinances/Sync_ForbordFinances</code> as <code>budget.json</code> so
            the nightly backup can find it. You'll click to re-grant access once per launch.
          </div>
        </>
      )}
    </div>
  );
}

export function Backup() {
  const { state, dispatch } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const monthCount = Object.keys(state.months).length;

  function onImport(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = parseImported(String(reader.result));
        if (
          confirm(
            "Importing will REPLACE all current data with the contents of this file. Continue?",
          )
        ) {
          dispatch({ type: "REPLACE", state: { ...imported, lastModified: Date.now() } });
          setMsg("Backup imported successfully.");
        }
      } catch (e) {
        setMsg(`${(e as Error).message}`);
      }
    };
    reader.readAsText(file);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Backup &amp; Data</h1>
          <div className="subtle">Keep your finances safe with auto-save and exports</div>
        </div>
      </div>

      <div className="cards">
        <div className="card stat">
          <div className="label">Buckets</div>
          <div className="value">{state.buckets.length}</div>
        </div>
        <div className="card stat">
          <div className="label">Accounts</div>
          <div className="value">{state.accounts.length}</div>
        </div>
        <div className="card stat">
          <div className="label">Months tracked</div>
          <div className="value">{monthCount}</div>
        </div>
      </div>

      <div className="section">
        <FileSyncPanel />
      </div>

      <div className="section">
        <div className="card">
          <h2>Export a one-off backup</h2>
          <p className="subtle">
            Download a <code>.json</code> snapshot of everything. Handy before big changes.
          </p>
          <div className="toolbar">
            <button className="primary" onClick={() => exportState(state)}>
              Export backup file
            </button>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="card">
          <h2>Import</h2>
          <p className="subtle">Restore from a backup file. This replaces all current data.</p>
          <div className="toolbar">
            <button onClick={() => fileRef.current?.click()}>Choose backup file…</button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onImport(f);
                e.target.value = "";
              }}
            />
          </div>
          {msg && <div className="help">{msg}</div>}
        </div>
      </div>

      <div className="section">
        <div className="card">
          <h2>Reset</h2>
          <p className="subtle">Wipe everything and start over with the default sample buckets.</p>
          <button
            className="danger"
            onClick={() => {
              if (confirm("Erase ALL data and reset to defaults? Export a backup first!")) {
                dispatch({
                  type: "REPLACE",
                  state: { ...defaultState(), lastModified: Date.now() },
                });
                setMsg("Data reset to defaults.");
              }
            }}
          >
            Reset all data
          </button>
        </div>
      </div>
    </>
  );
}
