import React from "react";
import {interpolate, useCurrentFrame} from "remotion";
import {MarketingDesktop} from "../components/MarketingDesktop";
import {ParticlePop} from "../components/DetailPills";
import {Stage} from "../components/SceneChrome";
import {clamp, sceneOpacity} from "../motion/timing";
import {palette} from "../styles/tokens";

const beats = [
  {label: "Choose your AI.", mode: "models" as const},
  {label: "Remember the project.", mode: "memory" as const},
  {label: "Ship with proof.", mode: "review" as const},
];

export const CapabilityBurst: React.FC<{duration: number}> = ({duration}) => {
  const frame = useCurrentFrame();
  const beat = Math.min(2, Math.floor(frame / 70));
  const local = frame % 70;
  const push = interpolate(local, [0, 9, 58, 69], [70, 0, 0, -70], clamp);
  return <Stage><div style={{position: "absolute", inset: 0, opacity: sceneOpacity(frame, duration, 4)}}>
    <MarketingDesktop mode={beats[beat].mode} style={{position: "absolute", left: 120, top: 145, transform: `translateX(${push}px) scale(.86)`, transformOrigin: "top left", opacity: interpolate(local, [0, 6, 64, 69], [0, 1, 1, 0], clamp)}} />
    <ParticlePop progress={interpolate(local, [2, 36], [0, 1], clamp)} x={960} y={560} radius={230} />
    <div style={{position: "absolute", left: 0, right: 0, bottom: 70, textAlign: "center", fontSize: 67, fontWeight: 780, letterSpacing: -3, textShadow: "0 4px 30px #0e0f12"}}>{beats[beat].label} <span style={{color: palette.accentBright}}>Fast.</span></div>
  </div></Stage>;
};
