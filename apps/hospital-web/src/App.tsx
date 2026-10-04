import { NavLink, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth-context.js";
import Login from "./pages/Login.js";
import Dashboard from "./pages/Dashboard.js";
import VacancyEditor from "./pages/VacancyEditor.js";
import CandidateComparison from "./pages/CandidateComparison.js";
import ScopeView from "./pages/ScopeView.js";
import AssuranceQueue from "./pages/AssuranceQueue.js";
import ExperienceDashboard from "./pages/ExperienceDashboard.js";
import Security from "./pages/Security.js";
import Agencies from "./pages/Agencies.js";
import AgencyPortal from "./pages/AgencyPortal.js";
import AgencyProposals from "./pages/AgencyProposals.js";
import Placements from "./pages/Placements.js";
import Timesheets from "./pages/Timesheets.js";

const nav = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/vacancy-editor", label: "Vacancy editor" },
  { to: "/candidates", label: "Candidate comparison" },
  { to: "/agency-proposals", label: "Agency proposals" },
  { to: "/scope", label: "Credential / scope view" },
  { to: "/assurance", label: "Assurance queue" },
  { to: "/timesheets", label: "Timesheets" },
  { to: "/experience", label: "Experience dashboard" },
  { to: "/agencies", label: "Agency panel" },
  { to: "/agency-portal", label: "Agency portal" },
  { to: "/placements", label: "Placements" },
  { to: "/security", label: "Security" },
];

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}

function Shell() {
  const { user, loading, logout } = useAuth();

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 720, margin: "0 auto", padding: 16 }}>
      <header style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h1 style={{ fontSize: 20 }}>Medical Workforce Exchange — Hospital</h1>
          {user && (
            <button
              type="button"
              onClick={() => void logout()}
              style={{ background: "none", border: "none", textDecoration: "underline", cursor: "pointer", fontSize: 13 }}
            >
              Sign out ({user.displayName ?? user.email})
            </button>
          )}
        </div>
        {user && (
          <nav style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8 }}>
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                style={({ isActive }) => ({
                  textDecoration: isActive ? "underline" : "none",
                  fontWeight: isActive ? 600 : 400,
                })}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>
      <main>
        {loading ? (
          <p>Loading…</p>
        ) : !user ? (
          <Login />
        ) : (
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/vacancy-editor" element={<VacancyEditor />} />
            <Route path="/candidates" element={<CandidateComparison />} />
            <Route path="/scope" element={<ScopeView />} />
            <Route path="/assurance" element={<AssuranceQueue />} />
            <Route path="/timesheets" element={<Timesheets />} />
            <Route path="/experience" element={<ExperienceDashboard />} />
            <Route path="/agencies" element={<Agencies />} />
            <Route path="/agency-portal" element={<AgencyPortal />} />
            <Route path="/agency-proposals" element={<AgencyProposals />} />
            <Route path="/placements" element={<Placements />} />
            <Route path="/security" element={<Security />} />
          </Routes>
        )}
      </main>
    </div>
  );
}
