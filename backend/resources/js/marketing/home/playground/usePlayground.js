import { useEffect, useReducer, useRef, useState } from "react";
import { initialProjects, projectReducer, makeChange } from "./projectState.js";

export function usePlayground(open) {
    const [projects, dispatch] = useReducer(projectReducer, undefined, initialProjects);
    const [projectId, setProjectId] = useState("orbit");
    const [view, setView] = useState("agents");
    const [run, setRun] = useState(null);
    const [notice, setNotice] = useState("");
    const timers = useRef([]);
    const pending = useRef(null);
    const sequence = useRef(0);
    const project = projects.find((item) => item.id === projectId) || projects[0];
    const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; pending.current = null; };
    const cancel = () => {
        if (pending.current) dispatch({ type: "message", id: pending.current, message: { role: "agent", text: "Demo run stopped. No files changed." } });
        clearTimers(); setRun(null);
    };
    useEffect(() => () => clearTimers(), []);
    useEffect(() => {
        if (!open) { cancel(); return; }
        setView(open.view || "agents");
        if (open.provider) dispatch({ type: "patch", id: projectId, patch: { provider: open.provider } });
    }, [open]);
    const send = (prompt) => {
        if (pending.current || !prompt.trim()) return;
        const id = project.id;
        pending.current = id;
        dispatch({ type: "message", id, message: { role: "you", text: prompt.trim().slice(0, 500) } });
        setRun("Reading the sample project…");
        timers.current.push(setTimeout(() => setRun("Preparing your demo change…"), 600));
        timers.current.push(setTimeout(() => {
            const result = makeChange(project, prompt.trim());
            if (result.value) dispatch({ type: "file", id, name: "app.json", value: result.value });
            dispatch({ type: "message", id, message: { role: "agent", text: result.text } });
            clearTimers(); setRun(null);
            setNotice(result.value ? "Preview updated. Your change is ready to review." : result.text);
        }, 1500));
    };
    const switchProject = (id) => { cancel(); setProjectId(id); setNotice(""); };
    const create = (name) => {
        if (projects.length >= 8) return "This demo supports up to 8 projects.";
        if (!name.trim()) return "Give your project a name.";
        if (projects.some((item) => item.name.toLowerCase() === name.trim().toLowerCase())) return "A project with that name already exists.";
        cancel();
        const id = `project-${++sequence.current}`;
        dispatch({ type: "create", id, name: name.trim().slice(0, 40) });
        setProjectId(id); setView("agents"); setNotice("Your sample project is ready.");
        return null;
    };
    const reset = () => { cancel(); dispatch({ type: "reset" }); setProjectId("orbit"); setView("agents"); setNotice("Sample workspace reset."); };
    const update = (action) => dispatch({ ...action, id: project.id });
    return { projects, project, view, setView, run, notice, setNotice, send, cancel, switchProject, create, reset, update };
}
