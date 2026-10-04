import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth-context.js";
import { apiFetch, ApiError } from "../lib/api.js";

interface RoleTemplate {
  id: string;
  code: string;
  name: string;
  status: string;
  defaultRequirementSetId: string | null;
}

interface Facility {
  id: string;
  code: string;
  name: string;
}

interface Vacancy {
  id: string;
  status: string;
  startAt: string;
  endAt: string;
  deliveryMode: string;
  facility: { id: string; name: string };
  roleTemplate: { id: string; code: string; name: string };
}

const EVALUATOR_OPTIONS = [
  { value: "activeScopeAtFacility", type: "ACTIVE_SCOPE", label: "Active scope grant for a role/activity code", paramKey: "roleActivityCode", paramLabel: "Role/activity code (e.g. ED_SENIOR)" },
  { value: "registrationCurrent", type: "REGISTRATION", label: "Registration current (credential code)", paramKey: "definitionCode", paramLabel: "Credential code (e.g. REG_AHPRA_MEDICAL)" },
  { value: "credentialCurrent", type: "CREDENTIAL", label: "Credential/training current (credential code)", paramKey: "definitionCode", paramLabel: "Credential code (e.g. TRAINING_ALS)" },
  { value: "credentialCurrent", type: "VISA_WORK_RIGHTS", label: "Visa work rights current", paramKey: "definitionCode", paramLabel: "Credential code", paramDefault: "IMMIGRATION_WORK_RIGHTS_VISA" },
  { value: "areaOfNeedCurrent", type: "AREA_OF_NEED", label: "Area of Need determination at facility", paramKey: "facilityId", paramLabel: "Facility" },
  { value: "moratoriumLocationClear", type: "MORATORIUM_LOCATION", label: "Not blocked by moratorium/DWS status at facility", paramKey: "facilityId", paramLabel: "Facility" },
];

