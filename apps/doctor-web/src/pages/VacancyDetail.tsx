import PagePlaceholder from "./PagePlaceholder.js";

export default function VacancyDetail() {
  return (
    <PagePlaceholder
      title="Vacancy detail"
      specRef="docs/spec/02-ynlhn-mvp-product-spec-v1.0.docx §9 (Doctor / Vacancy detail)"
      minimumContent={[
        "Site/role/time/rate/conditions",
        "Accommodation/travel (or delivery mode, if telehealth — docs/addendum/v0.3-addendum.md §4)",
        "Eligibility explanation (never silently optimistic — INDETERMINATE is a valid, visible outcome)",
        "Express interest / apply",
      ]}
    />
  );
}
