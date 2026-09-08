import React from "react";
import { HomeNav, HomeFooter } from "./home/Navigation.jsx";
import Hero from "./home/Hero.jsx";
import Desktop from "./home/Desktop.jsx";
import Mobile from "./home/Mobile.jsx";
import Control from "./home/Control.jsx";
import Plans from "./home/Plans.jsx";
import Questions from "./home/Questions.jsx";

export default function App() {
    return (
        <div className="marketing-home marketing-home-cinematic">
            <a className="skip-link" href="#main">
                Skip to content
            </a>
            <HomeNav />
            <main id="main">
                <Hero />
                <Desktop />
                <Mobile />
                <Control />
                <Plans />
                <Questions />
            </main>
            <HomeFooter />
        </div>
    );
}
