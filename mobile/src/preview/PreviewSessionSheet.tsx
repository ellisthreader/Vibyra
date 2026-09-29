import { styles } from './previewSheetStyles';
import { Modal, StatusBar } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import type { WorkspaceModel } from '../ui/types';
import { PreviewWebView } from './PreviewWebView';
import { PreviewChooser } from './PreviewChooser';
import { PreviewSheetHeader } from './PreviewSheetHeader';
import { PreviewStatus } from './PreviewStatus';
import { PreviewHostNounContext, previewHostNoun } from './hostNoun';
import type { PreviewTarget as Target } from './types';
import { usePreviewSession } from './usePreviewSession';
import { WindowConsent } from './WindowConsent';
import { planLimitFrom } from '../vibes/planLimit';
import { usePlanEntitlements } from '../vibes/usePlanEntitlements';

/** The Mac owns the server; closing this sheet closes only the phone adapter. */
export function PreviewSessionSheet({ visible, onClose, projectId, workspace, known }: {
  visible: boolean; onClose(): void; projectId: string; workspace: WorkspaceModel;
  /** The running site the card or header already found: it opens straight away. */
  known?: Target | null;
}) {
  const { colors, dark } = useTheme();
  const session = usePreviewSession({ visible, onClose, projectId, workspace, known });
  const { targets, consent, page, busy, error, close } = session;
  const connected = workspace.status === 'connected';
  // Preview is Pro. The computer refuses it on Free anyway; saying so here
  // keeps the phone from showing that refusal as a fault.
  const plan = usePlanEntitlements();
  const limit = plan?.preview === false
    ? { title: 'Preview is part of Vibyra Pro', message: 'Watch your site change as your agents build it, on your phone. Upgrade to Vibyra Pro to turn it on.' }
    : planLimitFrom(error) ? { title: 'Preview is part of Vibyra Pro', message: planLimitFrom(error)!.message } : null;
  // Desktop apps this project can run sit beside whatever is already running.
  const runs = workspace.previewRunAvailable ? session.runnables : [];
  const choosing = !error && !busy && (targets.length > 0 || runs.length > 0);

  // Keep the presenting view mounted while Preview covers it. The secure
  // transport WebView lives there; fullScreen removes it from the view tree
  // and WebKit throttles its socket callbacks during image-heavy pages.
  // Turning the phone sideways shows a wide app window, or site, larger.
  return <Modal visible={visible} animationType="slide" presentationStyle="overFullScreen" onRequestClose={close}
    supportedOrientations={['portrait', 'landscape-left', 'landscape-right']}>
    <StatusBar hidden={false} barStyle={dark ? 'light-content' : 'dark-content'} />
    <PreviewHostNounContext.Provider value={previewHostNoun(workspace)}>
    <SafeAreaProvider style={styles.empty}>
    {page ? <PreviewWebView nativeWindow={page.nativeWindow} startUrl={page.url} label={page.label} onClose={close}
      onTargets={session.choose} onReconnect={session.reconnect} /> :
      <SafeAreaView style={[styles.empty, { backgroundColor: colors.background }]}>
        <PreviewSheetHeader onClose={close} />
        {limit ? <PreviewStatus phase="waiting" problem={limit} onClose={close} />
          : consent && !error ? <WindowConsent target={consent} busy={busy} onCancel={session.choose} onView={session.view} />
          : choosing ? <PreviewChooser targets={targets} runs={runs} actions={workspace.actions}
            connected={connected} onOpen={target => void session.open(target)} onChanged={session.refresh} />
          : <PreviewStatus phase={busy ? 'connecting' : 'waiting'}
            problem={error ? { title: 'Preview needs attention', message: error } : undefined} onClose={close}
            onRetry={connected ? session.retry : undefined} />}
      </SafeAreaView>}
    </SafeAreaProvider>
    </PreviewHostNounContext.Provider>
  </Modal>;
}
