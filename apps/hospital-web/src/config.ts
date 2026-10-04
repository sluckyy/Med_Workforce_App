declare global {
  interface Window {
    __MED_WORKFORCE_CONFIG__?: { apiBaseUrl?: string; doctorWebUrl?: string };
  }
}

/**
 * Resolves the API base URL at runtime from /config.js (written by
 * docker/40-runtime-config.sh from the API_BASE_URL container env var), so
 * one built image works in every environment — local, Azure, etc. Falls
 * back to the Vite build-time env var for `npm run dev`.
 */
export function getApiBaseUrl(): string {
  return (
    window.__MED_WORKFORCE_CONFIG__?.apiBaseUrl ||
    import.meta.env.VITE_API_BASE_URL ||
    "http://localhost:8000"
  );
}

// The doctor-facing app's own base URL — needed to build a timesheet
// approval link (served from doctor-web, see apps/doctor-web's
// ApprovalPage) from inside hospital-web.
export function getDoctorWebBaseUrl(): string {
  return (
    window.__MED_WORKFORCE_CONFIG__?.doctorWebUrl ||
    import.meta.env.VITE_DOCTOR_WEB_URL ||
    "http://localhost:5173"
  );
}
