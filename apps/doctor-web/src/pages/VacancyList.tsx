import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch, ApiError } from "../lib/api.js";

export interface AssessedVacancy {
  id: string;
  startAt: string;
  endAt: string;
  deliveryMode: string;
  facility: { name: string };
  roleTemplate: { name: string };
  organisation: { name: string };
  eligibility: { status: string };
  match: { excluded: boolean; preferred: boolean; reasons: string[] };
}

export const ELIGIBILITY_COLOR: Record<string, string> = {
  ELIGIBLE: "#0a7a2f",
  INELIGIBLE: "#a33",
  INDETERMINATE: "#a67c00",
};

export default function VacancyList() {
  const [vacancies, setVacancies] = useState<AssessedVacancy[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showExcluded, setShowExcluded] = useState(false);

  useEffect(() => {
    apiFetch<AssessedVacancy[]>("/v1/practitioners/me/vacancies")
      .then(setVacancies)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load vacancies."));
  }, []);

  if (error) return <p style={{ color: "#a33" }}>{error}</p>;
  if (!vacancies) return <p>Loading…</p>;

  const excluded = vacancies.filter((v) => v.match.excluded);
  const shown = showExcluded ? vacancies : vacancies.filter((v) => !v.match.excluded);

  return (
    <section>
      <h2>Open vacancies</h2>
      <p style={{ fontSize: 12, color: "#666" }}>
        Each one is checked against your passport for that shift. INDETERMINATE means something couldn't be
        confirmed — it is a real answer, not a hidden no or a quiet yes. Your <Link to="/preferences">preferences</Link>{" "}
        only sort and hide; they never change the eligibility answer.
      </p>
      {excluded.length > 0 && (
        <label style={{ fontSize: 12, display: "block", marginBottom: 8 }}>
          <input type="checkbox" checked={showExcluded} onChange={(e) => setShowExcluded(e.target.checked)} /> Show{" "}
          {excluded.length} vacanc{excluded.length === 1 ? "y" : "ies"} hidden by your preferences
        </label>
      )}
      <ul style={{ listStyle: "none", padding: 0 }}>
        {shown.map((v) => (
          <li key={v.id} style={{ border: "1px solid #ddd", borderRadius: 6, padding: 10, marginBottom: 8, opacity: v.match.excluded ? 0.6 : 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
              <Link to={`/vacancy/${v.id}`} style={{ fontWeight: 600 }}>
                {v.roleTemplate.name} · {v.facility.name}
              </Link>
              <span style={{ fontSize: 12, fontWeight: 600, display: "flex", gap: 8 }}>
                {v.match.preferred && <span style={{ color: "#0a7a2f" }}>Preferred</span>}
                {v.match.excluded && <span style={{ color: "#888" }}>Excluded by you</span>}
                <span style={{ color: ELIGIBILITY_COLOR[v.eligibility.status] ?? "#333" }}>{v.eligibility.status}</span>
              </span>
            </div>
            <div style={{ fontSize: 13, color: "#555" }}>
              {new Date(v.startAt).toLocaleString()} – {new Date(v.endAt).toLocaleString()} · {v.organisation.name} ·{" "}
              {v.deliveryMode.replaceAll("_", " ").toLowerCase()}
            </div>
            {v.match.reasons.length > 0 && <div style={{ fontSize: 12, color: "#777", marginTop: 2 }}>{v.match.reasons.join(" · ")}</div>}
          </li>
        ))}
        {shown.length === 0 && <p style={{ color: "#666" }}>{vacancies.length === 0 ? "No open vacancies right now." : "Everything open is hidden by your preferences."}</p>}
      </ul>
    </section>
  );
}
