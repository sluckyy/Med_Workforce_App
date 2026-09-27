import PagePlaceholder from "./PagePlaceholder.js";

export default function Experience() {
  return (
    <PagePlaceholder
      title="Experience"
      specRef="docs/spec/02-ynlhn-mvp-product-spec-v1.0.docx §9 (Doctor / Experience) and Appendix B survey wording (docs/spec/04-ynlhn-implementation-evaluation-plan-v0.2.docx)"
      minimumContent={[
        "Short confidential survey (culture, support, orientation, workload, return intention)",
        "Optional free text",
        "Safety redirect: this survey is not the formal incident-reporting channel",
      ]}
    />
  );
}
