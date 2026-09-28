import React, { useState } from "react";
import { Icon } from "./shared.jsx";

const csrfToken = () => document.querySelector('meta[name="csrf-token"]')?.content ?? "";

export default function PhoneWaitlist({ defaultEmail = "" }) {
    const [email, setEmail] = useState(defaultEmail);
    const [state, setState] = useState("idle");
    const [error, setError] = useState("");

    async function submit(event) {
        event.preventDefault();
        if (state === "sending") return;
        setState("sending");
        setError("");
        try {
            const response = await fetch("/web-api/phone-waitlist", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    "X-CSRF-TOKEN": csrfToken(),
                },
                body: JSON.stringify({ email }),
            });
            const body = await response.json().catch(() => ({}));
            if (response.ok && body.ok) {
                setState("done");
                return;
            }
            setError(body.error || "That didn’t go through. Try again in a moment.");
            setState("idle");
        } catch {
            setError("We couldn’t reach the server. Check your connection and try again.");
            setState("idle");
        }
    }

    if (state === "done") {
        return (
            <p className="phone-waitlist-done" role="status">
                <Icon name="check" size={18} />
                You’re on the list. We’ll email you the moment the phone app opens up.
            </p>
        );
    }

    return (
        <form className="phone-waitlist" data-analytics-form="waitlist" onSubmit={submit} noValidate>
            <label htmlFor="phone-waitlist-email">Get told the day it lands</label>
            <div className="phone-waitlist-row">
                <input
                    id="phone-waitlist-email"
                    type="email"
                    name="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    aria-describedby={error ? "phone-waitlist-error" : undefined}
                    aria-invalid={error ? "true" : undefined}
                    required
                />
                <button type="submit" disabled={state === "sending"}>
                    {state === "sending" ? "Adding…" : "Keep me posted"}
                    <Icon size={16} />
                </button>
            </div>
            {error ? (
                <p className="phone-waitlist-error" id="phone-waitlist-error" role="alert">
                    {error}
                </p>
            ) : (
                <p className="phone-waitlist-note">One email when it opens. Nothing else.</p>
            )}
        </form>
    );
}
