import React from "react";
import { Button, Container, Section, SectionTitle } from "./ui.jsx";

export function FinalCta() {
  return (
    <Section id="join" className="pb-20 md:pb-24 xl:pb-28">
      <Container narrow className="text-center">
        <img src="/vibyra-cobalt.png" alt="" className="mx-auto mb-7 h-[42px] w-14 object-contain" />
        <SectionTitle>Keep the build moving.</SectionTitle>
        <p className="text-lg text-ink-muted">Start free. Connect your phone when you are ready.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button href="/downloads" className="max-sm:w-full">Get Vibyra</Button>
          <Button href="/login" variant="ghost" className="max-sm:w-full">Log in</Button>
        </div>
      </Container>
    </Section>
  );
}

const FOOTER_LINKS = [
  ["#how-it-works", "How it works"],
  ["#pricing", "Pricing"],
  ["#faq", "FAQ"],
  ["/login", "Log in"],
];

export function Footer() {
  return (
    <footer className="border-t border-line pb-8 pt-10">
      <Container className="flex flex-col gap-7 sm:flex-row sm:items-center">
        <div>
          <a href="#" className="flex items-center gap-2.5 text-base font-bold">
            <img src="/vibyra-cobalt.png" alt="" className="h-5 w-6 object-contain" />
            <span>Vibyra</span>
          </a>
          <p className="mt-2 text-sm text-ink-muted">AI work, connected.</p>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-3 sm:ml-auto" aria-label="Footer">
          {FOOTER_LINKS.map(([href, label]) => (
            <a key={label} href={href} className="text-sm text-ink-muted hover:text-ink">
              {label}
            </a>
          ))}
        </nav>
      </Container>
      <Container className="mt-8 border-t border-line pt-5">
        <p className="text-xs text-ink-muted">© 2026 Vibyra. All rights reserved.</p>
      </Container>
    </footer>
  );
}
