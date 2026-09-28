import { useState, type FormEvent } from "react";
import { useAuth, ApiError } from "../lib/auth-context.js";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
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
