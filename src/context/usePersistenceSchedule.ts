import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { createLatestPersistenceTask } from "../utils/latestPersistenceTask";

export function usePersistenceSchedule(identity: string) {
  const task = useRef(createLatestPersistenceTask());
  const owner = useRef(identity);
  // Invalidate the old closure during render, before logout's storage barrier.
  if (owner.current !== identity) {
    task.current.cancel();
    owner.current = identity;
  }
  useEffect(() => {
    const flush = () => task.current.flush();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") flush();
    });
    if (typeof window !== "undefined") window.addEventListener("pagehide", flush);
    return () => {
      subscription.remove();
      if (typeof window !== "undefined") window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);
  return task.current;
}