export default function VacancyEditor() {
  const { activeOrgId } = useAuth();
  const [roleTemplates, setRoleTemplates] = useState<RoleTemplate[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [vacancies, setVacancies] = useState<Vacancy[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!activeOrgId) return;
    try {
      const [rts, facs, vacs] = await Promise.all([
        apiFetch<RoleTemplate[]>(`/v1/organisations/${activeOrgId}/role-templates`),
        apiFetch<Facility[]>(`/v1/organisations/${activeOrgId}/facilities`),
        apiFetch<Vacancy[]>(`/v1/organisations/${activeOrgId}/vacancies`),
      ]);
      setRoleTemplates(rts);
      setFacilities(facs);
      setVacancies(vacs);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load vacancy data.");
    } finally {
      setLoading(false);
    }
  }, [activeOrgId]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function transitionVacancy(id: string, action: "approve" | "open-for-candidates") {
    try {
      await apiFetch(`/v1/organisations/${activeOrgId}/vacancies/${id}/${action}`, { method: "POST" });
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update that vacancy.");
    }
  }

  if (!activeOrgId) return <p>Select an organisation from the Dashboard first.</p>;
  if (loading) return <p>Loading…</p>;

  return (
    <section>
      <h2>Vacancy editor</h2>
      {error && <p style={{ color: "#a33" }}>{error}</p>}

      <h3 style={{ fontSize: 15 }}>Role templates</h3>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {roleTemplates.map((rt) => (
          <li key={rt.id} style={{ border: "1px solid #ddd", borderRadius: 6, padding: 10, marginBottom: 8 }}>
            <strong>{rt.name}</strong> ({rt.code}) — {rt.defaultRequirementSetId ? "published" : "no requirement set yet"}
          </li>
        ))}
        {roleTemplates.length === 0 && <p style={{ color: "#666" }}>None yet.</p>}
      </ul>
      <RoleTemplateForm orgId={activeOrgId} facilities={facilities} onCreated={reload} />

      <h3 style={{ marginTop: 32, fontSize: 15 }}>Vacancies</h3>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {vacancies.map((v) => (
          <li key={v.id} style={{ border: "1px solid #ddd", borderRadius: 6, padding: 10, marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong>
                {v.roleTemplate.name} @ {v.facility.name}
              </strong>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{v.status}</span>
            </div>
            <div style={{ fontSize: 12, color: "#666" }}>
              {new Date(v.startAt).toLocaleString()} – {new Date(v.endAt).toLocaleString()} · {v.deliveryMode}
            </div>
            <div style={{ marginTop: 6, display: "flex", gap: 8 }}>
              {v.status === "DRAFT" && (
                <button type="button" onClick={() => transitionVacancy(v.id, "approve")} style={{ padding: "4px 8px" }}>
                  Approve
                </button>
              )}
              {v.status === "APPROVED" && (
                <button type="button" onClick={() => transitionVacancy(v.id, "open-for-candidates")} style={{ padding: "4px 8px" }}>
                  Open for candidates
                </button>
              )}
              <Link to={`/candidates?vacancyId=${v.id}`} style={{ fontSize: 13, alignSelf: "center" }}>
                View candidates →
              </Link>
              <Link to={`/agency-proposals?vacancyId=${v.id}`} style={{ fontSize: 13, alignSelf: "center" }}>
                Agency proposals →
              </Link>
            </div>
          </li>
        ))}
        {vacancies.length === 0 && <p style={{ color: "#666" }}>None yet.</p>}
      </ul>
      <VacancyForm orgId={activeOrgId} roleTemplates={roleTemplates.filter((rt) => rt.defaultRequirementSetId)} facilities={facilities} onCreated={reload} />
    </section>
  );
}

function RoleTemplateForm({
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
  const [evaluatorIndex, setEvaluatorIndex] = useState(0);
  const [paramValue, setParamValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentEvaluator = EVALUATOR_OPTIONS[evaluatorIndex];

  function selectEvaluator(index: number) {
    setEvaluatorIndex(index);
    setParamValue(EVALUATOR_OPTIONS[index].paramDefault ?? "");
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const evaluator = EVALUATOR_OPTIONS[evaluatorIndex];
    try {
      const rt = await apiFetch<{ id: string }>(`/v1/organisations/${orgId}/role-templates`, {
        method: "POST",
        body: JSON.stringify({ code, name }),
      });
      const rs = await apiFetch<{ id: string }>(`/v1/organisations/${orgId}/role-templates/${rt.id}/requirement-sets`, {
        method: "POST",
        body: JSON.stringify({
          requirements: [
            {
              code: evaluator.paramKey.toUpperCase(),
              type: evaluator.type,
              hard: true,
              evaluator: evaluator.value,
              parameters: { [evaluator.paramKey]: paramValue },
            },
          ],
        }),
      });
      await apiFetch(`/v1/organisations/${orgId}/role-templates/${rt.id}/requirement-sets/${rs.id}/publish`, {
        method: "POST",
      });
      setCode("");
      setName("");
      setParamValue("");
      await onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create role template.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{ border: "1px dashed #bbb", borderRadius: 6, padding: 12, display: "flex", flexDirection: "column", gap: 8, maxWidth: 420 }}
    >
      <strong style={{ fontSize: 14 }}>Create a role template</strong>
      <p style={{ fontSize: 12, color: "#666", margin: 0 }}>
        Starts with one requirement and publishes immediately — enough to open a vacancy.
        Add more requirements later via the API if needed.
      </p>
      <input placeholder="Code (e.g. ED_SENIOR)" value={code} onChange={(e) => setCode(e.target.value)} required style={{ padding: 6 }} />
      <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required style={{ padding: 6 }} />
      <select value={evaluatorIndex} onChange={(e) => selectEvaluator(Number(e.target.value))} style={{ padding: 6 }}>
        {EVALUATOR_OPTIONS.map((opt, i) => (
          <option key={`${opt.value}-${opt.type}`} value={i}>
            {opt.label}
          </option>
        ))}
      </select>
      {currentEvaluator.paramKey === "facilityId" ? (
        <select value={paramValue} onChange={(e) => setParamValue(e.target.value)} required style={{ padding: 6 }}>
          <option value="">Select a facility…</option>
          {facilities.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      ) : (
        <input
          placeholder={currentEvaluator.paramLabel}
          value={paramValue}
          onChange={(e) => setParamValue(e.target.value)}
          required
          style={{ padding: 6 }}
        />
      )}
      {error && <p style={{ color: "#a33", fontSize: 13, margin: 0 }}>{error}</p>}
      <button type="submit" disabled={submitting} style={{ padding: 8, alignSelf: "flex-start" }}>
        {submitting ? "Creating…" : "Create and publish"}
      </button>
    </form>
  );
}

function VacancyForm({
  orgId,
  roleTemplates,
  facilities,
  onCreated,
}: {
  orgId: string;
  roleTemplates: RoleTemplate[];
  facilities: Facility[];
  onCreated: () => Promise<void>;
}) {
  const [roleTemplateId, setRoleTemplateId] = useState("");
  const [facilityId, setFacilityId] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/v1/organisations/${orgId}/vacancies`, {
        method: "POST",
        body: JSON.stringify({ roleTemplateId, facilityId, startAt, endAt }),
      });
      setStartAt("");
      setEndAt("");
      await onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create vacancy.");
    } finally {
      setSubmitting(false);
    }
  }

  const disabled = roleTemplates.length === 0 || facilities.length === 0;

  return (
    <form
      onSubmit={onSubmit}
      style={{ border: "1px dashed #bbb", borderRadius: 6, padding: 12, marginTop: 8, display: "flex", flexDirection: "column", gap: 8, maxWidth: 420 }}
    >
      <strong style={{ fontSize: 14 }}>Create a vacancy</strong>
      {disabled && (
        <p style={{ fontSize: 12, color: "#666", margin: 0 }}>
          Needs at least one published role template and one facility first.
        </p>
      )}
      <select value={roleTemplateId} onChange={(e) => setRoleTemplateId(e.target.value)} required style={{ padding: 6 }}>
        <option value="">Select a role template…</option>
        {roleTemplates.map((rt) => (
          <option key={rt.id} value={rt.id}>
            {rt.name}
          </option>
        ))}
      </select>
      <select value={facilityId} onChange={(e) => setFacilityId(e.target.value)} required style={{ padding: 6 }}>
        <option value="">Select a facility…</option>
        {facilities.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
      <label style={{ fontSize: 12 }}>
        Start
        <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} required style={{ display: "block", padding: 6, width: "100%" }} />
      </label>
      <label style={{ fontSize: 12 }}>
        End
        <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} required style={{ display: "block", padding: 6, width: "100%" }} />
      </label>
      {error && <p style={{ color: "#a33", fontSize: 13, margin: 0 }}>{error}</p>}
      <button type="submit" disabled={submitting || disabled} style={{ padding: 8, alignSelf: "flex-start" }}>
        {submitting ? "Creating…" : "Create vacancy"}
      </button>
    </form>
  );
}
