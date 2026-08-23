import React from "react";
import {interpolate, spring, useCurrentFrame, useVideoConfig} from "remotion";
import {clamp} from "../motion/timing";
import {font, palette} from "../styles/tokens";

const AGENTS = [["Morgan", "Layout"], ["Cameron", "Data"], ["Casey", "Tests"], ["Alex", "Review"], ["Avery", "Preview"], ["Riley", "Polish"]];
const CODE = ["const analytics = await loadMetrics();", "return <AnalyticsOverview data={analytics} />;", "expect(screen.getByText('842')).toBeVisible();", "preview.open({ project: 'Atlas' });"];

export const StatusDot = ({color = palette.success}: {color?: string}) => <span style={{width: 7, height: 7, borderRadius: 9, background: color, boxShadow: `0 0 10px ${color}`}} />;

const Terminal = ({name, role, index}: {name: string; role: string; index: number}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const progress = interpolate(frame, [12 + index * 6, 64 + index * 7], [0, 1], clamp);
  const reveal = spring({frame: frame - index * 5, fps, config: {damping: 24, stiffness: 220}});
  return <div style={{minWidth: 0, opacity: reveal, transform: `translateY(${(1 - reveal) * 26}px) scale(${.97 + reveal * .03})`, border: `1px solid ${index === 0 ? "rgba(91,124,250,.72)" : palette.border}`, borderRadius: 12, overflow: "hidden", background: "#101217"}}>
    <div style={{height: 42, padding: "0 14px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#181b22", borderBottom: `1px solid ${palette.border}`}}>
      <div style={{display: "flex", alignItems: "center", gap: 8}}><StatusDot /><b style={{fontSize: 14}}>{name}</b><span style={{color: palette.muted, fontSize: 11}}>{role}</span></div><span style={{color: palette.success, fontSize: 11}}>Working</span>
    </div>
    <div style={{padding: "16px 16px 12px", fontFamily: font.mono, fontSize: 13, lineHeight: 1.65, color: "#cdd5e1"}}><div style={{color: palette.accentBright}}>$ vibyra run {role.toLowerCase()}</div><div style={{color: "#8ed8b6"}}>+ {CODE[index % CODE.length]}</div><div style={{color: palette.muted}}>Checking Atlas workspace...</div></div>
    <div style={{display: "flex", gap: 6, margin: "0 16px 14px"}}>{[.25, .55, .85].map((threshold) => <span key={threshold} style={{width: 7, height: 7, borderRadius: 9, background: progress >= threshold ? palette.accentBright : "rgba(255,255,255,.1)", boxShadow: progress >= threshold ? "0 0 12px rgba(91,124,250,.7)" : "none"}} />)}</div>
  </div>;
};

export const TerminalGrid = () => <div style={{height: "100%", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gridTemplateRows: "repeat(2, 1fr)", gap: 10}}>{AGENTS.map(([name, role], index) => <Terminal key={name} name={name} role={role} index={index} />)}</div>;

export const MemoryPanel = () => <div style={{height: "100%", display: "grid", gridTemplateColumns: "1.1fr .9fr", gap: 12}}>
  <div style={{display: "grid", gridTemplateRows: "1fr 1fr", gap: 12}}><Terminal name="Morgan" role="Build" index={0} /><Terminal name="Casey" role="Tests" index={2} /></div>
  <div style={{padding: 24, border: "1px solid rgba(91,124,250,.46)", borderRadius: 14, background: "linear-gradient(145deg,#171a22,#101217)"}}>
    <div style={{display: "flex", justifyContent: "space-between", alignItems: "center"}}><div><div style={{color: palette.accentBright, fontSize: 12, fontWeight: 800, letterSpacing: 2}}>PROJECT MEMORY</div><h3 style={{margin: "8px 0 0", fontSize: 27}}>Atlas project brain</h3></div><span style={{padding: "7px 10px", borderRadius: 9, background: "rgba(91,124,250,.16)", color: palette.accentBright, fontSize: 12}}>4 notes linked</span></div>
    {["Design language", "Analytics requirements", "Testing rules"].map((note, index) => <div key={note} style={{marginTop: 18, padding: 15, border: `1px solid ${index === 0 ? "rgba(91,124,250,.55)" : palette.border}`, borderRadius: 11, background: index === 0 ? "rgba(91,124,250,.1)" : palette.surface}}><b>{note}</b><div style={{marginTop: 6, color: palette.muted, fontSize: 13}}>{index === 0 ? "Graphite surfaces. Cobalt actions. Preserve the current layout." : index === 1 ? "Three metrics, a chart, and a 30-day filter." : "Run component tests before preview."}</div></div>)}
    <div style={{marginTop: 20, color: palette.success, fontSize: 13}}>Memory attached to every Atlas terminal</div>
  </div>
</div>;
