import type { PreviewDeviceKind } from '../../previewTypes';
export function PreviewDeviceIcon({ kind }: { kind: PreviewDeviceKind }) {
  const phone = kind === 'phone' || kind === 'foldable';
  return <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3">
    {phone ? <><rect x="5.5" y="2" width="9" height="16" rx="2"/><path d="M9 15.5h2"/></>
      : kind === 'tablet' ? <><rect x="3.5" y="2" width="13" height="16" rx="2"/><path d="M9 15.5h2"/></>
      : kind === 'laptop' ? <><rect x="3" y="3.5" width="14" height="10" rx="1"/><path d="m3 13.5-2 3h18l-2-3"/></>
      : <><rect x="2" y="3" width="16" height="11" rx="1"/>{kind === 'tv' ? <path d="m5 14-2 3m12-3 2 3"/> : <path d="M10 14v3m-4 0h8"/>}</>}
  </svg>;
}
