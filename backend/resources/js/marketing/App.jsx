import React from "react";
import Nav from "./Nav.jsx";
import Hero from "./Hero.jsx";
import SimpleOverview from "./sections/SimpleOverview.jsx";
import Pricing from "./Pricing.jsx";
import Faq from "./Faq.jsx";
import { FinalCta, Footer } from "./Closing.jsx";

export default function App() {
  return (
    <>
      <a
        href="#main"
        className="absolute -top-12 left-4 z-[100] rounded-lg bg-violet px-4 py-2.5 text-white transition-all focus:top-3"
      >
        Skip to content
      </a>
      <Nav />
      <main id="main">
        <Hero />
        <SimpleOverview />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
