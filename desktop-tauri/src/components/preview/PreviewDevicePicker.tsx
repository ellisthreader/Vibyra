import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PREVIEW_DEVICES } from '../../lib/previewDevices';
import type { PreviewDevice } from '../../previewTypes';
import { PreviewDeviceIcon } from './PreviewDeviceIcon';
import './previewDevicePicker.css';

export function PreviewDevicePicker({ device, onChange }: { device: PreviewDevice; onChange(key: string): void }) {
  const [open, setOpen] = useState(false), [active, setActive] = useState(0);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0, maxHeight: 0 });
  const trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = (restore = true) => { setOpen(false); if (restore) trigger.current?.focus(); };
  const choose = (index: number) => { onChange(PREVIEW_DEVICES[index].key); close(); };
  useLayoutEffect(() => {
    if (!open || !trigger.current) return;
    const rect = trigger.current.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 24);
    const below = window.innerHeight - rect.bottom - 16;
    const maxHeight = Math.min(400, Math.max(below, rect.top - 16));
    const top = below >= maxHeight ? rect.bottom + 6 : rect.top - maxHeight - 6;
    setPosition({ top: Math.max(12, top), left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), width, maxHeight });
    setActive(Math.max(0, PREVIEW_DEVICES.findIndex(d => d.key === device.key)));
  }, [open, device.key]);
  useEffect(() => {
    if (!open) return;
    menu.current?.focus();
    const outside = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) close(false);
    };
    const resize = () => close();
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', resize);
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', resize); };
  }, [open]);
  useEffect(() => {
    if (open && active < 4 && menu.current) menu.current.scrollTop = 0;
    else if (open) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active, position]);
  return <>
    <button ref={trigger} className="preview-device-trigger" role="combobox" aria-label="Preview device"
      aria-expanded={open} aria-controls={open ? id : undefined} aria-haspopup="listbox"
      onClick={() => setOpen(v => !v)} onKeyDown={event => {
        if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); setOpen(true); }
      }}>
      <PreviewDeviceIcon kind={device.kind} /><span>{device.label}</span>
      <svg className="preview-picker-chevron" aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor"><path d="m5 6 3 3 3-3"/></svg>
    </button>
    {open && createPortal(<div ref={menu} id={id} className="preview-device-menu" role="listbox" aria-label="Devices"
      tabIndex={-1} aria-activedescendant={`${id}-${active}`} style={position} onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); close(); }
        else if (event.key === 'Tab') close();
        else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(active); }
        else if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
          event.preventDefault(); setActive(index => event.key === 'Home' ? 0 : event.key === 'End' ? PREVIEW_DEVICES.length - 1 : Math.max(0, Math.min(PREVIEW_DEVICES.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))));
        }
      }}>
      {[...new Set(PREVIEW_DEVICES.map(d => d.group))].map(group => <div role="group" aria-label={group} key={group}>
        <div className="preview-device-menu__group">{group}</div>
        {PREVIEW_DEVICES.filter(d => d.group === group).map(d => {
          const index = PREVIEW_DEVICES.indexOf(d);
          return <div id={`${id}-${index}`} key={d.key} role="option" aria-selected={d.key === device.key}
            data-active={index === active} data-device={d.key} onPointerMove={() => setActive(index)} onClick={() => choose(index)}>
            <PreviewDeviceIcon kind={d.kind}/><span>{d.label}<small>{d.width} × {d.height}</small></span>
            {d.key === device.key && <span className="preview-device-menu__check" aria-hidden="true">✓</span>}
          </div>;
        })}
      </div>)}
    </div>, document.body)}
  </>;
}
