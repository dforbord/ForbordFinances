import { useState } from "react";
import { useStore } from "../store";

/**
 * Household membership — who shares this budget, and the add-by-email invite.
 *
 * Adding an email grants that Google account full access to this household's
 * budget the next time they sign in. Only the owner can remove someone.
 */
export function Household() {
  const { cloud, household } = useStore();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const current = household.current;
  if (!current) return null;

  const myEmail = (cloud.user?.email ?? "").toLowerCase();
  const isOwner = myEmail === current.ownerEmail;

  async function add() {
    if (!email.trim() || busy) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const added = email.trim().toLowerCase();
      await household.addMember(added);
      setNote(`${added} can now open this budget.`);
      setEmail("");
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  async function remove(member: string) {
    if (!confirm(`Remove ${member} from ${current!.name}? They'll lose access to this budget.`)) {
      return;
    }
    setError(null);
    setNote(null);
    try {
      await household.removeMember(member);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{current.name}</h1>
          <div className="subtle">
            Everyone here shares this budget — the same buckets, months, goals and
            wallet, syncing live
          </div>
        </div>
      </div>

      <div className="section">
        <h2>Members</h2>
        <div className="card">
          <table className="table">
            <tbody>
              {current.memberEmails.map((m) => (
                <tr key={m}>
                  <td>
                    {m}
                    {m === current.ownerEmail && <span className="subtle"> · owner</span>}
                    {m === myEmail && <span className="subtle"> · you</span>}
                  </td>
                  <td className="actions">
                    {isOwner && m !== current.ownerEmail && (
                      <button className="danger small" onClick={() => remove(m)}>
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="section">
        <h2>Add someone</h2>
        <div className="card">
          <div className="row-form">
            <div className="field grow">
              <label>Their Google email</label>
              <input
                value={email}
                placeholder="their-email@gmail.com"
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && add()}
              />
            </div>
            <button className="primary" onClick={add} disabled={busy || !email.trim()}>
              {busy ? "Adding…" : "Add member"}
            </button>
          </div>
          <div className="help">
            They must sign in with this exact Google account. A person can belong to
            only one household.
          </div>
          {error && (
            <div className="help" style={{ color: "var(--red)" }}>
              {error}
            </div>
          )}
          {note && (
            <div className="help" style={{ color: "var(--green)" }}>
              {note}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
