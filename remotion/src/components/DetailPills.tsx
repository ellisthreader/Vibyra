import React from "react";
import {spring, useCurrentFrame, useVideoConfig} from "remotion";
import {palette} from "../styles/tokens";

export const DetailPills: React.FC<{items: string[]; start?: number; style?: React.CSSProperties; success?: boolean}> = ({items, start = 0, style, success = false}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return <div style={{display: "flex", gap: 10, flexWrap: "wrap", ...style}}>{items.map((item, index) => {const reveal = spring({frame: frame - start - index * 7, fps, config: {damping: 22, stiffness: 250, mass: .75}}); return <div key={item} style={{display: "flex", alignItems: "center", gap: 9, opacity: reveal, transform: `translateY(${(1 - reveal) * 22}px) scale(${.86 + reveal * .14})`, padding: "10px 14px", borderRadius: 999, background: "rgba(24,26,32,.92)", boxShadow: "0 12px 34px rgba(0,0,0,.34),0 0 22px rgba(91,124,250,.12)", color: palette.text, fontSize: 14, fontWeight: 650}}><span style={{width: 8, height: 8, borderRadius: 99, background: success ? palette.success : palette.accentBright, boxShadow: `0 0 14px ${success ? palette.success : palette.accent}`}} />{item}</div>;})}</div>;
};

const particles = [[-1,-.2],[-.82,-.72],[-.35,-1],[.25,-.92],[.8,-.55],[1,.08],[.72,.72],[.15,1],[-.45,.87],[-.92,.48]];

export const ParticlePop: React.FC<{progress: number; x: number; y: number; radius?: number}> = ({progress, x, y, radius = 150}) => <div style={{position: "absolute", left: x, top: y, width: 1, height: 1, pointerEvents: "none"}}>{particles.map(([dx, dy], index) => {const travel = Math.sin(Math.min(1, progress) * Math.PI) * radius * (.65 + index * .035); return <span key={index} style={{position: "absolute", left: dx * travel, top: dy * travel, width: 5 + index % 3 * 3, height: 5 + index % 3 * 3, borderRadius: 99, opacity: Math.sin(Math.min(1, progress) * Math.PI) * (1 - index * .035), background: index % 3 === 0 ? "white" : palette.accentBright, boxShadow: "0 0 18px rgba(91,124,250,.9)"}} />;})}<span style={{position: "absolute", left: -70, top: -70, width: 140, height: 140, opacity: Math.sin(Math.min(1, progress) * Math.PI), borderRadius: 99, background: "radial-gradient(circle,rgba(116,144,255,.55),transparent 70%)", filter: "blur(5px)"}} /></div>;
