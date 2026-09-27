interface Props {
  title: string;
  specRef: string;
  minimumContent: string[];
}

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
