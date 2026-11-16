import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch, ApiError } from "../lib/api.js";
import { ELIGIBILITY_COLOR } from "./VacancyList.js";

interface VacancyDetailData {
  id: string;
  startAt: string;
  endAt: string;
  deliveryMode: string;
  reasonCode: string | null;
  facility: { name: string };
  roleTemplate: { name: string; code: string };
  organisation: { name: string };
  rateContext: Record<string, unknown> | null;
  travelAccommodation: Record<string, unknown> | null;
  candidateStatus: string | null;
  eligibility: {
    status: string;
    explanation: string | null;
    results: Array<{ requirementId: string; code: string; type: string; hard: boolean; status: string; explanation: string }>;
  };
}

const RESULT_COLOR: Record<string, string> = { PASS: "#0a7a2f", FAIL: "#a33", UNKNOWN: "#a67c00" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr>
      <td style={{ padding: "4px 12px 4px 0", color: "#666", verticalAlign: "top" }}>{label}</td>
      <td>{children}</td>
    </tr>
  );
}

export default function VacancyDetail() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<VacancyDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const reload = useCallback(async () => {
    if (!id) return;
    try {
      setData(await apiFetch<VacancyDetailData>(`/v1/vacancies/${id}`));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404 ? "This vacancy isn't open." : "Could not load this vacancy.");
    }
  }, [id]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function apply() {
    setApplying(true);
    try {
      await apiFetch(`/v1/vacancies/${id}/apply`, { method: "POST" });
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not apply.");
    } finally {
      setApplying(false);
    }
  }

  if (error) return <p style={{ color: "#a33" }}>{error}</p>;
  if (!data) return <p>Loading…</p>;

  const telehealth = data.deliveryMode !== "IN_PERSON";
  const applied = data.candidateStatus !== null && data.candidateStatus !== "DISCOVERED";

  return (
    <section>
      <p>
        <Link to="/vacancy">&larr; All open vacancies</Link>
      </p>
      <h2>{data.roleTemplate.name}</h2>
      <p style={{ color: "#666", fontSize: 13 }}>
        {data.facility.name} · {data.organisation.name}
      </p>

      <table style={{ borderCollapse: "collapse", marginBottom: 20 }}>
        <tbody>
          <Row label="When">
            {new Date(data.startAt).toLocaleString()} – {new Date(data.endAt).toLocaleString()}
          </Row>
          <Row label="Delivery mode">{data.deliveryMode.replaceAll("_", " ").toLowerCase()}</Row>
          {data.reasonCode && <Row label="Reason">{data.reasonCode}</Row>}
          <Row label="Rate / conditions">
            {data.rateContext ? <pre style={{ margin: 0, fontSize: 12 }}>{JSON.stringify(data.rateContext, null, 2)}</pre> : <span style={{ color: "#888" }}>Not provided by the organisation.</span>}
          </Row>
          <Row label={telehealth ? "Telehealth arrangements" : "Travel / accommodation"}>
            {data.travelAccommodation ? <pre style={{ margin: 0, fontSize: 12 }}>{JSON.stringify(data.travelAccommodation, null, 2)}</pre> : <span style={{ color: "#888" }}>Not provided by the organisation.</span>}
          </Row>
        </tbody>
      </table>

      <h3 style={{ fontSize: 15 }}>
        Your eligibility:{" "}
        <span style={{ color: ELIGIBILITY_COLOR[data.eligibility.status] ?? "#333" }}>{data.eligibility.status}</span>
      </h3>
      {data.eligibility.explanation && <p style={{ fontSize: 13, color: "#a67c00" }}>{data.eligibility.explanation}</p>}
      {data.eligibility.results.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, fontSize: 13 }}>
          {data.eligibility.results.map((r) => (
            <li key={r.requirementId} style={{ padding: "5px 0", borderBottom: "1px solid #eee" }}>
              <strong style={{ color: RESULT_COLOR[r.status] ?? "#333" }}>{r.status}</strong> · {r.type.replaceAll("_", " ")}
              {!r.hard && <span style={{ color: "#888" }}> (soft)</span>}
              <div style={{ color: "#555" }}>{r.explanation}</div>
            </li>
          ))}
        </ul>
      )}
      <p style={{ fontSize: 12, color: "#666" }}>
        Assessed just now against your passport, not stored. The organisation runs its own assessment when it
        reviews your application — INDETERMINATE here means a human will need to resolve the gap, not that you are
        out.
      </p>

      {applied ? (
        <p style={{ fontSize: 13, fontWeight: 600 }}>You have applied · status: {data.candidateStatus}</p>
      ) : (
        <button type="button" onClick={apply} disabled={applying} style={{ padding: 8 }}>
          {applying ? "Applying…" : "Express interest / apply"}
        </button>
      )}
    </section>
  );
}
