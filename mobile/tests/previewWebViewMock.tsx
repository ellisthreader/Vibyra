import { forwardRef, useEffect, useImperativeHandle } from 'react';

type Props = Record<string, any>;
export const mock = { props: {} as Props, mounts: 0, unmounts: 0, sources: new Set<unknown>() };
export const WebView = forwardRef(function MockWebView(props: Props, ref) {
  useImperativeHandle(ref, () => ({ goBack() {}, goForward() {}, reload() {} }), []);
  useEffect(() => { mock.mounts++; return () => { mock.unmounts++; }; }, []);
  useEffect(() => { mock.props = props; mock.sources.add(props.source); });
  return <div data-testid="mock-website" style={{ background: 'white', flex: 1 }}>Website</div>;
});
