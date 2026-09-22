import { useState } from "react";
import { useStore } from "../store";
import { Brand } from "./Brand";

/**
 * Shown to a signed-in user who isn't in a household yet.
 *
 * The app is invite-only: only an app admin can create a household, so
 * everyone else sees the "ask to be added" screen with the exact email an
 * existing member needs to enter.
 */
export function Onboarding() {
  const { cloud, household } = useStore();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await household.create(name);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="signin">
      <div className="card signin-card">
        <Brand size="lg" />

        {household.isAdmin ? (
          <>
            <p className="subtle" style={{ margin: 0 }}>
              Create your household to get started. You can add other people to it
              afterwards.
            </p>
            <input
              value={name}
              placeholder="Household name"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
              style={{ width: "100%" }}
            />
            <button className="primary" onClick={create} disabled={busy || !name.trim()}>
              {busy ? "Creating…" : "Create household"}
            </button>
          </>
        ) : (
          <>
            <h2 style={{ margin: 0 }}>You're not in a household yet</h2>
            <p className="subtle" style={{ margin: 0 }}>
              Ask whoever invited you to add this email in their{" "}
              <strong>Household</strong> tab:
            </p>
            <div className="card" style={{ padding: "10px 14px", width: "100%" }}>
              <strong>{cloud.user?.email}</strong>
            </div>
            <div className="help">
              Once they've added you, sign out and back in to see the budget.
            </div>
          </>
        )}

        {(error || household.error) && (
          <div className="help" style={{ color: "var(--red)" }}>
            {error ?? household.error}
          </div>
        )}

        <button className="ghost small" onClick={cloud.signOut}>
          Sign out
        </button>
      </div>
    </div>
  );
}
