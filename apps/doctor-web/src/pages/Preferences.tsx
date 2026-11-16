import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiError } from "../lib/api.js";

interface Preference {
  id: string;
  dimension: string;
  targetId: string | null;
  value: Record<string, unknown> | null;
}

interface AvailabilityBlock {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
}

const DIMENSIONS: Array<{ key: string; label: string; hint: string; fields: Array<{ name: string; label: string; type?: string }> }> = [
  { key: "SITE", label: "Site", hint: "A site you prefer, or want excluded.", fields: [{ name: "name", label: "Site name" }] },
  { key: "ROLE", label: "Role", hint: "A role you prefer, or want excluded.", fields: [{ name: "name", label: "Role" }] },
  { key: "REGION", label: "Region", hint: "A region you prefer, or want excluded.", fields: [{ name: "name", label: "Region" }] },
  { key: "RATE", label: "Minimum rate floor", hint: "Confidential — never shown to an organisation or agency.", fields: [{ name: "minHourlyRate", label: "Minimum hourly rate (AUD)", type: "number" }] },
  { key: "TRAVEL", label: "Travel", hint: "e.g. max hours from home, needs flights covered.", fields: [{ name: "note", label: "Travel preference" }] },
  { key: "ACCOMMODATION", label: "Accommodation", hint: "e.g. must be provided, self-contained only.", fields: [{ name: "note", label: "Accommodation preference" }] },
  { key: "AGENCY_RELATIONSHIP", label: "Agency relationship", hint: "An agency you work with, or won't.", fields: [{ name: "agency", label: "Agency name" }] },
  { key: "DELIVERY_MODE", label: "Delivery mode", hint: "In-person, telehealth or hybrid.", fields: [{ name: "mode", label: "Mode (IN_PERSON / TELEHEALTH_SYNCHRONOUS / HYBRID)" }] },
  { key: "NOTIFICATION", label: "Notifications", hint: "Channels and quiet hours. Recorded only — no notifications are sent yet.", fields: [{ name: "channel", label: "Channel (email / sms)" }, { name: "quietHours", label: "Quiet hours (e.g. 22:00–07:00)" }] },
];

const EXCLUDABLE = new Set(["SITE", "ROLE", "REGION", "AGENCY_RELATIONSHIP"]);

function describe(p: Preference) {
  const v = p.value ?? {};
  const parts = Object.entries(v).filter(([k]) => k !== "exclude").map(([k, val]) => (k === "minHourlyRate" ? `$${val}/hr` : String(val)));
  return `${v.exclude ? "Exclude: " : ""}${parts.join(" · ") || p.targetId || "—"}`;
}

export default function Preferences() {
  const [prefs, setPrefs] = useState<Preference[]>([]);
  const [blocks, setBlocks] = useState<AvailabilityBlock[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const [p, a] = await Promise.all([
        apiFetch<Preference[]>("/v1/practitioners/me/preferences"),
        apiFetch<AvailabilityBlock[]>("/v1/practitioners/me/availability"),
      ]);
      setPrefs(p);
      setBlocks(a);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load your preferences.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function remove(path: string) {
    try {
      await apiFetch(path, { method: "DELETE" });
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove that.");
    }
  }

  if (loading) return <p>Loading…</p>;

  return (
    <section>
      <h2>Preferences</h2>
      <p style={{ fontSize: 12, color: "#666" }}>
        Your own record of what you want to work. Only you can see these — a rate floor is never shown to an
        organisation or agency. Marking yourself unavailable is the one thing here that changes an outcome: it fails
        the availability check for any vacancy that overlaps it.
      </p>
      {error && <p style={{ color: "#a33" }}>{error}</p>}

      <h3 style={{ fontSize: 15 }}>Current preferences</h3>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {prefs.map((p) => (
          <li key={p.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "6px 0", borderBottom: "1px solid #eee", fontSize: 13 }}>
            <span>
              <strong>{DIMENSIONS.find((d) => d.key === p.dimension)?.label ?? p.dimension}</strong> · {describe(p)}
            </span>
            <button type="button" onClick={() => remove(`/v1/practitioners/me/preferences/${p.id}`)} style={linkButton}>
              Remove
            </button>
          </li>
        ))}
        {prefs.length === 0 && <p style={{ color: "#666", fontSize: 13 }}>None set yet.</p>}
      </ul>
      <PreferenceForm onSaved={reload} />

      <h3 style={{ fontSize: 15, marginTop: 28 }}>Availability</h3>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {blocks.map((b) => (
          <li key={b.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "6px 0", borderBottom: "1px solid #eee", fontSize: 13 }}>
            <span>
              {new Date(b.startAt).toLocaleString()} – {new Date(b.endAt).toLocaleString()} ·{" "}
              <strong style={{ color: b.status === "UNAVAILABLE" ? "#a33" : b.status === "TENTATIVE" ? "#a67c00" : "#0a7a2f" }}>{b.status}</strong>
            </span>
            <button type="button" onClick={() => remove(`/v1/practitioners/me/availability/${b.id}`)} style={linkButton}>
              Remove
            </button>
          </li>
        ))}
        {blocks.length === 0 && <p style={{ color: "#666", fontSize: 13 }}>No availability recorded.</p>}
      </ul>
      <AvailabilityForm onSaved={reload} />
    </section>
  );
}

