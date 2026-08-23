import React from "react";
import {font, palette} from "../styles/tokens";
import {MemoryPanel, StatusDot, TerminalGrid} from "./DesktopTerminalPanels";
import {ModelPanel, ReviewPanel} from "./DesktopUtilityPanels";

type Mode = "terminals" | "memory" | "models" | "review";

export const MarketingDesktop: React.FC<{mode: Mode; style?: React.CSSProperties}> = ({mode, style}) => <div style={{width: 1680, height: 820, overflow: "hidden", borderRadius: 22, border: "1px solid rgba(91,124,250,.55)", background: palette.canvas, boxShadow: "0 38px 110px rgba(0,0,0,.62),0 0 55px rgba(91,124,250,.16)", color: palette.text, fontFamily: font.sans, ...style}}>
  <div style={{height: 52, display: "flex", alignItems: "center", gap: 10, padding: "0 18px", borderBottom: `1px solid ${palette.border}`, background: "#13151a"}}><StatusDot color="#ef6a78" /><StatusDot color="#e8a94b" /><StatusDot /><b style={{marginLeft: 12}}>Vibyra Desktop</b><span style={{color: palette.muted}}>Atlas</span><span style={{marginLeft: "auto", color: palette.success, fontSize: 12}}>Desktop connected</span></div>
  <div style={{height: 768, display: "grid", gridTemplateColumns: "220px 1fr"}}><aside style={{position: "relative", padding: 18, borderRight: `1px solid ${palette.border}`, background: "#111318"}}><div style={{color: palette.accentBright, fontWeight: 800, fontSize: 19}}>Vibyra</div><div style={{marginTop: 28, padding: 12, borderRadius: 10, background: "rgba(91,124,250,.14)", border: "1px solid rgba(91,124,250,.45)"}}>Terminals <span style={{float: "right", color: palette.muted}}>6</span></div>{["Projects", "Editor", "Preview", "AI", "Memory"].map(item => <div key={item} style={{padding: "13px 12px", color: mode === item.toLowerCase() ? palette.text : palette.muted}}>{item}</div>)}<div style={{position: "absolute", bottom: 28, color: palette.success, fontSize: 12}}>Atlas workspace active</div></aside><main style={{padding: 14, overflow: "hidden"}}>{mode === "terminals" ? <TerminalGrid /> : mode === "memory" ? <MemoryPanel /> : mode === "models" ? <ModelPanel /> : <ReviewPanel />}</main></div>
</div>;
