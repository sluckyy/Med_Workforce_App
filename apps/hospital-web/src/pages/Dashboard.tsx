import { useEffect, useState } from "react";
import PagePlaceholder from "./PagePlaceholder.js";
import { getApiBaseUrl } from "../config.js";

type ApiStatus = "checking" | "ok" | "unreachable";

export default function Dashboard() {
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
        title="Dashboard"
        specRef="docs/spec/02-ynlhn-mvp-product-spec-v1.0.docx §9 (Hospital / Dashboard)"
        minimumContent={[
          "Vacancy pulse and urgent gaps",
          "Sourcing stage",
          "Pending approvals",
          "Booked shifts / placements (docs/addendum/v0.3-addendum.md §3)",
          "Timesheets",
        ]}
      />
    </>
  );
}
