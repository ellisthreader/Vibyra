import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { emitTo } from '@tauri-apps/api/event';
import { takeScreenshotEditorCapture, finishScreenshotEdit } from '../../ipc/tools';
import { useScreenshotStore } from '../../state/screenshotStore';
import { ScreenshotEditor } from './ScreenshotEditor';
import { screenshotDemo } from '../../lib/screenshotDemo';

export function ScreenshotWindow() {
  const [error, setError] = useState('');
  const demo = import.meta.env.DEV && new URLSearchParams(location.search).has('demo');
  useEffect(() => {
    if (demo) { useScreenshotStore.setState({ draft: screenshotDemo() }); return () => useScreenshotStore.setState({ draft: null }); }
    let live = true;
    void takeScreenshotEditorCapture().then(draft => {
      if (live) useScreenshotStore.setState({ draft });
    }).catch(cause => { if (live) setError(String(cause)); });
    const cleanup = getCurrentWindow().onCloseRequested(async () => {
      await emitTo('main', 'screenshot:closed').catch(() => {});
      await finishScreenshotEdit().catch(() => {});
    });
    return () => { live = false; useScreenshotStore.setState({ draft: null }); void cleanup.then(off => off()); };
  }, [demo]);
  if (error) return <div className="screenshot-window-error" role="alert"><p>Screenshot could not be opened.</p><small>{error}</small><button className="btn" onClick={() => void getCurrentWindow().close()}>Close</button></div>;
  return <ScreenshotEditor forReport={new URLSearchParams(location.search).has('report')} />;
}
