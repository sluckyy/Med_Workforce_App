import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { apiFetch, ApiError } from "../lib/api.js";

interface CredentialSummary {
  id: string;
  definition: { code: string; name: string; category: string };
  issuer: string | null;
  referenceNumber: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  status: string;
  registrationType: string | null;
  version: number;
  evidenceCount: number;
  latestVerification: { result: string; method: string; verifiedAt: string } | null;
}

interface ProceduralEndorsement {
  id: string;
  endorsementType: string;
  awardingBody: string | null;
  awardedAt: string | null;
  currencyStatus: string;
}

interface PassportMe {
  practitioner: { id: string; displayName: string; legalName: string | null; email: string; mobile: string | null; status: string };
  credentials: CredentialSummary[];
  proceduralEndorsements: ProceduralEndorsement[];
}

interface CredentialDefinition {
  code: string;
  name: string;
  category: string;
  validityModel: string;
  sensitivity: string;
}

const SENSITIVE_CATEGORIES = new Set(["IMMIGRATION_WORK_RIGHTS", "ENGLISH_LANGUAGE_TEST"]);

const STATUS_COLOR: Record<string, string> = {
  DECLARED: "#a67c00",
  CURRENT: "#0a7a2f",
  EXPIRED: "#a33",
  SUPERSEDED: "#888",
  REVOKED: "#a33",
};

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : "—";
}

export default function Passport() {
  const [data, setData] = useState<PassportMe | null>(null);
  const [definitions, setDefinitions] = useState<CredentialDefinition[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const [me, defs] = await Promise.all([
        apiFetch<PassportMe>("/v1/passport/me"),
        apiFetch<CredentialDefinition[]>("/v1/passport/credential-definitions"),
      ]);
      setData(me);
      setDefinitions(defs);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load your passport.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  if (loading) return <p>Loading your passport…</p>;
  if (error) return <p style={{ color: "#a33" }}>{error}</p>;
  if (!data) return null;

  const byCategory = new Map<string, CredentialSummary[]>();
  for (const credential of data.credentials) {
    const list = byCategory.get(credential.definition.category) ?? [];
    list.push(credential);
    byCategory.set(credential.definition.category, list);
  }

  return (
    <section>
      <h2>Passport</h2>

      {Array.from(byCategory.entries()).map(([category, credentials]) => (
        <div key={category} style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 15 }}>
            {category.replaceAll("_", " ")}
            {SENSITIVE_CATEGORIES.has(category) && (
              <span
                title="Sensitive evidence — restricted, never shared by default"
                style={{
                  marginLeft: 8,
                  fontSize: 11,
                  color: "#a33",
                  border: "1px solid #a33",
                  borderRadius: 4,
                  padding: "1px 6px",
                }}
              >
                Restricted
              </span>
            )}
          </h3>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {credentials.map((c) => (
              <li
                key={c.id}
                style={{ border: "1px solid #ddd", borderRadius: 6, padding: 10, marginBottom: 8 }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <Link to={`/passport/credential/${c.id}`} style={{ fontWeight: 600 }}>
                    {c.definition.name}
                  </Link>
                  <span style={{ color: STATUS_COLOR[c.status] ?? "#333", fontSize: 12, fontWeight: 600 }}>
                    {c.status}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: "#555" }}>
                  {c.issuer && <span>Issuer: {c.issuer} · </span>}
                  Expires: {formatDate(c.expiryDate)} · {c.evidenceCount} evidence version
                  {c.evidenceCount === 1 ? "" : "s"}
                </div>
                <div style={{ fontSize: 12, color: "#777" }}>
                  {c.latestVerification
                    ? `Last verification: ${c.latestVerification.result} (${c.latestVerification.method}, ${formatDate(c.latestVerification.verifiedAt)})`
                    : "Not yet verified"}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {data.credentials.length === 0 && <p style={{ color: "#666" }}>No credentials declared yet.</p>}

      <DeclareCredentialForm definitions={definitions} onDeclared={reload} />

      <h3 style={{ marginTop: 32 }}>Rural generalist procedural endorsements</h3>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {data.proceduralEndorsements.map((e) => (
          <li key={e.id} style={{ border: "1px solid #ddd", borderRadius: 6, padding: 10, marginBottom: 8 }}>
            <div style={{ fontWeight: 600 }}>{e.endorsementType.replaceAll("_", " ")}</div>
            <div style={{ fontSize: 13, color: "#555" }}>
              {e.awardingBody && <span>{e.awardingBody} · </span>}
              Awarded {formatDate(e.awardedAt)} · {e.currencyStatus}
            </div>
          </li>
        ))}
        {data.proceduralEndorsements.length === 0 && (
          <p style={{ color: "#666" }}>No procedural endorsements declared yet.</p>
        )}
      </ul>
      <DeclareEndorsementForm onDeclared={reload} />
    </section>
  );
}

function DeclareCredentialForm({
  definitions,
  onDeclared,
}: {
  definitions: CredentialDefinition[];
  onDeclared: () => Promise<void>;
}) {
  const [definitionCode, setDefinitionCode] = useState("");
  const [issuer, setIssuer] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!definitionCode) {
      setError("Choose a credential type.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch("/v1/passport/credentials", {
        method: "POST",
        body: JSON.stringify({
          definitionCode,
          issuer: issuer || undefined,
          referenceNumber: referenceNumber || undefined,
          issueDate: issueDate || undefined,
          expiryDate: expiryDate || undefined,
        }),
      });
      setDefinitionCode("");
      setIssuer("");
      setReferenceNumber("");
      setIssueDate("");
      setExpiryDate("");
      await onDeclared();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add that credential.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{ border: "1px dashed #bbb", borderRadius: 6, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}
    >
      <strong style={{ fontSize: 14 }}>Add a credential claim</strong>
      {definitions.length === 0 ? (
        <p style={{ fontSize: 12, color: "#666" }}>
          No credential types are available yet — reference data hasn't been loaded.
        </p>
      ) : (
        <>
          <select value={definitionCode} onChange={(e) => setDefinitionCode(e.target.value)} style={{ padding: 6 }}>
            <option value="">Select a credential type…</option>
            {definitions.map((d) => (
              <option key={d.code} value={d.code}>
                {d.name}
              </option>
            ))}
          </select>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input placeholder="Issuer" value={issuer} onChange={(e) => setIssuer(e.target.value)} style={{ padding: 6, flex: 1 }} />
            <input
              placeholder="Reference number"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              style={{ padding: 6, flex: 1 }}
            />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <label style={{ fontSize: 12, flex: 1 }}>
              Issue date
              <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} style={{ display: "block", padding: 6, width: "100%" }} />
            </label>
            <label style={{ fontSize: 12, flex: 1 }}>
              Expiry date
              <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} style={{ display: "block", padding: 6, width: "100%" }} />
            </label>
          </div>
          {error && <p style={{ color: "#a33", fontSize: 13, margin: 0 }}>{error}</p>}
          <button type="submit" disabled={submitting} style={{ padding: 8, alignSelf: "flex-start" }}>
            {submitting ? "Adding…" : "Add credential"}
          </button>
        </>
      )}
    </form>
  );
}

