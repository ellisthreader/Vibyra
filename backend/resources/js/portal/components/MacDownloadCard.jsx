import React from 'react';
import PlatformRow from './PlatformRow.jsx';
import { downloadPath } from '../api.js';
import { formatBytes } from '../platform.js';

const OPTIONS = [
  { platform: 'macos-arm64', label: 'Apple Silicon', detail: 'M-series Macs' },
  { platform: 'macos-x64', label: 'Intel', detail: 'Intel-based Macs' },
];

export default function MacDownloadCard({ release, recommended }) {
  const variants = Object.fromEntries((release?.variants ?? []).map((variant) => [variant.platform, variant]));
  const available = OPTIONS.filter(({ platform }) => variants[platform]?.available);
  return (
    <PlatformRow
      platform='macos'
      name='macOS'
      meta={available.length ? 'Choose the chip inside your Mac' : 'In preparation — coming soon'}
      recommended={recommended}
      disabled={!available.length}
    >
      {available.length > 0 && <div className='platform-row__install mac-variants' role='group' aria-label='macOS downloads'>
        {available.map(({ platform, label, detail }) => {
          const variant = variants[platform];
          const meta = [variant.version && `Beta ${variant.version}`, formatBytes(variant.sizeBytes),
            variant.minimumSystemVersion && `macOS ${variant.minimumSystemVersion}+`]
            .filter(Boolean).join(' · ');
          return <a
            key={platform}
            className='mac-variant'
            href={downloadPath(platform)}
            aria-label={`Download Vibyra for ${label} Macs`}
          >
            <span><strong>{label}</strong><small>{detail}</small></span>
            <span>{meta || 'Download'} <span aria-hidden='true'>&darr;</span></span>
          </a>;
        })}
      </div>}
    </PlatformRow>
  );
}
