import { CopyButton } from '../common/CopyButton';
import './notificationError.css';

export function NotificationError({ message }: { message: string }) {
  return <div className="notification-error">
    <p tabIndex={0} aria-label="Full error message">{message}</p>
    <CopyButton value={message} label="Copy error" />
  </div>;
}
