import { useRef } from "react";
import { AuthPhoneArt } from "./AuthPhoneArt";

export function AuthMobileCampaign({ side }: { side: "left" | "right" }) {
  const dialog = useRef<HTMLDialogElement>(null);
  if (side === "right") return <section className="pocket-showcase" aria-label="iPhone app preview">
    <h2 className="pocket-showcase-title">Build from<br /><span>your pocket.</span></h2>
    <div className="pocket-visual"><AuthPhoneArt /><span className="pocket-spark" aria-hidden="true">✳</span></div>
  </section>;
  return <section className="pocket-campaign">
    <span className="ios-label">VIBYRA FOR iPHONE</span>
    <h2>Download the new<br />Vibyra iOS app.</h2>
    <div className="pocket-note"><button className="ios-link" onClick={() => dialog.current?.showModal()}>
      Explore the iPhone app <span aria-hidden="true">↗</span>
    </button></div>
    <dialog className="auth-mobile-dialog" ref={dialog}>
      <h2>Vibyra for iPhone</h2>
      <p>Build from your pocket. Create on your phone and keep your ideas close.</p>
      <p>A download link isn’t available here yet.</p>
      <button onClick={() => dialog.current?.close()}>Back to sign in</button>
    </dialog>
  </section>;
}
