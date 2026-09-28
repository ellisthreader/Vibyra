import React, { useEffect, useState } from "react";
import { Button } from "./ui.jsx";

const LINKS = [
  ["#how-it-works", "How it works"],
  ["#pricing", "Pricing"],
  ["#faq", "FAQ"],
];

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const solid = scrolled || open;

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 border-b transition-colors duration-200 ${
        solid ? "border-line bg-canvas/85 backdrop-blur-md" : "border-transparent"
      }`}
    >
      <div className="mx-auto flex h-[68px] max-w-[1240px] items-center gap-3 px-4 sm:gap-7 sm:px-8 xl:px-16">
        <a href="#" className="flex items-center gap-2.5 text-lg font-bold tracking-tight">
          <img src="/vibyra-cobalt.png" alt="" className="h-[24px] w-7 object-contain" />
          <span>Vibyra</span>
        </a>
        <nav className="hidden flex-1 gap-7 md:flex" aria-label="Main">
          {LINKS.map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="text-[14.5px] text-ink-muted transition-colors hover:text-ink"
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <a href="/login" className="hidden text-sm font-semibold text-ink-muted transition-colors hover:text-ink sm:inline">
            Log in
          </a>
          <Button href="/downloads" small className="shrink-0 max-[440px]:hidden">
            Get Vibyra
          </Button>
          <button
            className="flex size-10 shrink-0 flex-col items-center justify-center gap-[5px] md:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            <span
              className={`block h-0.5 w-[18px] rounded bg-ink transition-transform duration-200 ${
                open ? "translate-y-[3.5px] rotate-45" : ""
              }`}
            />
            <span
              className={`block h-0.5 w-[18px] rounded bg-ink transition-transform duration-200 ${
                open ? "-translate-y-[3.5px] -rotate-45" : ""
              }`}
            />
          </button>
        </div>
      </div>

      {open && (
          <nav
            id="mobile-menu"
            className="border-b border-line bg-canvas-raised md:hidden"
            aria-label="Mobile"
          >
            <div className="flex flex-col px-5 pb-5 pt-2 sm:px-8">
              {LINKS.map(([href, label], i) => (
                <a
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className={`py-3.5 text-base text-ink-muted ${
                    i < LINKS.length - 1 ? "border-b border-line" : ""
                  }`}
                >
                  {label}
                </a>
              ))}
            </div>
          </nav>
      )}
    </header>
  );
}
