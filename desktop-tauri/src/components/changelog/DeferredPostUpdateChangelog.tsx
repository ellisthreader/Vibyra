import { useEffect, useState } from "react";
import type { ComponentType } from "react";

export function DeferredPostUpdateChangelog() {
  const [Component, setComponent] = useState<ComponentType | null>(null);

  useEffect(() => {
    let active = true;
    void import("./PostUpdateChangelog")
      .then((module) => {
        if (active) setComponent(() => module.PostUpdateChangelog);
      })
      .catch((error) => {
        console.warn("post-update changelog failed to load", error);
      });
    return () => {
      active = false;
    };
  }, []);

  return Component ? <Component /> : null;
}
