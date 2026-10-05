import React, { useRef } from "react";
import { HomeNav, HomeFooter } from "./home/Navigation.jsx";
import Hero from "./home/Hero.jsx";
import Film from "./home/Film.jsx";
import Desktop from "./home/Desktop.jsx";
import Mobile from "./home/Mobile.jsx";
import Ecosystem from "./home/Ecosystem.jsx";
import Comparison from "./home/Comparison.jsx";
import Plans from "./home/Plans.jsx";
import Questions from "./home/Questions.jsx";
import useIdleSections from "./home/useIdleSections.js";
import useHeroEntrance from "./home/useHeroEntrance.js";
import useScrollReveal from "./home/useScrollReveal.js";
import "../../css/marketing/home-hero-entrance.css";
import "../../css/marketing/home-scroll-reveal.css";

export default function App() {
    const page = useRef(null);
    useIdleSections();
    useScrollReveal(page);
    const entering = useHeroEntrance();

    return (
        <div ref={page} className="marketing-home marketing-home-cinematic" data-hero-entrance={entering}>
            <a className="skip-link" href="#main">
                Skip to content
            </a>
            <HomeNav />
            <main id="main">
                <Hero />
                <Film />
                <Desktop />
                <Mobile />
                <Ecosystem />
                <Comparison />
                <Plans />
                <Questions />
            </main>
            <HomeFooter />
        </div>
    );
}
