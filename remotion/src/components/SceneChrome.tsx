import React from "react";
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame} from "remotion";
import {clamp} from "../motion/timing";
import {font, palette} from "../styles/tokens";

export const Stage: React.FC<React.PropsWithChildren<{glowX?: number}>> = ({children, glowX = 50}) => {
  const frame = useCurrentFrame();
  const drift = Math.sin(frame * .018) * 5;
  const breathe = 1 + Math.sin(frame * .025) * .08;
  return <AbsoluteFill style={{background: palette.canvas, color: palette.text, fontFamily: font.sans, overflow: "hidden"}}>
    <div style={{position: "absolute", width: 950, height: 950, left: `${glowX - 25 + drift}%`, top: "10%", borderRadius: "50%", transform: `scale(${breathe})`, background: "radial-gradient(circle,rgba(91,124,250,.22),rgba(70,103,232,.07) 42%,transparent 70%)", filter: "blur(18px)"}} />
    <div style={{position: "absolute", width: 620, height: 620, left: `${15 - drift * .3}%`, bottom: "-34%", borderRadius: "50%", background: "radial-gradient(circle,rgba(116,144,255,.12),transparent 68%)", filter: "blur(28px)"}} />
    {children}
  </AbsoluteFill>;
};

export const Wordmark: React.FC<{small?: boolean}> = ({small = false}) => (
  <div style={{display: "flex", alignItems: "center", gap: small ? 10 : 18}}>
    <Img src={staticFile("vibyra-mark.png")} style={{width: small ? 34 : 72, height: small ? 34 : 72, objectFit: "contain"}} />
    <span style={{fontWeight: 760, fontSize: small ? 24 : 54, letterSpacing: -1.5}}>Vibyra</span>
  </div>
);

export const Kicker: React.FC<{children: React.ReactNode; at?: number}> = ({children, at = 0}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [at, at + 16], [0, 1], clamp);
  return <div style={{opacity, color: palette.accentBright, fontSize: 22, fontWeight: 700, letterSpacing: 4, textTransform: "uppercase"}}>{children}</div>;
};

export const Headline: React.FC<{children: React.ReactNode; at?: number; size?: number; width?: number}> = ({children, at = 0, size = 76, width = 900}) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [at, at + 24], [0, 1], clamp);
  return <div style={{maxWidth: width, opacity: progress, transform: `translateY(${(1 - progress) * 34}px)`, fontSize: size, fontWeight: 760, lineHeight: 1.02, letterSpacing: -3}}>{children}</div>;
};

export const Signal: React.FC<{progress: number; top?: string; left?: string; width?: string}> = ({progress, top = "50%", left = "20%", width = "60%"}) => (
  <div style={{position: "absolute", top, left, width, height: 44, overflow: "visible", opacity: progress > .02 ? 1 : 0}}>
    {[0, 1, 2, 3, 4, 5, 6].map((particle) => {const lag = particle * .025; const point = Math.max(0, Math.min(1, progress - lag)); const size = 5 + (6 - particle) * 1.6; return <span key={particle} style={{position: "absolute", left: `${point * 100}%`, top: 18 + Math.sin((progress * 18) + particle) * (particle + 1), width: size, height: size, borderRadius: 99, opacity: Math.max(0, 1 - particle * .12), background: particle < 2 ? "white" : palette.accentBright, boxShadow: "0 0 24px rgba(91,124,250,.95)", transform: `scale(${.65 + progress * .35})`}} />;})}
    <div style={{position: "absolute", left: `${progress * 100}%`, top: -5, width: 58, height: 58, marginLeft: -24, borderRadius: 99, background: "radial-gradient(circle,rgba(145,167,255,.5),transparent 70%)", filter: "blur(4px)"}} />
  </div>
);
