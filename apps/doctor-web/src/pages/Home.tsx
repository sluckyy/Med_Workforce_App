import PagePlaceholder from "./PagePlaceholder.js";

export default function Home() {
  return (
    <PagePlaceholder
      title="Home"
      specRef="docs/spec/02-ynlhn-mvp-product-spec-v1.0.docx §9 (Doctor / Home)"
      minimumContent={[
        "Credential health and expiring items",
        "Active shares",
        "Upcoming bookings",
        "Suitable vacancies",
        "Pending timesheet",
        "Feedback due",
      ]}
    />
  );
}
