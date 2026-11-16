import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch, ApiError } from "../lib/api.js";

interface AssessedVacancy {
  id: string;
  startAt: string;
  endAt: string;
  deliveryMode: string;
  facility: { name: string };
  roleTemplate: { name: string };
  organisation: { name: string };
  eligibility: { status: string };
}

export const ELIGIBILITY_COLOR: Record<string, string> = {
  ELIGIBLE: "#0a7a2f",
  INELIGIBLE: "#a33",
  INDETERMINATE: "#a67c00",
};

export default function VacancyList() {
  const [vacancies, setVacancies] = useState<AssessedVacancy[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<AssessedVacancy[]>("/v1/practitioners/me/vacancies")
      .then(setVacancies)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load vacancies."));
  }, []);

  if (error) return <p style={{ color: "#a33" }}>{error}</p>;
  if (!vacancies) return <p>Loading…</p>;

  return (
    <section>
      <h2>Open vacancies</h2>
      <p style={{ fontSize: 12, color: "#666" }}>
        Each one is checked against your passport for that shift. INDETERMINATE means something couldn't be
        confirmed — it is a real answer, not a hidden no or a quiet yes.
      </p>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {vacancies.map((v) => (
          <li key={v.id} style={{ border: "1px solid #ddd", borderRadius: 6, padding: 10, marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
              <Link to={`/vacancy/${v.id}`} style={{ fontWeight: 600 }}>
                {v.roleTemplate.name} · {v.facility.name}
              </Link>
              <span style={{ color: ELIGIBILITY_COLOR[v.eligibility.status] ?? "#333", fontSize: 12, fontWeight: 600 }}>
                {v.eligibility.status}
              </span>
            </div>
            <div style={{ fontSize: 13, color: "#555" }}>
              {new Date(v.startAt).toLocaleString()} – {new Date(v.endAt).toLocaleString()} · {v.organisation.name} ·{" "}
              {v.deliveryMode.replaceAll("_", " ").toLowerCase()}
            </div>
          </li>
        ))}
        {vacancies.length === 0 && <p style={{ color: "#666" }}>No open vacancies right now.</p>}
      </ul>
    </section>
  );
}
