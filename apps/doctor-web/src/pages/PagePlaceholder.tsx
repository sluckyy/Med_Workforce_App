interface Props {
  title: string;
  specRef: string;
  minimumContent: string[];
}

/**
 * Shared placeholder shell for MVP screens. Replace with the real screen
 * once its module's data/API is implemented — this exists so co-design
 * sessions have something clickable to react to from day one, per
 * docs/spec/02-ynlhn-mvp-product-spec-v1.0.docx §9.
 */
export default function PagePlaceholder({ title, specRef, minimumContent }: Props) {
  return (
    <section>
      <h2>{title}</h2>
      <p style={{ color: "#666", fontSize: 13 }}>Spec reference: {specRef}</p>
      <p>Minimum content/actions for this screen:</p>
      <ul>
        {minimumContent.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
