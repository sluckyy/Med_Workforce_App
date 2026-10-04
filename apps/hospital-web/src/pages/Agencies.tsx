import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiError } from "../lib/api.js";

interface Agency {
  id: string;
  organisationId: string;
  organisationName: string;
  panelStatus: string;
  categories: string[] | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
}

interface Agreement {
  id: string;
  category: string | null;
  feeModel: string;
  termsJson: Record<string, unknown>;
  effectiveFrom: string | null;
  effectiveTo: string | null;
}

const PANEL_STATUSES = ["ELIGIBLE", "SUSPENDED", "EXPIRED", "INELIGIBLE"];
const FEE_MODELS = ["PERCENT", "FIXED", "MARKUP", "OTHER"];

export default function Agencies() {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [selected, setSelected] = useState<Agency | null>(null);
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const list = await apiFetch<Agency[]>("/v1/commercial/agencies");
      setAgencies(list);
      setError(null);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not load the agency panel. This page needs a PROCUREMENT or FINANCE role.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function openAgency(agency: Agency) {
    setSelected(agency);
    try {
      const list = await apiFetch<Agreement[]>(`/v1/commercial/agencies/${agency.id}/agreements`);
      setAgreements(list);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load this agency's agreements.");
    }
  }

  async function setPanelStatus(agencyId: string, panelStatus: string) {
    try {
      await apiFetch(`/v1/commercial/agencies/${agencyId}`, {
        method: "PATCH",
        body: JSON.stringify({ panelStatus }),
      });
      await reload();
      if (selected?.id === agencyId) setSelected((s) => (s ? { ...s, panelStatus } : s));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update panel status.");
    }
  }

  if (loading) return <p>Loading…</p>;

  if (selected) {
    return (
      <section>
        <button
          type="button"
          onClick={() => setSelected(null)}
          style={{ background: "none", border: "none", textDecoration: "underline", cursor: "pointer", padding: 0, marginBottom: 12 }}
        >
          &larr; Back to agency panel
        </button>
        <h2>{selected.organisationName}</h2>
        <p style={{ fontSize: 13, color: "#555" }}>Panel status: {selected.panelStatus}</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {PANEL_STATUSES.filter((s) => s !== selected.panelStatus).map((s) => (
            <button key={s} type="button" onClick={() => setPanelStatus(selected.id, s)} style={{ padding: "4px 8px" }}>
              Set {s}
            </button>
          ))}
        </div>

        <h3 style={{ fontSize: 15 }}>Fee agreements</h3>
        {error && <p style={{ color: "#a33" }}>{error}</p>}
        <ul style={{ listStyle: "none", padding: 0 }}>
          {agreements.map((a) => (
            <li key={a.id} style={{ border: "1px solid #ddd", borderRadius: 6, padding: 10, marginBottom: 8, fontSize: 13 }}>
              <strong>{a.feeModel}</strong>
              {a.category && ` · ${a.category}`}
              <pre style={{ margin: "4px 0 0", fontSize: 12 }}>{JSON.stringify(a.termsJson, null, 2)}</pre>
            </li>
          ))}
          {agreements.length === 0 && <p style={{ color: "#666" }}>No agreements yet.</p>}
        </ul>
        <AgreementForm agencyId={selected.id} onCreated={() => openAgency(selected)} />
      </section>
    );
  }

  return (
    <section>
      <h2>Agency panel</h2>
      <p style={{ fontSize: 12, color: "#666" }}>
        Panel eligibility and fee agreements (docs/spec/01-technical-architecture-data-model-v0.2.docx §19, §25).
      </p>
      {error && <p style={{ color: "#a33" }}>{error}</p>}
      <ul style={{ listStyle: "none", padding: 0 }}>
        {agencies.map((a) => (
          <li
            key={a.id}
            style={{ border: "1px solid #ddd", borderRadius: 6, padding: 10, marginBottom: 8, cursor: "pointer" }}
            onClick={() => openAgency(a)}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong>{a.organisationName}</strong>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{a.panelStatus}</span>
            </div>
          </li>
        ))}
        {agencies.length === 0 && <p style={{ color: "#666" }}>No agencies registered yet.</p>}
      </ul>
      <RegisterAgencyForm onRegistered={reload} />
    </section>
  );
}

function RegisterAgencyForm({ onRegistered }: { onRegistered: () => Promise<void> }) {
  const [organisationId, setOrganisationId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch("/v1/commercial/agencies", { method: "POST", body: JSON.stringify({ organisationId }) });
      setOrganisationId("");
      await onRegistered();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not register this agency.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{ border: "1px dashed #bbb", borderRadius: 6, padding: 12, marginTop: 16, display: "flex", flexDirection: "column", gap: 8, maxWidth: 420 }}
    >
      <strong style={{ fontSize: 14 }}>Register an agency onto the panel</strong>
      <p style={{ fontSize: 12, color: "#666", margin: 0 }}>
        The organisation (type AGENCY) must already exist — organisations are provisioned by platform ops, not
        self-service.
      </p>
      <input
        placeholder="Organisation ID"
        value={organisationId}
        onChange={(e) => setOrganisationId(e.target.value)}
        required
        style={{ padding: 6 }}
      />
      {error && <p style={{ color: "#a33", fontSize: 13, margin: 0 }}>{error}</p>}
      <button type="submit" disabled={submitting} style={{ padding: 8, alignSelf: "flex-start" }}>
        {submitting ? "Registering…" : "Register"}
      </button>
    </form>
  );
}

function AgreementForm({ agencyId, onCreated }: { agencyId: string; onCreated: () => Promise<void> }) {
  const [feeModel, setFeeModel] = useState("PERCENT");
  const [category, setCategory] = useState("");
  const [termsText, setTermsText] = useState('{"percent": 20}');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    let terms: unknown;
    try {
      terms = JSON.parse(termsText);
    } catch {
      setError("Terms must be valid JSON.");
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch(`/v1/commercial/agencies/${agencyId}/agreements`, {
        method: "POST",
        body: JSON.stringify({ feeModel, category: category || undefined, terms }),
      });
      setCategory("");
      await onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create this agreement.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{ border: "1px dashed #bbb", borderRadius: 6, padding: 12, marginTop: 12, display: "flex", flexDirection: "column", gap: 8, maxWidth: 420 }}
    >
      <strong style={{ fontSize: 14 }}>Add a fee agreement</strong>
      <select value={feeModel} onChange={(e) => setFeeModel(e.target.value)} style={{ padding: 6 }}>
        {FEE_MODELS.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <input placeholder="Category (optional)" value={category} onChange={(e) => setCategory(e.target.value)} style={{ padding: 6 }} />
      <label style={{ fontSize: 12 }}>
        Terms (JSON)
        <textarea
          value={termsText}
          onChange={(e) => setTermsText(e.target.value)}
          style={{ display: "block", width: "100%", padding: 6, minHeight: 60, fontFamily: "monospace" }}
        />
      </label>
      {error && <p style={{ color: "#a33", fontSize: 13, margin: 0 }}>{error}</p>}
      <button type="submit" disabled={submitting} style={{ padding: 8, alignSelf: "flex-start" }}>
        {submitting ? "Adding…" : "Add agreement"}
      </button>
    </form>
  );
}
