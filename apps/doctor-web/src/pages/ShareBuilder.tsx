import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiError } from "../lib/api.js";

interface PassportCredential {
  id: string;
  definition: { code: string; name: string; category: string };
  status: string;
}

interface PassportEndorsement {
  id: string;
  endorsementType: string;
}

interface PassportMe {
  credentials: PassportCredential[];
  proceduralEndorsements: PassportEndorsement[];
}

interface ShareSummary {
  id: string;
  recipientLabel: string | null;
  recipientContact: string | null;
  otpRequired: boolean;
  expiresAt: string;
  status: string;
  createdAt: string;
  itemCount: number;
  accessEventCount: number;
}

interface AccessLogEntry {
  event: string;
  occurredAt: string;
}

const SENSITIVE_CATEGORIES = new Set(["IMMIGRATION_WORK_RIGHTS", "ENGLISH_LANGUAGE_TEST"]);

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: "#0a7a2f",
  REVOKED: "#a33",
  EXPIRED: "#888",
};

export default function ShareBuilder() {
  const [passport, setPassport] = useState<PassportMe | null>(null);
  const [shares, setShares] = useState<ShareSummary[]>([]);
  const [selected, setSelected] = useState<ShareSummary | null>(null);
  const [accessLog, setAccessLog] = useState<AccessLogEntry[]>([]);
  const [lastCreated, setLastCreated] = useState<{ shareToken: string; otpCode: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([
        apiFetch<PassportMe>("/v1/passport/me"),
        apiFetch<ShareSummary[]>("/v1/shares/me"),
      ]);
      setPassport(p);
      setShares(s);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load your passport or shares.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function openAccessLog(share: ShareSummary) {
    setSelected(share);
    try {
      const log = await apiFetch<AccessLogEntry[]>(`/v1/shares/${share.id}/access-log`);
      setAccessLog(log);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load the access log.");
    }
  }

  async function revoke(id: string) {
    try {
      await apiFetch(`/v1/shares/${id}/revoke`, { method: "POST" });
      setSelected(null);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not revoke this share.");
    }
  }

  if (loading) return <p>Loading…</p>;

  if (selected) {
    return (
      <section>
        <button
          type="button"
          onClick={() => setSelected(null)}
          style={{ background: "none", border: "none", textDecoration: "underline", cursor: "pointer", padding: 0, marginBottom: 12 }}
        >
          &larr; Back to shares
        </button>
        <h2>{selected.recipientLabel ?? "Share"}</h2>
        <p style={{ fontSize: 13, color: "#555" }}>
          Status: {selected.status} · Expires {new Date(selected.expiresAt).toLocaleString()}
        </p>
        <h3 style={{ fontSize: 14 }}>Access log</h3>
        <ul style={{ fontSize: 13 }}>
          {accessLog.map((e, i) => (
            <li key={i}>
              {e.event} — {new Date(e.occurredAt).toLocaleString()}
            </li>
          ))}
          {accessLog.length === 0 && <li style={{ listStyle: "none", color: "#666" }}>No access yet.</li>}
        </ul>
        {selected.status === "ACTIVE" && (
          <button type="button" onClick={() => revoke(selected.id)} style={{ padding: 8, color: "#a33" }}>
            Revoke this share
          </button>
        )}
      </section>
    );
  }

  return (
    <section>
      <h2>Share builder</h2>
      {error && <p style={{ color: "#a33" }}>{error}</p>}

      <h3 style={{ fontSize: 15 }}>Your shares</h3>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {shares.map((s) => (
          <li
            key={s.id}
            style={{ border: "1px solid #ddd", borderRadius: 6, padding: 10, marginBottom: 8, cursor: "pointer" }}
            onClick={() => openAccessLog(s)}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong>{s.recipientLabel ?? "(no label)"}</strong>
              <span style={{ fontSize: 12, fontWeight: 600, color: STATUS_COLOR[s.status] ?? "#333" }}>{s.status}</span>
            </div>
            <div style={{ fontSize: 12, color: "#666" }}>
              {s.itemCount} item{s.itemCount === 1 ? "" : "s"} · expires {new Date(s.expiresAt).toLocaleString()} ·{" "}
              {s.accessEventCount} access event{s.accessEventCount === 1 ? "" : "s"}
            </div>
          </li>
        ))}
        {shares.length === 0 && <p style={{ color: "#666" }}>None yet.</p>}
      </ul>

      {lastCreated && (
        <div style={{ border: "1px solid #0a7a2f", borderRadius: 6, padding: 10, marginBottom: 16, fontSize: 13 }}>
          <strong>Share created.</strong> Copy this link and send it yourself — it's shown only once:
          <pre style={{ wordBreak: "break-all", fontSize: 12 }}>{`${window.location.origin}/shares/${lastCreated.shareToken}`}</pre>
          {lastCreated.otpCode && (
            <p>
              OTP code for the recipient: <strong>{lastCreated.otpCode}</strong>
            </p>
          )}
        </div>
      )}

      {passport && (
        <CreateShareForm
          passport={passport}
          onCreated={(result) => {
            setLastCreated(result);
            void reload();
          }}
        />
      )}
    </section>
  );
}

function CreateShareForm({
  passport,
  onCreated,
}: {
  passport: PassportMe;
  onCreated: (result: { shareToken: string; otpCode: string | null }) => void;
}) {
  const [selectedCredentials, setSelectedCredentials] = useState<Set<string>>(new Set());
  const [selectedEndorsements, setSelectedEndorsements] = useState<Set<string>>(new Set());
  const [recipientLabel, setRecipientLabel] = useState("");
  const [expiresInHours, setExpiresInHours] = useState("72");
  const [otpRequired, setOtpRequired] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(set: Set<string>, setSet: (s: Set<string>) => void, id: string) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSet(next);
  }

  const hasSensitiveSelection = passport.credentials.some(
    (c) => selectedCredentials.has(c.id) && SENSITIVE_CATEGORIES.has(c.definition.category),
  );

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (selectedCredentials.size === 0 && selectedEndorsements.size === 0) {
      setError("Select at least one item to share.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const items = [
        ...[...selectedCredentials].map((itemId) => ({ itemType: "CREDENTIAL", itemId })),
        ...[...selectedEndorsements].map((itemId) => ({ itemType: "PROCEDURAL_ENDORSEMENT", itemId })),
      ];
      const result = await apiFetch<{ shareToken: string; otpCode: string | null }>("/v1/shares", {
        method: "POST",
        body: JSON.stringify({
          recipientLabel: recipientLabel || undefined,
          expiresInHours: Number(expiresInHours) || 72,
          otpRequired,
          items,
        }),
      });
      setSelectedCredentials(new Set());
      setSelectedEndorsements(new Set());
      setRecipientLabel("");
      onCreated(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create this share.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{ border: "1px dashed #bbb", borderRadius: 6, padding: 12, display: "flex", flexDirection: "column", gap: 8, maxWidth: 460 }}
    >
      <strong style={{ fontSize: 14 }}>Build a new share</strong>

      <div>
        <p style={{ fontSize: 12, color: "#666", margin: "0 0 4px" }}>Credentials</p>
        {passport.credentials.map((c) => (
          <label key={c.id} style={{ display: "block", fontSize: 13 }}>
            <input
              type="checkbox"
              checked={selectedCredentials.has(c.id)}
              onChange={() => toggle(selectedCredentials, setSelectedCredentials, c.id)}
            />{" "}
            {c.definition.name}
            {SENSITIVE_CATEGORIES.has(c.definition.category) && (
              <span style={{ color: "#a33", fontSize: 11 }}> (sensitive — not included automatically)</span>
            )}
          </label>
        ))}
        {passport.credentials.length === 0 && <p style={{ fontSize: 12, color: "#666" }}>No credentials declared yet.</p>}
      </div>

      {passport.proceduralEndorsements.length > 0 && (
        <div>
          <p style={{ fontSize: 12, color: "#666", margin: "0 0 4px" }}>Procedural endorsements</p>
          {passport.proceduralEndorsements.map((e) => (
            <label key={e.id} style={{ display: "block", fontSize: 13 }}>
              <input
                type="checkbox"
                checked={selectedEndorsements.has(e.id)}
                onChange={() => toggle(selectedEndorsements, setSelectedEndorsements, e.id)}
              />{" "}
              {e.endorsementType.replaceAll("_", " ")}
            </label>
          ))}
        </div>
      )}

      {hasSensitiveSelection && (
        <p style={{ fontSize: 12, color: "#a33" }}>
          You've selected sensitive identity/immigration evidence — only share this if the recipient genuinely needs
          it.
        </p>
      )}

      <input placeholder="Recipient label (optional)" value={recipientLabel} onChange={(e) => setRecipientLabel(e.target.value)} style={{ padding: 6 }} />
      <label style={{ fontSize: 12 }}>
        Expires in (hours)
        <input type="number" min={1} max={720} value={expiresInHours} onChange={(e) => setExpiresInHours(e.target.value)} style={{ display: "block", padding: 6, width: "100%" }} />
      </label>
      <label style={{ fontSize: 13 }}>
        <input type="checkbox" checked={otpRequired} onChange={(e) => setOtpRequired(e.target.checked)} /> Require a one-time code to view
      </label>
      {error && <p style={{ color: "#a33", fontSize: 13, margin: 0 }}>{error}</p>}
      <button type="submit" disabled={submitting} style={{ padding: 8, alignSelf: "flex-start" }}>
        {submitting ? "Creating…" : "Create share"}
      </button>
    </form>
  );
}
