import React from "react";
import { FadeUp } from "./motion.jsx";
import { Container, Eyebrow, Section, SectionTitle } from "./ui.jsx";

const MOMENTS = ["12 live terminals", "Voice + Memory", "Review from iPhone"];

export default function ProductFilm() {
  return (
    <Section id="product-film" className="product-film-section">
      <Container>
        <FadeUp className="product-film-heading">
          <div>
            <Eyebrow>Watch Vibyra in motion</Eyebrow>
            <SectionTitle>Many terminals. Shared Memory. Your approval.</SectionTitle>
          </div>
          <p>
            Speak or type one outcome, vibe-code across focused AI terminals, carry project
            context forward, then review and approve the work from your iPhone.
          </p>
        </FadeUp>

        <FadeUp className="product-film-stage" y={36}>
          <video
            className="product-film-video"
            controls
            playsInline
            preload="metadata"
            poster="/media/vibyra-launch-film-poster.png?v=3"
            aria-label="Vibyra product film showing desktop AI terminals, voice, Memory, phone review, and live preview"
          >
            <source src="/media/vibyra-launch-film.mp4?v=3" type="video/mp4" />
            Your browser does not support embedded video.
          </video>
          <div className="product-film-meta">
            <span>36-second product film</span>
            <ul aria-label="Features shown in the film">
              {MOMENTS.map((moment) => <li key={moment}>{moment}</li>)}
            </ul>
          </div>
        </FadeUp>
      </Container>
    </Section>
  );
}
