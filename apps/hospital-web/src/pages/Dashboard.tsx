import PagePlaceholder from "./PagePlaceholder.js";

export default function Dashboard() {
  return (
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
  );
}
