import { useEffect } from "react";
import { appApiRequest, SkillsResponse } from "../utils/appApi";
import { useAppState } from "./useAppState";

export function useLoadChatSkills(
  setChatSkills: ReturnType<typeof useAppState>["setters"]["setChatSkills"]
) {
  useEffect(() => {
    let cancelled = false;
    appApiRequest<SkillsResponse>("/api/skills", undefined, undefined, { background: true })
      .then((result) => {
        if (!cancelled && result.skills) setChatSkills(result.skills);
      })
      .catch(() => { /* skills are optional; silent fallback */ });
    return () => { cancelled = true; };
  }, [setChatSkills]);
}
