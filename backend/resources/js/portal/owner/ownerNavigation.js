import { useEffect, useState } from "react";

export const PAGES = [
  ["overview", "Overview", "Your business, at a glance."],
  ["users", "Users", "The people and accounts behind Vibyra."],
  ["downloads", "Downloads", "See which versions people are downloading."],
  ["memberships", "Memberships", "Current plans, website checkouts and Pro licenses."],
  ["website", "Website", "Understand how people find and explore Vibyra."],
  ["usage", "App usage", "Recorded activity across your apps."],
  ["tracking", "Tracking status", "Understand the coverage behind your figures."],
];
export const TABS = {
  memberships: [["summary", "Summary"], ["licenses", "Licenses"]],
  website: [["traffic", "Traffic"], ["sources", "Sources"], ["journeys", "Journeys"], ["experience", "Experience"]],
  usage: [["desktop", "Desktop"], ["mobile", "Mobile"], ["cloud", "Cloud AI"]],
};
export function readLocation(search) {
  const query = new URLSearchParams(search);
  const view = PAGES.some(([key]) => key === query.get("view")) ? query.get("view") : "overview";
  const choices = TABS[view] || [];
  const tab = choices.some(([key]) => key === query.get("tab")) ? query.get("tab") : choices[0]?.[0];
  const days = [7, 30, 90].includes(Number(query.get("days"))) ? Number(query.get("days")) : 30;
  return { view, tab, days };
}
export function locationFor(state) {
  const query = new URLSearchParams({ view: state.view, days: String(state.days) });
  if (state.tab) query.set("tab", state.tab);
  return "/owner?" + query;
}
export default function useOwnerNavigation() {
  const [state, setState] = useState(() => readLocation(window.location.search));
  useEffect(() => {
    const pop = () => setState(readLocation(window.location.search));
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  const navigate = (view, tab) => {
    const next = readLocation(new URLSearchParams({ view, tab: tab || "", days: state.days }).toString());
    window.history.pushState(null, "", locationFor(next));
    setState(next);
    window.scrollTo(0, 0);
  };
  const setDays = days => {
    const next = { ...state, days };
    window.history.pushState(null, "", locationFor(next));
    setState(next);
  };
  return { ...state, navigate, setDays };
}
