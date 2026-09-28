import React from "react";
import { Container, Eyebrow, Section, SectionTitle } from "../ui.jsx";
import { FadeUp } from "../motion.jsx";

const PROOFS = [
  {
    eyebrow: "Multi-agent terminals",
    title: "Run the team you actually need.",
    body: "Open independent terminals for focused tasks or describe one outcome and let Vibyra propose a coordinated team. Switch between focus and grid views without losing the live sessions.",
    image: "/media/homepage/desktop-multi-terminal.png",
    alt: "Vibyra Desktop showing four live AI terminal sessions in a grid with named agents in the sidebar.",
    label: "Live agent workspace",
    frame: "agents",
    facts: ["Up to 12 terminal sessions", "Independent or coordinated setup", "Persistent detached workers"],
  },
  {
    eyebrow: "Voice + project brain",
    title: "Speak, remember, and keep building.",
    body: "Talk to Vibyra, dictate directly into a selected terminal, and import project notes into a visual memory workspace. The same right-hand workspace also holds Editor and Preview.",
    image: "/media/homepage/desktop-memory-voice.png",
    alt: "Vibyra Desktop with multiple terminals, the Memory workspace, and an active voice listening control.",
    label: "Voice + memory",
    frame: "memory",
    facts: ["AI conversation and terminal dictation", "Obsidian and Markdown imports", "Editor, Preview, AI, and Memory"],
  },
  {
    eyebrow: "Model and account choice",
    title: "Use Vibyra credits or supported AI accounts.",
    body: "Choose from the verified runtime catalogue available to your setup. Vibyra keeps provider identity, account routing, workspace safety, and permissions explicit.",
    image: "/media/homepage/desktop-model-catalog-v2.png",
    alt: "Vibyra Desktop model picker showing supported OpenAI and Anthropic model choices.",
    label: "Real model catalogue",
    frame: "models",
    facts: ["Searchable model catalogue", "Connected provider accounts", "Safe mode by default"],
  },
];

export default function ProductProof() {
  return (
    <Section id="product-proof">
      <Container narrow>
        <FadeUp>
          <Eyebrow>Built for serious AI work</Eyebrow>
          <SectionTitle>More than a phone remote.</SectionTitle>
          <p className="text-lg text-ink-muted">
            Vibyra is the terminal workspace, the portable review surface, and the project context
            that connects them.
          </p>
        </FadeUp>
      </Container>
      <Container className="mt-12 space-y-20 md:mt-16 md:space-y-28">
        {PROOFS.map((proof, index) => (
          <article key={proof.title} className="proof-row grid items-center gap-8 lg:grid-cols-12 lg:gap-12">
            <FadeUp className={`lg:col-span-4 ${index % 2 ? "lg:order-2" : ""}`}>
              <Eyebrow>{proof.eyebrow}</Eyebrow>
              <h3 className="mb-4 text-3xl font-bold leading-tight tracking-tight xl:text-[2.5rem]">
                {proof.title}
              </h3>
              <p className="text-ink-muted">{proof.body}</p>
              <ul className="mt-6 space-y-3">
                {proof.facts.map((fact) => (
                  <li key={fact} className="flex gap-3 text-sm text-ink-muted">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-violet" aria-hidden="true" />
                    {fact}
                  </li>
                ))}
              </ul>
            </FadeUp>
            <FadeUp className={`min-w-0 lg:col-span-8 ${index % 2 ? "lg:order-1" : ""}`} y={32}>
              <figure className={`marketing-product-frame marketing-product-frame--${proof.frame}`}>
                <div className="marketing-product-frame__ambient" aria-hidden="true" />
                <div className="marketing-product-frame__window">
                  <div className="marketing-product-frame__bar" aria-hidden="true">
                    <span /><span /><span />
                    <strong>Vibyra Desktop</strong>
                  </div>
                  <div className="marketing-product-frame__viewport">
                    <img src={proof.image} alt={proof.alt} loading="lazy" width="1920" height="1080" />
                  </div>
                </div>
                <figcaption><span>{proof.label}</span> Authentic product capture</figcaption>
              </figure>
            </FadeUp>
          </article>
        ))}
      </Container>
    </Section>
  );
}
