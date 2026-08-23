import React from "react";
import {AbsoluteFill, Html5Audio, Sequence, staticFile} from "remotion";
import {CutTransition} from "../motion/CutTransition";
import {BrandConnect} from "../scenes/BrandConnect";
import {CapabilityBurst} from "../scenes/CapabilityBurst";
import {EndCard} from "../scenes/EndCard";
import {PreviewOutcome} from "../scenes/PreviewOutcome";
import {ProjectPrompt} from "../scenes/ProjectPrompt";
import {ReviewApprove} from "../scenes/ReviewApprove";
import {TerminalFanout} from "../scenes/TerminalFanout";
import {VoiceMemory} from "../scenes/VoiceMemory";

const scenes = [
  {from: 0, duration: 180, Component: BrandConnect},
  {from: 180, duration: 240, Component: ProjectPrompt},
  {from: 420, duration: 330, Component: TerminalFanout},
  {from: 750, duration: 300, Component: VoiceMemory},
  {from: 1050, duration: 300, Component: ReviewApprove},
  {from: 1350, duration: 210, Component: CapabilityBurst},
  {from: 1560, duration: 300, Component: PreviewOutcome},
] as const;

const cuts = [180, 420, 750, 1050, 1350, 1560, 1860];

export const LaunchFilm36: React.FC = () => <AbsoluteFill style={{background: "#0e0f12"}}>
  {scenes.map(({from, duration, Component}) => <Sequence key={from} from={from} durationInFrames={duration} premountFor={20}><Component duration={duration} /></Sequence>)}
  <Sequence from={1860} durationInFrames={300} premountFor={20}><EndCard /></Sequence>
  {cuts.map((from, index) => <Sequence key={from} from={from - 6} durationInFrames={12}><CutTransition direction={index % 2 ? "right" : "left"} variant={(["sweep", "split", "iris"] as const)[index % 3]} /></Sequence>)}
  <Html5Audio src={staticFile("audio/score.wav")} volume={0.3} />
  <Sequence from={760} durationInFrames={190}><Html5Audio src={staticFile("audio/voice.wav")} volume={0.92} /></Sequence>
</AbsoluteFill>;
