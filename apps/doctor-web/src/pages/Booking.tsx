import PagePlaceholder from "./PagePlaceholder.js";

export default function Booking() {
  return (
    <PagePlaceholder
      title="Booking"
      specRef="docs/spec/02-ynlhn-mvp-product-spec-v1.0.docx §9 (Doctor / Booking)"
      minimumContent={[
        "Confirmation, contacts, orientation",
        "No-conflicting-engagement fatigue attestation at interest/confirmation (docs/addendum/v0.3-addendum.md §1)",
        "Changes and cancellation",
        "Launch timesheet",
      ]}
    />
  );
}
