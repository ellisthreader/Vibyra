import React, { useEffect, useRef, useState } from "react";
import { Icon } from "./shared.jsx";

const csrfToken = () => document.querySelector('meta[name="csrf-token"]')?.content ?? "";
const MAX_CHARS = 600;

/* Writes the answer in a few words at a time, so it reads as being written. */
function useTyped(text) {
    const [shown, setShown] = useState("");
    useEffect(() => {
        if (!text) return setShown("");
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setShown(text);
        const words = text.split(" ");
        let i = 0;
        const timer = setInterval(() => {
            i += 1;
            setShown(words.slice(0, i).join(" "));
            if (i >= words.length) clearInterval(timer);
        }, 22);
        return () => clearInterval(timer);
    }, [text]);
    return shown;
}

export default function AskVibyra() {
    const [question, setQuestion] = useState("");
    const [answer, setAnswer] = useState("");
    const [state, setState] = useState("idle"); // idle | asking | done | error
    const [error, setError] = useState("");
    const request = useRef(null);
    const field = useRef(null);
    const typed = useTyped(answer);
    const ready = question.trim().length >= 3;

    /* A long question wraps onto its own lines instead of scrolling out of sight. */
    function fit() {
        const el = field.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${el.scrollHeight}px`;
    }
    useEffect(fit, [question]);

    function stop() {
        request.current?.abort();
        request.current = null;
        setState("idle");
    }

    async function ask(event) {
        event.preventDefault();
        if (state === "asking") return stop();
        if (!ready) return;
        const controller = new AbortController();
        request.current = controller;
        setState("asking");
        setAnswer("");
        setError("");
        try {
            const response = await fetch("/web-api/faq/ask", {
                method: "POST",
                signal: controller.signal,
                headers: { "Content-Type": "application/json", Accept: "application/json", "X-CSRF-TOKEN": csrfToken() },
                body: JSON.stringify({ question: question.trim() }),
            });
            const body = await response.json().catch(() => ({}));
            if (response.ok && body.ok) {
                setAnswer(body.answer);
                setState("done");
            } else {
                setError(body.error || "That didn’t go through. Try again in a moment.");
                setState("error");
            }
        } catch (failure) {
            if (failure.name === "AbortError") return;
            setError("We couldn’t reach the server. Check your connection and try again.");
            setState("error");
        }
        request.current = null;
    }

    return (
        <div className="qa-item qa-ask">
            <form className="qa-ask-row" onSubmit={ask}>
                <textarea
                    ref={field}
                    rows={1}
                    name="question"
                    autoComplete="off"
                    maxLength={MAX_CHARS}
                    placeholder="Ask anything else"
                    aria-label="Ask anything else"
                    aria-describedby="qa-ask-privacy"
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) ask(event);
                    }}
                />
                <button
                    type="submit"
                    className={ready || state === "asking" ? "is-ready" : ""}
                    disabled={!ready && state !== "asking"}
                    aria-label={state === "asking" ? "Stop" : "Ask"}
                >
                    {state === "asking" ? <span className="qa-stop" /> : <Icon name="arrow" size={15} />}
                </button>
            </form>
            <p className="qa-ask-privacy" id="qa-ask-privacy">
                Your question is sent to OpenAI for an answer. Please leave out personal or sensitive details.
            </p>
            {state !== "idle" && (
                <div className="qa-reply" role="status" aria-live="polite" aria-busy={state === "asking"}>
                    {state === "asking" && <p className="qa-status">Reading the notes</p>}
                    {state === "error" && <p className="qa-status">{error}</p>}
                    {state === "done" &&
                        typed
                            .split("\n\n")
                            .filter(Boolean)
                            .map((paragraph, index) => <p key={index}>{paragraph}</p>)}
                </div>
            )}
        </div>
    );
}
