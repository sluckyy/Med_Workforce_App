import { useEffect, useState } from "react";
import PagePlaceholder from "./PagePlaceholder.js";
import { getApiBaseUrl } from "../config.js";

type ApiStatus = "checking" | "ok" | "unreachable";

export default function Home() {
  const [apiStatus, setApiStatus] = useState<ApiStatus>("checking");

  useEffect(() => {
    const apiBaseUrl = getApiBaseUrl();
    fetch(`${apiBaseUrl}/health`)
      .then((res) => setApiStatus(res.ok ? "ok" : "unreachable"))
      .catch(() => setApiStatus("unreachable"));
  }, []);

  return (
    <>
      <p style={{ fontSize: 13, color: apiStatus === "ok" ? "#0a7a2f" : "#a33" }}>
        API connectivity: {apiStatus}
      </p>
      <PagePlaceholder
        title="Home"
        specRef="docs/spec/02-ynlhn-mvp-product-spec-v1.0.docx §9 (Doctor / Home)"
        minimumContent={[
          "Credential health and expiring items",
          "Active shares",
          "Upcoming bookings",
          "Suitable vacancies",
          "Pending timesheet",
          "Feedback due",
        ]}
      />
    </>
  );
}
