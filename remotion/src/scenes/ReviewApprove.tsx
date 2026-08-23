import React from "react";
import {interpolate, useCurrentFrame, useVideoConfig} from "remotion";
import {MarketingDesktop} from "../components/MarketingDesktop";
import {PhoneFrame} from "../components/PhoneFrame";
import {DetailPills, ParticlePop} from "../components/DetailPills";
import {Headline, Kicker, Signal, Stage} from "../components/SceneChrome";
import {clamp, enter, sceneOpacity} from "../motion/timing";

export const ReviewApprove: React.FC<{duration: number}> = ({duration}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const phone = enter(frame, fps, 12);
  const approval = interpolate(frame, [95, 165], [0, 1], clamp);
  return <Stage glowX={70}><div style={{position: "absolute", inset: 0, opacity: sceneOpacity(frame, duration, 5)}}>
    <div style={{position: "absolute", left: 110, top: 70}}><Kicker at={2}>Review from iPhone</Kicker><Headline at={8} size={62} width={1050}>See the proof. Approve the change.</Headline></div>
    <DetailPills items={["Human approval", "Safe by default"]} start={16} style={{position: "absolute", right: 110, top: 115, justifyContent: "flex-end"}} />
    <MarketingDesktop mode="review" style={{position: "absolute", left: 85, top: 245, transform: "scale(.73)", transformOrigin: "top left"}} />
    <PhoneFrame screen={frame < 78 ? "activity" : "approve"} style={{position: "absolute", right: 115, top: 220, transform: `translateX(${(1 - phone) * 80}px) scale(.72)`, transformOrigin: "top right"}} />
    <Signal progress={approval} top="82%" left="64%" width="21%" />
    <ParticlePop progress={approval} x={1660} y={725} radius={150} />
  </div></Stage>;
};
