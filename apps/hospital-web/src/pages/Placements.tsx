import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../lib/auth-context.js";
import { apiFetch, ApiError } from "../lib/api.js";

interface Placement {
  id: string;
  status: string;
  startDate: string;
  endDate: string | null;
  roleTemplateId: string;
  practitioner: { id: string; displayName: string; email: string };
  bookingCount: number;
}

export default function Placements() {
  const { activeOrgId } = useAuth();
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!activeOrgId) return;
    try {
      const list = await apiFetch<Placement[]>(`/v1/organisations/${activeOrgId}/placements`);
      setPlacements(list);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load placements.");
    } finally {
      setLoading(false);
    }
  }, [activeOrgId]);

  useEffect(() => {
    reload();
  }, [reload]);

  if (!activeOrgId) return <p>Select an organisation from the Dashboard first.</p>;
  if (loading) return <p>Loading…</p>;

  return (
    <section>
      <h2>Placements</h2>
      <p style={{ fontSize: 12, color: "#666" }}>
        An aggregate above individual bookings for non-contiguous block/on-call engagements — e.g. "1 week per month
        for 6 months" of rural generalist coverage (docs/addendum/v0.3-addendum.md §3). Link a booking to one when
        selecting a candidate.
      </p>
      {error && <p style={{ color: "#a33" }}>{error}</p>}
      <ul style={{ listStyle: "none", padding: 0 }}>
        {placements.map((p) => (
          <li key={p.id} style={{ border: "1px solid #ddd", borderRadius: 6, padding: 10, marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong>{p.practitioner.displayName}</strong>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{p.status}</span>
            </div>
            <div style={{ fontSize: 12, color: "#666" }}>{p.practitioner.email}</div>
            <div style={{ fontSize: 12, color: "#888" }}>
              From {new Date(p.startDate).toLocaleDateString()}
              {p.endDate && ` to ${new Date(p.endDate).toLocaleDateString()}`} · {p.bookingCount} booking
              {p.bookingCount === 1 ? "" : "s"} linked
            </div>
          </li>
        ))}
        {placements.length === 0 && <p style={{ color: "#666" }}>None yet.</p>}
      </ul>
      <PlacementForm orgId={activeOrgId} onCreated={reload} />
    </section>
  );
}

function PlacementForm({ orgId, onCreated }: { orgId: string; onCreated: () => Promise<void> }) {
  const [practitionerEmail, setPractitionerEmail] = useState("");
  const [roleTemplateId, setRoleTemplateId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const practitioner = await apiFetch<{ id: string }>(
        `/v1/practitioners?email=${encodeURIComponent(practitionerEmail)}`,
      );
      await apiFetch(`/v1/organisations/${orgId}/placements`, {
        method: "POST",
        body: JSON.stringify({
          practitionerId: practitioner.id,
          roleTemplateId,
          startDate,
          endDate: endDate || undefined,
        }),
      });
      setPractitionerEmail("");
      setRoleTemplateId("");
      setStartDate("");
      setEndDate("");
      await onCreated();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? "No registered practitioner with that email."
          : err instanceof ApiError
            ? err.message
            : "Could not create this placement.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{ border: "1px dashed #bbb", borderRadius: 6, padding: 12, display: "flex", flexDirection: "column", gap: 8, maxWidth: 420 }}
    >
      <strong style={{ fontSize: 14 }}>Create a placement</strong>
      <input
        type="email"
        placeholder="Practitioner's email"
        value={practitionerEmail}
        onChange={(e) => setPractitionerEmail(e.target.value)}
        required
        style={{ padding: 6 }}
      />
      <input
        placeholder="Role template ID (from Vacancy editor)"
        value={roleTemplateId}
        onChange={(e) => setRoleTemplateId(e.target.value)}
        required
        style={{ padding: 6 }}
      />
      <label style={{ fontSize: 12 }}>
        Start date
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required style={{ display: "block", padding: 6, width: "100%" }} />
      </label>
      <label style={{ fontSize: 12 }}>
        End date (optional)
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ display: "block", padding: 6, width: "100%" }} />
      </label>
      {error && <p style={{ color: "#a33", fontSize: 13, margin: 0 }}>{error}</p>}
      <button type="submit" disabled={submitting} style={{ padding: 8, alignSelf: "flex-start" }}>
        {submitting ? "Creating…" : "Create placement"}
      </button>
    </form>
  );
}
