import PagePlaceholder from "./PagePlaceholder.js";

export default function CredentialDetail() {
  return (
    <PagePlaceholder
      title="Credential detail"
      specRef="docs/spec/02-ynlhn-mvp-product-spec-v1.0.docx §9 (Doctor / Credential detail)"
      minimumContent={[
        "Issuer, dates and structured attributes",
        "Evidence versions",
        "Verification history",
        "Dependent role readiness",
      ]}
    />
  );
}
