import { useEffect, useRef, useState } from 'react';
import type { WebView } from 'react-native-webview';
import { previewLocation, previewNavigationAllowed } from './navigation';
import { previewProblem, type PreviewProblem } from './previewProblem';

export function usePreviewPage(startUrl: string) {
  const browser = useRef<WebView>(null);
  const currentUrl = useRef(startUrl);
  const loads = useRef<{ at: number; url: string }[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [problem, setProblem] = useState<PreviewProblem>();
  const [location, setLocation] = useState('/');
  const [navigation, setNavigation] = useState({ back: false, forward: false });
  const [progress, setProgress] = useState(0);
  const fail = (error: PreviewProblem) => { setProblem(error); setPhase('error'); };
  useEffect(() => {
    if (phase !== 'loading') return;
    const timer = setTimeout(() => {
      setProblem(previewProblem('timeout')); setPhase('error');
    }, 30000);
    return () => clearTimeout(timer);
  }, [phase, attempt]);
  const retry = () => {
    loads.current = []; currentUrl.current = startUrl;
    setProblem(undefined); setProgress(0); setPhase('loading');
    setAttempt(value => value + 1);
  };
  const begin = (url: string) => {
    const now = Date.now();
    loads.current = loads.current.filter(load => now - load.at < 10000);
    if (previewLocation(url) !== null) loads.current.push({ at: now, url });
    if (loads.current.filter(load => load.url === url).length > 5) { fail(previewProblem('loop')); return; }
    currentUrl.current = url;
    setPhase(previous => previous === 'error' ? previous : 'loading');
    setProgress(0);
  };
  const message = (data: string, url: string) => {
    if (data.length > 2048 || !previewNavigationAllowed(startUrl, url)) return;
    try {
      const event = JSON.parse(data);
      if (event.preview !== 1 || event.url !== url || url !== currentUrl.current) return;
      if (event.kind === 'ready') setPhase(previous => previous === 'error' ? previous : 'ready');
      if (event.kind === 'failed') fail(previewProblem('script', typeof event.detail === 'string' ? event.detail : ''));
    } catch { /* Project messages are untrusted and carry no authority. */ }
  };
  return { browser, attempt, phase, problem, location, navigation, progress, setProgress, retry, begin, message, fail,
    navigate: (state: { url: string; canGoBack: boolean; canGoForward: boolean }) => {
      currentUrl.current = state.url;
      const path = previewLocation(state.url);
      if (path !== null) setLocation(path);
      setNavigation({ back: state.canGoBack, forward: state.canGoForward });
    },
    httpError: (url: string, status: number) => {
      // Missing images/favicons must not replace a healthy page with a full-screen error.
      if (url === currentUrl.current) fail(previewProblem('http', previewLocation(url) ?? 'Preview setup', status));
    },
    back: () => { loads.current = []; browser.current?.goBack(); },
    forward: () => { loads.current = []; browser.current?.goForward(); },
  };
}
