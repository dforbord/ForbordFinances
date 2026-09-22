import { useStore } from "../store";
import { Brand } from "./Brand";

export function SignIn() {
  const { cloud } = useStore();
  return (
    <div className="signin">
      <div className="card signin-card">
        <Brand size="lg" />
        <p className="subtle" style={{ margin: 0 }}>
          Your household's money, in one clear view.
        </p>
        <button className="primary" onClick={cloud.signIn}>
          Sign in with Google
        </button>
        {cloud.error && (
          <div className="help" style={{ color: "var(--red)" }}>
            {cloud.error}
          </div>
        )}
        <div className="help">Access is by invitation.</div>
      </div>
    </div>
  );
}
