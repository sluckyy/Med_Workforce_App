import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../lib/auth-context.js";
import { apiFetch, ApiError } from "../lib/api.js";
import { getDoctorWebBaseUrl } from "../config.js";

interface TimesheetVersion {
  id: string;
  version: number;
  startAt: string;
  endAt: string;
  breakMinutes: number;
  doctorComment: string | null;
}

interface TimesheetSummary {
  id: string;
  status: string;
  currentVersion: number;
  submittedAt: string | null;
  approvedAt: string | null;
  reconciliationRef: string | null;
  booking: {
    practitioner: { displayName: string };
    bookedStartAt: string;
    bookedEndAt: string;
    facility: string;
    roleTemplate: string;
  };
  versions: TimesheetVersion[];
}

const STATUSES = ["SUBMITTED", "APPROVAL_SENT", "APPROVED", "AMENDED", "REJECTED", "RECONCILED"];
const STATUS_COLOR: Record<string, string> = {
  SUBMITTED: "#a67c00",
  APPROVAL_SENT: "#555",
  APPROVED: "#0a7a2f",
  AMENDED: "#a67c00",
  REJECTED: "#a33",
  RECONCILED: "#0a7a2f",
};

export default function Timesheets() {
  const { activeOrgId } = useAuth();
  const [statusFilter, setStatusFilter] = useState("");
  const [timesheets, setTimesheets] = useState<TimesheetSummary[]>([]);
  const [selected, setSelected] = useState<TimesheetSummary | null>(null);
  const [lastLink, setLastLink] = useState<{ timesheetId: string; url: string; expiresAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!activeOrgId) return;
    try {
      const qs = statusFilter ? `?status=${statusFilter}` : "";
      const list = await apiFetch<TimesheetSummary[]>(`/v1/organisations/${activeOrgId}/timesheets${qs}`);
      setTimesheets(list);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load timesheets.");
    } finally {
      setLoading(false);
    }
  }, [activeOrgId, statusFilter]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function sendForApproval(id: string, recipient: string) {
    if (!activeOrgId) return;
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch<{ token: string; expiresAt: string }>(
        `/v1/organisations/${activeOrgId}/timesheets/${id}/send-for-approval`,
        { method: "POST", body: JSON.stringify({ recipient: recipient || undefined }) },
      );
      setLastLink({ timesheetId: id, url: `${getDoctorWebBaseUrl()}/approve/${result.token}`, expiresAt: result.expiresAt });
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send this timesheet for approval.");
    } finally {
      setBusy(false);
    }
  }

  async function reconcile(id: string, reconciliationRef: string) {
    if (!activeOrgId) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/v1/organisations/${activeOrgId}/timesheets/${id}/reconcile`, {
        method: "POST",
        body: JSON.stringify({ reconciliationRef }),
      });
      setSelected(null);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reconcile this timesheet.");
    } finally {
      setBusy(false);
    }
  }

  if (!activeOrgId) return <p>Select an organisation from the Dashboard first.</p>;
  if (loading) return <p>Loading…</p>;

  if (selected) {
    const latest = selected.versions[selected.versions.length - 1];
    return (
      <section>
        <button
          type="button"
          onClick={() => setSelected(null)}
          style={{ background: "none", border: "none", textDecoration: "underline", cursor: "pointer", padding: 0, marginBottom: 12 }}
        >
          &larr; Back to timesheets
        </button>
        <h2>{selected.booking.practitioner.displayName}</h2>
        <p style={{ fontSize: 13, color: "#555" }}>
          {selected.booking.roleTemplate} @ {selected.booking.facility} · Status: {selected.status}
        </p>
        <table style={{ borderCollapse: "collapse", marginBottom: 16, fontSize: 14 }}>
          <tbody>
            <tr>
              <td style={{ padding: "2px 12px 2px 0", color: "#666" }}>Booked</td>
              <td>
                {new Date(selected.booking.bookedStartAt).toLocaleString()} –{" "}
                {new Date(selected.booking.bookedEndAt).toLocaleString()}
              </td>
            </tr>
            <tr>
              <td style={{ padding: "2px 12px 2px 0", color: "#666" }}>Claimed (v{latest.version})</td>
              <td>
                {new Date(latest.startAt).toLocaleString()} – {new Date(latest.endAt).toLocaleString()} ·{" "}
                {latest.breakMinutes}min break
              </td>
            </tr>
          </tbody>
        </table>
        <h3 style={{ fontSize: 14 }}>All versions</h3>
        <ul style={{ fontSize: 13 }}>
          {selected.versions.map((v) => (
            <li key={v.id}>
              v{v.version} · {new Date(v.startAt).toLocaleString()} – {new Date(v.endAt).toLocaleString()} ·{" "}
              {v.breakMinutes}min break
              {v.doctorComment && ` — "${v.doctorComment}"`}
            </li>
          ))}
        </ul>

        {(selected.status === "SUBMITTED" || selected.status === "APPROVAL_SENT") && (
          <SendForApprovalForm busy={busy} onSend={(recipient) => sendForApproval(selected.id, recipient)} />
        )}
        {lastLink && lastLink.timesheetId === selected.id && (
          <p style={{ fontSize: 12, color: "#666", wordBreak: "break-all", border: "1px dashed #bbb", borderRadius: 6, padding: 8 }}>
            One-time approval link (copy and send to the approver — no notification service exists yet):
            <br />
            <code>{lastLink.url}</code>
            <br />
            Expires {new Date(lastLink.expiresAt).toLocaleString()}
          </p>
        )}
        {selected.status === "APPROVED" && <ReconcileForm busy={busy} onReconcile={(ref) => reconcile(selected.id, ref)} />}
        {error && <p style={{ color: "#a33" }}>{error}</p>}
      </section>
    );
  }

  return (
    <section>
      <h2>Timesheets</h2>
      <label style={{ fontSize: 12, display: "block", marginBottom: 12 }}>
        Filter by status
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ display: "block", padding: 6, marginTop: 4 }}>
          <option value="">All</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      {error && <p style={{ color: "#a33" }}>{error}</p>}
      <ul style={{ listStyle: "none", padding: 0 }}>
        {timesheets.map((t) => (
          <li
            key={t.id}
            style={{ border: "1px solid #ddd", borderRadius: 6, padding: 10, marginBottom: 8, cursor: "pointer" }}
            onClick={() => setSelected(t)}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong>{t.booking.practitioner.displayName}</strong>
              <span style={{ fontSize: 12, fontWeight: 600, color: STATUS_COLOR[t.status] ?? "#333" }}>{t.status}</span>
            </div>
            <div style={{ fontSize: 12, color: "#666" }}>
              {t.booking.roleTemplate} @ {t.booking.facility}
            </div>
          </li>
        ))}
        {timesheets.length === 0 && <p style={{ color: "#666" }}>None found.</p>}
      </ul>
    </section>
  );
}

function SendForApprovalForm({ busy, onSend }: { busy: boolean; onSend: (recipient: string) => Promise<void> }) {
  const [recipient, setRecipient] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    await onSend(recipient);
  }

  return (
    <form onSubmit={onSubmit} style={{ border: "1px dashed #bbb", borderRadius: 6, padding: 12, marginTop: 12, display: "flex", flexDirection: "column", gap: 8, maxWidth: 360 }}>
      <strong style={{ fontSize: 14 }}>Send for approval</strong>
      <input placeholder="Approver's email or phone (label only)" value={recipient} onChange={(e) => setRecipient(e.target.value)} style={{ padding: 6 }} />
      <button type="submit" disabled={busy} style={{ padding: 8, alignSelf: "flex-start" }}>
        {busy ? "Sending…" : "Generate approval link"}
      </button>
    </form>
  );
}

function ReconcileForm({ busy, onReconcile }: { busy: boolean; onReconcile: (ref: string) => Promise<void> }) {
  const [ref, setRef] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    await onReconcile(ref);
  }

  return (
    <form onSubmit={onSubmit} style={{ border: "1px dashed #bbb", borderRadius: 6, padding: 12, marginTop: 12, display: "flex", flexDirection: "column", gap: 8, maxWidth: 360 }}>
      <strong style={{ fontSize: 14 }}>Reconcile</strong>
      <input placeholder="External finance reference" value={ref} onChange={(e) => setRef(e.target.value)} required style={{ padding: 6 }} />
      <button type="submit" disabled={busy} style={{ padding: 8, alignSelf: "flex-start" }}>
        {busy ? "Reconciling…" : "Mark reconciled"}
      </button>
    </form>
  );
}