const ENDORSEMENT_TYPES = [
  "ANAESTHETICS",
  "OBSTETRICS",
  "OBSTETRICS_SURGICAL",
  "SURGERY",
  "EMERGENCY_MEDICINE",
  "MENTAL_HEALTH",
  "ADULT_INTERNAL_MEDICINE",
  "PAEDIATRICS",
  "INDIGENOUS_HEALTH",
];

function DeclareEndorsementForm({ onDeclared }: { onDeclared: () => Promise<void> }) {
  const [endorsementType, setEndorsementType] = useState("");
  const [awardingBody, setAwardingBody] = useState("");
  const [awardedAt, setAwardedAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!endorsementType) {
      setError("Choose an endorsement type.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch("/v1/passport/procedural-endorsements", {
        method: "POST",
        body: JSON.stringify({
          endorsementType,
          awardingBody: awardingBody || undefined,
          awardedAt: awardedAt || undefined,
        }),
      });
      setEndorsementType("");
      setAwardingBody("");
      setAwardedAt("");
      await onDeclared();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add that endorsement.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{ border: "1px dashed #bbb", borderRadius: 6, padding: 12, marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}
    >
      <strong style={{ fontSize: 14 }}>Add a procedural endorsement</strong>
      <select value={endorsementType} onChange={(e) => setEndorsementType(e.target.value)} style={{ padding: 6 }}>
        <option value="">Select a type…</option>
        {ENDORSEMENT_TYPES.map((t) => (
          <option key={t} value={t}>
            {t.replaceAll("_", " ")}
          </option>
        ))}
      </select>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          placeholder="Awarding body"
          value={awardingBody}
          onChange={(e) => setAwardingBody(e.target.value)}
          style={{ padding: 6, flex: 1 }}
        />
        <input type="date" value={awardedAt} onChange={(e) => setAwardedAt(e.target.value)} style={{ padding: 6, flex: 1 }} />
      </div>
      {error && <p style={{ color: "#a33", fontSize: 13, margin: 0 }}>{error}</p>}
      <button type="submit" disabled={submitting} style={{ padding: 8, alignSelf: "flex-start" }}>
        {submitting ? "Adding…" : "Add endorsement"}
      </button>
    </form>
  );
}
