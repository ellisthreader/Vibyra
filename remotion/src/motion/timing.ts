import {interpolate, spring} from "remotion";

export const clamp = {extrapolateLeft: "clamp", extrapolateRight: "clamp"} as const;

export function sceneOpacity(frame: number, duration: number, edge = 16) {
  return interpolate(frame, [0, edge, duration - edge, duration], [0, 1, 1, 0], clamp);
}

export function enter(frame: number, fps: number, delay = 0) {
  return spring({
    frame: frame - delay,
    fps,
    config: {damping: 28, stiffness: 180, mass: 0.9},
  });
}

export function rise(frame: number, fps: number, delay = 0, distance = 42) {
  return (1 - enter(frame, fps, delay)) * distance;
}

export function pulse(frame: number, speed = 0.12) {
  return 0.5 + Math.sin(frame * speed) * 0.5;
}
