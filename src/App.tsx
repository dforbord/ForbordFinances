import { useState } from "react";
import { monthKey } from "./storage";
import { useStore } from "./store";
import { Dashboard } from "./components/Dashboard";
import { LogEntries } from "./components/LogEntries";
import { Goals } from "./components/Goals";
import { Calendar } from "./components/Calendar";
import { Savings } from "./components/Savings";
import { Business } from "./components/Business";
import { Backup } from "./components/Backup";
import { SignIn } from "./components/SignIn";

type Tab = "home" | "log" | "goals" | "savings" | "business" | "calendar" | "backup";

const NAV: { id: Tab; label: string; icon: string }[] = [
  { id: "home", label: "Home", icon: "🏠" },
  { id: "log", label: "Log Entries", icon: "📝" },
  { id: "goals", label: "Goals", icon: "🎯" },
  { id: "savings", label: "Savings", icon: "🏦" },
  { id: "business", label: "Business", icon: "💼" },
  { id: "calendar", label: "Expense Calendar", icon: "📅" },
  { id: "backup", label: "Backup", icon: "💾" },
];

export function App() {
  const { file, cloud } = useStore();
  const [tab, setTab] = useState<Tab>("home");
  const [month, setMonth] = useState<string>(monthKey(new Date()));

  // When cloud sync is configured, require Google sign-in before showing data.
  if (cloud.configured && !cloud.authReady) {
    return (
      <div className="signin">
        <div className="subtle">Loading…</div>
      </div>
    );
  }
  if (cloud.configured && !cloud.user) {
    return <SignIn />;
  }

  const showBanner =
    file.supported && (file.status === "disconnected" || file.status === "needs-permission");

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="brand">
          <span className="brand-mark">💰</span>
          <span className="brand-name">
            Forbord<span className="brand-accent"> Financials</span>
          </span>
        </div>
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
        {cloud.configured && cloud.user ? (
          <div className="cloud-foot">
            <div className="cloud-status">
              <span className={`cloud-dot ${cloud.status}`} />
              {cloud.status === "synced"
                ? "Synced"
                : cloud.status === "connecting"
                  ? "Connecting…"
                  : "Offline — will retry"}
            </div>
            <div className="subtle cloud-email">{cloud.user.email}</div>
            <button className="ghost small" onClick={cloud.signOut}>
              Sign out
            </button>
          </div>
        ) : (
          <div className="subtle" style={{ padding: "0 12px" }}>
            Data is saved locally in this browser. Use Backup to export a file.
          </div>
        )}
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
        {tab === "home" && <Dashboard month={month} setMonth={setMonth} />}
        {tab === "log" && <LogEntries month={month} setMonth={setMonth} />}
        {tab === "goals" && <Goals />}
        {tab === "savings" && <Savings />}
        {tab === "business" && <Business />}
        {tab === "calendar" && <Calendar />}
        {tab === "backup" && <Backup />}
      </main>
    </div>
  );
}
