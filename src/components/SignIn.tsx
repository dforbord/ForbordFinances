import { useStore } from "../store";

export function SignIn() {
  const { cloud } = useStore();
  return (
    <div className="signin">
      <div className="card signin-card">
        <div className="brand" style={{ justifyContent: "center", padding: 0 }}>
          <span className="brand-mark">💰</span>
          <span className="brand-name">
            Forbord<span className="brand-accent"> Financials</span>
          </span>
        </div>
        <p className="subtle" style={{ margin: 0 }}>
          Sign in to open your shared household budget.
        </p>
        <button className="primary" onClick={cloud.signIn}>
          Sign in with Google
        </button>
        {cloud.error && (
          <div className="help" style={{ color: "var(--red)" }}>
            {cloud.error}
          </div>
        )}
        <div className="help">Access is limited to approved accounts.</div>
      </div>
    </div>
  );
}
