import { NavLink, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth-context.js";
import Login from "./pages/Login.js";
import Home from "./pages/Home.js";
import Passport from "./pages/Passport.js";
import CredentialDetail from "./pages/CredentialDetail.js";
import ShareBuilder from "./pages/ShareBuilder.js";
import Preferences from "./pages/Preferences.js";
import VacancyDetail from "./pages/VacancyDetail.js";
import Booking from "./pages/Booking.js";
import Timesheet from "./pages/Timesheet.js";
import Experience from "./pages/Experience.js";
import Security from "./pages/Security.js";

const nav = [
  { to: "/", label: "Home", end: true },
  { to: "/passport", label: "Passport" },
  { to: "/share", label: "Share builder" },
  { to: "/preferences", label: "Preferences" },
  { to: "/vacancy", label: "Vacancy detail" },
  { to: "/booking", label: "Booking" },
  { to: "/timesheet", label: "Timesheet" },
  { to: "/experience", label: "Experience" },
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
          <h1 style={{ fontSize: 20 }}>Medical Workforce Passport — Doctor</h1>
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
            <Route path="/" element={<Home />} />
            <Route path="/passport" element={<Passport />} />
            <Route path="/passport/credential/:id" element={<CredentialDetail />} />
            <Route path="/share" element={<ShareBuilder />} />
            <Route path="/preferences" element={<Preferences />} />
            <Route path="/vacancy" element={<VacancyDetail />} />
            <Route path="/booking" element={<Booking />} />
            <Route path="/timesheet" element={<Timesheet />} />
            <Route path="/experience" element={<Experience />} />
            <Route path="/security" element={<Security />} />
          </Routes>
        )}
      </main>
    </div>
  );
}
