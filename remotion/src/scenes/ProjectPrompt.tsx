import React from "react";
import {interpolate, useCurrentFrame, useVideoConfig} from "remotion";
import {PhoneFrame} from "../components/PhoneFrame";
import {Headline, Kicker, Signal, Stage} from "../components/SceneChrome";
import {clamp, enter, sceneOpacity} from "../motion/timing";

export const ProjectPrompt: React.FC<{duration: number}> = ({duration}) => {
  const frame = useCurrentFrame(); const {fps} = useVideoConfig(); const move = enter(frame, fps, 6);
  const sent = interpolate(frame, [115, 190], [0, 1], clamp);
  return <Stage glowX={32}><div style={{position: "absolute", inset: 0, opacity: sceneOpacity(frame, duration, 5)}}>
    <PhoneFrame screen={frame < 55 ? "projects" : "prompt"} style={{position: "absolute", left: 230, top: 110, transform: `translateX(${(1-move)*-90}px) scale(.92)`, transformOrigin: "top left"}} />
    <div style={{position: "absolute", left: 870, top: 270}}><Kicker at={20}>Choose a real project</Kicker><Headline at={34} size={70} width={790}>One clear request<br />starts the work.</Headline><p style={{fontSize: 25, color: "#a6adba", lineHeight: 1.5, maxWidth: 650}}>Select Atlas, ask for the analytics overview, tests, and a live preview.</p></div>
    <Signal progress={sent} top="73%" left="43%" width="45%" />
  </div></Stage>;
};
