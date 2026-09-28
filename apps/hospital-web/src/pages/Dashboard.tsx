import { useAuth } from "../lib/auth-context.js";

export default function Dashboard() {
  const { user, activeOrgId, setActiveOrgId } = useAuth();

  if (!user) return null;

  return (
    <section>
      <h2>Dashboard</h2>
      <p style={{ fontSize: 13, color: "#555" }}>
        Signed in as {user.displayName ?? user.email}
      </p>

      <h3 style={{ marginTop: 24, fontSize: 15 }}>Your organisations</h3>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {user.memberships.map((m) => (
          <li
            key={`${m.organisationId}-${m.role}`}
            style={{
              border: "1px solid " + (m.organisationId === activeOrgId ? "#333" : "#ddd"),
              borderRadius: 6,
              padding: 10,
              marginBottom: 8,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontWeight: 600 }}>{m.organisationName}</div>
              <div style={{ fontSize: 12, color: "#666" }}>{m.role.replaceAll("_", " ")}</div>
            </div>
            {m.organisationId === activeOrgId ? (
              <span style={{ fontSize: 12, color: "#0a7a2f", fontWeight: 600 }}>Active</span>
            ) : (
              <button type="button" onClick={() => setActiveOrgId(m.organisationId)} style={{ padding: "4px 10px" }}>
                Switch to this org
              </button>
            )}
          </li>
        ))}
      </ul>
      {user.memberships.length === 0 && (
        <p style={{ color: "#a33" }}>
          Your account has no organisation membership yet — nothing below will work until a
          PLATFORM_SECURITY_ADMIN adds you to one.
        </p>
      )}

      <p style={{ fontSize: 13, color: "#666", marginTop: 24 }}>
        Use the nav above to manage scope grants, review credentials awaiting verification,
        or create and staff vacancies for your active organisation.
      </p>
    </section>
  );
}
