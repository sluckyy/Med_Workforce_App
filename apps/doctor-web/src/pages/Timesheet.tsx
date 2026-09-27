import PagePlaceholder from "./PagePlaceholder.js";

export default function Timesheet() {
  return (
    <PagePlaceholder
      title="Timesheet"
      specRef="docs/spec/02-ynlhn-mvp-product-spec-v1.0.docx §9 (Doctor / Timesheet)"
      minimumContent={[
        "Booked vs actual hours",
        "Allowances",
        "Declaration and submit",
        "Approval status (accountless approver — no platform account required)",
      ]}
    />
  );
}
