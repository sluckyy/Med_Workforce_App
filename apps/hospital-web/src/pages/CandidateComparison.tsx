import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/auth-context.js";
import { apiFetch, ApiError } from "../lib/api.js";

interface Candidate {
  id: string;
  status: string;
  sourceType: string;
  practitioner: { id: string; displayName: string; email: string };
  interestAt: string | null;
  latestAssessment: { status: string; assessedAt: string } | null;
}

const STATUS_COLOR: Record<string, string> = {
  ELIGIBLE: "#0a7a2f",
  INELIGIBLE: "#a33",
  ELIGIBILITY_PENDING: "#a67c00",
  SELECTED: "#0a7a2f",
  APPLIED: "#555",
};

export default function CandidateComparison() {
  const { activeOrgId } = useAuth();
  const [searchParams] = useSearchParams();
  const vacancyId = searchParams.get("vacancyId");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!activeOrgId || !vacancyId) return;
    try {
      const list = await apiFetch<Candidate[]>(`/v1/organisations/${activeOrgId}/vacancies/${vacancyId}/candidates`);
      setCandidates(list);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load candidates.");
    } finally {
      setLoading(false);
    }
  }, [activeOrgId, vacancyId]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function assess(candidateId: string) {
    if (!activeOrgId || !vacancyId) return;
    setBusyId(candidateId);
    try {
      await apiFetch(`/v1/organisations/${activeOrgId}/vacancies/${vacancyId}/candidates/${candidateId}/assess`, {
        method: "POST",
      });
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not assess that candidate.");
    } finally {
      setBusyId(null);
    }
  }

  async function select(candidateId: string) {
    if (!activeOrgId || !vacancyId) return;
    setBusyId(candidateId);
    try {
      await apiFetch(`/v1/organisations/${activeOrgId}/vacancies/${vacancyId}/candidates/${candidateId}/select`, {
        method: "POST",
      });
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not select that candidate.");
    } finally {
      setBusyId(null);
    }
  }

  if (!vacancyId) {
    return <p>Open this page from a vacancy's "View candidates" link in the Vacancy editor.</p>;
  }
  if (loading) return <p>Loading…</p>;

  return (
    <section>
      <h2>Candidate comparison</h2>
      {error && <p style={{ color: "#a33" }}>{error}</p>}
      <ul style={{ listStyle: "none", padding: 0 }}>
        {candidates.map((c) => (
          <li key={c.id} style={{ border: "1px solid #ddd", borderRadius: 6, padding: 10, marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong>{c.practitioner.displayName}</strong>
              <span style={{ fontSize: 12, fontWeight: 600, color: STATUS_COLOR[c.status] ?? "#333" }}>{c.status}</span>
            </div>
            <div style={{ fontSize: 12, color: "#666" }}>{c.practitioner.email}</div>
            <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>
              {c.latestAssessment
                ? `Last assessed: ${c.latestAssessment.status} (${new Date(c.latestAssessment.assessedAt).toLocaleString()})`
                : "Not yet assessed"}
            </div>
            <div style={{ marginTop: 6, display: "flex", gap: 8 }}>
              <button type="button" disabled={busyId === c.id} onClick={() => assess(c.id)} style={{ padding: "4px 8px" }}>
                {busyId === c.id ? "Working…" : "Assess eligibility"}
              </button>
              {c.status === "ELIGIBLE" && (
                <button type="button" disabled={busyId === c.id} onClick={() => select(c.id)} style={{ padding: "4px 8px" }}>
                  Select this candidate
                </button>
              )}
            </div>
          </li>
        ))}
        {candidates.length === 0 && <p style={{ color: "#666" }}>No candidates yet.</p>}
      </ul>
    </section>
  );
}
