import React from "react";
import {Composition} from "remotion";
import {LaunchFilm36} from "./compositions/LaunchFilm48";

export const Root: React.FC = () => (
  <Composition
    id="VibyraLaunch36"
    component={LaunchFilm36}
    durationInFrames={2160}
    fps={60}
    width={1920}
    height={1080}
  />
);
