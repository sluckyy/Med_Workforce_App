import { useState, type FormEvent } from "react";
import { useAuth, ApiError } from "../lib/auth-context.js";

export default function Login() {
  const { login, mfaLogin, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mfaChallengeToken, setMfaChallengeToken] = useState<string | null>(null);
  const [code, setCode] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "login") {
        const result = await login(email, password);
        if (result) setMfaChallengeToken(result.mfaChallengeToken);
      } else {
        await register(email, password, displayName);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onMfaSubmit(event: FormEvent) {
    event.preventDefault();
    if (!mfaChallengeToken) return;
    setError(null);
    setSubmitting(true);
    try {
      const { remainingBackupCodes } = await mfaLogin(mfaChallengeToken, code);
      if (typeof remainingBackupCodes === "number" && remainingBackupCodes <= 2) {
        // Best-effort nudge — running low on backup codes with no
        // authenticator access left is a permanent lockout.
        window.alert(
          `You used a backup code. Only ${remainingBackupCodes} left — consider re-enrolling MFA from Security settings soon.`,
        );
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Invalid code. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (mfaChallengeToken) {
    return (
      <section style={{ maxWidth: 360, margin: "48px auto" }}>
        <h2>Two-factor verification</h2>
        <p style={{ fontSize: 13, color: "#666" }}>
          Enter the 6-digit code from your authenticator app, or one of your backup codes.
        </p>
        <form onSubmit={onMfaSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            autoFocus
            placeholder="123456 or XXXXX-XXXXX"
            style={{ padding: 8 }}
          />
          {error && <p style={{ color: "#a33", fontSize: 13 }}>{error}</p>}
          <button type="submit" disabled={submitting} style={{ padding: 10 }}>
            {submitting ? "Verifying…" : "Verify"}
          </button>
        </form>
        <button
          type="button"
          onClick={() => {
            setMfaChallengeToken(null);
            setCode("");
            setError(null);
          }}
          style={{ marginTop: 16, background: "none", border: "none", textDecoration: "underline", cursor: "pointer", padding: 0 }}
        >
          &larr; Back to sign in
        </button>
      </section>
    );
  }

  return (
    <section style={{ maxWidth: 360, margin: "48px auto" }}>
      <h2>{mode === "login" ? "Sign in" : "Create your account"}</h2>
      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {mode === "register" && (
          <label>
            Full name
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
            />
          </label>
        )}
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={12}
            style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
          />
          {mode === "register" && (
            <span style={{ fontSize: 12, color: "#666" }}>At least 12 characters.</span>
          )}
        </label>
        {error && <p style={{ color: "#a33", fontSize: 13 }}>{error}</p>}
        <button type="submit" disabled={submitting} style={{ padding: 10 }}>
          {submitting ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setMode(mode === "login" ? "register" : "login");
        }}
        style={{ marginTop: 16, background: "none", border: "none", textDecoration: "underline", cursor: "pointer", padding: 0 }}
      >
        {mode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}
      </button>
      <p style={{ fontSize: 12, color: "#666", marginTop: 24 }}>
        Doctor self-registration only. Organisation staff accounts are provisioned by an
        administrator (docs/spec/01-technical-architecture-data-model-v0.2.docx §33).
      </p>
    </section>
  );
}
