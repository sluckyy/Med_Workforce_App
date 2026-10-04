import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { apiFetch, ApiError } from "../lib/api.js";

interface TimesheetVersion {
  id: string;
  version: number;
  startAt: string;
  endAt: string;
  breakMinutes: number;
  doctorComment: string | null;
}

interface TimesheetData {
  id: string;
  status: string;
  booking: {
    practitioner: { displayName: string };
    bookedStartAt: string;
    bookedEndAt: string;
    facility: string;
    roleTemplate: string;
    organisation: { name: string };
  };
  versions: TimesheetVersion[];
}

// No login, no Authorization header — the URL token itself is the
// credential (see services/api/src/modules/timesheet/index.ts). This
// page is deliberately reachable with no authenticated user at all.
export default function ApprovalPage() {
  const { token } = useParams<{ token: string }>();
  const [timesheet, setTimesheet] = useState<TimesheetData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [decided, setDecided] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!token) return;
    try {
      const ts = await apiFetch<TimesheetData>(`/v1/timesheets/approve/${token}`);
      setTimesheet(ts);
      setError(null);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 410
          ? "This approval link has expired or already been used."
          : err instanceof ApiError && err.status === 404
            ? "This approval link isn't valid."
            : "Could not load this timesheet.",
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function decide(body: { decision: "APPROVE" | "AMEND" | "REJECT"; reason?: string; amendedVersion?: Record<string, unknown> }) {
    if (!token) return;
    try {
      const result = await apiFetch<TimesheetData>(`/v1/timesheets/approve/${token}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setTimesheet(result);
      setDecided(body.decision);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not record your decision.");
    }
  }

  if (loading) return <p>Loading…</p>;
  if (error) return <p style={{ color: "#a33", maxWidth: 420, margin: "48px auto" }}>{error}</p>;
  if (!timesheet) return null;

  const latest = timesheet.versions[timesheet.versions.length - 1];

  return (
    <section style={{ maxWidth: 480, margin: "48px auto" }}>
      <h2>Timesheet approval</h2>
      <p style={{ fontSize: 13, color: "#555" }}>
        {timesheet.booking.practitioner.displayName} · {timesheet.booking.roleTemplate} @{" "}
        {timesheet.booking.facility} ({timesheet.booking.organisation.name})
      </p>

      <table style={{ borderCollapse: "collapse", marginBottom: 16, fontSize: 14 }}>
        <tbody>
          <tr>
            <td style={{ padding: "2px 12px 2px 0", color: "#666" }}>Booked</td>
            <td>
              {new Date(timesheet.booking.bookedStartAt).toLocaleString()} –{" "}
              {new Date(timesheet.booking.bookedEndAt).toLocaleString()}
            </td>
          </tr>
          <tr>
            <td style={{ padding: "2px 12px 2px 0", color: "#666" }}>Claimed</td>
            <td>
              {new Date(latest.startAt).toLocaleString()} – {new Date(latest.endAt).toLocaleString()} ·{" "}
              {latest.breakMinutes}min break
            </td>
          </tr>
          {latest.doctorComment && (
            <tr>
              <td style={{ padding: "2px 12px 2px 0", color: "#666" }}>Comment</td>
              <td>{latest.doctorComment}</td>
            </tr>
          )}
        </tbody>
      </table>

      {decided ? (
        <p style={{ color: "#0a7a2f" }}>
          Decision recorded: {decided}. This link has now been used and can't be used again.
        </p>
      ) : (
        <DecisionForm latest={latest} onDecide={decide} />
      )}
    </section>
  );
}

function DecisionForm({
  latest,
  onDecide,
}: {
  latest: TimesheetVersion;
  onDecide: (body: { decision: "APPROVE" | "AMEND" | "REJECT"; reason?: string; amendedVersion?: Record<string, unknown> }) => Promise<void>;
}) {
  const [mode, setMode] = useState<"idle" | "amend" | "reject">("idle");
  const [reason, setReason] = useState("");
  const [amendStart, setAmendStart] = useState("");
  const [amendEnd, setAmendEnd] = useState("");
  const [amendBreak, setAmendBreak] = useState(String(latest.breakMinutes));
  const [submitting, setSubmitting] = useState(false);

  async function approve() {
    setSubmitting(true);
    await onDecide({ decision: "APPROVE" });
    setSubmitting(false);
  }

  async function submitReject(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    await onDecide({ decision: "REJECT", reason });
    setSubmitting(false);
  }

  async function submitAmend(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    await onDecide({
      decision: "AMEND",
      reason: reason || undefined,
      amendedVersion: {
        startAt: amendStart || latest.startAt,
        endAt: amendEnd || latest.endAt,
        breakMinutes: Number(amendBreak) || 0,
      },
    });
    setSubmitting(false);
  }

  if (mode === "reject") {
    return (
      <form onSubmit={submitReject} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label style={{ fontSize: 12 }}>
          Reason (required)
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} required style={{ display: "block", width: "100%", padding: 6, minHeight: 50 }} />
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" disabled={submitting} style={{ padding: 8 }}>
            {submitting ? "Submitting…" : "Confirm reject"}
          </button>
          <button type="button" onClick={() => setMode("idle")} style={{ padding: 8 }}>
            Cancel
          </button>
        </div>
      </form>
    );
  }

  if (mode === "amend") {
    return (
      <form onSubmit={submitAmend} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label style={{ fontSize: 12 }}>
          Amended start
          <input
            type="datetime-local"
            defaultValue={latest.startAt.slice(0, 16)}
            onChange={(e) => setAmendStart(e.target.value)}
            style={{ display: "block", width: "100%", padding: 6 }}
          />
        </label>
        <label style={{ fontSize: 12 }}>
          Amended end
          <input
            type="datetime-local"
            defaultValue={latest.endAt.slice(0, 16)}
            onChange={(e) => setAmendEnd(e.target.value)}
            style={{ display: "block", width: "100%", padding: 6 }}
          />
        </label>
        <label style={{ fontSize: 12 }}>
          Amended break minutes
          <input type="number" min={0} value={amendBreak} onChange={(e) => setAmendBreak(e.target.value)} style={{ display: "block", width: "100%", padding: 6 }} />
        </label>
        <label style={{ fontSize: 12 }}>
          Reason (optional)
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} style={{ display: "block", width: "100%", padding: 6, minHeight: 40 }} />
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" disabled={submitting} style={{ padding: 8 }}>
            {submitting ? "Submitting…" : "Confirm amendment"}
          </button>
          <button type="button" onClick={() => setMode("idle")} style={{ padding: 8 }}>
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div style={{ display: "flex", gap: 8 }}>
      <button type="button" disabled={submitting} onClick={() => void approve()} style={{ padding: 8 }}>
        Approve
      </button>
      <button type="button" onClick={() => setMode("amend")} style={{ padding: 8 }}>
        Amend
      </button>
      <button type="button" onClick={() => setMode("reject")} style={{ padding: 8 }}>
        Reject
      </button>
    </div>
  );
}
