import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../lib/auth-context.js";
import { apiFetch, ApiError } from "../lib/api.js";

interface Facility {
  id: string;
  code: string;
  name: string;
}

interface AreaOfNeedRow {
  id: string;
  practitioner: { id: string; displayName: string; email: string };
  facility: { id: string; name: string } | null;
  positionRef: string | null;
  classification: string;
  status: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
}

export default function WorkforceAccess() {
  const { activeOrgId } = useAuth();
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [determinations, setDeterminations] = useState<AreaOfNeedRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!activeOrgId) return;
    try {
      const [facs, dets] = await Promise.all([
        apiFetch<Facility[]>(`/v1/organisations/${activeOrgId}/facilities`),
        apiFetch<AreaOfNeedRow[]>(`/v1/organisations/${activeOrgId}/area-of-need`),
      ]);
      setFacilities(facs);
      setDeterminations(dets);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load Workforce Access data.");
    } finally {
      setLoading(false);
    }
  }, [activeOrgId]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function withdraw(id: string) {
    if (!activeOrgId) return;
    try {
      await apiFetch(`/v1/organisations/${activeOrgId}/area-of-need/${id}/withdraw`, { method: "POST" });
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not withdraw that determination.");
    }
  }

  if (!activeOrgId) return <p>Select an organisation from the Dashboard first.</p>;
  if (loading) return <p>Loading…</p>;

  return (
    <section>
      <h2>Workforce Access</h2>
      <p style={{ fontSize: 12, color: "#666" }}>
        Area of Need determinations (facility/position-specific, never portable) and moratorium/DWS status — both
        independent of clinical scope (docs/addendum/v0.3-addendum.md §2).
      </p>
      {error && <p style={{ color: "#a33" }}>{error}</p>}

      <h3 style={{ fontSize: 15 }}>Area of Need determinations</h3>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {determinations.map((d) => (
          <li key={d.id} style={{ border: "1px solid #ddd", borderRadius: 6, padding: 10, marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong>{d.practitioner.displayName}</strong>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{d.status}</span>
            </div>
            <div style={{ fontSize: 12, color: "#666" }}>
              {d.classification} {d.facility && `· ${d.facility.name}`}
            </div>
            {d.status === "ACTIVE" && (
              <button type="button" onClick={() => withdraw(d.id)} style={{ marginTop: 6, padding: "4px 8px" }}>
                Withdraw
              </button>
            )}
          </li>
        ))}
        {determinations.length === 0 && <p style={{ color: "#666" }}>None yet.</p>}
      </ul>
      <AreaOfNeedForm orgId={activeOrgId} facilities={facilities} onCreated={reload} />

      <h3 style={{ marginTop: 32, fontSize: 15 }}>Moratorium / DWS status</h3>
      <MoratoriumLookup orgId={activeOrgId} />
      <MoratoriumForm orgId={activeOrgId} facilities={facilities} />
    </section>
  );
}

function AreaOfNeedForm({
  orgId,
  facilities,
  onCreated,
}: {
  orgId: string;
  facilities: Facility[];
  onCreated: () => Promise<void>;
}) {
  const [practitionerEmail, setPractitionerEmail] = useState("");
  const [facilityId, setFacilityId] = useState("");
  const [classification, setClassification] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const practitioner = await apiFetch<{ id: string }>(`/v1/practitioners?email=${encodeURIComponent(practitionerEmail)}`);
      await apiFetch(`/v1/organisations/${orgId}/area-of-need`, {
        method: "POST",
        body: JSON.stringify({ practitionerId: practitioner.id, facilityId: facilityId || undefined, classification }),
      });
      setPractitionerEmail("");
      setClassification("");
      await onCreated();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? "No registered practitioner with that email."
          : err instanceof ApiError
            ? err.message
            : "Could not issue this determination.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ border: "1px dashed #bbb", borderRadius: 6, padding: 12, display: "flex", flexDirection: "column", gap: 8, maxWidth: 420 }}>
      <strong style={{ fontSize: 14 }}>Issue a determination</strong>
      <input type="email" placeholder="Practitioner's email" value={practitionerEmail} onChange={(e) => setPractitionerEmail(e.target.value)} required style={{ padding: 6 }} />
      <select value={facilityId} onChange={(e) => setFacilityId(e.target.value)} style={{ padding: 6 }}>
        <option value="">No specific facility</option>
        {facilities.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
      <input placeholder="Classification (e.g. District of Workforce Shortage GP)" value={classification} onChange={(e) => setClassification(e.target.value)} required style={{ padding: 6 }} />
      {error && <p style={{ color: "#a33", fontSize: 13, margin: 0 }}>{error}</p>}
      <button type="submit" disabled={submitting} style={{ padding: 8, alignSelf: "flex-start" }}>
        {submitting ? "Issuing…" : "Issue determination"}
      </button>
    </form>
  );
}

function MoratoriumLookup({ orgId }: { orgId: string }) {
  const [email, setEmail] = useState("");
  const [statuses, setStatuses] = useState<Array<{ id: string; facility: { name: string } | null; dwsAreaCode: string | null; restricted: boolean; source: string | null }> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function lookup(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const practitioner = await apiFetch<{ id: string }>(`/v1/practitioners?email=${encodeURIComponent(email)}`);
      const list = await apiFetch<typeof statuses>(`/v1/organisations/${orgId}/moratorium-status?practitionerId=${practitioner.id}`);
      setStatuses(list);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404 ? "No registered practitioner with that email." : "Could not load status.");
      setStatuses(null);
    }
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <form onSubmit={lookup} style={{ display: "flex", gap: 8, maxWidth: 420 }}>
        <input type="email" placeholder="Practitioner's email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ padding: 6, flex: 1 }} />
        <button type="submit" style={{ padding: 6 }}>
          Look up
        </button>
      </form>
      {error && <p style={{ color: "#a33", fontSize: 13 }}>{error}</p>}
      {statuses && (
        <ul style={{ fontSize: 13 }}>
          {statuses.map((s) => (
            <li key={s.id}>
              {s.restricted ? "Restricted" : "Cleared"}
              {s.facility && ` · exception at ${s.facility.name}`}
              {s.dwsAreaCode && ` · DWS area ${s.dwsAreaCode}`}
              {s.source && ` · ${s.source}`}
            </li>
          ))}
          {statuses.length === 0 && <li style={{ listStyle: "none", color: "#666" }}>No moratorium status recorded.</li>}
        </ul>
      )}
    </div>
  );
}

