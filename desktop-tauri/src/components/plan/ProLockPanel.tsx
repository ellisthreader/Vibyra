import { accountBillingPage } from "../../ipc/accountBilling";
import { SparklesIcon } from "../common/Icons";

/** In place of a Pro-only panel on Free: what it does, and the way to it. */
export function ProLockPanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="pro-lock" role="note">
      <span className="pro-lock__mark" aria-hidden="true"><SparklesIcon size={16} /></span>
      <strong>{title}</strong>
      <p>{body}</p>
      <button className="btn btn--primary" type="button" onClick={() => void accountBillingPage("pro").catch(() => {})}>
        Get Vibyra Pro
      </button>
    </div>
  );
}
