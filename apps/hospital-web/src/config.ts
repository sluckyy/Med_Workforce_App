declare global {
  interface Window {
    __MED_WORKFORCE_CONFIG__?: { apiBaseUrl?: string };
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
