import PagePlaceholder from "./PagePlaceholder.js";

export default function VacancyEditor() {
  return (
    <PagePlaceholder
      title="Vacancy editor"
      specRef="docs/spec/02-ynlhn-mvp-product-spec-v1.0.docx §9 (Hospital / Vacancy editor)"
      minimumContent={[
        "Structured shift fields",
        "Role template (including rural generalist procedural templates — docs/addendum/v0.3-addendum.md §3)",
        "Delivery mode: in-person / telehealth / hybrid (docs/addendum/v0.3-addendum.md §4)",
        "Approval",
        "Sourcing policy",
        "Preview",
      ]}
    />
  );
}
