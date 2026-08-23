import React from "react";
import {interpolate, useCurrentFrame, useVideoConfig} from "remotion";
import {PhoneFrame} from "../components/PhoneFrame";
import {DetailPills, ParticlePop} from "../components/DetailPills";
import {Headline, Kicker, Stage} from "../components/SceneChrome";
import {clamp, enter, sceneOpacity} from "../motion/timing";

export const PreviewOutcome: React.FC<{duration:number}> = ({duration}) => {const frame=useCurrentFrame();const {fps}=useVideoConfig();const bloom=enter(frame,fps,12);const pop=interpolate(frame,[45,100],[0,1],clamp);return <Stage glowX={50}><div style={{position:"absolute",inset:0,opacity:sceneOpacity(frame,duration,5)}}>
  <div style={{position:"absolute",left:110,top:185}}><Kicker at={10}>Live Preview</Kicker><Headline at={22} size={78}>See the result<br />anywhere.</Headline><p style={{fontSize:25,color:"#a6adba",lineHeight:1.55,maxWidth:650}}>The analytics overview is tested, approved, and running from the same Atlas project.</p></div>
  <DetailPills items={["8 tests passed", "Approved", "Preview live"]} start={36} success style={{position:"absolute",left:110,top:555,maxWidth:580}} />
  <PhoneFrame screen="preview" style={{position:"absolute",right:270,top:85,transform:`translateY(${(1-bloom)*44}px) scale(${.72+bloom*.25}) rotateY(${(1-bloom)*-5}deg)`,transformOrigin:"top right"}} />
  <ParticlePop progress={pop} x={1450} y={520} radius={250} />
  </div></Stage>;};
