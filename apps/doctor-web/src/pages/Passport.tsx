import PagePlaceholder from "./PagePlaceholder.js";

export default function Passport() {
  return (
    <PagePlaceholder
      title="Passport"
      specRef="docs/spec/02-ynlhn-mvp-product-spec-v1.0.docx §9 (Doctor / Passport)"
      minimumContent={[
        "Credential list grouped by category",
        "Status/assurance/expiry per credential",
        "Add/edit credential claim",
        "Evidence versions",
        "Rural generalist procedural endorsements (docs/addendum/v0.3-addendum.md §3)",
        "Immigration/visa/Area-of-Need status, shown with the highest-sensitivity treatment (docs/addendum/v0.3-addendum.md §2)",
      ]}
    />
  );
}
