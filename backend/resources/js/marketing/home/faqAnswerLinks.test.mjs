import assert from "node:assert/strict";
import test from "node:test";
import { faqAnswerLinks } from "./faqAnswerLinks.js";

test("FAQ answers link known site pages without swallowing punctuation", () => {
    assert.deepEqual(faqAnswerLinks("Go to /downloads. Plans are at /#pricing; read /legal/privacy."), [
        { text: "Go to " },
        { text: "/downloads", href: "/downloads" },
        { text: ". Plans are at " },
        { text: "/#pricing", href: "/#pricing" },
        { text: "; read " },
        { text: "/legal/privacy", href: "/legal/privacy" },
        { text: "." },
    ]);
});

test("FAQ answers leave unknown and embedded paths as plain text", () => {
    assert.deepEqual(faqAnswerLinks("Avoid //evil.test/downloads and /unknown; write hello@vibyra.com."), [
        { text: "Avoid //evil.test/downloads and /unknown; write " },
        { text: "hello@vibyra.com", href: "mailto:hello@vibyra.com" },
        { text: "." },
    ]);
});
