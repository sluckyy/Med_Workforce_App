import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch, ApiError } from "../lib/api.js";
import { getApiBaseUrl } from "../config.js";

type ApiStatus = "checking" | "ok" | "unreachable";

interface Credential {
  id: string;
  definition: { name: string };
  status: string;
  expiryDate: string | null;
}

interface Share {
  id: string;
  recipientLabel: string | null;
  status: string;
  expiresAt: string;
  accessEventCount: number;
}

interface Booking {
  id: string;
  status: string;
  vacancy: {
    startAt: string;
    endAt: string;
    facility: { name: string };
    roleTemplate: { name: string };
  };
}

interface OpenVacancy {
  id: string;
  startAt: string;
  facility: { name: string };
  roleTemplate: { name: string };
  organisation: { name: string };
}

interface Timesheet {
  id: string;
  status: string;
  booking: { id: string };
}

interface ExperienceResponse {
  id: string;
  bookingEpisodeId: string | null;
}

interface HomeData {
  credentials: Credential[];
  shares: Share[];
  bookings: Booking[];
  vacancies: OpenVacancy[];
  timesheets: Timesheet[];
  responses: ExperienceResponse[];
}

const EXPIRY_WARNING_DAYS = 90;
const ACTIVE_BOOKING = new Set(["PENDING_CONFIRMATION", "CONFIRMED"]);
const WORKED_BOOKING = new Set(["CONFIRMED", "WORKED"]);
const TIMESHEET_NEEDS_DOCTOR: Record<string, string> = {
  DRAFT: "draft — not submitted",
  AMENDED: "amended by the approver — review",
  REJECTED: "rejected — resubmit",
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

function daysUntil(value: string) {
  return Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000);
}

