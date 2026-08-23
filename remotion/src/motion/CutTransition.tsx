import React from "react";
import {interpolate, useCurrentFrame} from "remotion";
import {clamp} from "./timing";

type Variant = "sweep" | "split" | "iris";

const Sweep = ({frame, direction}: {frame: number; direction: "left" | "right"}) => {
  const x = interpolate(frame, [0, 12], [direction === "left" ? -35 : 135, direction === "left" ? 135 : -35], clamp);
  return <><div style={{position: "absolute", inset: 0, opacity: interpolate(frame, [0, 3, 8, 12], [0, .38, .14, 0], clamp), background: "rgb(91,124,250)", mixBlendMode: "screen"}} /><div style={{position: "absolute", top: 0, bottom: 0, left: `${x}%`, width: "18%", transform: "skewX(-12deg)", background: "linear-gradient(90deg,transparent,rgba(91,124,250,.5),rgba(255,255,255,.78),transparent)", filter: "blur(8px)"}} /></>;
};

const Split = ({frame}: {frame: number}) => {
  const cover = interpolate(frame, [0, 5, 7, 12], [-102, 0, 0, 102], clamp);
  return <><div style={{position: "absolute", left: 0, right: 0, top: 0, height: "50.2%", transform: `translateX(${cover}%)`, background: "linear-gradient(180deg,#161b2d,#283966)"}} /><div style={{position: "absolute", left: 0, right: 0, bottom: 0, height: "50.2%", transform: `translateX(${-cover}%)`, background: "linear-gradient(0deg,#111626,#283966)"}} /></>;
};

const Iris = ({frame}: {frame: number}) => {
  const size = interpolate(frame, [0, 5, 7, 12], [0, 145, 145, 0], clamp);
  return <div style={{position: "absolute", inset: 0, clipPath: `circle(${size}% at 50% 50%)`, background: "radial-gradient(circle,rgba(116,144,255,.94),rgba(28,39,72,.98) 44%,#0e0f12 72%)"}} />;
};

export const CutTransition: React.FC<{direction?: "left" | "right"; variant?: Variant}> = ({direction = "left", variant = "sweep"}) => {
  const frame = useCurrentFrame();
  return <div style={{position: "absolute", inset: 0, zIndex: 50, pointerEvents: "none", overflow: "hidden"}}>{variant === "split" ? <Split frame={frame} /> : variant === "iris" ? <Iris frame={frame} /> : <Sweep frame={frame} direction={direction} />}</div>;
};
