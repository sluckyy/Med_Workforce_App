import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiError } from "../lib/api.js";

interface BookingRow {
  id: string;
  status: string;
  vacancy: {
    startAt: string;
    endAt: string;
    facility: { id: string; name: string };
    roleTemplate: { id: string; name: string };
  };
}

interface ResponseRow {
  id: string;
  submittedAt: string;
  scores: Record<string, number>;
  freeText: string | null;
  reportability: string;
}

const SCORE_FIELDS: Array<{ key: string; label: string }> = [
  { key: "culture", label: "Culture & team welcome" },
  { key: "support", label: "Clinical support available" },
  { key: "orientation", label: "Orientation to the site" },
  { key: "workload", label: "Workload was manageable" },
  { key: "returnIntention", label: "Likely to work here again" },
];

export default function Experience() {
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const [bks, resp] = await Promise.all([
        apiFetch<BookingRow[]>("/v1/bookings/me"),
        apiFetch<ResponseRow[]>("/v1/practitioners/me/experience-responses"),
      ]);
      setBookings(bks);
      setResponses(resp);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load experience data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  if (loading) return <p>Loading…</p>;

  return (
    <section>
      <h2>Experience</h2>
      <p style={{ fontSize: 12, color: "#666" }}>
        A short confidential survey after a shift. Routine reporting to hospital staff is always aggregated across
        several responses — never shown to them one at a time.
      </p>
      <p style={{ fontSize: 13, background: "#fff7e6", border: "1px solid #f0cb7a", borderRadius: 6, padding: 10 }}>
        <strong>This survey is not the formal incident-reporting channel.</strong> If something unsafe happened, use
        your organisation's incident reporting process as well.
      </p>
      {error && <p style={{ color: "#a33" }}>{error}</p>}

      <h3 style={{ fontSize: 15 }}>Past responses</h3>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {responses.map((r) => (
          <li key={r.id} style={{ border: "1px solid #ddd", borderRadius: 6, padding: 10, marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#666" }}>
              <span>{new Date(r.submittedAt).toLocaleString()}</span>
              <span>{r.reportability === "RESTRICTED" ? "Withheld from aggregate reporting" : "Included in aggregates"}</span>
            </div>
            <div style={{ fontSize: 13, marginTop: 4 }}>
              {SCORE_FIELDS.map((f) => `${f.label.split(" ")[0]}: ${r.scores[f.key]}`).join(" · ")}
            </div>
            {r.freeText && <div style={{ fontSize: 13, marginTop: 4, color: "#444" }}>{r.freeText}</div>}
          </li>
        ))}
        {responses.length === 0 && <p style={{ color: "#666" }}>No responses submitted yet.</p>}
      </ul>

      <SubmitResponseForm bookings={bookings} onSubmitted={reload} />
    </section>
  );
}

function SubmitResponseForm({ bookings, onSubmitted }: { bookings: BookingRow[]; onSubmitted: () => Promise<void> }) {
  const [bookingId, setBookingId] = useState("");
  const [scores, setScores] = useState<Record<string, number>>({
    culture: 3,
    support: 3,
    orientation: 3,
    workload: 3,
    returnIntention: 3,
  });
  const [freeText, setFreeText] = useState("");
  const [flagSensitive, setFlagSensitive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSubmitted(false);
    try {
      const booking = bookings.find((b) => b.id === bookingId);
      await apiFetch("/v1/practitioners/me/experience-responses", {
        method: "POST",
        body: JSON.stringify({
          bookingEpisodeId: booking?.id,
          siteFacilityId: booking?.vacancy.facility.id,
          roleTemplateId: booking?.vacancy.roleTemplate.id,
          scores,
          freeText: freeText || undefined,
          flagSensitive,
        }),
      });
      setFreeText("");
      setFlagSensitive(false);
      setSubmitted(true);
      await onSubmitted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not submit this response.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ border: "1px dashed #bbb", borderRadius: 6, padding: 12, display: "flex", flexDirection: "column", gap: 10, maxWidth: 480 }}>
      <strong style={{ fontSize: 14 }}>Submit feedback</strong>
      <label style={{ fontSize: 12 }}>
        Which shift is this about? (optional)
        <select value={bookingId} onChange={(e) => setBookingId(e.target.value)} style={{ display: "block", padding: 6, width: "100%" }}>
          <option value="">General feedback, not tied to a specific shift</option>
          {bookings.map((b) => (
            <option key={b.id} value={b.id}>
              {b.vacancy.facility.name} · {b.vacancy.roleTemplate.name} · {new Date(b.vacancy.startAt).toLocaleDateString()}
            </option>
          ))}
        </select>
      </label>

      {SCORE_FIELDS.map((f) => (
        <label key={f.key} style={{ fontSize: 12 }}>
          {f.label}: {scores[f.key]}
          <input
            type="range"
            min={1}
            max={5}
            value={scores[f.key]}
            onChange={(e) => setScores((s) => ({ ...s, [f.key]: Number(e.target.value) }))}
            style={{ display: "block", width: "100%" }}
          />
        </label>
      ))}

      <label style={{ fontSize: 12 }}>
        Anything else you'd like to add? (optional)
        <textarea value={freeText} onChange={(e) => setFreeText(e.target.value)} rows={3} style={{ display: "block", padding: 6, width: "100%" }} />
      </label>

      <label style={{ fontSize: 12 }}>
        <input type="checkbox" checked={flagSensitive} onChange={(e) => setFlagSensitive(e.target.checked)} /> Keep this
        response out of aggregate reporting entirely (e.g. it's identifying or describes a safety concern)
      </label>

      {error && <p style={{ color: "#a33", fontSize: 13, margin: 0 }}>{error}</p>}
      {submitted && <p style={{ color: "#0a7a2f", fontSize: 13, margin: 0 }}>Thanks — your feedback was submitted.</p>}
      <button type="submit" disabled={submitting} style={{ padding: 8, alignSelf: "flex-start" }}>
        {submitting ? "Submitting…" : "Submit feedback"}
      </button>
    </form>
  );
}
