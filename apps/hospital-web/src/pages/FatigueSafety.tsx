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
            <div style={{ fontSize: 12, color: "#666" }}>{describeRuleParameters(r.parametersJson)}</div>
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

export function describeRuleParameters(p: Record<string, unknown> | null | undefined): string {
  if (!p) return "no hour limits (overlap only)";
  const parts: string[] = [];
  if (typeof p.minInterShiftBreakHours === "number") parts.push(`${p.minInterShiftBreakHours}h minimum break`);
  if (typeof p.maxConsecutiveHours === "number") parts.push(`${p.maxConsecutiveHours}h max consecutive`);
  const r = p.maxRollingHours as { days?: number; hours?: number } | undefined;
  if (r && typeof r.hours === "number") parts.push(`${r.hours}h per ${r.days} days`);
  return parts.length ? parts.join(" · ") : "no hour limits (overlap only)";
}

function FatigueRuleForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const [code, setCode] = useState("");
  const [minBreak, setMinBreak] = useState("");
  const [maxConsecutive, setMaxConsecutive] = useState("");
  const [rollingHours, setRollingHours] = useState("");
  const [rollingDays, setRollingDays] = useState("7");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const parametersJson: Record<string, unknown> = {};
      if (minBreak) parametersJson.minInterShiftBreakHours = Number(minBreak);
      if (maxConsecutive) parametersJson.maxConsecutiveHours = Number(maxConsecutive);
      if (rollingHours) parametersJson.maxRollingHours = { days: Number(rollingDays), hours: Number(rollingHours) };
      await apiFetch("/v1/fatigue-rules", { method: "POST", body: JSON.stringify({ code, parametersJson }) });
      setCode("");
      setMinBreak("");
      setMaxConsecutive("");
      setRollingHours("");
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
        Created as DRAFT; publish it before a requirement referencing its code resolves anything other than UNKNOWN.
        Leave a limit blank to not apply it. A breach against booked shifts fails eligibility; a breach that only
        appears once a doctor's self-declared work is counted is INDETERMINATE, never a silent pass or fail.
      </p>
      <input placeholder="Code (e.g. STANDARD_FATIGUE_RULE)" value={code} onChange={(e) => setCode(e.target.value)} required style={{ padding: 6 }} />
      <input type="number" min={0.5} step={0.5} placeholder="Minimum break between shifts (hours)" value={minBreak} onChange={(e) => setMinBreak(e.target.value)} style={{ padding: 6 }} />
      <input type="number" min={1} step={0.5} placeholder="Maximum consecutive hours" value={maxConsecutive} onChange={(e) => setMaxConsecutive(e.target.value)} style={{ padding: 6 }} />
      <div style={{ display: "flex", gap: 8 }}>
        <input type="number" min={1} step={0.5} placeholder="Maximum rolling hours" value={rollingHours} onChange={(e) => setRollingHours(e.target.value)} style={{ padding: 6, flex: 1 }} />
        <select value={rollingDays} onChange={(e) => setRollingDays(e.target.value)} style={{ padding: 6 }} aria-label="Rolling window days">
          <option value="7">per 7 days</option>
          <option value="14">per 14 days</option>
          <option value="28">per 28 days</option>
        </select>
      </div>
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
