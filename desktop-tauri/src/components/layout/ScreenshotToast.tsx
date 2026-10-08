import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import { isMac } from "../../lib/platform";
import type { Screenshot } from "../../types";

const HOLD_MS = 7000;
const LEAVE_MS = 190;

const icon = { width: 15, height: 15, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;
const CopyIcon = () => <svg {...icon}><rect x="8" y="8" width="11" height="11" rx="2.4" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>;
const CheckIcon = () => <svg {...icon} strokeWidth={2.6}><path d="m5 12.5 4.2 4.2L19 7" /></svg>;
const MarkupIcon = () => <svg {...icon}><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></svg>;
const FolderIcon = () => <svg {...icon}><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2.5h7.5A2.5 2.5 0 0 1 21 10v7.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" /></svg>;
const CloseIcon = () => <svg {...icon} width={11} height={11} strokeWidth={2.6}><path d="M6 6l12 12M18 6 6 18" /></svg>;

/** The corner thumbnail after a capture. The file is already saved, so leaving
 * it alone is a complete answer: it puts itself away after a few seconds. */
export function ScreenshotToast() {
  const [shot, setShot] = useState<Screenshot | null>(null);
  const [round, setRound] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [held, setHeld] = useState(false);
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState("");

  const load = useCallback(() => {
    void invoke<Screenshot>("screenshot_toast_shot").then(next => {
      setShot(next); setLeaving(false); setCopied(false); setNote(""); setHeld(false);
      setRound(value => value + 1);
    }).catch(() => void invoke("close_screenshot_toast").catch(() => {}));
  }, []);
  useEffect(() => {
    load();
    const reload = listen("screenshot-toast:shot", load);
    return () => { void reload.then(off => off()); };
  }, [load]);

  const leave = useCallback(() => setLeaving(true), []);
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => void invoke("close_screenshot_toast").catch(() => {}), LEAVE_MS);
    return () => clearTimeout(timer);
  }, [leaving]);
  useEffect(() => {
    if (!shot || held || leaving || note) return;
    const timer = setTimeout(leave, copied ? 1000 : HOLD_MS);
    return () => clearTimeout(timer);
  }, [shot, held, leaving, note, copied, round, leave]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") leave(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [leave]);

  if (!shot) return null;
  const fail = (error: unknown) => setNote(String(error));
  const copy = () => void invoke("copy_saved_screenshot", { path: shot.path }).then(() => setCopied(true)).catch(fail);
  const markup = () => void invoke("open_screenshot_markup", { path: shot.path }).catch(fail);
  const reveal = () => void invoke("reveal_screenshot", { path: shot.path }).then(leave).catch(fail);

  return <div className="shot-toast" key={round} data-leaving={leaving} onMouseEnter={() => setHeld(true)} onMouseLeave={() => setHeld(false)}>
    <div className="shot-toast__card">
      <button type="button" className="shot-toast__image" onClick={markup} title="Open in Markup" aria-label="Open screenshot in Markup">
        <img src={shot.thumbDataUrl} alt={`Screenshot, ${shot.width} by ${shot.height}`} draggable={false} />
      </button>
      <div className="shot-toast__scrim" />
      <button type="button" className="shot-toast__glass shot-toast__close" onClick={leave} title="Dismiss" aria-label="Dismiss"><CloseIcon /></button>
      <div className="shot-toast__bar">
        <button type="button" className="shot-toast__glass" onClick={copy} title={copied ? "Copied" : "Copy"} aria-label="Copy screenshot">{copied ? <CheckIcon /> : <CopyIcon />}</button>
        <button type="button" className="shot-toast__glass" onClick={markup} title="Markup" aria-label="Markup">{<MarkupIcon />}</button>
        <button type="button" className="shot-toast__glass" onClick={reveal} title={isMac ? "Show in Finder" : "Show in folder"} aria-label="Show saved file"><FolderIcon /></button>
      </div>
      {note && <p className="shot-toast__note" role="alert">{note}</p>}
    </div>
  </div>;
}
