import { useState } from 'react';
import './notificationError.css';

export function NotificationError({ message }: { message: string }) {
  const [copyState, setCopyState] = useState('Copy error');
  return <div className="notification-error">
    <p tabIndex={0} aria-label="Full error message">{message}</p>
    <button type="button" onClick={() => {
      void navigator.clipboard.writeText(message)
        .then(() => setCopyState('Copied'))
        .catch(() => setCopyState('Select the message to copy'));
    }}>{copyState}</button>
  </div>;
}
