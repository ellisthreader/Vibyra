import { statusSummary } from '../../../../mobile/src/conversation/statusSummary';
import { InspectorData } from './InspectorData';
export function ConversationStatus({ value }: { value: unknown }) {
  const status = statusSummary(value);
  return <><p className="inspector-muted">{status.state}</p><dl className="inspector-data">
    {status.rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
  </dl>{status.active && <p className="inspector-muted">Active turn: {status.active}. Your selection applies to the next turn.</p>}
  <details className="conversation-trust"><summary>Technical details</summary><InspectorData value={value} /></details></>;
}
