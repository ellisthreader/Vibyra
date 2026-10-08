import { useEffect, useState } from 'react';
import { useWorkspaceStore } from '../state/workspaceStore';
import { useLaunchApprovalStore } from '../state/launchApprovalStore';
import { useRunConfirmStore } from '../state/runConfirmStore';
import { useReportStore } from '../state/reportStore';
import { useCloseGuardStore } from '../state/closeGuardStore';
import { usePlanPromptStore } from '../state/planPromptStore';
import { usePhoneStore } from '../state/phoneStore';
import { useRemoteSecurity } from '../state/remoteSecurityStore';

export function useBetaWelcomeBlockers(enabled: boolean) {
  const workspace = useWorkspaceStore(s => s.settingsOpen || s.agentPickerOpen || s.paletteOpen || s.historyOpen || s.preview !== null);
  const launch = useLaunchApprovalStore(s => s.pending !== null);
  const run = useRunConfirmStore(s => s.pending !== null);
  const report = useReportStore(s => s.open || s.capturing);
  const close = useCloseGuardStore(s => s.prompting.length > 0 || !!s.error);
  const plan = usePlanPromptStore(s => s.notice !== null);
  const phone = usePhoneStore(s => !!s.status?.pending.length);
  const remote = useRemoteSecurity(s => !!s.snapshot?.pendingDevices.length || !!s.snapshot?.pendingSessions.length);
  const [otherDialog, setOtherDialog] = useState(true);
  useEffect(() => {
    if (!enabled) { setOtherDialog(true); return; }
    const check = () => setOtherDialog(Array.from(document.querySelectorAll<HTMLElement>(
      '[role="dialog"], [role="alertdialog"], dialog[open]',
    )).some(node => !node.closest('[data-beta-welcome]') && node.getClientRects().length > 0));
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'style', 'class', 'open'] });
    check();
    return () => observer.disconnect();
  }, [enabled]);
  const priorityBlocked = !!(workspace || launch || run || report || close || plan || phone || remote);
  return { priorityBlocked, blocked: priorityBlocked || otherDialog };
}