export default function Home() {
  const [apiStatus, setApiStatus] = useState<ApiStatus>("checking");
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${getApiBaseUrl()}/health`)
      .then((res) => setApiStatus(res.ok ? "ok" : "unreachable"))
      .catch(() => setApiStatus("unreachable"));
  }, []);

  useEffect(() => {
    Promise.all([
      apiFetch<{ credentials: Credential[] }>("/v1/passport/me"),
      apiFetch<Share[]>("/v1/shares/me"),
      apiFetch<Booking[]>("/v1/bookings/me"),
      apiFetch<OpenVacancy[]>("/v1/vacancies/open"),
      apiFetch<Timesheet[]>("/v1/timesheets/me"),
      apiFetch<ExperienceResponse[]>("/v1/practitioners/me/experience-responses"),
    ])
      .then(([passport, shares, bookings, vacancies, timesheets, responses]) =>
        setData({ credentials: passport.credentials, shares, bookings, vacancies, timesheets, responses }),
      )
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load your home page."));
  }, []);

  const connectivity = (
    <p style={{ fontSize: 13, color: apiStatus === "ok" ? "#0a7a2f" : "#a33" }}>API connectivity: {apiStatus}</p>
  );

  if (error) {
    return (
      <>
        {connectivity}
        <p style={{ color: "#a33" }}>{error}</p>
      </>
    );
  }
  if (!data) {
    return (
      <>
        {connectivity}
        <p>Loading…</p>
      </>
    );
  }

  const now = Date.now();
  const expiring = data.credentials.filter(
    (c) => c.status === "EXPIRED" || (c.expiryDate && daysUntil(c.expiryDate) <= EXPIRY_WARNING_DAYS),
  );
  const unverified = data.credentials.filter((c) => c.status === "DECLARED").length;
  const activeShares = data.shares.filter((s) => s.status === "ACTIVE");
  const upcoming = data.bookings
    .filter((b) => ACTIVE_BOOKING.has(b.status) && new Date(b.vacancy.startAt).getTime() >= now)
    .sort((a, b) => a.vacancy.startAt.localeCompare(b.vacancy.startAt));
  const workedPast = data.bookings.filter(
    (b) => WORKED_BOOKING.has(b.status) && new Date(b.vacancy.endAt).getTime() < now,
  );
  const timesheetByBooking = new Map(data.timesheets.map((t) => [t.booking.id, t]));
  const pendingTimesheets = workedPast
    .map((b) => ({ booking: b, timesheet: timesheetByBooking.get(b.id) ?? null }))
    .filter(({ timesheet }) => !timesheet || timesheet.status in TIMESHEET_NEEDS_DOCTOR);
  const respondedBookings = new Set(data.responses.map((r) => r.bookingEpisodeId).filter(Boolean));
  const feedbackDue = workedPast.filter((b) => !respondedBookings.has(b.id));

  return (
    <>
      {connectivity}
      <section>
        <h2>Home</h2>

        <Panel title="Credential health" to="/passport" linkLabel="Open passport">
          <p style={{ margin: "0 0 6px", fontSize: 13 }}>
            {data.credentials.length} credential{data.credentials.length === 1 ? "" : "s"} declared
            {unverified > 0 && ` · ${unverified} not yet verified`}
          </p>
          {expiring.length === 0 ? (
            <Empty>Nothing expiring in the next {EXPIRY_WARNING_DAYS} days.</Empty>
          ) : (
            <ul style={listStyle}>
              {expiring.map((c) => {
                const days = c.expiryDate ? daysUntil(c.expiryDate) : null;
                const lapsed = c.status === "EXPIRED" || (days !== null && days < 0);
                return (
                  <li key={c.id} style={rowStyle}>
                    <Link to={`/passport/credential/${c.id}`}>{c.definition.name}</Link>
                    <span style={{ color: lapsed ? "#a33" : "#a67c00", fontWeight: 600 }}>
                      {lapsed ? "Expired" : `Expires in ${days} day${days === 1 ? "" : "s"}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="Active shares" to="/share" linkLabel="Manage shares">
          {activeShares.length === 0 ? (
            <Empty>No active shares.</Empty>
          ) : (
            <ul style={listStyle}>
              {activeShares.map((s) => (
                <li key={s.id} style={rowStyle}>
                  <span>{s.recipientLabel ?? "Unnamed recipient"}</span>
                  <span style={{ color: "#666" }}>
                    {s.accessEventCount} access event{s.accessEventCount === 1 ? "" : "s"} · expires {formatDate(s.expiresAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Upcoming bookings" to="/booking" linkLabel="All bookings">
          {upcoming.length === 0 ? (
            <Empty>No upcoming bookings.</Empty>
          ) : (
            <ul style={listStyle}>
              {upcoming.map((b) => (
                <li key={b.id} style={rowStyle}>
                  <span>
                    {formatDate(b.vacancy.startAt)} · {b.vacancy.facility.name} · {b.vacancy.roleTemplate.name}
                  </span>
                  {b.status === "PENDING_CONFIRMATION" && (
                    <span style={{ color: "#a67c00", fontWeight: 600 }}>Needs your confirmation</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Open vacancies" to="/vacancy" linkLabel="Browse vacancies">
          <p style={{ margin: "0 0 6px", fontSize: 12, color: "#666" }}>
            Everything currently open, not filtered to you — your eligibility is assessed when you apply, and
            an unknown is shown as unknown, never as a quiet yes.
          </p>
          {data.vacancies.length === 0 ? (
            <Empty>No open vacancies right now.</Empty>
          ) : (
            <ul style={listStyle}>
              {data.vacancies.slice(0, 5).map((v) => (
                <li key={v.id} style={rowStyle}>
                  <span>
                    {formatDate(v.startAt)} · {v.facility.name} · {v.roleTemplate.name}
                  </span>
                  <span style={{ color: "#666" }}>{v.organisation.name}</span>
                </li>
              ))}
              {data.vacancies.length > 5 && <li style={{ color: "#666" }}>and {data.vacancies.length - 5} more</li>}
            </ul>
          )}
        </Panel>

        <Panel title="Pending timesheets">
          {pendingTimesheets.length === 0 ? (
            <Empty>Nothing waiting on you.</Empty>
          ) : (
            <ul style={listStyle}>
              {pendingTimesheets.map(({ booking, timesheet }) => (
                <li key={booking.id} style={rowStyle}>
                  <Link to={`/timesheet?bookingId=${booking.id}`}>
                    {formatDate(booking.vacancy.startAt)} · {booking.vacancy.facility.name}
                  </Link>
                  <span style={{ color: "#a67c00", fontWeight: 600 }}>
                    {timesheet ? TIMESHEET_NEEDS_DOCTOR[timesheet.status] : "not started"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Feedback due" to="/experience" linkLabel="Give feedback">
          {feedbackDue.length === 0 ? (
            <Empty>No shifts awaiting feedback.</Empty>
          ) : (
            <ul style={listStyle}>
              {feedbackDue.map((b) => (
                <li key={b.id} style={rowStyle}>
                  <span>
                    {formatDate(b.vacancy.startAt)} · {b.vacancy.facility.name} · {b.vacancy.roleTemplate.name}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </section>
    </>
  );
}

const listStyle = { listStyle: "none", padding: 0, margin: 0, fontSize: 13 } as const;
const rowStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  padding: "5px 0",
  borderBottom: "1px solid #eee",
} as const;

function Panel({
  title,
  to,
  linkLabel,
  children,
}: {
  title: string;
  to?: string;
  linkLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 6, padding: 12, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <h3 style={{ fontSize: 15, margin: 0 }}>{title}</h3>
        {to && linkLabel && (
          <Link to={to} style={{ fontSize: 12 }}>
            {linkLabel} →
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: 0, fontSize: 13, color: "#666" }}>{children}</p>;
}
