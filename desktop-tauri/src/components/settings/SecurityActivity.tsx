import { useId, useState } from 'react';
import type { RemoteSecuritySnapshot } from '../../ipc/remoteSecurity';
import { SettingsBlock } from './SettingsShared';

/** Presentation only: keep the server's event order and the existing ten-event limit. */
export function SecurityActivity({ events, unavailable }: {
  events?: RemoteSecuritySnapshot['events'];
  unavailable: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const recent = (events ?? []).slice(0, 10);
  const visible = expanded ? recent : recent.slice(0, 3);
  return (
    <SettingsBlock label="Recent activity" panel="securityActivity">
      <ol className="security-activity" id={id}>
        {visible.map((event, index) => {
          const device = event.metadata.device || event.metadata.client || event.metadata.computer;
          const date = new Date(event.createdAt);
          const validDate = Number.isFinite(date.getTime());
          return <li className="security-activity__item" key={event.id || index}>
            <span className="security-activity__dot" aria-hidden="true" />
            <div>
              <span className="security-activity__title">{event.title}</span>
              <span className="security-activity__detail">{device && <span>{device}</span>}
                <time dateTime={validDate ? date.toISOString() : undefined}>
                  {validDate ? date.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : event.createdAt}
                </time>
              </span>
            </div>
          </li>;
        })}
      </ol>
      {!recent.length && <p className="security-empty" role="status">{events ? 'No remote security activity yet' : unavailable ? 'Recent activity unavailable' : 'Loading recent activity…'}</p>}
      {recent.length > 3 && <button type="button" className="security-activity__more" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(!expanded)}>
        {expanded ? 'Show less' : `Show ${recent.length - 3} more events`}
      </button>}
    </SettingsBlock>
  );
}
