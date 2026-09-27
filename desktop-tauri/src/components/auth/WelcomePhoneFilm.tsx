import { useEffect, useRef, useState } from "react";
import darkFilm from "../../assets/welcome/iphone-connection-dark.webm";
import lightFilm from "../../assets/welcome/iphone-connection-light.webm";
import darkSearch from "../../assets/welcome/iphone-search-dark.jpg";
import lightSearch from "../../assets/welcome/iphone-search-light.jpg";
import darkApproval from "../../assets/welcome/iphone-approval-dark.jpg";
import lightApproval from "../../assets/welcome/iphone-approval-light.jpg";
import { WelcomeScreen } from "./WelcomeScreens";
import { ramp } from "./WelcomeDemoActivity";

/** Recording of production mobile components. Playback never contacts a device. */
export function WelcomePhoneFilm({ time, playing, reduced }: { time:number; playing:boolean; reduced:boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const [light, setLight] = useState(() => document.documentElement.dataset.theme === 'light');
  const latest = useRef({time,playing,reduced});
  latest.current = {time,playing,reduced};
  useEffect(() => {
    const observer = new MutationObserver(() => setLight(document.documentElement.dataset.theme === 'light'));
    observer.observe(document.documentElement, {attributes:true,attributeFilter:['data-theme']});
    return () => observer.disconnect();
  }, []);
  const sync = () => {
    const element = video.current;
    if (!element || !Number.isFinite(element.duration)) return;
    const state = latest.current;
    const target = Math.min(Math.max(0, state.time), element.duration - .06);
    if (Math.abs(element.currentTime - target) > .2 || !state.playing) element.currentTime = target;
    if (state.playing && !state.reduced && target < element.duration - .1) void element.play().catch(() => {});
    else element.pause();
  };
  useEffect(sync, [time,playing,reduced,light]);
  useEffect(() => { const element = video.current; return () => element?.pause(); }, [reduced]);
  useEffect(() => setFailed(false), [light]);
  const poster = light ? lightSearch : darkSearch;
  const fallback = time < 5 ? poster : light ? lightApproval : darkApproval;
  return <div className="welcome-phone-film" data-phone-phase={reduced || time >= 9 ? 'connected' : time >= 5 ? 'approval' : 'searching'}>
    <WelcomeScreen name="iphone" />
    {!reduced && failed && time < 9 && <img className="welcome-phone-fallback" src={fallback} alt="" />}
    {!reduced && !failed && <video ref={video} poster={poster} onError={() => setFailed(true)} src={light ? lightFilm : darkFilm} muted playsInline preload="auto" style={{opacity:1 - ramp(time, 9.6, .4)}}
      onLoadedMetadata={sync} aria-hidden="true" />}
  </div>;
}
