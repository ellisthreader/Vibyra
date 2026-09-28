import React, { useState } from 'react';
import { Icon } from '../home/shared.jsx';
import { formatBytes } from '../../portal/platform.js';
import { available, fileUrl, quickInstallCommand } from './catalog.js';
import InstallCommand from './InstallCommand.jsx';

const platforms = [
    { key: 'windows', name: 'Windows', icon: 'microsoft.svg' },
    { key: 'linux', name: 'Linux', icon: 'linux-tux.svg' },
    { key: 'macos', name: 'macOS', icon: 'apple.svg' },
];

const packages = {
    windows: [['windows', 'Download for Windows', 'Windows 10 or 11 · 64-bit']],
    linux: [
        ['linux-deb', 'Download .deb', 'Debian, Ubuntu, Mint · 64-bit'],
        ['linux', 'Download AppImage', 'Other compatible distros · 64-bit', 'Other distros'],
    ],
    macos: [
        ['macos-arm64', 'Download for Apple Silicon', 'M-series Macs'],
        ['macos-x64', 'Download for Intel Mac', 'Intel-based Macs'],
    ],
};

function PackageLink({ catalog, item, secondary = false }) {
    const [key, label, system, secondaryHint] = item;
    const release = catalog.releases[key];
    const href = fileUrl(catalog, key);
    if (!href) return null;
    return (
        <div className={'dl-package' + (secondary ? ' dl-package--secondary' : '')}>
            <a className='dl-package-link'
                href={href} aria-label={label} data-analytics-cta={'downloads_' + key.replaceAll('-', '_')}
                data-analytics-download={key}>
                <span>{label}</span>
                {secondary && <small>{formatBytes(release.sizeBytes)}{secondaryHint && ` · ${secondaryHint}`}</small>}
                <Icon name='download' size={17} />
            </a>
            {!secondary && <p>{system}{release.minimumSystemVersion && key.startsWith('macos-')
                ? ` · macOS ${release.minimumSystemVersion}+` : ''}</p>}
            {!secondary && <small>v{release.version} <span aria-hidden='true'>·</span> {formatBytes(release.sizeBytes)}</small>}
        </div>
    );
}

function PlatformCard({ platform, catalog }) {
    const ready = packages[platform.key].filter(([key]) => available(catalog.releases[key]));
    return (
        <article className={'dl-card' + (platform.key === 'macos'
            ? ready.length ? ' dl-card--mac-ready' : ' dl-card--mac-pending' : '')}
            aria-labelledby={'dl-' + platform.key}>
            <div className='dl-card-top'>
                <span className={'dl-icon dl-icon--' + platform.key} aria-hidden='true'>
                    <img src={'/platform-icons/' + platform.icon} alt='' width='36' height='36' />
                </span>
            </div>
            <div className='dl-card-title'>
                <h2 id={'dl-' + platform.key}>{platform.name}</h2>
            </div>
            <p className='dl-card-description'>
                {platform.key === 'windows' && 'A simple installer for your Windows PC.'}
                {platform.key === 'linux' && 'Pick the package that fits your distro.'}
                {platform.key === 'macos' && (ready.length
                    ? 'Choose the build for your Mac’s chip.'
                    : 'Apple Silicon and Intel')}
            </p>
            <div className='dl-card-actions'>
                {ready.length ? ready.map((item, index) => <PackageLink key={item[0]}
                    catalog={catalog} item={item}
                    secondary={index > 0 && (platform.key === 'linux' || platform.key === 'macos')} />) :
                    <p className='dl-unavailable'>{platform.key === 'macos'
                        ? 'Downloads coming soon'
                        : 'Temporarily unavailable. Please check back soon.'}</p>}
                {platform.key === 'macos' && ready.some(([key]) => catalog.releases[key].notarized !== true) &&
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
        <details className='dl-terminal'>
            <summary><span>Install from the terminal</span><small>Linux · .deb or AppImage</small></summary>
            <div className='dl-terminal-body'>
                <div className='dl-terminal-heading'>
                    <p>Choose a package, then copy the command.</p>
                    {debReady && imageReady && <div className='dl-switch' role='group' aria-label='Linux package format'>
                        <button type='button' aria-pressed={kind === 'linux-deb'} onClick={() => setSelected('linux-deb')}>.deb</button>
                        <button type='button' aria-pressed={kind === 'linux'} onClick={() => setSelected('linux')}>AppImage</button>
                    </div>}
                </div>
                {command && <InstallCommand command={command} />}
            </div>
        </details>
    );
}

export default function PlatformCards({ catalog, error, retry }) {
    if (!catalog && !error) return null;

    return (
        <section className='dl-platforms page-width' id='installers' aria-label='Desktop downloads'>
            {error ? <div className='dl-error' role='alert'>
                <h2>Downloads couldn’t load.</h2>
                <p>Please try again to check the current installers.</p>
                <button type='button' onClick={retry}>Try again <Icon size={17} /></button>
            </div> : <>
                <div className={'dl-grid' + (!packages.macos.some(([key]) =>
                    available(catalog.releases[key])) ? ' dl-grid--mac-pending' : '')}>
                    {platforms.map((platform) => <PlatformCard key={platform.key} platform={platform}
                        catalog={catalog} />)}
                </div>
                <LinuxCommand catalog={catalog} />
                <p className='dl-note'>Vibyra Desktop is in beta. Check for updates from inside the app.</p>
            </>}
        </section>
    );
}
