import { useRef, useState } from "react";
import { useStore } from "../store";
import { exportState, parseImported, defaultState } from "../storage";

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
          dispatch({ type: "REPLACE", state: imported });
          setMsg("✅ Backup imported successfully.");
        }
      } catch (e) {
        setMsg(`❌ ${(e as Error).message}`);
      }
    };
    reader.readAsText(file);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Backup &amp; Data</h1>
          <div className="subtle">Your data lives in this browser — export regularly to be safe</div>
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
        <div className="card">
          <h2>Export</h2>
          <p className="subtle">
            Download a <code>.json</code> file with everything — your buckets, accounts, and every
            month. Keep it somewhere safe (Drive, Dropbox, a folder you back up).
          </p>
          <div className="toolbar">
            <button className="primary" onClick={() => exportState(state)}>
              ⬇ Export backup file
            </button>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="card">
          <h2>Import</h2>
          <p className="subtle">Restore from a backup file. This replaces all current data.</p>
          <div className="toolbar">
            <button onClick={() => fileRef.current?.click()}>⬆ Choose backup file…</button>
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
                dispatch({ type: "REPLACE", state: defaultState() });
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
