import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { apiFetch, ApiError } from "../lib/api.js";

interface ShareBundle {
  recipientLabel: string | null;
  otpRequired: boolean;
  credentials?: Array<{
    code: string;
    name: string;
    category: string;
    issuer: string | null;
    referenceNumber: string | null;
    issueDate: string | null;
    expiryDate: string | null;
    status: string;
  }>;
  proceduralEndorsements?: Array<{
    endorsementType: string;
    awardingBody: string | null;
    awardedAt: string | null;
    currencyStatus: string;
  }>;
}

// No login — the URL token is the credential, same accountless pattern
// as modules/timesheet's ApprovalPage.
export default function ShareView() {
  const { token } = useParams<{ token: string }>();
  const [bundle, setBundle] = useState<ShareBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [unlocking, setUnlocking] = useState(false);

  const reload = useCallback(async () => {
    if (!token) return;
    try {
      const result = await apiFetch<ShareBundle>(`/v1/shares/view/${token}`);
      setBundle(result);
      setError(null);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 410
          ? "This share link has expired or been revoked."
          : err instanceof ApiError && err.status === 404
            ? "This share link isn't valid."
            : "Could not load this share.",
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function unlock(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    setUnlocking(true);
    setError(null);
    try {
      const result = await apiFetch<ShareBundle>(`/v1/shares/view/${token}/unlock`, {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      setBundle(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not unlock this share.");
    } finally {
      setUnlocking(false);
    }
  }

  if (loading) return <p>Loading…</p>;
  // Only a failure to load the share at all (expired/revoked/not found)
  // replaces the whole page — a wrong-OTP error on an already-loaded
  // otpRequired share must stay inline within that form instead, or the
  // form (and the chance to retry) would disappear along with it.
  if (error && !bundle) return <p style={{ color: "#a33", maxWidth: 420, margin: "48px auto" }}>{error}</p>;
  if (!bundle) return null;

  if (bundle.otpRequired) {
    return (
      <section style={{ maxWidth: 420, margin: "48px auto" }}>
        <h2>Enter your one-time code</h2>
        <p style={{ fontSize: 13, color: "#555" }}>
          The person who sent you this link should also have given you a 6-digit code.
        </p>
        <form onSubmit={unlock} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input value={code} onChange={(e) => setCode(e.target.value)} required autoFocus placeholder="123456" style={{ padding: 8 }} />
          {error && <p style={{ color: "#a33", fontSize: 13 }}>{error}</p>}
          <button type="submit" disabled={unlocking} style={{ padding: 8 }}>
            {unlocking ? "Checking…" : "View"}
          </button>
        </form>
      </section>
    );
  }

  return (
    <section style={{ maxWidth: 480, margin: "48px auto" }}>
      <h2>Shared credentials</h2>
      {bundle.recipientLabel && <p style={{ fontSize: 13, color: "#555" }}>Shared with: {bundle.recipientLabel}</p>}

      <h3 style={{ fontSize: 14 }}>Credentials</h3>
      <ul>
        {bundle.credentials?.map((c) => (
          <li key={c.code} style={{ fontSize: 13, marginBottom: 6 }}>
            <strong>{c.name}</strong> — {c.status}
            {c.issuer && ` · ${c.issuer}`}
            {c.referenceNumber && ` · ${c.referenceNumber}`}
            {c.expiryDate && ` · expires ${new Date(c.expiryDate).toLocaleDateString()}`}
          </li>
        ))}
        {(!bundle.credentials || bundle.credentials.length === 0) && (
          <li style={{ listStyle: "none", color: "#666" }}>None included.</li>
        )}
      </ul>

      {bundle.proceduralEndorsements && bundle.proceduralEndorsements.length > 0 && (
        <>
          <h3 style={{ fontSize: 14 }}>Procedural endorsements</h3>
          <ul>
            {bundle.proceduralEndorsements.map((e, i) => (
              <li key={i} style={{ fontSize: 13, marginBottom: 6 }}>
                {e.endorsementType.replaceAll("_", " ")} — {e.currencyStatus}
                {e.awardingBody && ` · ${e.awardingBody}`}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
