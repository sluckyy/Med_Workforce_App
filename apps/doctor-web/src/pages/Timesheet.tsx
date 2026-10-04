import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { apiFetch, ApiError } from "../lib/api.js";

interface TimesheetVersion {
  id: string;
  version: number;
  startAt: string;
  endAt: string;
  breakMinutes: number;
  allowances: Record<string, unknown> | null;
  doctorComment: string | null;
  createdAt: string;
}

interface TimesheetData {
  id: string;
  status: string;
  currentVersion: number;
  submittedAt: string | null;
  approvedAt: string | null;
  reconciliationRef: string | null;
  latestDecision: { reason: string | null; decidedAt: string } | null;
  booking: {
    id: string;
    status: string;
    bookedStartAt: string;
    bookedEndAt: string;
    facility: string;
    roleTemplate: string;
    organisation: { id: string; name: string };
  };
  versions: TimesheetVersion[];
}

function toLocalInput(iso: string) {
  // <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm" with no timezone.
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function Timesheet() {
  const [searchParams] = useSearchParams();
  const bookingId = searchParams.get("bookingId");
  const [timesheet, setTimesheet] = useState<TimesheetData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!bookingId) return;
    try {
      const ts = await apiFetch<TimesheetData>(`/v1/bookings/${bookingId}/timesheet`);
      setTimesheet(ts);
      setNotFound(false);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setTimesheet(null);
        setNotFound(true);
        setError(null);
      } else {
        setError(err instanceof ApiError ? err.message : "Could not load this timesheet.");
      }
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function submitClaim(body: { startAt: string; endAt: string; breakMinutes: number; comment?: string }) {
    if (!bookingId) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/v1/bookings/${bookingId}/timesheet`, { method: "POST", body: JSON.stringify(body) });
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create this timesheet.");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(body: { startAt: string; endAt: string; breakMinutes: number; comment?: string }) {
    if (!timesheet) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/v1/timesheets/${timesheet.id}`, { method: "PATCH", body: JSON.stringify(body) });
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save your changes.");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!timesheet) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/v1/timesheets/${timesheet.id}/submit`, { method: "POST" });
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not submit this timesheet.");
    } finally {
      setBusy(false);
    }
  }

  async function resubmit(body: { startAt: string; endAt: string; breakMinutes: number; comment?: string }) {
    if (!timesheet) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/v1/timesheets/${timesheet.id}/resubmit`, { method: "POST", body: JSON.stringify(body) });
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not resubmit this timesheet.");
    } finally {
      setBusy(false);
    }
  }

  async function acceptAmendment() {
    if (!timesheet) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/v1/timesheets/${timesheet.id}/accept-amendment`, { method: "POST" });
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not accept the amendment.");
    } finally {
      setBusy(false);
    }
  }

  if (!bookingId) {
    return <p>Open this page from a booking's "Launch timesheet" link in Booking.</p>;
  }
  if (loading) return <p>Loading…</p>;

  return (
    <section>
      <h2>Timesheet</h2>
      {error && <p style={{ color: "#a33" }}>{error}</p>}

      {notFound ? (
        <ClaimForm busy={busy} onSubmit={submitClaim} submitLabel="Create timesheet" />
      ) : timesheet ? (
        <TimesheetView
          timesheet={timesheet}
          busy={busy}
          onSaveEdit={saveEdit}
          onSubmit={submit}
          onResubmit={resubmit}
          onAcceptAmendment={acceptAmendment}
        />
      ) : null}
    </section>
  );
}

