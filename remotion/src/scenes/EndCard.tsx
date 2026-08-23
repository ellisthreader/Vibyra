import React from "react";
import {interpolate, useCurrentFrame, useVideoConfig} from "remotion";
import {Stage, Wordmark} from "../components/SceneChrome";
import {ParticlePop} from "../components/DetailPills";
import {clamp, enter} from "../motion/timing";
import {palette} from "../styles/tokens";

export const EndCard: React.FC = () => {const frame=useCurrentFrame();const {fps}=useVideoConfig();const p=enter(frame,fps,0);const cta=interpolate(frame,[28,54],[0,1],clamp);const pop=interpolate(frame,[0,48],[0,1],clamp);return <Stage><ParticlePop progress={pop} x={960} y={490} radius={330} /><div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:32,transform:`scale(${.9+p*.1})`}}><Wordmark/><h1 style={{margin:0,fontSize:86,letterSpacing:-4}}>Build here. <span style={{color:palette.accentBright}}>Review anywhere.</span></h1><p style={{opacity:cta,margin:0,color:palette.muted,fontSize:27}}>Many AI terminals. One project Memory. Your approval.</p><div style={{opacity:cta,marginTop:18,padding:"16px 26px",borderRadius:13,color:"white",background:palette.action,fontWeight:700,fontSize:20,boxShadow:"0 18px 52px rgba(70,103,232,.38)"}}>Start building with Vibyra</div></div></Stage>;};
