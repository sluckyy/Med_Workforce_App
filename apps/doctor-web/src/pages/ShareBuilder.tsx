import PagePlaceholder from "./PagePlaceholder.js";

export default function ShareBuilder() {
  return (
    <PagePlaceholder
      title="Share builder"
      specRef="docs/spec/02-ynlhn-mvp-product-spec-v1.0.docx §9 (Doctor / Share builder)"
      minimumContent={[
        "Pack template and item selection",
        "Sensitive-item warning (identity and immigration/visa evidence excluded by default — docs/addendum/v0.3-addendum.md §2)",
        "Recipient, OTP and expiry",
        "Preview exactly what the recipient will receive",
        "Send, and later view access log / revoke",
      ]}
    />
  );
}
