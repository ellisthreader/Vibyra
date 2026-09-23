import { useRef } from "react";
import { WelcomeScreen } from "./WelcomeScreens";
import { WelcomePhoneFilm } from "./WelcomePhoneFilm";
import { ease, ramp, WelcomeAgentActivity, WelcomeDemoCursor, WelcomeTerminal } from "./WelcomeDemoActivity";

/** Full interface, fixed camera. Terminals open independently within their actual pane chrome. */
export function WelcomeArtwork({ step, time, reduced, playing }: { step:number; time:number; reduced:boolean; playing:boolean }) {
  const phone = step === 3;
  const demoTime = reduced ? 14 : time;
  const sceneTimes = useRef([0, 0, 0, 0, 0]);
  sceneTimes.current[step] = demoTime;
  const codeTime = sceneTimes.current[1];
  const agentTime = sceneTimes.current[2];
  const connected = ease(ramp(demoTime, 9, 1.2));
  return <div className="welcome-product" data-demo-step={step} aria-hidden="true">
    <div className="welcome-film">
      <div className="welcome-film__desktop" style={phone ? {
        opacity:connected, transform:`translateX(${-14 * connected}%) scale(.72)`,
      } : undefined}>
        <div className="welcome-film__view" data-active={step === 1}>
          <WelcomeScreen name="code" />
          <div className="welcome-terminal-stage">
            {[0,1,2,3].map(index => {
              const opening = ease(ramp(codeTime, .2 + index * .65, .65));
              return <div className="welcome-opening-pane" data-terminal={index} key={index}
                style={{opacity:opening,transform:`translateY(${(1-opening)*18}px) scale(${.97 + opening*.03})`}}>
                <div className="welcome-pane-chrome"><WelcomeScreen name="code" /></div>
                <WelcomeTerminal index={index} time={codeTime - index * .65} />
              </div>;
            })}
          </div>
        </div>
        <div className="welcome-film__view" data-active={step === 2}>
          <WelcomeScreen name="agents" />
          <WelcomeAgentActivity time={agentTime} />
          <WelcomeDemoCursor time={agentTime} />
        </div>
        <div className="welcome-film__view welcome-film__settings" data-active={phone}><WelcomeScreen name="phone" /></div>
      </div>
      <div className="welcome-film__phone" style={{opacity:phone ? 1 : 0, left:`${50 + 35 * connected}%`}}>
        <WelcomePhoneFilm time={sceneTimes.current[3]} playing={phone && playing} reduced={reduced} />
      </div>
    </div>
  </div>;
}
