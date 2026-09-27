import PagePlaceholder from "./PagePlaceholder.js";

export default function Preferences() {
  return (
    <PagePlaceholder
      title="Preferences"
      specRef="docs/spec/02-ynlhn-mvp-product-spec-v1.0.docx §9 (Doctor / Preferences)"
      minimumContent={[
        "Sites/roles and explicit exclusions",
        "Confidential minimum rate floors",
        "Travel and accommodation preferences",
        "Availability",
        "Agency relationships",
        "Notification channels and quiet hours",
        "Delivery-mode preference: in-person / telehealth / hybrid (docs/addendum/v0.3-addendum.md §4)",
      ]}
    />
  );
}
