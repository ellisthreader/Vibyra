import { memo } from "react";
import codeDark from "../../assets/welcome/code-dark.jpg";
import codeLight from "../../assets/welcome/code-light.jpg";
import agentsDark from "../../assets/welcome/agents-dark.jpg";
import agentsLight from "../../assets/welcome/agents-light.jpg";
import phoneDark from "../../assets/welcome/phone-dark.jpg";
import phoneLight from "../../assets/welcome/phone-light.jpg";
import iphoneDark from "../../assets/welcome/iphone-dark.jpg";
import iphoneLight from "../../assets/welcome/iphone-light.jpg";

const screens = { code:[codeDark,codeLight], agents:[agentsDark,agentsLight], phone:[phoneDark,phoneLight], iphone:[iphoneDark,iphoneLight] };
export function preloadWelcomeImages() {
  for (const url of Object.values(screens).flat()) { const image = new Image(); image.src = url; }
}
export const WelcomeScreen = memo(function WelcomeScreen({ name }: { name: keyof typeof screens }) {
  return <div className="welcome-screen" data-screen={name}>
    <img className="welcome-screen__dark" src={screens[name][0]} alt="" draggable={false} />
    <img className="welcome-screen__light" src={screens[name][1]} alt="" draggable={false} />
  </div>;
});
