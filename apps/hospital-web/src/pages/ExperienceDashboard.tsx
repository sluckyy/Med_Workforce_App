import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../lib/auth-context.js";
import { apiFetch, ApiError } from "../lib/api.js";

interface FacilityAggregate {
  facilityId: string;
  facilityName: string;
  n: number;
  suppressed: boolean;
  scores: Record<string, number> | null;
}

interface ImprovementAction {
  id: string;
  siteFacilityId: string | null;
  theme: string | null;
  title: string;
  action: string | null;
  owner: string | null;
  dueDate: string | null;
  status: string;
}

const SCORE_LABELS: Record<string, string> = {
  culture: "Culture",
  support: "Support",
  orientation: "Orientation",
  workload: "Workload",
  returnIntention: "Would return",
};

export default function ExperienceDashboard() {
  const { activeOrgId } = useAuth();
  const [aggregate, setAggregate] = useState<FacilityAggregate[]>([]);
  const [actions, setActions] = useState<ImprovementAction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!activeOrgId) return;
    try {
      const [agg, acts] = await Promise.all([
        apiFetch<FacilityAggregate[]>(`/v1/organisations/${activeOrgId}/experience-aggregate`),
        apiFetch<ImprovementAction[]>("/v1/improvement-actions"),
      ]);
      setAggregate(agg);
      setActions(acts);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load the experience dashboard.");
    } finally {
      setLoading(false);
    }
  }, [activeOrgId]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function updateStatus(id: string, status: string) {
    try {
      await apiFetch(`/v1/improvement-actions/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update that action.");
    }
  }

  if (!activeOrgId) return <p>Select an organisation from the Dashboard first.</p>;
  if (loading) return <p>Loading…</p>;

  return (
    <section>
      <h2>Experience dashboard</h2>
      <p style={{ fontSize: 12, color: "#666" }}>
        Aggregated trends only. A site with fewer than the minimum number of responses is shown with its scores
        withheld — this is enforced by the query layer itself, not by this page choosing not to render them.
      </p>
      {error && <p style={{ color: "#a33" }}>{error}</p>}

      <h3 style={{ fontSize: 15 }}>By site</h3>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {aggregate.map((a) => (
          <li key={a.facilityId} style={{ border: "1px solid #ddd", borderRadius: 6, padding: 10, marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong>{a.facilityName}</strong>
              <span style={{ fontSize: 12, color: "#666" }}>{a.n} response{a.n === 1 ? "" : "s"}</span>
            </div>
            {a.suppressed || !a.scores ? (
              <p style={{ fontSize: 13, color: "#a66", margin: "4px 0 0" }}>
                Too few responses to report without risking re-identification.
              </p>
            ) : (
              <div style={{ fontSize: 13, marginTop: 4 }}>
                {Object.entries(a.scores)
                  .map(([key, value]) => `${SCORE_LABELS[key] ?? key}: ${value.toFixed(1)}`)
                  .join(" · ")}
              </div>
            )}
          </li>
        ))}
        {aggregate.length === 0 && <p style={{ color: "#666" }}>No facilities yet.</p>}
      </ul>

      <h3 style={{ marginTop: 32, fontSize: 15 }}>Improvement actions</h3>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {actions.map((a) => (
          <li key={a.id} style={{ border: "1px solid #ddd", borderRadius: 6, padding: 10, marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong>{a.title}</strong>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{a.status}</span>
            </div>
            <div style={{ fontSize: 12, color: "#666" }}>
              {a.theme && `${a.theme} · `}
              {a.owner && `Owner: ${a.owner} · `}
              {a.dueDate && `Due ${new Date(a.dueDate).toLocaleDateString()}`}
            </div>
            {a.action && <div style={{ fontSize: 13, marginTop: 4 }}>{a.action}</div>}
            {a.status !== "DONE" && a.status !== "CANCELLED" && (
              <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
                {a.status === "OPEN" && (
                  <button type="button" onClick={() => updateStatus(a.id, "IN_PROGRESS")} style={{ padding: "4px 8px" }}>
                    Start
                  </button>
                )}
                <button type="button" onClick={() => updateStatus(a.id, "DONE")} style={{ padding: "4px 8px" }}>
                  Mark done
                </button>
              </div>
            )}
          </li>
        ))}
        {actions.length === 0 && <p style={{ color: "#666" }}>None yet.</p>}
      </ul>
      <CreateActionForm onCreated={reload} />
    </section>
  );
}

function CreateActionForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [theme, setTheme] = useState("");
  const [action, setAction] = useState("");
  const [owner, setOwner] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch("/v1/improvement-actions", {
        method: "POST",
        body: JSON.stringify({
          title,
          theme: theme || undefined,
          action: action || undefined,
          owner: owner || undefined,
          dueDate: dueDate || undefined,
        }),
      });
      setTitle("");
      setTheme("");
      setAction("");
      setOwner("");
      setDueDate("");
      await onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create this action.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ border: "1px dashed #bbb", borderRadius: 6, padding: 12, display: "flex", flexDirection: "column", gap: 8, maxWidth: 420 }}>
      <strong style={{ fontSize: 14 }}>Add an improvement action</strong>
      <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} required style={{ padding: 6 }} />
      <input placeholder="Theme (e.g. Orientation)" value={theme} onChange={(e) => setTheme(e.target.value)} style={{ padding: 6 }} />
      <textarea placeholder="Action" value={action} onChange={(e) => setAction(e.target.value)} rows={2} style={{ padding: 6 }} />
      <div style={{ display: "flex", gap: 8 }}>
        <input placeholder="Owner" value={owner} onChange={(e) => setOwner(e.target.value)} style={{ padding: 6, flex: 1 }} />
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={{ padding: 6, flex: 1 }} />
      </div>
      {error && <p style={{ color: "#a33", fontSize: 13, margin: 0 }}>{error}</p>}
      <button type="submit" disabled={submitting} style={{ padding: 8, alignSelf: "flex-start" }}>
        {submitting ? "Adding…" : "Add action"}
      </button>
    </form>
  );
}
