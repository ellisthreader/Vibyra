import React, { useState } from "react";
import { HERO_TERMINALS } from "./heroTerminalData.js";

function ActivityLine({ item, index }) {
  const [action, target, result] = item;
  return (
    <li className="term-line-in grid grid-cols-[50px_minmax(0,1fr)_auto] gap-2 text-[10px] leading-6 sm:text-[11px]" style={{ animationDelay: `${index * 90}ms` }}>
      <span className="text-violet">{action}</span>
      <span className="truncate text-ink">{target}</span>
      <span className="truncate text-right text-ink-muted/60">{result}</span>
    </li>
  );
}

function CodePane({ terminal }) {
  return (
    <section className="overflow-hidden rounded-lg border border-white/[0.07] bg-[#090a0d]" aria-label={`${terminal.file} diff`}>
      <header className="flex items-center gap-2 border-b border-white/[0.07] bg-white/[0.025] px-3 py-2 font-mono text-[9px] text-ink-muted sm:text-[10px]">
        <span className="size-1.5 rounded-full bg-violet" aria-hidden="true" />
        <span className="truncate">{terminal.file}</span>
        <span className="ml-auto text-ok">modified</span>
      </header>
      <div className="overflow-x-auto py-2 font-mono text-[9px] leading-[22px] sm:text-[10px] lg:text-[11px]">
        {terminal.code.map(([number, marker, code]) => (
          <p key={number} className={`flex min-w-max pr-3 ${marker === "+" ? "bg-ok/[0.055]" : ""}`}>
            <span className="w-8 shrink-0 select-none pr-2 text-right text-ink-muted/30">{number}</span>
            <span className={`w-4 shrink-0 ${marker === "+" ? "text-ok" : "text-transparent"}`}>{marker}</span>
            <code className={marker === "+" ? "text-[#d9e2ff]" : "text-ink-muted"}>{code}</code>
          </p>
        ))}
      </div>
    </section>
  );
}

function TerminalPanel({ terminal }) {
  return (
    <div id={`hero-terminal-panel-${terminal.id}`} role="tabpanel" aria-labelledby={`hero-terminal-tab-${terminal.id}`} className="marketing-terminal-panel grid gap-3 bg-[#07080a] p-3 sm:p-4 md:grid-cols-[0.92fr_1.08fr]">
      <section className="min-w-0 rounded-lg border border-white/[0.07] bg-[#0a0b0e] p-3 font-mono sm:p-4">
        <p className="truncate text-[9px] text-ink-muted/55 sm:text-[10px]">ellis@vibyra:~/checkout-app <span className="text-ok">({terminal.branch})</span></p>
        <p className="mt-2 break-words text-[10px] text-ink sm:text-[11px]"><span className="mr-2 text-violet">❯</span>{terminal.command}<span className="term-cursor ml-1 inline-block h-3 w-[5px] bg-violet align-middle" aria-hidden="true" /></p>
        <p className="mt-3 border-l border-violet/40 pl-3 text-[10px] leading-5 text-ink-muted sm:text-[11px]">{terminal.task}</p>
        <ul className="mt-3 border-y border-white/[0.06] py-2">
          {terminal.activity.map((item, index) => <ActivityLine key={item[0]} item={item} index={index} />)}
        </ul>
        <div className="mt-3 flex items-start gap-2 rounded-md border border-ok/20 bg-ok/[0.055] px-3 py-2.5">
          <span className="mt-0.5 text-ok" aria-hidden="true">✓</span>
          <div className="min-w-0"><p className="truncate text-[10px] font-semibold text-ok sm:text-[11px]">{terminal.result}</p><p className="mt-0.5 truncate text-[9px] text-ink-muted sm:text-[10px]">{terminal.detail}</p></div>
        </div>
      </section>
      <CodePane terminal={terminal} />
    </div>
  );
}

function TerminalWindow({ active, d }) {
  const [activeId, setActiveId] = useState(HERO_TERMINALS[0].id);
  const terminal = HERO_TERMINALS.find((item) => item.id === activeId) || HERO_TERMINALS[0];
  const moveTab = (direction) => {
    const current = HERO_TERMINALS.findIndex((item) => item.id === activeId);
    const next = (current + direction + HERO_TERMINALS.length) % HERO_TERMINALS.length;
    setActiveId(HERO_TERMINALS[next].id);
  };

  return (
    <div className={`rounded-[18px] bg-gradient-to-b from-white/12 via-white/5 to-transparent p-px ${active ? "edge-pulse" : ""}`} style={d(2)}>
      <div className="overflow-hidden rounded-[17px] bg-canvas-raised shadow-[0_40px_120px_rgba(0,0,0,0.55),0_0_80px_rgba(64,103,246,0.08)]">
        <div className="flex items-center gap-2 border-b border-line bg-rail px-3 py-2.5 sm:px-4">
          <div className="hidden gap-[7px] sm:flex" aria-hidden="true"><span className="size-3 rounded-full bg-[#3a3a40]" /><span className="size-3 rounded-full bg-[#3a3a40]" /><span className="size-3 rounded-full bg-[#3a3a40]" /></div>
          <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:ml-2" role="tablist" aria-label="AI terminal sessions">
            {HERO_TERMINALS.map((item) => {
              const selected = item.id === activeId;
              return (
                <button key={item.id} id={`hero-terminal-tab-${item.id}`} type="button" role="tab" aria-selected={selected} aria-controls={`hero-terminal-panel-${item.id}`} tabIndex={selected ? 0 : -1} onClick={() => setActiveId(item.id)} onKeyDown={(event) => { if (event.key === "ArrowRight") moveTab(1); if (event.key === "ArrowLeft") moveTab(-1); }} className={`group flex min-w-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-[10px] transition sm:px-3 sm:text-[11px] ${selected ? "border-violet/50 bg-violet/10 text-ink shadow-[inset_0_-1px_0_rgba(91,124,250,.55)]" : "border-transparent text-ink-muted hover:border-line-strong hover:bg-white/[0.035] hover:text-ink"}`}>
                  <span className={`size-1.5 shrink-0 rounded-full ${item.dot} ${selected ? "shadow-[0_0_9px_currentColor]" : "opacity-55"}`} aria-hidden="true" /><span className="truncate">{item.tab}</span>
                </button>
              );
            })}
          </div>
          <span className="hidden font-mono text-[10px] text-ink-muted/55 md:block">Vibyra Desktop</span>
        </div>

        <TerminalPanel key={terminal.id} terminal={terminal} />

        <footer className="flex items-center gap-3 border-t border-line bg-rail/80 px-3 py-2 font-mono text-[9px] text-ink-muted sm:px-4 sm:text-[10px]">
          <span className="flex items-center gap-1.5"><span className="pulse-dot size-1.5 rounded-full bg-ok" aria-hidden="true" />{terminal.runtime}</span>
          <span className="hidden sm:block">{terminal.elapsed}</span>
          <span className="ml-auto hidden text-ink-muted/50 sm:block">Click a terminal to switch</span>
          <span className="flex items-center gap-1.5 text-ink"><span className="size-1.5 rounded-full bg-violet" aria-hidden="true" />Ready on iPhone</span>
        </footer>
      </div>
    </div>
  );
}

export default TerminalWindow;
