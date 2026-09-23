import { useCallback, useEffect, useRef, useState } from "react";

import { iconForProvider } from "../../lib/providerIcons";
import { hideNewModelsNotice } from "../../lib/newModelsNotice";
import { useModalFocus } from "../../lib/useModalFocus";
import { CheckIcon, ChevronIcon, CloseIcon } from "../common/Icons";

const gptModels = [
  { name: "Luna", description: <>Deep reasoning for<br />complex problems.</>, traits: ["Rigorous", "Analytical", "Reliable"] },
  { name: "Sol", description: <>Maximum capability<br />for the hardest tasks.</>, traits: ["Frontier", "Multimodal", "Highest intelligence"] },
  { name: "Astra", description: <>Fast. Versatile.<br />Built for everyday work.</>, traits: ["Speed", "Creative", "Practical"] },
];

function BrandGlyph({ provider }: { provider: "openai" | "anthropic" }) {
  const icon = iconForProvider(provider);
  return <span className={`new-models__glyph new-models__glyph--${provider}`}
    style={icon ? { WebkitMaskImage: `url("${icon}")`, maskImage: `url("${icon}")` } : undefined}
    aria-hidden="true">{icon ? null : provider === "openai" ? "◎" : "AI"}</span>;
}

export function NewModelsNotice({ onClose, onStart }: { onClose: () => void; onStart: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  const [neverAgain, setNeverAgain] = useState(true);
  const neverAgainRef = useRef(true);
  const dismiss = useCallback((start: boolean) => {
    if (neverAgainRef.current) hideNewModelsNotice();
    if (start) onStart(); else onClose();
  }, [onClose, onStart]);
  const close = useCallback(() => dismiss(false), [dismiss]);
  useModalFocus(dialogRef, true, close);
  useEffect(() => { dialogRef.current?.focus({ preventScroll: true }); }, []);

  return <div className="new-models-backdrop">
    <section className="new-models" ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="new-models-title">
      <div className="new-models__scene">
        <span className="new-models__eyebrow">New models available</span>
        <button type="button" className="new-models__close" onClick={close} aria-label="Close new models"><CloseIcon size={18} /></button>
        <header className="new-models__intro">
          <h2 id="new-models-title">More intelligence<br />at <span>your fingertips.</span></h2>
          <p>The latest frontier models from OpenAI and Anthropic<br />are now available in Vibyra. Start using them in the terminal<br />today.</p>
        </header>
        <div className="new-models__openai">
          <BrandGlyph provider="openai" />
          <div><span>OpenAI</span><strong>GPT-6 Series</strong><p>A new era of intelligence.</p></div>
        </div>
        <div className="new-models__planets">
          {gptModels.map(model => <div className="new-models__planet" key={model.name}>
            <h3>{model.name}</h3><p>{model.description}</p>
            <div className="new-models__traits">{model.traits.map(trait => <span key={trait}>{trait}</span>)}</div>
          </div>)}
        </div>
        <div className="new-models__anthropic">
          <div className="new-models__claude-heading">
            <BrandGlyph provider="anthropic" />
            <div><span>Anthropic</span><strong>Claude Opus 5.5</strong><p>Higher standards for what AI can do.</p></div>
          </div>
          <p className="new-models__claude-statement">Intelligence at its finest.</p>
          <div className="new-models__claude-traits new-models__traits">
            {["Advanced reasoning", "Longer context", "Safer & more controllable", "Exceptional coding"].map(trait => <span key={trait}>{trait}</span>)}
          </div>
        </div>
      </div>
      <footer className="new-models__footer">
        <label className="new-models__remember">
          <input type="checkbox" checked={neverAgain} onChange={event => {
            neverAgainRef.current = event.target.checked;
            setNeverAgain(event.target.checked);
          }} />
          <span className="new-models__checkbox"><CheckIcon size={16} /></span>
          Don’t show this again
        </label>
        <div className="new-models__actions">
          <button type="button" className="new-models__later" onClick={close}>Maybe later</button>
          <button type="button" className="new-models__start" onClick={() => dismiss(true)}>Start using the new models <ChevronIcon size={17} /></button>
        </div>
      </footer>
    </section>
  </div>;
}
