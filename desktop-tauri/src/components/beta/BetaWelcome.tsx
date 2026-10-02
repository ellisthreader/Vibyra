import { useRef } from 'react';
import { useModalFocus } from '../../lib/useModalFocus';
import { welcomeFirstName } from '../../lib/firstWelcomePolicy';
import { betaOffer, type BetaReceipt } from '../../lib/betaWelcomePolicy';
import { CloseIcon } from '../common/Icons';
import art from '../../assets/beta-ribbon.png';
import { vibyraLogoUrl as logo } from '../../assets/vibyraLogo';
import './betaWelcome.css';

export function BetaWelcome({ name, receipt, onDismiss, onReport }: {
  name: string; receipt: BetaReceipt; onDismiss: () => void; onReport: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useModalFocus(ref, true, onDismiss);
  const end = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(receipt.endsAt));
  return <div className="beta-backdrop" data-beta-welcome>
    <section className="beta-welcome" ref={ref} role="dialog" aria-modal="true" aria-labelledby="beta-title" aria-describedby="beta-description" tabIndex={-1}>
      <div className="beta-hero">
        <img className="beta-hero-art" src={art} alt="" draggable={false} />
        <div className="beta-art-shade" />
        <div className="beta-wordmark"><img src={logo} alt="" />vibyra</div>
        <button type="button" className="beta-close" aria-label="Close welcome" onClick={onDismiss}><CloseIcon size={17} /></button>
        <div className="beta-welcome-copy">
          <div className="beta-eyebrow"><span />YOU’RE PART OF THE BEGINNING</div>
          <h1 id="beta-title">Welcome,<span>{welcomeFirstName(name)}.</span></h1>
          <h2>{betaOffer(receipt.months)}</h2>
          <p id="beta-description">Thank you for becoming a Vibyra beta tester. Your ideas, feedback and every bug you spot help shape what comes next.</p>
          <p className="beta-thanks">We’re glad you’re here.</p>
        </div>
        <div className="beta-art-caption"><span />BUILT WITH YOU. FROM THE BEGINNING.</div>
      </div>
      <div className="beta-membership">
        <div className="beta-membership-icon" aria-hidden="true">◇</div>
        <div className="beta-membership-label"><strong>Your Pro membership is active</strong><span>Included until {end}</span></div>
        <span className="beta-badge">BETA TESTER</span>
      </div>
      <footer className="beta-actions">
        <div className="beta-report-help"><button type="button" onClick={onReport}>Report a problem <span aria-hidden="true">↗</span></button><p>You can also find this in the sidebar, anytime.</p></div>
        <button type="button" className="beta-primary" onClick={onDismiss}>Let’s build <span aria-hidden="true">→</span></button>
      </footer>
    </section>
  </div>;
}
