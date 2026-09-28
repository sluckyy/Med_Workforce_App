import { useState, type FormEvent } from "react";
import { useAuth, ApiError } from "../lib/auth-context.js";

export default function Login() {
  const { login, mfaLogin } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mfaChallengeToken, setMfaChallengeToken] = useState<string | null>(null);
  const [code, setCode] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await login(email, password);
      if (result) setMfaChallengeToken(result.mfaChallengeToken);
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
      <h2>Staff sign in</h2>
      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
            style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
          />
        </label>
        {error && <p style={{ color: "#a33", fontSize: 13 }}>{error}</p>}
        <button type="submit" disabled={submitting} style={{ padding: 10 }}>
          {submitting ? "Please wait…" : "Sign in"}
        </button>
      </form>
      <p style={{ fontSize: 12, color: "#666", marginTop: 24 }}>
        No self-service sign-up: organisation staff accounts are provisioned by a
        PLATFORM_SECURITY_ADMIN (docs/spec/01-technical-architecture-data-model-v0.2.docx §33).
      </p>
    </section>
  );
}
