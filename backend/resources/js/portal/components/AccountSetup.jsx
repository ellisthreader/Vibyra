import React, { useEffect, useRef, useState } from "react";
import PhoneWaitlist from "../../marketing/home/PhoneWaitlist.jsx";

const steps = [
  ["Install Vibyra Desktop", "Download the right installer above, open Vibyra, and sign in with this account."],
  ["Open the phone connection", "In Desktop, open Settings → Phone and enable the connection. Keep both devices on the same Wi-Fi for nearby setup."],
  ["Find and approve your computer", "In the phone app, open Remote and choose your computer. Approve the request on the computer before the phone connects."],
];

function ConnectionArt() {
  const node = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!node.current || !window.IntersectionObserver) { setVisible(true); return undefined; }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); observer.disconnect(); }
    }, { threshold: 0.25 });
    observer.observe(node.current);
    return () => observer.disconnect();
  }, []);
  return <div ref={node} className={`account-connection-art${visible ? " is-visible" : ""}`} aria-hidden="true">
    <div className="account-art-desktop"><div className="account-art-bar"><i /><i /><i /><span>vibyra</span></div><div className="account-art-body"><div className="account-art-rail"><b>V</b><i /><i /><i /></div><div className="account-art-window"><small>SETTINGS / PHONE</small><strong>Connect your iPhone.</strong><p>Approve the connection on this computer.</p><div><span>Connection ready</span><i /></div></div></div></div>
    <div className="account-art-signal"><span /><span /><span /></div>
    <div className="account-art-phone"><div className="account-art-notch" /><small>REMOTE</small><strong>Find your computer.</strong><div><span>Vibyra Desktop</span><i>→</i></div><p>Your computer confirms the connection.</p></div>
  </div>;
}

export default function AccountSetup({ email }) {
  return <section className="account-setup" id="connect" aria-labelledby="account-setup-title">
    <div className="account-section-head"><div><span>03 / CONNECT</span><h2 id="account-setup-title">Take it with you.</h2><p>Start on your computer, then bring your workspace to your phone.</p></div></div>
    <div className="account-setup-stage"><ConnectionArt /><div className="account-setup-copy"><span className="account-setup-kicker">FROM DESKTOP TO POCKET</span><h3>One workspace.<br /><em>Wherever you are.</em></h3><p>Your phone finds the computer you choose. You approve the connection on Desktop.</p></div></div>
    <ol className="account-setup-steps">{steps.map(([title, body], index) => <li key={title}><span>0{index + 1}</span><div><h3>{title}</h3><p>{body}</p></div></li>)}</ol>
    <div className="account-cloud-note"><strong>Connecting away from home?</strong><p>Sign in to the same Vibyra account on both devices and enable Remote access on the computer. Your computer must be awake and online; the first connection still needs its approval.</p></div>
    <div className="account-phone-availability"><div><span>VIBYRA MOBILE</span><h3>The phone app is on its way.</h3><p>The connection guide is ready for when public phone access opens.</p></div><PhoneWaitlist defaultEmail={email} /></div>
  </section>;
}
