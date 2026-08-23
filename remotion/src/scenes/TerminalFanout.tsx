import React from "react";
import {interpolate, useCurrentFrame, useVideoConfig} from "remotion";
import {DetailPills, ParticlePop} from "../components/DetailPills";
import {MarketingDesktop} from "../components/MarketingDesktop";
import {Headline, Kicker, Stage} from "../components/SceneChrome";
import {clamp, enter, sceneOpacity} from "../motion/timing";

export const TerminalFanout: React.FC<{duration: number}> = ({duration}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const zoom = enter(frame, fps, 4);
  const burst = interpolate(frame, [20, 64], [0, 1], clamp);
  const drift = interpolate(frame, [70, duration - 8], [0, .028], clamp);
  return <Stage><div style={{position: "absolute", inset: 0, opacity: sceneOpacity(frame, duration, 5)}}>
    <div style={{position: "absolute", left: 120, top: 72}}><Kicker at={2}>Six live AI terminals</Kicker><Headline at={8} size={64} width={1000}>Vibe-code in parallel. See every agent work.</Headline></div>
    <DetailPills items={["6 agents live", "Shared Atlas context", "Work visible"]} start={18} style={{position: "absolute", right: 105, top: 112, maxWidth: 570, justifyContent: "flex-end"}} />
    <MarketingDesktop mode="terminals" style={{position: "absolute", left: 120, top: 235, transform: `scale(${.87 + zoom * .05 + drift})`, transformOrigin: "top left"}} />
    <ParticlePop progress={burst} x={960} y={610} radius={210} />
  </div></Stage>;
};
