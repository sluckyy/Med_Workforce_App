import { NavLink, Route, Routes } from "react-router-dom";
import Home from "./pages/Home.js";
import Passport from "./pages/Passport.js";
import CredentialDetail from "./pages/CredentialDetail.js";
import ShareBuilder from "./pages/ShareBuilder.js";
import Preferences from "./pages/Preferences.js";
import VacancyDetail from "./pages/VacancyDetail.js";
import Booking from "./pages/Booking.js";
import Timesheet from "./pages/Timesheet.js";
import Experience from "./pages/Experience.js";

const nav = [
  { to: "/", label: "Home", end: true },
  { to: "/passport", label: "Passport" },
  { to: "/passport/credential", label: "Credential detail" },
  { to: "/share", label: "Share builder" },
  { to: "/preferences", label: "Preferences" },
  { to: "/vacancy", label: "Vacancy detail" },
  { to: "/booking", label: "Booking" },
  { to: "/timesheet", label: "Timesheet" },
  { to: "/experience", label: "Experience" },
];

export default function App() {
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 720, margin: "0 auto", padding: 16 }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20 }}>Medical Workforce Passport — Doctor</h1>
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
          <Route path="/" element={<Home />} />
          <Route path="/passport" element={<Passport />} />
          <Route path="/passport/credential" element={<CredentialDetail />} />
          <Route path="/share" element={<ShareBuilder />} />
          <Route path="/preferences" element={<Preferences />} />
          <Route path="/vacancy" element={<VacancyDetail />} />
          <Route path="/booking" element={<Booking />} />
          <Route path="/timesheet" element={<Timesheet />} />
          <Route path="/experience" element={<Experience />} />
        </Routes>
      </main>
    </div>
  );
}
