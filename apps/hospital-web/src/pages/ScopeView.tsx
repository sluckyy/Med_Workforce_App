import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../lib/auth-context.js";
import { apiFetch, ApiError } from "../lib/api.js";

interface Facility {
  id: string;
  code: string;
  name: string;
}

interface ScopeGrant {
  id: string;
  practitionerId: string;
  roleActivityCode: string;
  status: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  facilities: { facilityId: string }[];
}

export default function ScopeView() {
  const { activeOrgId } = useAuth();
  const [grants, setGrants] = useState<ScopeGrant[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!activeOrgId) return;
    try {
      const [grantList, facilityList] = await Promise.all([
        apiFetch<ScopeGrant[]>(`/v1/organisations/${activeOrgId}/scope-grants`),
        apiFetch<Facility[]>(`/v1/organisations/${activeOrgId}/facilities`),
      ]);
      setGrants(grantList);
      setFacilities(facilityList);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load scope grants.");
    } finally {
      setLoading(false);
    }
  }, [activeOrgId]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function transition(id: string, action: "suspend" | "withdraw") {
    try {
      await apiFetch(`/v1/organisations/${activeOrgId}/scope-grants/${id}/${action}`, { method: "POST" });
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Could not ${action} that grant.`);
    }
  }

  if (!activeOrgId) return <p>Select an organisation from the Dashboard first.</p>;
  if (loading) return <p>Loading…</p>;

  return (
    <section>
      <h2>Credential / scope view</h2>
      <p style={{ fontSize: 12, color: "#666" }}>
        Never editable by the practitioner — this organisation's own authority decision
        (docs/spec/01-technical-architecture-data-model-v0.2.docx §11-13).
      </p>
      {error && <p style={{ color: "#a33" }}>{error}</p>}

      <ul style={{ listStyle: "none", padding: 0 }}>
        {grants.map((g) => (
          <li key={g.id} style={{ border: "1px solid #ddd", borderRadius: 6, padding: 10, marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong>{g.roleActivityCode}</strong>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{g.status}</span>
            </div>
            <div style={{ fontSize: 12, color: "#666" }}>
              Practitioner: {g.practitionerId} · Facilities: {g.facilities.map((f) => f.facilityId).join(", ") || "—"}
            </div>
            {g.status === "ACTIVE" && (
              <div style={{ marginTop: 6, display: "flex", gap: 8 }}>
                <button type="button" onClick={() => transition(g.id, "suspend")} style={{ padding: "4px 8px" }}>
                  Suspend
                </button>
                <button type="button" onClick={() => transition(g.id, "withdraw")} style={{ padding: "4px 8px" }}>
                  Withdraw
                </button>
              </div>
            )}
            {g.status === "SUSPENDED" && (
              <div style={{ marginTop: 6 }}>
                <button type="button" onClick={() => transition(g.id, "withdraw")} style={{ padding: "4px 8px" }}>
                  Withdraw
                </button>
              </div>
            )}
          </li>
        ))}
        {grants.length === 0 && <p style={{ color: "#666" }}>No scope grants issued yet.</p>}
      </ul>

      <FacilitiesPanel orgId={activeOrgId} facilities={facilities} onCreated={reload} />
      <IssueGrantForm orgId={activeOrgId} facilities={facilities} onIssued={reload} setError={setError} />
    </section>
  );
}

function FacilitiesPanel({
  orgId,
  facilities,
  onCreated,
}: {
  orgId: string;
  facilities: Facility[];
  onCreated: () => Promise<void>;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/v1/organisations/${orgId}/facilities`, {
        method: "POST",
        body: JSON.stringify({ code, name }),
      });
      setCode("");
      setName("");
      await onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create facility.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ marginTop: 24, border: "1px dashed #bbb", borderRadius: 6, padding: 12 }}>
      <strong style={{ fontSize: 14 }}>Facilities</strong>
      <ul style={{ fontSize: 13, marginTop: 6 }}>
        {facilities.map((f) => (
          <li key={f.id}>
            {f.name} ({f.code})
          </li>
        ))}
        {facilities.length === 0 && <li style={{ color: "#666", listStyle: "none" }}>None yet.</li>}
      </ul>
      <form onSubmit={onSubmit} style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <input placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} style={{ padding: 6, width: 100 }} />
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} style={{ padding: 6, flex: 1 }} />
        <button type="submit" disabled={submitting} style={{ padding: "6px 12px" }}>
          Add
        </button>
      </form>
      {error && <p style={{ color: "#a33", fontSize: 13 }}>{error}</p>}
    </div>
  );
}

function IssueGrantForm({
  orgId,
  facilities,
  onIssued,
  setError,
}: {
  orgId: string;
  facilities: Facility[];
  onIssued: () => Promise<void>;
  setError: (e: string | null) => void;
}) {
  const [email, setEmail] = useState("");
  const [roleActivityCode, setRoleActivityCode] = useState("");
  const [facilityId, setFacilityId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lookupResult, setLookupResult] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setLookupResult(null);
    try {
      const practitioner = await apiFetch<{ id: string; displayName: string }>(
        `/v1/practitioners?email=${encodeURIComponent(email)}`,
      );
      await apiFetch(`/v1/organisations/${orgId}/scope-grants`, {
        method: "POST",
        body: JSON.stringify({
          practitionerId: practitioner.id,
          roleActivityCode,
          facilityIds: [facilityId],
        }),
      });
      setLookupResult(`Issued to ${practitioner.displayName}.`);
      setEmail("");
      setRoleActivityCode("");
      await onIssued();
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError(`No practitioner found with email ${email}.`);
      } else {
        setError(err instanceof ApiError ? err.message : "Could not issue scope grant.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{ marginTop: 16, border: "1px dashed #bbb", borderRadius: 6, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}
    >
      <strong style={{ fontSize: 14 }}>Issue a scope grant</strong>
      <input
        type="email"
        placeholder="Practitioner email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        style={{ padding: 6 }}
      />
      <input
        placeholder="Role/activity code (e.g. ED_SENIOR)"
        value={roleActivityCode}
        onChange={(e) => setRoleActivityCode(e.target.value)}
        required
        style={{ padding: 6 }}
      />
      <select value={facilityId} onChange={(e) => setFacilityId(e.target.value)} required style={{ padding: 6 }}>
        <option value="">Select a facility…</option>
        {facilities.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
      {lookupResult && <p style={{ color: "#0a7a2f", fontSize: 13, margin: 0 }}>{lookupResult}</p>}
      <button type="submit" disabled={submitting || facilities.length === 0} style={{ padding: 8, alignSelf: "flex-start" }}>
        {submitting ? "Issuing…" : "Issue grant"}
      </button>
      {facilities.length === 0 && (
        <p style={{ fontSize: 12, color: "#666", margin: 0 }}>Add a facility above first.</p>
      )}
    </form>
  );
}
