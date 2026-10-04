import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiError } from "../lib/api.js";

interface AgencyVacancy {
  id: string;
  status: string;
  startAt: string;
  endAt: string;
  deliveryMode: string;
  organisation: { id: string; name: string };
  facility: { id: string; name: string };
  roleTemplate: { id: string; code: string; name: string };
}

interface AgencyProposal {
  id: string;
  status: string;
  submittedAt: string;
  representedIdentity: { email: string; displayName: string | null } | null;
  rateFeeSnapshot: { feeModel: string; terms: Record<string, unknown> } | null;
  candidateStatus: string;
  vacancy: { id: string; status: string; startAt: string; endAt: string; facility: string; roleTemplate: string };
}

export default function AgencyPortal() {
  const [vacancies, setVacancies] = useState<AgencyVacancy[]>([]);
  const [proposals, setProposals] = useState<AgencyProposal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [vacancyList, proposalList] = await Promise.all([
        apiFetch<AgencyVacancy[]>("/v1/commercial/agency/vacancies"),
        apiFetch<AgencyProposal[]>("/v1/commercial/agency/proposals"),
      ]);
      setVacancies(vacancyList);
      setProposals(proposalList);
      setError(null);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not load agency data. This page needs an AGENCY_USER role at an organisation on the panel.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function withdraw(proposalId: string) {
    setBusyId(proposalId);
    try {
      await apiFetch(`/v1/commercial/agency/proposals/${proposalId}/withdraw`, { method: "POST" });
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not withdraw that proposal.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <p>Loading…</p>;

  return (
    <section>
      <h2>Agency portal</h2>
      {error && <p style={{ color: "#a33" }}>{error}</p>}

      <h3 style={{ fontSize: 15 }}>Vacancies open for sourcing</h3>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {vacancies.map((v) => (
          <li key={v.id} style={{ border: "1px solid #ddd", borderRadius: 6, padding: 10, marginBottom: 8, fontSize: 13 }}>
            <strong>
              {v.roleTemplate.name} @ {v.facility.name}
            </strong>{" "}
            ({v.organisation.name})
            <div style={{ color: "#666" }}>
              {new Date(v.startAt).toLocaleString()} – {new Date(v.endAt).toLocaleString()} · {v.deliveryMode}
            </div>
          </li>
        ))}
        {vacancies.length === 0 && <p style={{ color: "#666" }}>Nothing open for sourcing right now.</p>}
      </ul>
      <SubmitProposalForm vacancies={vacancies} onSubmitted={reload} />

      <h3 style={{ marginTop: 32, fontSize: 15 }}>Our proposals</h3>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {proposals.map((p) => (
          <li key={p.id} style={{ border: "1px solid #ddd", borderRadius: 6, padding: 10, marginBottom: 8, fontSize: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong>{p.representedIdentity?.displayName ?? p.representedIdentity?.email}</strong>
              <span style={{ fontWeight: 600 }}>{p.status}</span>
            </div>
            <div style={{ color: "#666" }}>
              {p.vacancy.roleTemplate} @ {p.vacancy.facility} ·{" "}
              {new Date(p.vacancy.startAt).toLocaleDateString()}
            </div>
            {p.rateFeeSnapshot && (
              <div style={{ color: "#888", fontSize: 12 }}>
                {p.rateFeeSnapshot.feeModel}: {JSON.stringify(p.rateFeeSnapshot.terms)}
              </div>
            )}
            {p.status === "SUBMITTED" && (
              <button
                type="button"
                disabled={busyId === p.id}
                onClick={() => withdraw(p.id)}
                style={{ marginTop: 6, padding: "4px 8px" }}
              >
                {busyId === p.id ? "Withdrawing…" : "Withdraw"}
              </button>
            )}
          </li>
        ))}
        {proposals.length === 0 && <p style={{ color: "#666" }}>No proposals submitted yet.</p>}
      </ul>
    </section>
  );
}

function SubmitProposalForm({
  vacancies,
  onSubmitted,
}: {
  vacancies: AgencyVacancy[];
  onSubmitted: () => Promise<void>;
}) {
  const [vacancyId, setVacancyId] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch("/v1/commercial/agency/proposals", {
        method: "POST",
        body: JSON.stringify({ vacancyId, email }),
      });
      setEmail("");
      await onSubmitted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not submit this candidate.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{ border: "1px dashed #bbb", borderRadius: 6, padding: 12, display: "flex", flexDirection: "column", gap: 8, maxWidth: 420 }}
    >
      <strong style={{ fontSize: 14 }}>Submit a candidate</strong>
      <p style={{ fontSize: 12, color: "#666", margin: 0 }}>
        The candidate must already be a registered practitioner on the platform.
      </p>
      <select value={vacancyId} onChange={(e) => setVacancyId(e.target.value)} required style={{ padding: 6 }}>
        <option value="">Select a vacancy…</option>
        {vacancies.map((v) => (
          <option key={v.id} value={v.id}>
            {v.roleTemplate.name} @ {v.facility.name} ({v.organisation.name})
          </option>
        ))}
      </select>
      <input
        type="email"
        placeholder="Candidate's email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        style={{ padding: 6 }}
      />
      {error && <p style={{ color: "#a33", fontSize: 13, margin: 0 }}>{error}</p>}
      <button type="submit" disabled={submitting || vacancies.length === 0} style={{ padding: 8, alignSelf: "flex-start" }}>
        {submitting ? "Submitting…" : "Submit candidate"}
      </button>
    </form>
  );
}
