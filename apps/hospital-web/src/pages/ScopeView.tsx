import PagePlaceholder from "./PagePlaceholder.js";

export default function ScopeView() {
  return (
    <PagePlaceholder
      title="Credential / scope view"
      specRef="docs/spec/02-ynlhn-mvp-product-spec-v1.0.docx §9 (Hospital / Credential-scope view)"
      minimumContent={[
        "Minimum necessary credential status",
        "Verification and current YNLHN scope (never editable from this view)",
        "Area of Need / moratorium status where applicable, highest-sensitivity treatment (docs/addendum/v0.3-addendum.md §2)",
        "Evidence only if explicitly permitted",
      ]}
    />
  );
}
