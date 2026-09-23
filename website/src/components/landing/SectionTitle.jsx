export default function SectionTitle({ id, lines }) {
  const content = Array.isArray(lines) ? lines : [lines];

  return (
    <h2 id={id} className="section-title section-title-lines reveal">
      {content.map((line) => (
        <span key={line} className="section-title-line">
          {line}
        </span>
      ))}
    </h2>
  );
}
