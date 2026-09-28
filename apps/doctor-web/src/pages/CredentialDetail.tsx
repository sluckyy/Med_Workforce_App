import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch, ApiError } from "../lib/api.js";

interface CredentialDetailData {
  id: string;
  definition: { code: string; name: string; category: string };
  issuer: string | null;
  referenceNumber: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  status: string;
  registrationType: string | null;
  attributes: Record<string, unknown> | null;
  version: number;
  createdAt: string;
  evidence: Array<{
    id: string;
    sourceType: string;
    originalFilename: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
    scanStatus: string;
    sensitivity: string;
    version: number;
    createdAt: string;
    supersededAt: string | null;
  }>;
  verifications: Array<{
    id: string;
    method: string;
    result: string;
    assuranceLevel: string | null;
    verifiedAt: string;
    validUntil: string | null;
    verifierOrgId: string | null;
    notes: string | null;
  }>;
  dependentRoleReadiness: unknown;
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : "—";
}

export default function CredentialDetail() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<CredentialDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!id) return;
    try {
      const detail = await apiFetch<CredentialDetailData>(`/v1/passport/credentials/${id}`);
      setData(detail);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404 ? "Credential not found." : "Could not load this credential.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    reload();
  }, [reload]);

  if (loading) return <p>Loading…</p>;
  if (error) return <p style={{ color: "#a33" }}>{error}</p>;
  if (!data) return null;

  return (
    <section>
      <p>
        <Link to="/passport">&larr; Back to passport</Link>
      </p>
      <h2>{data.definition.name}</h2>
      <p style={{ color: "#666", fontSize: 13 }}>{data.definition.category.replaceAll("_", " ")}</p>

      <table style={{ borderCollapse: "collapse", marginBottom: 24 }}>
        <tbody>
          <tr>
            <td style={{ padding: "4px 12px 4px 0", color: "#666" }}>Status</td>
            <td>{data.status}</td>
          </tr>
          <tr>
            <td style={{ padding: "4px 12px 4px 0", color: "#666" }}>Issuer</td>
            <td>{data.issuer ?? "—"}</td>
          </tr>
          <tr>
            <td style={{ padding: "4px 12px 4px 0", color: "#666" }}>Reference number</td>
            <td>{data.referenceNumber ?? "—"}</td>
          </tr>
          <tr>
            <td style={{ padding: "4px 12px 4px 0", color: "#666" }}>Issue date</td>
            <td>{formatDate(data.issueDate)}</td>
          </tr>
          <tr>
            <td style={{ padding: "4px 12px 4px 0", color: "#666" }}>Expiry date</td>
            <td>{formatDate(data.expiryDate)}</td>
          </tr>
          {data.registrationType && (
            <tr>
              <td style={{ padding: "4px 12px 4px 0", color: "#666" }}>Registration type</td>
              <td>{data.registrationType}</td>
            </tr>
          )}
          {data.attributes && Object.keys(data.attributes).length > 0 && (
            <tr>
              <td style={{ padding: "4px 12px 4px 0", color: "#666", verticalAlign: "top" }}>Attributes</td>
              <td>
                <pre style={{ margin: 0, fontSize: 12 }}>{JSON.stringify(data.attributes, null, 2)}</pre>
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {data.status === "DECLARED" ? (
        <EditForm data={data} onSaved={reload} />
      ) : (
        <p style={{ fontSize: 12, color: "#888" }}>
          This credential has left DECLARED status, so its claimed facts are frozen — editing after
          verification would undermine what the verification attested to.
        </p>
      )}

      <h3 style={{ marginTop: 24 }}>Evidence versions</h3>
      {data.evidence.length === 0 ? (
        <p style={{ color: "#666", fontSize: 13 }}>
          No evidence attached yet. Evidence upload isn't available in this build — no object storage
          is provisioned yet (see README "Status").
        </p>
      ) : (
        <ul>
          {data.evidence.map((e) => (
            <li key={e.id} style={{ fontSize: 13 }}>
              v{e.version} · {e.sourceType} · {e.originalFilename ?? "(no file)"} · {e.scanStatus}
              {e.supersededAt && " · superseded"}
            </li>
          ))}
        </ul>
      )}

      <h3 style={{ marginTop: 24 }}>Verification history</h3>
      {data.verifications.length === 0 ? (
        <p style={{ color: "#666", fontSize: 13 }}>Not yet verified.</p>
      ) : (
        <ul>
          {data.verifications.map((v) => (
            <li key={v.id} style={{ fontSize: 13 }}>
              {formatDate(v.verifiedAt)} · {v.method} · <strong>{v.result}</strong>
              {v.assuranceLevel && ` · ${v.assuranceLevel}`}
              {v.validUntil && ` · valid until ${formatDate(v.validUntil)}`}
            </li>
          ))}
        </ul>
      )}

      <h3 style={{ marginTop: 24 }}>Dependent role readiness</h3>
      <p style={{ color: "#666", fontSize: 13 }}>
        Not available yet — this is computed by the eligibility engine, which hasn't been built.
      </p>
    </section>
  );
}

function EditForm({ data, onSaved }: { data: CredentialDetailData; onSaved: () => Promise<void> }) {
  const [issuer, setIssuer] = useState(data.issuer ?? "");
  const [referenceNumber, setReferenceNumber] = useState(data.referenceNumber ?? "");
  const [expiryDate, setExpiryDate] = useState(data.expiryDate ? data.expiryDate.slice(0, 10) : "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSaved(false);
    try {
      await apiFetch(`/v1/passport/credentials/${data.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          issuer: issuer || undefined,
          referenceNumber: referenceNumber || undefined,
          expiryDate: expiryDate || undefined,
        }),
      });
      setSaved(true);
      await onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save changes.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{ border: "1px dashed #bbb", borderRadius: 6, padding: 12, display: "flex", flexDirection: "column", gap: 8, maxWidth: 360 }}
    >
      <strong style={{ fontSize: 14 }}>Edit claim</strong>
      <input placeholder="Issuer" value={issuer} onChange={(e) => setIssuer(e.target.value)} style={{ padding: 6 }} />
      <input
        placeholder="Reference number"
        value={referenceNumber}
        onChange={(e) => setReferenceNumber(e.target.value)}
        style={{ padding: 6 }}
      />
      <label style={{ fontSize: 12 }}>
        Expiry date
        <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} style={{ display: "block", padding: 6, width: "100%" }} />
      </label>
      {error && <p style={{ color: "#a33", fontSize: 13, margin: 0 }}>{error}</p>}
      {saved && <p style={{ color: "#0a7a2f", fontSize: 13, margin: 0 }}>Saved.</p>}
      <button type="submit" disabled={submitting} style={{ padding: 8, alignSelf: "flex-start" }}>
        {submitting ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