function MoratoriumForm({ orgId, facilities }: { orgId: string; facilities: Facility[] }) {
  const [practitionerEmail, setPractitionerEmail] = useState("");
  const [facilityId, setFacilityId] = useState("");
  const [restricted, setRestricted] = useState(true);
  const [source, setSource] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSaved(false);
    try {
      const practitioner = await apiFetch<{ id: string }>(`/v1/practitioners?email=${encodeURIComponent(practitionerEmail)}`);
      await apiFetch(`/v1/organisations/${orgId}/moratorium-status`, {
        method: "POST",
        body: JSON.stringify({ practitionerId: practitioner.id, facilityId: facilityId || undefined, restricted, source: source || undefined }),
      });
      setSaved(true);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? "No registered practitioner with that email."
          : err instanceof ApiError
            ? err.message
            : "Could not record this status.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ border: "1px dashed #bbb", borderRadius: 6, padding: 12, display: "flex", flexDirection: "column", gap: 8, maxWidth: 420 }}>
      <strong style={{ fontSize: 14 }}>Record a moratorium/DWS status</strong>
      <input type="email" placeholder="Practitioner's email" value={practitionerEmail} onChange={(e) => setPractitionerEmail(e.target.value)} required style={{ padding: 6 }} />
      <label style={{ fontSize: 13 }}>
        <input type="checkbox" checked={restricted} onChange={(e) => setRestricted(e.target.checked)} /> Subject to restriction
      </label>
      <select value={facilityId} onChange={(e) => setFacilityId(e.target.value)} style={{ padding: 6 }}>
        <option value="">No facility exception</option>
        {facilities.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name} (exception)
          </option>
        ))}
      </select>
      <input placeholder="Source (e.g. Department of Health DWS determination)" value={source} onChange={(e) => setSource(e.target.value)} style={{ padding: 6 }} />
      {error && <p style={{ color: "#a33", fontSize: 13, margin: 0 }}>{error}</p>}
      {saved && <p style={{ color: "#0a7a2f", fontSize: 13, margin: 0 }}>Saved.</p>}
      <button type="submit" disabled={submitting} style={{ padding: 8, alignSelf: "flex-start" }}>
        {submitting ? "Recording…" : "Record status"}
      </button>
    </form>
  );
}
