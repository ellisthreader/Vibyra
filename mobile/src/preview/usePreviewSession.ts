import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorkspaceModel } from '../ui/types';
import { ACTIVE_RUN, type PreviewRunnable } from './runnable';
import { previewHostNoun } from './hostNoun';
import { autoOpenRow, claimRunOpen, runWindowTarget, subscribeRunOpen, takeRunOpen } from './runOpen';
import { previewRunRows, previewTargetMatchesProject, previewTargetRunning } from './targetMatch';
import type { PreviewList, PreviewTarget as Target } from './types';

export interface OpenPage { url: string; label: string; nativeWindow?: boolean; close(): Promise<void> }
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

/** One Preview sheet's session: finding this project's targets and runnable apps,
 *  consent for a native window, and the open page. The Mac owns the server;
 *  closing only closes the phone adapter. */
export function usePreviewSession({ visible, onClose, projectId, workspace, known }: {
  visible: boolean; onClose(): void; projectId: string; workspace: WorkspaceModel; known?: Target | null;
}) {
  const [targets, setTargets] = useState<Target[]>([]);
  const [runnables, setRunnables] = useState<PreviewRunnable[]>([]);
  const [consent, setConsent] = useState<Target | null>(null);
  const [page, setPage] = useState<OpenPage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const actionsRef = useRef(workspace.actions);
  actionsRef.current = workspace.actions;
  const request = useRef(0);
  const lastTarget = useRef<string | null>(null);
  const pageRef = useRef<OpenPage | null>(null);
  const lookRef = useRef<(() => void) | null>(null);
  // The finding loop belongs to one opening of the sheet; a choice stops automatic opening.
  const session = useRef(0);
  const choosing = useRef(false);
  // Read when the sheet opens, not tracked: the header's polling hands over a new
  // object every few seconds, and that must not reopen the page.
  const knownRef = useRef(known);
  knownRef.current = known;
  // Host snapshots replace the projects array while the sheet is open. Read the
  // latest paths for matching without treating each snapshot as a new session.
  const projectsRef = useRef(workspace.projects);
  projectsRef.current = workspace.projects;
  const runsRef = useRef(workspace.previewRunAvailable);
  const nounRef = useRef(previewHostNoun(workspace));
  nounRef.current = previewHostNoun(workspace);
  runsRef.current = workspace.previewRunAvailable;
  const mine = useCallback((target: { projectId: string }) =>
    previewTargetMatchesProject(target, projectId, projectsRef.current), [projectId]);
  const accept = useCallback((result: PreviewList) => {
    const matches = result.targets.filter(target => mine(target) && previewTargetRunning(target));
    const rows = runsRef.current ? previewRunRows(result.runnable ?? [], projectId, projectsRef.current) : [];
    setTargets(matches); setRunnables(rows);
    return { matches, rows };
  }, [mine, projectId]);

  const releasePage = useCallback(() => {
    const current = pageRef.current;
    pageRef.current = null;
    if (current) void current.close();
    setPage(null);
  }, []);

  const close = useCallback(() => {
    request.current++;
    setBusy(false);
    releasePage();
    onClose();
  }, [onClose, releasePage]);

  useEffect(() => () => {
    request.current++;
    const current = pageRef.current;
    pageRef.current = null;
    if (current) void current.close();
  }, []);

  const open = useCallback(async (target: Target) => {
    const actions = actionsRef.current;
    if (!mine(target) || !previewTargetRunning(target) || !actions.startPreview || !actions.openPreview) return;
    if (target.approvalRequired) { setError(''); setConsent(target); setBusy(false); return; }
    setConsent(null);
    const version = ++request.current;
    setBusy(true); setError('');
    try {
      // A running target was verified by preview.list; preview.open checks its
      // grant and listener again. Skip an extra start round trip on reopen.
      if (!target.running) {
        const started = await actions.startPreview(target.grantId);
        if (started.phase === 'failed') throw new Error(`The ${nounRef.current} could not start this site. Check Preview on your ${nounRef.current}.`);
      }
      let opened: { url: string; close(): Promise<void> } | null = null;
      for (let attempt = 0; attempt < 8 && request.current === version; attempt++) {
        try { opened = await actions.openPreview(target.grantId); break; }
        catch (cause) {
          if (!/not running|no local address/i.test(message(cause)) || attempt === 7) throw cause;
          if (target.running && attempt === 0) {
            const started = await actions.startPreview(target.grantId);
            if (started.phase === 'failed') throw new Error(`The ${nounRef.current} could not start this site. Check Preview on your ${nounRef.current}.`);
          }
          await wait(Math.min(500 * 2 ** attempt, 4000));
        }
      }
      if (!opened) return;
      if (request.current !== version) { await opened.close(); return; }
      lastTarget.current = target.grantId;
      const port = /^(?:auto|attached)-port:(\d+)$/.exec(target.targetId)?.[1];
      const pageWithLabel = { ...opened, nativeWindow: target.targetId.startsWith('native-window:'), label: port ? `localhost:${port}` : target.name || target.targetId };
      pageRef.current = pageWithLabel;
      setPage(pageWithLabel);
    } catch (cause) { if (request.current === version) setError(message(cause)); }
    finally { if (request.current === version) setBusy(false); }
  }, [mine]);

  useEffect(() => {
    if (!visible || workspace.status !== 'connected') {
      releasePage();
      return;
    }
    // Only a host/project change or explicit retry starts a new session.
    // Refreshed callbacks, target lists and Host snapshots must not reload it.
    releasePage();
    request.current++;
    const version = ++session.current;
    choosing.current = false;
    setTargets([]); setRunnables([]); setConsent(null); setError(''); setBusy(true);
    // Nothing running yet: keep looking, and open the site the moment its server starts.
    // A run in progress keeps being read too, so its steps show as they happen.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const look = () => { clearTimeout(timer); const asked = request.current;
      void actionsRef.current.listPreviews?.().then(result => {
        if (session.current !== version || pageRef.current) return;
        const { matches, rows } = accept(result);
        const again = () => { clearTimeout(timer);
          if (!matches.length || rows.some(row => ACTIVE_RUN.includes(row.runState))) timer = setTimeout(look, 2000); };
        // Another open or a choice started meanwhile: only keep the lists fresh.
        if (request.current !== asked) return again();
        setError(!matches.length && !rows.length ? result.windowProblem ?? '' : '');
        const run = autoOpenRow(rows);
        const automatic = run?.runId && claimRunOpen(run.runId) ? runWindowTarget(run, result.targets)
          : choosing.current ? undefined : matches.length === 1 ? matches[0]
          : matches.find(target => target.grantId === lastTarget.current);
        if (automatic) void open(automatic);
        else { setBusy(false); again(); }
      }).catch(cause => { if (session.current === version && request.current === asked) { setError(message(cause)); setBusy(false); } }); };
    lookRef.current = look;
    // A run's window the chat just handed over comes first, then the header's find.
    const found = takeRunOpen(mine) ?? knownRef.current;
    if (found && previewTargetRunning(found) && mine(found)) {
      setTargets([found]);
      void open(found);
    } else look();
    const [requests, sessions] = [request, session];
    return () => { requests.current++; sessions.current++; clearTimeout(timer); lookRef.current = null; };
  }, [visible, projectId, workspace.host?.id, workspace.status, retry, open, releasePage, accept, mine]);

  // The chat handed over a run's window while this sheet was already open.
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  useEffect(() => subscribeRunOpen(() => {
    if (!visibleRef.current) return;
    const target = takeRunOpen(mine);
    if (target) { releasePage(); void open(target); }
  }), [mine, open, releasePage]);

  useEffect(() => {
    if (visible && workspace.status !== 'connected') {
      request.current++;
      releasePage();
      setError(`The ${nounRef.current} disconnected. Reconnect before opening Live Preview.`);
    }
  }, [visible, workspace.status, releasePage]);

  const choose = () => {
    setConsent(null); releasePage(); request.current++; choosing.current = true; setBusy(true); setError('');
    lookRef.current?.();
  };

  const view = () => {
    const selected = consent; if (!selected) return;
    const version = ++request.current; setBusy(true);
    const share = actionsRef.current.shareWindowPreview;
    if (!share) { setConsent(null); setError('Update Vibyra on this phone to share application windows.'); setBusy(false); return; }
    void share(selected.grantId).then(approved => {
      if (request.current === version) void open(approved);
    }).catch(cause => { if (request.current === version) { setConsent(null); setError(message(cause)); setBusy(false); } });
  };

  return { targets, runnables, consent, page, busy, error, close, open, choose, view,
    retry: () => setRetry(value => value + 1),
    reconnect: () => { releasePage(); setRetry(value => value + 1); },
    /** Read the list again now (a run started or stopped). */
    refresh: () => lookRef.current?.() };
}
