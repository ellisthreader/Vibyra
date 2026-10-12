import { useEffect, useState } from "react";
export default function useOwnerTheme(enabled = true) {
  const [theme, setTheme] = useState(() => {
    try { return ["light", "dark", "auto"].includes(localStorage.getItem("vibyra-owner-theme")) ? localStorage.getItem("vibyra-owner-theme") : "light"; }
    catch { return "light"; }
  });
  useEffect(() => {
    if (!enabled) return;
    try { localStorage.setItem("vibyra-owner-theme", theme); } catch { /* A preference is optional. */ }
  }, [theme, enabled]);
  return [theme, setTheme];
}
