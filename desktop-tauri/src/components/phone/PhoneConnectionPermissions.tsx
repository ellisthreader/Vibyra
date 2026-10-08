import type { ReactNode } from "react";

function Icon({ children }: { children: ReactNode }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24">{children}</svg>;
}

export function PhoneConnectionPermissions({ typing, preview }: { typing: boolean; preview: boolean }) {
  return <div className="phone-connect__permissions">
    <ul aria-label="This phone will be able to">
      <li><Icon><rect x="3" y="4" width="18" height="16" rx="3" /><path d="m7 9 3 3-3 3m6 0h4" /></Icon>
        <div>Read all terminal conversations &amp; output<span>Current and future sessions</span></div></li>
      {typing && <li><Icon><path d="m21 3-7 18-4-7-7-4 18-7ZM10 14 21 3" /></Icon>
        <div>Send instructions that can change files</div></li>}
      {typing && <li><Icon><path d="M12 3 4 6v5c0 5 8 10 8 10s8-5 8-10V6l-8-3Z" /><path d="m8.5 11.5 2.5 2.5 4.5-5" /></Icon>
        <div>Respond to agent permission requests</div></li>}
      {preview && <li><Icon><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M3 9h18M7 6.5h.01M10 6.5h.01" /></Icon>
        <div>Preview your project websites<span>Including signed-in pages and cookies</span></div></li>}
    </ul>
    {!typing && <p>Sending instructions and answering permission requests are off.</p>}
  </div>;
}
