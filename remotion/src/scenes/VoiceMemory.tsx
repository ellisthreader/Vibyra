import React from "react";
import {useCurrentFrame} from "remotion";
import {MarketingDesktop} from "../components/MarketingDesktop";
import {Headline, Kicker, Stage} from "../components/SceneChrome";
import {pulse, sceneOpacity} from "../motion/timing";
import {palette} from "../styles/tokens";

export const VoiceMemory: React.FC<{duration: number}> = ({duration}) => {
  const frame = useCurrentFrame();
  const wave = pulse(frame, 0.24);
  return <Stage glowX={65}><div style={{position: "absolute", inset: 0, opacity: sceneOpacity(frame, duration, 5)}}>
    <div style={{position: "absolute", left: 120, top: 70}}><Kicker at={2}>Vibyra AI Talk + Memory</Kicker><Headline at={8} size={64} width={1000}>Speak once. Keep the context.</Headline></div>
    <div style={{position: "absolute", right: 120, top: 90, display: "flex", alignItems: "center", gap: 16, padding: "13px 20px", borderRadius: 36, background: "rgba(19,21,26,.96)", border: `1px solid ${palette.accent}`, boxShadow: `0 0 ${20 + wave * 26}px rgba(91,124,250,.34)`}}><b style={{padding: 11, borderRadius: 22, background: palette.action, fontSize: 12}}>VOICE</b><div><b>Use Atlas Memory.</b><div style={{fontSize: 13, color: palette.muted}}>Keep the current design language.</div></div><div style={{display: "flex", gap: 4}}>{[.5,.8,1,.65,.9].map((height, index) => <span key={index} style={{width: 4, height: 10 + height * 18 * wave, borderRadius: 5, background: palette.accentBright}} />)}</div></div>
    <MarketingDesktop mode="memory" style={{position: "absolute", left: 120, top: 235, transform: "scale(.92)", transformOrigin: "top left"}} />
  </div></Stage>;
};