function TimesheetView({
  timesheet,
  busy,
  onSaveEdit,
  onSubmit,
  onResubmit,
  onAcceptAmendment,
}: {
  timesheet: TimesheetData;
  busy: boolean;
  onSaveEdit: (body: { startAt: string; endAt: string; breakMinutes: number; comment?: string }) => Promise<void>;
  onSubmit: () => Promise<void>;
  onResubmit: (body: { startAt: string; endAt: string; breakMinutes: number; comment?: string }) => Promise<void>;
  onAcceptAmendment: () => Promise<void>;
}) {
  const latest = timesheet.versions[timesheet.versions.length - 1];
  const doctorsOwnLatest = [...timesheet.versions].reverse().find((v) => v.doctorComment !== null || v.version === 1) ?? latest;

  return (
    <div>
      <table style={{ borderCollapse: "collapse", marginBottom: 16 }}>
        <tbody>
          <tr>
            <td style={{ padding: "2px 12px 2px 0", color: "#666" }}>Status</td>
            <td style={{ fontWeight: 600 }}>{timesheet.status}</td>
          </tr>
          <tr>
            <td style={{ padding: "2px 12px 2px 0", color: "#666" }}>Shift</td>
            <td>
              {timesheet.booking.roleTemplate} @ {timesheet.booking.facility} ({timesheet.booking.organisation.name})
            </td>
          </tr>
          <tr>
            <td style={{ padding: "2px 12px 2px 0", color: "#666" }}>Booked hours</td>
            <td>
              {new Date(timesheet.booking.bookedStartAt).toLocaleString()} –{" "}
              {new Date(timesheet.booking.bookedEndAt).toLocaleString()}
            </td>
          </tr>
          {timesheet.reconciliationRef && (
            <tr>
              <td style={{ padding: "2px 12px 2px 0", color: "#666" }}>Finance reference</td>
              <td>{timesheet.reconciliationRef}</td>
            </tr>
          )}
        </tbody>
      </table>

      {timesheet.latestDecision && (timesheet.status === "AMENDED" || timesheet.status === "REJECTED") && (
        <p style={{ fontSize: 13, color: "#a67c00", border: "1px solid #a67c00", borderRadius: 6, padding: 8 }}>
          {timesheet.status === "AMENDED" ? "Amended" : "Rejected"}
          {timesheet.latestDecision.reason && `: ${timesheet.latestDecision.reason}`}
        </p>
      )}

      <h3 style={{ fontSize: 14 }}>Versions</h3>
      <ul style={{ fontSize: 13 }}>
        {timesheet.versions.map((v) => (
          <li key={v.id}>
            v{v.version} · {new Date(v.startAt).toLocaleString()} – {new Date(v.endAt).toLocaleString()} ·{" "}
            {v.breakMinutes}min break
            {v.doctorComment && ` — "${v.doctorComment}"`}
          </li>
        ))}
      </ul>

      {timesheet.status === "DRAFT" && (
        <>
          <h3 style={{ fontSize: 14, marginTop: 16 }}>Edit your claim</h3>
          <ClaimForm busy={busy} initial={latest} onSubmit={onSaveEdit} submitLabel="Save" />
          <button type="button" disabled={busy} onClick={() => void onSubmit()} style={{ padding: 8, marginTop: 8 }}>
            {busy ? "Submitting…" : "Submit timesheet"}
          </button>
        </>
      )}

      {timesheet.status === "AMENDED" && (
        <>
          <button type="button" disabled={busy} onClick={() => void onAcceptAmendment()} style={{ padding: 8, marginTop: 8 }}>
            {busy ? "Accepting…" : "Accept the amended version"}
          </button>
          <h3 style={{ fontSize: 14, marginTop: 16 }}>Or submit a corrected claim instead</h3>
          <ClaimForm busy={busy} initial={doctorsOwnLatest} onSubmit={onResubmit} submitLabel="Resubmit" />
        </>
      )}

      {timesheet.status === "REJECTED" && (
        <>
          <h3 style={{ fontSize: 14, marginTop: 16 }}>Submit a corrected claim</h3>
          <ClaimForm busy={busy} initial={doctorsOwnLatest} onSubmit={onResubmit} submitLabel="Resubmit" />
        </>
      )}
    </div>
  );
}

function ClaimForm({
  initial,
  busy,
  onSubmit,
  submitLabel,
}: {
  initial?: TimesheetVersion;
  busy: boolean;
  onSubmit: (body: { startAt: string; endAt: string; breakMinutes: number; comment?: string }) => Promise<void>;
  submitLabel: string;
}) {
  const [startAt, setStartAt] = useState(initial ? toLocalInput(initial.startAt) : "");
  const [endAt, setEndAt] = useState(initial ? toLocalInput(initial.endAt) : "");
  const [breakMinutes, setBreakMinutes] = useState(initial ? String(initial.breakMinutes) : "0");
  const [comment, setComment] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await onSubmit({
      startAt,
      endAt,
      breakMinutes: Number(breakMinutes) || 0,
      comment: comment || undefined,
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ border: "1px dashed #bbb", borderRadius: 6, padding: 12, display: "flex", flexDirection: "column", gap: 8, maxWidth: 420 }}
    >
      <label style={{ fontSize: 12 }}>
        Actual start
        <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} required style={{ display: "block", padding: 6, width: "100%" }} />
      </label>
      <label style={{ fontSize: 12 }}>
        Actual end
        <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} required style={{ display: "block", padding: 6, width: "100%" }} />
      </label>
      <label style={{ fontSize: 12 }}>
        Break minutes
        <input
          type="number"
          min={0}
          value={breakMinutes}
          onChange={(e) => setBreakMinutes(e.target.value)}
          style={{ display: "block", padding: 6, width: "100%" }}
        />
      </label>
      <label style={{ fontSize: 12 }}>
        Comment (optional)
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} style={{ display: "block", padding: 6, width: "100%", minHeight: 50 }} />
      </label>
      <button type="submit" disabled={busy} style={{ padding: 8, alignSelf: "flex-start" }}>
        {busy ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
