import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiError } from "../lib/api.js";
import { useAuth } from "../lib/auth-context.js";

interface EnrollResponse {
  secret: string;
  qrCodeDataUrl: string;
}

interface ConfirmResponse {
  backupCodes: string[];
}

type Stage = "idle" | "enrolling" | "confirming" | "showingBackupCodes";

export default function Security() {
  const { user, refreshUser } = useAuth();
  const [stage, setStage] = useState<Stage>("idle");
  const [enrollment, setEnrollment] = useState<EnrollResponse | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void refreshUser();
    // Only needed once, on mount, to pick up the latest mfaEnabled status —
    // refreshUser is stable across renders (useCallback in auth-context).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startEnroll = useCallback(async () => {
    setError(null);
    setSubmitting(true);
    try {
      const result = await apiFetch<EnrollResponse>("/v1/auth/mfa/enroll", { method: "POST" });
      setEnrollment(result);
      setStage("enrolling");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start MFA enrollment.");
    } finally {
      setSubmitting(false);
    }
  }, []);

  async function onConfirm(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await apiFetch<ConfirmResponse>("/v1/auth/mfa/confirm", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      setBackupCodes(result.backupCodes);
      setStage("showingBackupCodes");
      setCode("");
      await refreshUser();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Invalid code. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onDisable(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch("/v1/auth/mfa/disable", {
        method: "POST",
        body: JSON.stringify({ code: disableCode }),
      });
      setDisableCode("");
      await refreshUser();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Invalid code. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function finishEnrollment() {
    setStage("idle");
    setEnrollment(null);
    setBackupCodes(null);
  }

  if (stage === "showingBackupCodes" && backupCodes) {
    return (
      <section style={{ maxWidth: 480 }}>
        <h2>Two-factor authentication enabled</h2>
        <p style={{ fontSize: 13, color: "#666" }}>
          Save these one-time backup codes somewhere safe. Each can be used once if you lose
          access to your authenticator app. They will not be shown again.
        </p>
        <pre
          style={{
            background: "#f4f4f4",
            padding: 12,
            borderRadius: 4,
            fontSize: 14,
            lineHeight: 1.8,
          }}
        >
          {backupCodes.join("\n")}
        </pre>
        <button type="button" onClick={finishEnrollment} style={{ padding: 10 }}>
          Done
        </button>
      </section>
    );
  }

  if (stage === "enrolling" && enrollment) {
    return (
      <section style={{ maxWidth: 480 }}>
        <h2>Set up two-factor authentication</h2>
        <p style={{ fontSize: 13, color: "#666" }}>
          Scan this QR code with an authenticator app (e.g. Google Authenticator, Authy), or enter
          the secret manually, then enter the 6-digit code it shows.
        </p>
        <img src={enrollment.qrCodeDataUrl} alt="MFA enrollment QR code" style={{ display: "block", margin: "12px 0" }} />
        <p style={{ fontSize: 12, fontFamily: "monospace", wordBreak: "break-all" }}>{enrollment.secret}</p>
        <form onSubmit={onConfirm} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            autoFocus
            placeholder="123456"
            style={{ padding: 8 }}
          />
          {error && <p style={{ color: "#a33", fontSize: 13 }}>{error}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" disabled={submitting} style={{ padding: 10 }}>
              {submitting ? "Confirming…" : "Confirm"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStage("idle");
                setEnrollment(null);
                setError(null);
              }}
              style={{ padding: 10 }}
            >
              Cancel
            </button>
          </div>
        </form>
      </section>
    );
  }

  return (
    <section style={{ maxWidth: 480 }}>
      <h2>Security</h2>
      <p style={{ fontSize: 13, color: "#666" }}>
        Two-factor authentication: <strong>{user?.mfaEnabled ? "Enabled" : "Not enabled"}</strong>
      </p>
      {error && <p style={{ color: "#a33", fontSize: 13 }}>{error}</p>}
      {!user?.mfaEnabled ? (
        <button type="button" disabled={submitting} onClick={() => void startEnroll()} style={{ padding: 10 }}>
          {submitting ? "Starting…" : "Enable two-factor authentication"}
        </button>
      ) : (
        <form onSubmit={onDisable} style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 280 }}>
          <label>
            Enter a current code to disable two-factor authentication
            <input
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value)}
              required
              placeholder="123456 or XXXXX-XXXXX"
              style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
            />
          </label>
          <button type="submit" disabled={submitting} style={{ padding: 10 }}>
            {submitting ? "Disabling…" : "Disable two-factor authentication"}
          </button>
        </form>
      )}
    </section>
  );
}
