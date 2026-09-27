import PagePlaceholder from "./PagePlaceholder.js";

export default function CandidateComparison() {
  return (
    <PagePlaceholder
      title="Candidate comparison"
      specRef="docs/spec/02-ynlhn-mvp-product-spec-v1.0.docx §9 (Hospital / Candidate comparison)"
      minimumContent={[
        "Eligibility and plain-language explanations (never optimistic on missing data)",
        "Fatigue status, clearly labelled by assurance level (docs/addendum/v0.3-addendum.md §1)",
        "Availability, source and continuity",
        "Cost snapshot",
        "Selection with recorded reason",
      ]}
    />
  );
}
