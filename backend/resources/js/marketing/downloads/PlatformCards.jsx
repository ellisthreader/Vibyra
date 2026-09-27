import React, { useState } from 'react';
import { Icon } from '../home/shared.jsx';
import { formatBytes } from '../../portal/platform.js';
import { available, fileUrl, quickInstallCommand } from './catalog.js';
import InstallCommand from './InstallCommand.jsx';

const platforms = [
    { key: 'windows', name: 'Windows', icon: 'microsoft.svg', number: '01' },
    { key: 'linux', name: 'Linux', icon: 'linux-tux.svg', number: '02' },
    { key: 'macos', name: 'macOS', icon: 'apple.svg', number: '03' },
];

const packages = {
    windows: [['windows', 'Download for Windows', 'Windows 10 or 11 · 64-bit']],
    linux: [
        ['linux-deb', 'Download .deb', 'Debian, Ubuntu, Mint · 64-bit'],
        ['linux', 'Download AppImage', 'Other compatible distros · 64-bit'],
    ],
    macos: [
        ['macos-arm64', 'Apple Silicon', 'M-series Macs'],
        ['macos-x64', 'Intel', 'Intel-based Macs'],
    ],
};

function PackageLink({ catalog, item, primary }) {
    const [key, label, system] = item;
    const release = catalog.releases[key];
    const href = fileUrl(catalog, key);
    if (!href) return null;
    return (
        <div className='dl-package'>
            <a className={'dl-package-link' + (primary ? ' dl-package-link--primary' : '')}
                href={href} aria-label={label} data-analytics-cta={'downloads_' + key.replaceAll('-', '_')}
                data-analytics-download={key}>
                <span>{label}</span><Icon name='download' size={17} />
            </a>
            <p>{system}{release.minimumSystemVersion && key.startsWith('macos-')
                ? ` · macOS ${release.minimumSystemVersion}+` : ''}</p>
            <small>v{release.version} <span aria-hidden='true'>·</span> {formatBytes(release.sizeBytes)}</small>
        </div>
    );
}

function PlatformCard({ platform, catalog, recommended }) {
    const ready = packages[platform.key].filter(([key]) => available(catalog.releases[key]));
    return (
        <article className={'dl-card' + (recommended && ready.length ? ' dl-card--recommended' : '')}
            aria-labelledby={'dl-' + platform.key}>
            <div className='dl-card-top'>
                <span className={'dl-icon dl-icon--' + platform.key} aria-hidden='true'>
                    <img src={'/platform-icons/' + platform.icon} alt='' width='36' height='36' />
                </span>
                <span className='dl-number'>{platform.number} / 03</span>
            </div>
            <div className='dl-card-title'>
                <h2 id={'dl-' + platform.key}>{platform.name}</h2>
                {recommended && ready.length > 0 && <span className='dl-recommended'>Your computer</span>}
            </div>
            <p className='dl-card-description'>
                {platform.key === 'windows' && 'A simple installer for your Windows PC.'}
                {platform.key === 'linux' && 'Pick the package that fits your distro.'}
                {platform.key === 'macos' && (ready.length
                    ? 'Choose the build for your Mac’s chip.'
                    : 'Apple Silicon and Intel builds are on the way.')}
            </p>
            <div className='dl-card-actions'>
                {ready.length ? ready.map((item, index) => <PackageLink key={item[0]}
                    catalog={catalog} item={item} primary={index === 0} />) :
                    <p className='dl-unavailable'>{platform.key === 'macos'
                        ? 'Coming soon. Public Mac installers are not available yet.'
                        : 'Temporarily unavailable. Please check back soon.'}</p>}
                {platform.key === 'macos' && ready.some(([key]) => catalog.releases[key].notarized === false) &&
                    <a className='dl-mac-help' href='https://support.apple.com/en-us/102445' target='_blank' rel='noreferrer'>
                        First launch on Mac <Icon size={14} />
                    </a>}
            </div>
        </article>
    );
}

function LinuxCommand({ catalog }) {
    const debReady = available(catalog.releases['linux-deb']);
    const imageReady = available(catalog.releases.linux);
    const [selected, setSelected] = useState('linux-deb');
    if (!debReady && !imageReady) return null;
    const kind = selected === 'linux-deb' && debReady ? 'linux-deb' :
        selected === 'linux' && imageReady ? 'linux' : debReady ? 'linux-deb' : 'linux';
    const command = quickInstallCommand(catalog, kind);
    return (
        <section className='dl-terminal' aria-labelledby='dl-terminal-title'>
            <div className='dl-terminal-heading'>
                <div>
                    <span className='dl-terminal-kicker'>LINUX / TERMINAL</span>
                    <h2 id='dl-terminal-title'>Prefer a command?</h2>
                    <p>Download and get started from your terminal.</p>
                </div>
                {debReady && imageReady && <div className='dl-switch' role='group' aria-label='Linux package format'>
                    <button type='button' aria-pressed={kind === 'linux-deb'} onClick={() => setSelected('linux-deb')}>.deb</button>
                    <button type='button' aria-pressed={kind === 'linux'} onClick={() => setSelected('linux')}>AppImage</button>
                </div>}
            </div>
            {command && <InstallCommand command={command} />}
        </section>
    );
}

export default function PlatformCards({ catalog, error, retry, recommended }) {
    return (
        <section className='dl-platforms page-width' id='installers' aria-label='Desktop downloads'>
            {error ? <div className='dl-error' role='alert'>
                <h2>Downloads couldn’t load.</h2>
                <p>Please try again to check the current installers.</p>
                <button type='button' onClick={retry}>Try again <Icon size={17} /></button>
            </div> : !catalog ? <div className='dl-loading' role='status'>Checking current downloads…</div> : <>
                <div className='dl-grid'>
                    {platforms.map((platform) => <PlatformCard key={platform.key} platform={platform}
                        catalog={catalog} recommended={recommended === platform.key} />)}
                </div>
                <LinuxCommand catalog={catalog} />
            </>}
            <p className='dl-note'>Vibyra Desktop is in beta. Check for updates from inside the app.</p>
        </section>
    );
}