const linkButton = { background: "none", border: "none", textDecoration: "underline", cursor: "pointer", padding: 0, fontSize: 13, color: "#a33" } as const;
const formStyle = { border: "1px dashed #bbb", borderRadius: 6, padding: 12, display: "flex", flexDirection: "column", gap: 8, maxWidth: 420 } as const;

function PreferenceForm({ onSaved }: { onSaved: () => Promise<void> }) {
  const [dimension, setDimension] = useState(DIMENSIONS[0].key);
  const [values, setValues] = useState<Record<string, string>>({});
  const [exclude, setExclude] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const def = DIMENSIONS.find((d) => d.key === dimension)!;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const value: Record<string, unknown> = {};
      for (const f of def.fields) {
        if (values[f.name]) value[f.name] = f.type === "number" ? Number(values[f.name]) : values[f.name];
      }
      if (exclude) value.exclude = true;
      await apiFetch("/v1/practitioners/me/preferences", { method: "POST", body: JSON.stringify({ dimension, value }) });
      setValues({});
      setExclude(false);
      await onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save this preference.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={formStyle}>
      <strong style={{ fontSize: 14 }}>Add a preference</strong>
      <select value={dimension} onChange={(e) => { setDimension(e.target.value); setValues({}); setExclude(false); }} style={{ padding: 6 }}>
        {DIMENSIONS.map((d) => (
          <option key={d.key} value={d.key}>{d.label}</option>
        ))}
      </select>
      <p style={{ fontSize: 12, color: "#666", margin: 0 }}>{def.hint}</p>
      {def.fields.map((f) => (
        <input key={f.name} type={f.type ?? "text"} placeholder={f.label} value={values[f.name] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))} required style={{ padding: 6 }} />
      ))}
      {EXCLUDABLE.has(dimension) && (
        <label style={{ fontSize: 12 }}>
          <input type="checkbox" checked={exclude} onChange={(e) => setExclude(e.target.checked)} /> Exclude this (I don't want it)
        </label>
      )}
      {error && <p style={{ color: "#a33", fontSize: 13, margin: 0 }}>{error}</p>}
      <button type="submit" disabled={submitting} style={{ padding: 8, alignSelf: "flex-start" }}>
        {submitting ? "Saving…" : "Save preference"}
      </button>
    </form>
  );
}

function AvailabilityForm({ onSaved }: { onSaved: () => Promise<void> }) {
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [status, setStatus] = useState("UNAVAILABLE");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch("/v1/practitioners/me/availability", { method: "POST", body: JSON.stringify({ startAt, endAt, status }) });
      setStartAt("");
      setEndAt("");
      await onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save this block.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={formStyle}>
      <strong style={{ fontSize: 14 }}>Add an availability block</strong>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <label style={{ fontSize: 12, flex: 1 }}>
          From
          <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} required style={{ display: "block", padding: 6, width: "100%" }} />
        </label>
        <label style={{ fontSize: 12, flex: 1 }}>
          To
          <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} required style={{ display: "block", padding: 6, width: "100%" }} />
        </label>
      </div>
      <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ padding: 6 }}>
        <option value="UNAVAILABLE">Unavailable</option>
        <option value="AVAILABLE">Available</option>
        <option value="TENTATIVE">Tentative</option>
      </select>
      {error && <p style={{ color: "#a33", fontSize: 13, margin: 0 }}>{error}</p>}
      <button type="submit" disabled={submitting} style={{ padding: 8, alignSelf: "flex-start" }}>
        {submitting ? "Saving…" : "Save block"}
      </button>
    </form>
  );
}
