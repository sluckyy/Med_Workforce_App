import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/auth-context.js";
import { apiFetch, ApiError } from "../lib/api.js";

interface StaffAgencyProposal {
  id: string;
  status: string;
  submittedAt: string;
  candidateId: string;
  candidateStatus: string;
  agencyName: string;
  representedIdentity: { email: string; displayName: string | null } | null;
  rateFeeSnapshot: { feeModel: string; terms: Record<string, unknown> } | null;
}

export default function AgencyProposals() {
  const { activeOrgId } = useAuth();
  const [searchParams] = useSearchParams();
  const vacancyId = searchParams.get("vacancyId");
  const [proposals, setProposals] = useState<StaffAgencyProposal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!activeOrgId || !vacancyId) return;
    try {
      const list = await apiFetch<StaffAgencyProposal[]>(
        `/v1/organisations/${activeOrgId}/vacancies/${vacancyId}/agency-proposals`,
      );
      setProposals(list);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load agency proposals.");
    } finally {
      setLoading(false);
    }
  }, [activeOrgId, vacancyId]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function decline(proposalId: string) {
    if (!activeOrgId || !vacancyId) return;
    setBusyId(proposalId);
    try {
      await apiFetch(
        `/v1/organisations/${activeOrgId}/vacancies/${vacancyId}/agency-proposals/${proposalId}/decline`,
        { method: "POST" },
      );
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not decline that proposal.");
    } finally {
      setBusyId(null);
    }
  }

  if (!vacancyId) {
    return <p>Open this page from a vacancy's "Agency proposals" link in the Vacancy editor.</p>;
  }
  if (loading) return <p>Loading…</p>;

  return (
    <section>
      <h2>Agency proposals</h2>
      <p style={{ fontSize: 12, color: "#666" }}>
        To accept a proposal, assess and select the same candidate from the Candidate comparison page — that's what
        snapshots the agency's commercial terms onto the resulting booking.
      </p>
      {error && <p style={{ color: "#a33" }}>{error}</p>}
      <ul style={{ listStyle: "none", padding: 0 }}>
        {proposals.map((p) => (
          <li key={p.id} style={{ border: "1px solid #ddd", borderRadius: 6, padding: 10, marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong>{p.representedIdentity?.displayName ?? p.representedIdentity?.email}</strong>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{p.status}</span>
            </div>
            <div style={{ fontSize: 12, color: "#666" }}>Via {p.agencyName}</div>
            <div style={{ fontSize: 12, color: "#888" }}>Candidate status: {p.candidateStatus}</div>
            {p.rateFeeSnapshot && (
              <div style={{ fontSize: 12, color: "#888" }}>
                {p.rateFeeSnapshot.feeModel}: {JSON.stringify(p.rateFeeSnapshot.terms)}
              </div>
            )}
            {p.status === "SUBMITTED" && (
              <button
                type="button"
                disabled={busyId === p.id}
                onClick={() => decline(p.id)}
                style={{ marginTop: 6, padding: "4px 8px" }}
              >
                {busyId === p.id ? "Declining…" : "Decline"}
              </button>
            )}
          </li>
        ))}
        {proposals.length === 0 && <p style={{ color: "#666" }}>No agency proposals for this vacancy yet.</p>}
      </ul>
    </section>
  );
}
