import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../lib/auth-context.js";
import { apiFetch, ApiError } from "../lib/api.js";

interface FatigueRule {
  id: string;
  code: string;
  status: string;
  parametersJson: Record<string, unknown>;
  effectiveFrom: string;
  effectiveTo: string | null;
}

interface WorkEpisodeRow {
  id: string;
  facility: { id: string; name: string } | null;
  startAt: string;
  endAt: string;
  source: string;
  assuranceLevel: string | null;
}

export default function FatigueSafety() {
  const { activeOrgId } = useAuth();
  const [rules, setRules] = useState<FatigueRule[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const list = await apiFetch<FatigueRule[]>("/v1/fatigue-rules");
      setRules(list);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load fatigue rules.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function publish(id: string) {
    try {
      await apiFetch(`/v1/fatigue-rules/${id}/publish`, { method: "POST" });
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not publish that rule.");
    }
  }

  if (!activeOrgId) return <p>Select an organisation from the Dashboard first.</p>;
  if (loading) return <p>Loading…</p>;

  return (
    <section>
      <h2>Fatigue &amp; Cross-Organisation Safety</h2>
      <p style={{ fontSize: 12, color: "#666" }}>
        Cross-organisation visibility of a practitioner's work episodes, and authoring of the FatigueRule a role's
        requirement set checks against (docs/addendum/v0.3-addendum.md §1). A confirmed platform booking that
        overlaps is a hard FAIL; a self-declared external engagement is UNKNOWN, never a silent pass or fail — the
        platform cannot verify it.
      </p>
      {error && <p style={{ color: "#a33" }}>{error}</p>}

      <h3 style={{ fontSize: 15 }}>Fatigue rules</h3>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {rules.map((r) => (
          <li key={r.id} style={{ border: "1px solid #ddd", borderRadius: 6, padding: 10, marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong>{r.code}</strong>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{r.status}</span>
            </div>
            <div style={{ fontSize: 12, color: "#666" }}>{JSON.stringify(r.parametersJson)}</div>
            {r.status === "DRAFT" && (
              <button type="button" onClick={() => publish(r.id)} style={{ marginTop: 6, padding: "4px 8px" }}>
                Publish
              </button>
            )}
          </li>
        ))}
        {rules.length === 0 && <p style={{ color: "#666" }}>None yet.</p>}
      </ul>
      <FatigueRuleForm onCreated={reload} />

      <h3 style={{ marginTop: 32, fontSize: 15 }}>Cross-organisation work episodes</h3>
      <p style={{ fontSize: 12, color: "#666", marginTop: -4 }}>
        Look up a practitioner's known work episodes regardless of which organisation booked them.
      </p>
      <FatigueEpisodeLookup orgId={activeOrgId} />
    </section>
  );
}

function FatigueRuleForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const [code, setCode] = useState("");
  const [parametersJson, setParametersJson] = useState("{}");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(parametersJson);
      } catch {
        setError("Parameters must be valid JSON (e.g. {} or {\"maxConsecutiveHours\": 14}).");
        setSubmitting(false);
        return;
      }
      await apiFetch("/v1/fatigue-rules", {
        method: "POST",
        body: JSON.stringify({ code, parametersJson: parsed }),
      });
      setCode("");
      setParametersJson("{}");
      await onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create this rule.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ border: "1px dashed #bbb", borderRadius: 6, padding: 12, display: "flex", flexDirection: "column", gap: 8, maxWidth: 420 }}>
      <strong style={{ fontSize: 14 }}>Create a fatigue rule</strong>
      <p style={{ fontSize: 12, color: "#666", margin: 0 }}>
        Created as DRAFT. Must be published before a requirement referencing its code resolves anything other than
        UNKNOWN. Parameters are stored but not yet interpreted — only direct window overlap is checked.
      </p>
      <input placeholder="Code (e.g. STANDARD_FATIGUE_RULE)" value={code} onChange={(e) => setCode(e.target.value)} required style={{ padding: 6 }} />
      <textarea placeholder="Parameters JSON" value={parametersJson} onChange={(e) => setParametersJson(e.target.value)} rows={3} style={{ padding: 6, fontFamily: "monospace" }} />
      {error && <p style={{ color: "#a33", fontSize: 13, margin: 0 }}>{error}</p>}
      <button type="submit" disabled={submitting} style={{ padding: 8, alignSelf: "flex-start" }}>
        {submitting ? "Creating…" : "Create rule"}
      </button>
    </form>
  );
}

function FatigueEpisodeLookup({ orgId }: { orgId: string }) {
  const [email, setEmail] = useState("");
  const [episodes, setEpisodes] = useState<WorkEpisodeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function lookup(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const practitioner = await apiFetch<{ id: string }>(`/v1/practitioners?email=${encodeURIComponent(email)}`);
      const list = await apiFetch<WorkEpisodeRow[]>(
        `/v1/organisations/${orgId}/practitioners/${practitioner.id}/fatigue-episodes`,
      );
      setEpisodes(list);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404 ? "No registered practitioner with that email." : "Could not load episodes.");
      setEpisodes(null);
    }
  }

  return (
    <div>
      <form onSubmit={lookup} style={{ display: "flex", gap: 8, maxWidth: 420 }}>
        <input type="email" placeholder="Practitioner's email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ padding: 6, flex: 1 }} />
        <button type="submit" style={{ padding: 6 }}>
          Look up
        </button>
      </form>
      {error && <p style={{ color: "#a33", fontSize: 13 }}>{error}</p>}
      {episodes && (
        <ul style={{ fontSize: 13, listStyle: "none", padding: 0, marginTop: 8 }}>
          {episodes.map((e) => (
            <li key={e.id} style={{ borderBottom: "1px solid #eee", padding: "6px 0" }}>
              {new Date(e.startAt).toLocaleString()} – {new Date(e.endAt).toLocaleString()}
              {e.facility && ` · ${e.facility.name}`} · <strong>{e.source}</strong>
              {e.assuranceLevel && ` (${e.assuranceLevel})`}
            </li>
          ))}
          {episodes.length === 0 && <li style={{ color: "#666" }}>No known work episodes.</li>}
        </ul>
      )}
    </div>
  );
}
