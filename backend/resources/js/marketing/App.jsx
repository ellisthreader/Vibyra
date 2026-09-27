import React from "react";
import { HomeNav, HomeFooter } from "./home/Navigation.jsx";
import Hero from "./home/Hero.jsx";
import Film from "./home/Film.jsx";
import Desktop from "./home/Desktop.jsx";
import Mobile from "./home/Mobile.jsx";
import Ecosystem from "./home/Ecosystem.jsx";
import Plans from "./home/Plans.jsx";
import Questions from "./home/Questions.jsx";
import useIdleSections from "./home/useIdleSections.js";

export default function App() {
    useIdleSections();

    return (
        <div className="marketing-home marketing-home-cinematic">
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
                <Plans />
                <Questions />
            </main>
            <HomeFooter />
        </div>
    );
}
