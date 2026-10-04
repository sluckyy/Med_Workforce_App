import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch, ApiError } from "../lib/api.js";

interface BookingSummary {
  id: string;
  status: string;
  confirmedAt: string | null;
  vacancy: {
    id: string;
    status: string;
    startAt: string;
    endAt: string;
    deliveryMode: string;
    facility: { id: string; name: string };
    roleTemplate: { id: string; code: string; name: string };
    organisation: { id: string; name: string };
  };
}

const STATUS_COLOR: Record<string, string> = {
  PENDING_CONFIRMATION: "#a67c00",
  CONFIRMED: "#0a7a2f",
  WORKED: "#0a7a2f",
  CLOSED: "#555",
  CANCELLED_BY_DOCTOR: "#a33",
  CANCELLED_BY_SERVICE: "#a33",
  NO_SHOW: "#a33",
};

export default function Booking() {
  const [bookings, setBookings] = useState<BookingSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const list = await apiFetch<BookingSummary[]>("/v1/bookings/me");
      setBookings(list);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load your bookings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function confirm(id: string) {
    setBusyId(id);
    try {
      await apiFetch(`/v1/bookings/${id}/confirm`, { method: "POST" });
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not confirm that booking.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <p>Loading…</p>;

  return (
    <section>
      <h2>Booking</h2>
      {error && <p style={{ color: "#a33" }}>{error}</p>}
      <ul style={{ listStyle: "none", padding: 0 }}>
        {bookings.map((b) => (
          <li key={b.id} style={{ border: "1px solid #ddd", borderRadius: 6, padding: 10, marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong>
                {b.vacancy.roleTemplate.name} @ {b.vacancy.facility.name}
              </strong>
              <span style={{ fontSize: 12, fontWeight: 600, color: STATUS_COLOR[b.status] ?? "#333" }}>{b.status}</span>
            </div>
            <div style={{ fontSize: 12, color: "#666" }}>
              {b.vacancy.organisation.name} · {new Date(b.vacancy.startAt).toLocaleString()} –{" "}
              {new Date(b.vacancy.endAt).toLocaleString()} · {b.vacancy.deliveryMode}
            </div>
            <div style={{ marginTop: 6, display: "flex", gap: 8 }}>
              {b.status === "PENDING_CONFIRMATION" && (
                <button type="button" disabled={busyId === b.id} onClick={() => confirm(b.id)} style={{ padding: "4px 8px" }}>
                  {busyId === b.id ? "Confirming…" : "Confirm booking"}
                </button>
              )}
              {(b.status === "CONFIRMED" || b.status === "WORKED" || b.status === "CLOSED") && (
                <Link to={`/timesheet?bookingId=${b.id}`} style={{ fontSize: 13, alignSelf: "center" }}>
                  {b.status === "CONFIRMED" ? "Launch timesheet →" : "View timesheet →"}
                </Link>
              )}
            </div>
          </li>
        ))}
        {bookings.length === 0 && <p style={{ color: "#666" }}>No bookings yet.</p>}
      </ul>
    </section>
  );
}
