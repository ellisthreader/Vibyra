export function InspectorData({ value }: { value: unknown }) {
  if (value == null) return <p className="inspector-muted">Not reported by the provider.</p>;
  if (typeof value !== 'object') return <span>{String(value)}</span>;
  if (Array.isArray(value)) return <div className="inspector-values">{value.map((entry, i) => <InspectorData key={i} value={entry} />)}</div>;
  return <dl className="inspector-data">{Object.entries(value).map(([key, entry]) => <div key={key}>
    <dt>{key.replace(/([A-Z])/g, ' $1').replace(/^./, char => char.toUpperCase())}</dt><dd><InspectorData value={entry} /></dd>
  </div>)}</dl>;
}
