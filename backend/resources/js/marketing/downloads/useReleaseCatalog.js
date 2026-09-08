import { useEffect, useState } from "react";
import { parseCatalog } from "./catalog.js";

export default function useReleaseCatalog() {
    const [catalog, setCatalog] = useState(null);
    const [error, setError] = useState(false);
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        let active = true;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 16000);
        setError(false);
        setCatalog(null);
        fetch("/web-api/download-catalog", {
            signal: controller.signal,
            headers: { Accept: "application/json" },
            credentials: "same-origin",
        })
            .then((response) => {
                if (!response.ok) throw new Error("Downloads unavailable");
                return response.json();
            })
            .then((payload) => {
                const result = parseCatalog(payload);
                if (active) setCatalog(result);
            })
            .catch(() => {
                if (active) setError(true);
            })
            .finally(() => clearTimeout(timeout));
        return () => {
            active = false;
            clearTimeout(timeout);
            controller.abort();
        };
    }, [attempt]);
    return { catalog, error, retry: () => setAttempt((value) => value + 1) };
}
