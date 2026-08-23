import React from "react";
import {interpolate, useCurrentFrame, useVideoConfig} from "remotion";
import {MarketingDesktop} from "../components/MarketingDesktop";
import {PhoneFrame} from "../components/PhoneFrame";
import {Headline, Kicker, Signal, Stage, Wordmark} from "../components/SceneChrome";
import {clamp, enter, sceneOpacity} from "../motion/timing";

export const BrandConnect: React.FC<{duration: number}> = ({duration}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const devices = enter(frame, fps, 22);
  const signal = interpolate(frame, [60, 125], [0, 1], clamp);
  return <Stage><div style={{position: "absolute", inset: 0, opacity: sceneOpacity(frame, duration, 5)}}>
    <div style={{position: "absolute", left: 100, top: 65}}><Wordmark small /></div>
    <div style={{position: "absolute", left: 100, top: 185}}><Kicker at={8}>Your AI workspace</Kicker><Headline at={15} size={72} width={850}>Build on your computer.<br />Stay in control anywhere.</Headline></div>
    <PhoneFrame screen="projects" style={{position: "absolute", left: 125, top: 515, transform: `translateY(${(1 - devices) * 90}px) scale(.52)`, transformOrigin: "top left"}} />
    <MarketingDesktop mode="terminals" style={{position: "absolute", right: 60, top: 430, transform: `translateX(${(1 - devices) * 120}px) scale(.61)`, transformOrigin: "top right"}} />
    <Signal progress={signal} top="80%" left="25%" width="29%" />
  </div></Stage>;
};
