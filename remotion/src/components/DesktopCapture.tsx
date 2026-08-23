import React from "react";
import {Img, staticFile} from "remotion";
import {palette} from "../styles/tokens";

export const DesktopCapture: React.FC<{src: string; style?: React.CSSProperties; active?: boolean}> = ({src, style, active = true}) => (
  <div style={{position: "relative", overflow: "hidden", border: `1px solid ${active ? "rgba(91,124,250,.7)" : palette.border}`, borderRadius: 22, background: palette.surface, boxShadow: active ? "0 38px 110px rgba(0,0,0,.58),0 0 55px rgba(91,124,250,.2)" : "0 38px 100px rgba(0,0,0,.55)", ...style}}>
    <div style={{height: 42, display: "flex", alignItems: "center", gap: 9, padding: "0 18px", background: "rgba(19,21,26,.96)", borderBottom: `1px solid ${palette.border}`}}>
      {["#f06472", "#e8a94b", "#37c78a"].map((color) => <span key={color} style={{width: 10, height: 10, borderRadius: 99, background: color, opacity: .78}} />)}
      <span style={{marginLeft: 14, color: palette.muted, fontSize: 14}}>Vibyra Desktop · Atlas</span>
    </div>
    <Img src={staticFile(src)} style={{display: "block", width: "100%", height: "calc(100% - 42px)", objectFit: "cover", objectPosition: "top center"}} />
  </div>
);
