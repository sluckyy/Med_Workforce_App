import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../lib/auth-context.js";
import { apiFetch, ApiError } from "../lib/api.js";

interface QueueItem {
  id: string;
  definition: { code: string; name: string; category: string };
  practitioner: { id: string; displayName: string; email: string };
  issuer: string | null;
  referenceNumber: string | null;
  declaredAt: string;
  lastVerificationResult: string | null;
}

interface CredentialDetail {
  id: string;
  status: string;
  issuer: string | null;
  referenceNumber: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  definition: { code: string; name: string; category: string };
  practitioner: { id: string; displayName: string; email: string };
  evidence: Array<{ id: string; sourceType: string; originalFilename: string | null; scanStatus: string; mimeType: string | null }>;
  verifications: Array<{ id: string; method: string; result: string; verifiedAt: string; notes: string | null }>;
}

const METHODS = ["SELF_ATTESTED", "DOCUMENT_INSPECTION", "PRIMARY_SOURCE", "API", "EMPLOYER_RECORD"];
const RESULTS = ["VERIFIED", "PARTIAL", "FAILED", "UNABLE", "REVOKED"];

export default function AssuranceQueue() {
  const { activeOrgId } = useAuth();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [selected, setSelected] = useState<CredentialDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reloadQueue = useCallback(async () => {
    try {
      const items = await apiFetch<QueueItem[]>("/v1/assurance/queue");
      setQueue(items);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load the assurance queue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reloadQueue();
  }, [reloadQueue]);

  async function openDetail(id: string) {
    try {
      const detail = await apiFetch<CredentialDetail>(`/v1/assurance/credentials/${id}`);
      setSelected(detail);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load that credential.");
    }
  }

  async function afterVerify() {
    setSelected(null);
    await reloadQueue();
  }

  if (loading) return <p>Loading…</p>;

  if (selected) {
    return (
      <VerifyForm
        credential={selected}
        orgId={activeOrgId}
        onBack={() => setSelected(null)}
        onVerified={afterVerify}
      />
    );
  }

  return (
    <section>
      <h2>Credential assurance queue</h2>
      <p style={{ fontSize: 12, color: "#666" }}>
        Declared claims with no VERIFIED result yet, across every practitioner.
      </p>
      {error && <p style={{ color: "#a33" }}>{error}</p>}
      <ul style={{ listStyle: "none", padding: 0 }}>
        {queue.map((item) => (
          <li
            key={item.id}
            style={{ border: "1px solid #ddd", borderRadius: 6, padding: 10, marginBottom: 8, cursor: "pointer" }}
            onClick={() => openDetail(item.id)}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong>{item.definition.name}</strong>
              <span style={{ fontSize: 12, color: "#888" }}>
                {item.lastVerificationResult ? `last: ${item.lastVerificationResult}` : "never verified"}
              </span>
            </div>
            <div style={{ fontSize: 13, color: "#555" }}>
              {item.practitioner.displayName} ({item.practitioner.email})
            </div>
            {item.issuer && <div style={{ fontSize: 12, color: "#888" }}>Issuer: {item.issuer}</div>}
          </li>
        ))}
        {queue.length === 0 && <p style={{ color: "#666" }}>Nothing pending review.</p>}
      </ul>
    </section>
  );
}

function VerifyForm({
  credential,
  orgId,
  onBack,
  onVerified,
}: {
  credential: CredentialDetail;
  orgId: string | null;
  onBack: () => void;
  onVerified: () => Promise<void>;
}) {
  const [method, setMethod] = useState("PRIMARY_SOURCE");
  const [result, setResult] = useState("VERIFIED");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!orgId) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/v1/assurance/credentials/${credential.id}/verifications`, {
        method: "POST",
        body: JSON.stringify({ organisationId: orgId, method, result, notes: notes || undefined }),
      });
      await onVerified();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not record verification.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section>
      <p>
        <button type="button" onClick={onBack} style={{ background: "none", border: "none", textDecoration: "underline", cursor: "pointer", padding: 0 }}>
          &larr; Back to queue
        </button>
      </p>
      <h2>{credential.definition.name}</h2>
      <p style={{ fontSize: 13, color: "#555" }}>
        {credential.practitioner.displayName} ({credential.practitioner.email}) · Status: {credential.status}
      </p>
      <table style={{ borderCollapse: "collapse", marginBottom: 16 }}>
        <tbody>
          <tr>
            <td style={{ padding: "2px 12px 2px 0", color: "#666" }}>Issuer</td>
            <td>{credential.issuer ?? "—"}</td>
          </tr>
          <tr>
            <td style={{ padding: "2px 12px 2px 0", color: "#666" }}>Reference number</td>
            <td>{credential.referenceNumber ?? "—"}</td>
          </tr>
          <tr>
            <td style={{ padding: "2px 12px 2px 0", color: "#666" }}>Expiry date</td>
            <td>{credential.expiryDate ? new Date(credential.expiryDate).toLocaleDateString() : "—"}</td>
          </tr>
        </tbody>
      </table>

      <h3 style={{ fontSize: 14 }}>Evidence</h3>
      <ul style={{ fontSize: 13 }}>
        {credential.evidence.map((e) => (
          <EvidenceDownloadRow key={e.id} credentialId={credential.id} evidence={e} />
        ))}
        {credential.evidence.length === 0 && <li style={{ listStyle: "none", color: "#666" }}>No evidence attached.</li>}
      </ul>

      <h3 style={{ fontSize: 14 }}>Verification history</h3>
      <ul style={{ fontSize: 13 }}>
        {credential.verifications.map((v) => (
          <li key={v.id}>
            {new Date(v.verifiedAt).toLocaleDateString()} · {v.method} · {v.result}
            {v.notes && ` — ${v.notes}`}
          </li>
        ))}
        {credential.verifications.length === 0 && <li style={{ listStyle: "none", color: "#666" }}>None yet.</li>}
      </ul>

      <form
        onSubmit={onSubmit}
        style={{ marginTop: 16, border: "1px dashed #bbb", borderRadius: 6, padding: 12, display: "flex", flexDirection: "column", gap: 8, maxWidth: 400 }}
      >
        <strong style={{ fontSize: 14 }}>Record a verification</strong>
        <label style={{ fontSize: 12 }}>
          Method
          <select value={method} onChange={(e) => setMethod(e.target.value)} style={{ display: "block", padding: 6, width: "100%" }}>
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {m.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 12 }}>
          Result
          <select value={result} onChange={(e) => setResult(e.target.value)} style={{ display: "block", padding: 6, width: "100%" }}>
            {RESULTS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <textarea
          placeholder="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          style={{ padding: 6, minHeight: 60 }}
        />
        {error && <p style={{ color: "#a33", fontSize: 13, margin: 0 }}>{error}</p>}
        <button type="submit" disabled={submitting} style={{ padding: 8, alignSelf: "flex-start" }}>
          {submitting ? "Recording…" : "Record verification"}
        </button>
      </form>
    </section>
  );
}

function EvidenceDownloadRow({
  credentialId,
  evidence,
}: {
  credentialId: string;
  evidence: { id: string; sourceType: string; originalFilename: string | null; scanStatus: string; mimeType: string | null };
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState(evidence.scanStatus);

  async function onDownload() {
    setError(null);
    setBusy(true);
    try {
      const { url } = await apiFetch<{ url: string }>(
        `/v1/passport/credentials/${credentialId}/evidence/${evidence.id}/download`,
      );
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not get a download link.");
    } finally {
      setBusy(false);
    }
  }

  async function onRescan() {
    setError(null);
    setBusy(true);
    try {
      const result = await apiFetch<{ scanStatus: string }>(
        `/v1/passport/credentials/${credentialId}/evidence/${evidence.id}/rescan`,
        { method: "POST" },
      );
      setScanStatus(result.scanStatus);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not rescan this file.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li>
      {evidence.sourceType} · {evidence.originalFilename ?? "(no file)"} ·{" "}
      <span style={{ color: scanStatus === "QUARANTINED" ? "#a33" : scanStatus === "PENDING" ? "#a67c00" : "#0a7a2f", fontWeight: 600 }}>
        {scanStatus}
      </span>
      {" · "}
      <button
        type="button"
        disabled={busy || scanStatus === "QUARANTINED"}
        onClick={onDownload}
        style={{ background: "none", border: "none", textDecoration: "underline", cursor: "pointer", padding: 0, fontSize: 13 }}
      >
        Download
      </button>
      {scanStatus === "PENDING" && (
        <>
          {" · "}
          <button
            type="button"
            disabled={busy}
            onClick={onRescan}
            style={{ background: "none", border: "none", textDecoration: "underline", cursor: "pointer", padding: 0, fontSize: 13 }}
          >
            Rescan
          </button>
        </>
      )}
      {error && <span style={{ color: "#a33", marginLeft: 8 }}>{error}</span>}
    </li>
  );
}
