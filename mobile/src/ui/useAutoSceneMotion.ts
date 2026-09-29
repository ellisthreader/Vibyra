import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { useBreath, useCycle, useMotionTarget } from "./motion";
import { useReducedMotion } from "./useReducedMotion";

export function useAutoSceneMotion(
  working: boolean,
  selected: boolean,
  visible: boolean,
) {
  const reduced = useReducedMotion();
  const [foreground, setForeground] = useState(
    AppState.currentState !== "background",
  );
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) =>
      setForeground(state === "active"),
    );
    return () => listener.remove();
  }, []);
  const still = reduced || !foreground || !visible;
  const breath = useBreath(!still && !selected, working ? 2200 : 4200);
  const orbit = useCycle(!still && working && !selected, 18000);
  const reveal = useMotionTarget(working ? 1 : 0, still, 600);
  const resolve = useMotionTarget(selected ? 1 : 0, still, 380);
  return { still, breath, orbit, reveal, resolve };
}
