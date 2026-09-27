import { NavLink, Route, Routes } from "react-router-dom";
import Dashboard from "./pages/Dashboard.js";
import VacancyEditor from "./pages/VacancyEditor.js";
import CandidateComparison from "./pages/CandidateComparison.js";
import ScopeView from "./pages/ScopeView.js";
import ExperienceDashboard from "./pages/ExperienceDashboard.js";

const nav = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/vacancy-editor", label: "Vacancy editor" },
  { to: "/candidates", label: "Candidate comparison" },
  { to: "/scope", label: "Credential / scope view" },
  { to: "/experience", label: "Experience dashboard" },
];

export default function App() {
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 720, margin: "0 auto", padding: 16 }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20 }}>Medical Workforce Exchange — Hospital</h1>
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
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/vacancy-editor" element={<VacancyEditor />} />
          <Route path="/candidates" element={<CandidateComparison />} />
          <Route path="/scope" element={<ScopeView />} />
          <Route path="/experience" element={<ExperienceDashboard />} />
        </Routes>
      </main>
    </div>
  );
}
