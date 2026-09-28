import React, { useEffect } from "react";

export default function SignupWelcome({ name, onDone }) {
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      onDone();
      return undefined;
    }
    const timer = window.setTimeout(onDone, 1350);
    return () => window.clearTimeout(timer);
  }, [onDone]);
  const firstName = String(name || "there").trim().split(/\s+/)[0];
  return <div className="signup-welcome" role="status" aria-live="polite">
    <div className="signup-welcome-mark"><img src="/vibyra-cobalt.png" alt="" /></div>
    <span>YOUR SPACE IS READY</span><h1>Welcome to Vibyra, {firstName}.</h1>
    <p>Let’s make something you’re proud of.</p>
    <button type="button" onClick={onDone}>Continue <span aria-hidden="true">→</span></button>
  </div>;
}
