import PagePlaceholder from "./PagePlaceholder.js";

export default function ExperienceDashboard() {
  return (
    <PagePlaceholder
      title="Experience dashboard"
      specRef="docs/spec/02-ynlhn-mvp-product-spec-v1.0.docx §9 (Hospital / Experience dashboard)"
      minimumContent={[
        "Aggregated trends only — enforced by the query layer's minimum-n suppression, not dashboard convention",
        "Small-n cells suppressed",
        "Improvement actions",
      ]}
    />
  );
}
