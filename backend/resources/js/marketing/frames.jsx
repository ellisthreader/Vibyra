import React from "react";
import { Chip } from "./ui.jsx";

/* Illustrative product frames. Structured so each body can be swapped
   for a real release capture without layout changes. */

export function DesktopFrame({ title, className = "", children }) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border border-line-strong bg-canvas-raised shadow-[0_24px_60px_rgba(0,0,0,0.45)] ${className}`}
    >
      <div className="flex items-center gap-[7px] border-b border-line bg-rail px-4 py-3">
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="ml-2.5 font-mono text-[12.5px] text-ink-muted">{title}</span>
      </div>
      {children}
    </div>
  );
}

export function TerminalBody() {
  return (
    <div className="px-6 pb-7 pt-5 font-mono text-[13.5px] leading-8">
      <p className="truncate">
        <span className="mr-2 text-violet">▸</span>
        <span className="font-semibold">Fix the broken checkout layout on mobile</span>
      </p>
      <p className="truncate text-ink-muted">Reading src/components/Checkout.tsx…</p>
      <p className="truncate text-ink-muted">Adjusting flex layout for &lt;480px widths…</p>
      <p className="truncate text-ok">✓ 2 files changed · awaiting your approval</p>
      <span className="term-cursor mt-1.5 block h-4 w-2 bg-violet" aria-hidden="true" />
    </div>
  );
}

export function PhoneFrame({ className = "", children }) {
  return (
    <div
      className={`overflow-hidden rounded-[26px] border border-line-strong bg-canvas-raised shadow-[0_24px_60px_rgba(0,0,0,0.45)] ${className}`}
    >
      <div className="mx-auto h-[18px] w-20 rounded-b-xl bg-rail" aria-hidden="true" />
      <div className="px-3.5 pb-5 pt-3.5">{children}</div>
    </div>
  );
}

export function PhoneChat() {
  return (
    <>
      <p className="mb-3 text-center text-xs font-semibold text-ink-muted">checkout-app</p>
      <div className="mb-2.5 ml-4 rounded-xl rounded-br-[4px] bg-violet px-3 py-2.5 text-[12.5px] leading-snug text-white">
        Fix the broken checkout layout on mobile
      </div>
      <div className="mb-2.5 flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-[12.5px] text-ink-muted">
        <span className="pulse-dot size-[7px] shrink-0 rounded-full bg-amber" aria-hidden="true" />
        Desktop is working…
      </div>
      <div className="rounded-xl border border-line bg-surface p-3 text-[12.5px]">
        <p className="mb-2 font-semibold">2 files changed</p>
        <div className="flex gap-2">
          <Chip accent>Review</Chip>
          <Chip>Preview</Chip>
        </div>
      </div>
    </>
  );
}

export function ConnectionSignal({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 120 90" aria-hidden="true">
      <defs>
        <linearGradient id="vibyra-signal" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5B7CFA" />
          <stop offset=".6" stopColor="#91A7FF" />
          <stop offset="1" stopColor="#315BD8" />
        </linearGradient>
      </defs>
      <path
        className="signal-path"
        d="M8 82 C 40 70, 60 30, 112 10"
        fill="none"
        stroke="url(#vibyra-signal)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
