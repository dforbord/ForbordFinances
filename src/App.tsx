import { useState } from "react";
import { monthKey } from "./storage";
import { useStore } from "./store";
import { Dashboard } from "./components/Dashboard";
import { MonthlyEntry } from "./components/MonthlyEntry";
import { Buckets } from "./components/Buckets";
import { Savings } from "./components/Savings";
import { Backup } from "./components/Backup";

type Tab = "dashboard" | "monthly" | "buckets" | "savings" | "backup";

const NAV: { id: Tab; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "📊" },
  { id: "monthly", label: "Monthly Entry", icon: "🗓️" },
  { id: "buckets", label: "Buckets", icon: "🪣" },
  { id: "savings", label: "Savings", icon: "🏦" },
  { id: "backup", label: "Backup", icon: "💾" },
];

export function App() {
  const { file } = useStore();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [month, setMonth] = useState<string>(monthKey(new Date()));

  const showBanner =
    file.supported && (file.status === "disconnected" || file.status === "needs-permission");

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="brand">💰 Budget</div>
        {NAV.map((n) => (
          <button
            key={n.id}
            className={`nav-item ${tab === n.id ? "active" : ""}`}
            onClick={() => setTab(n.id)}
          >
            <span>{n.icon}</span>
            {n.label}
          </button>
        ))}
        <div className="nav-spacer" />
        <div className="subtle" style={{ padding: "0 12px" }}>
          Data is saved locally in this browser. Use Backup to export a file.
        </div>
      </nav>

      <main className="main">
        {showBanner && (
          <div className="filebanner">
            {file.status === "needs-permission" ? (
              <>
                🔌 Reconnect your data file to resume auto-saving.
                <button className="small" onClick={file.reconnect}>
                  Reconnect
                </button>
              </>
            ) : (
              <>
                💡 Auto-save to a file is off — your data is only in this browser.
                <button className="small" onClick={() => setTab("backup")}>
                  Set up
                </button>
              </>
            )}
          </div>
        )}
        {tab === "dashboard" && <Dashboard month={month} setMonth={setMonth} />}
        {tab === "monthly" && <MonthlyEntry month={month} setMonth={setMonth} />}
        {tab === "buckets" && <Buckets />}
        {tab === "savings" && <Savings />}
        {tab === "backup" && <Backup />}
      </main>
    </div>
  );
}
