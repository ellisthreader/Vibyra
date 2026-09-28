import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { initialProjects, projectReducer, makeChange } from "./projectState.js";
import { demoProjects, askTurns, startedLines } from "./demoData.js";
import { terminalSampleReply } from "./terminalSample.js";
import { useAgentDemo } from "./agent/useAgentDemo.js";

const HOME = { id: "home", name: "Home", branch: "", sessions: [] };
const seedSessions = () => Object.fromEntries(demoProjects.map((entry) => [entry.id, entry.sessions]));

// Everything the device knows about itself. Navigation stays in here, so a
// click stays in the miniature. All projects, settings and connections are samples.
export function useDeviceDemo() {
    const [preferences, setPreferences] = useState({ theme: "Dark", fontSize: 12, font: "JetBrains Mono", motion: true, performance: "Balanced", context: false, restore: true, remote: true, phoneTyping: false, notifications: true, sounds: false, attention: true, finished: true });
    const [phone, setPhone] = useState("disconnected");
    const updatePreferences = patch => setPreferences(current => ({ ...current, ...patch, ...(patch.performance ? { motion: patch.performance !== "Best performance" } : {}) }));
    const [mode, setMode] = useState("code");
    const agent = useAgentDemo();
    const [projectId, setProjectId] = useState("orbit");
    const [sampleProjects, setSampleProjects] = useState(demoProjects);
    const [sessionId, setSessionId] = useState("s1");
    const [sessions, setSessions] = useState(seedSessions);
    const [tool, setTool] = useState("preview");
    const [dockOpen, setDockOpen] = useState(true);
    const [dockWidth, setDockWidthState] = useState(380);
    const [sidebarOpen, setSidebarOpen] = useState(() => typeof window === "undefined" || window.innerWidth > 700);
    const [zoomedId, setZoomedId] = useState(null);
    const [pausedIds, setPausedIds] = useState([]);
    const [size, setSize] = useState("compact");
    const [file, setFile] = useState("app.json");
    const [turnsByProject, setTurnsByProject] = useState({ orbit: askTurns });
    const [terminalHistory, setTerminalHistory] = useState({});
    const [run, setRun] = useState(null);
    const [notice, setNotice] = useState("");
    const [files, dispatch] = useReducer(projectReducer, undefined, initialProjects);
    const timers = useRef([]);
    const nextId = useRef(10);

    const clearTimers = useCallback(() => {
        timers.current.forEach(clearTimeout);
        timers.current = [];
    }, []);

    useEffect(() => clearTimers, [clearTimers]);

    const projects = sampleProjects.map((entry) => ({ ...entry, sessions: sessions[entry.id] ?? [] }));
    const base = projects.find((entry) => entry.id === projectId);
    const project = base ? { ...base, sessions: sessions[projectId] ?? [] } : HOME;
    const data = files.find((entry) => entry.id === projectId) ?? files[0];
    const changed = Object.keys(data.files).filter((name) => data.files[name] !== data.baseline[name]);
    const turns = turnsByProject[projectId] ?? [];
    const addTurn = (id, turn) => setTurnsByProject((current) => ({ ...current, [id]: [...(current[id] ?? []).slice(-8), turn] }));

    const openProject = (id) => {
        setProjectId(id);
        const list = sessions[id];
        setSessionId(list?.[0]?.id ?? "");
        setZoomedId(null);
        setNotice("");
    };

    const newProject = (name, options = {}) => {
        const label = name.trim().slice(0, 60);
        if (!label) return false;
        const id = `sample-${nextId.current++}`;
        setSampleProjects((current) => [...current, { id, name: label, branch: options.git ? "main" : "", stack: options.stack, sessions: [] }]);
        const terminalId = `s${nextId.current++}`;
        setSessions((current) => ({ ...current, [id]: options.terminal ? [{ id: terminalId, ...startedLines({ id: "terminal", name: "Terminal" }, label) }] : [] }));
        dispatch({ type: "create", id, name: label });
        setProjectId(id);
        setSessionId(options.terminal ? terminalId : "");
        setDockOpen(false);
        setSize("compact");
        setZoomedId(null);
        setMode("code");
        setNotice(`${label} was added to this sample workspace.`);
        return true;
    };

    const setDockWidth = (value) => setDockWidthState(Math.max(320, Math.min(560, Math.round(value))));

    // Clicking an agent starts it here, the way the app's quick chips do.
    const startAgent = (agent) => {
        if (!agent?.id) return;
        const target = projects.some((entry) => entry.id === projectId) ? projectId : projects[0].id;
        setZoomedId(null);
        const id = `s${nextId.current}`;
        nextId.current += 1;
        setProjectId(target);
        setSessions((current) => ({
            ...current,
            [target]: [...(current[target] ?? []), { id, ...startedLines(agent, projects.find((entry) => entry.id === target)?.name), ...(agent.model ? { label: agent.model, model: agent.model } : {}) }],
        }));
        setSessionId(id);
        setMode("code");
        setNotice(`${agent.name} started in this sample workspace.`);
    };

    const closeSession = (id, targetProjectId = projectId) => {
        setSessions((current) => {
            const list = (current[targetProjectId] ?? []).filter((entry) => entry.id !== id);
            if (targetProjectId === projectId && id === sessionId) setSessionId(list[0]?.id ?? "");
            return { ...current, [targetProjectId]: list };
        });
        setZoomedId((current) => current === id ? null : current);
        setPausedIds((current) => current.filter((entry) => entry !== id));
    };

    const togglePause = (id) => setPausedIds((current) => current.includes(id)
        ? current.filter((entry) => entry !== id) : [...current, id]);
    const toggleZoom = (id) => setZoomedId((current) => current === id ? null : id);

    const runTerminalCommand = (id, input) => {
        const command = input.trim().slice(0, 160);
        if (!command) return;
        const session = project.sessions.find((entry) => entry.id === id);
        const reply = terminalSampleReply(command, session, project, data, changed);
        if (reply.openTool) { setTool(reply.openTool); setDockOpen(true); }
        if (reply.previewTitle) {
            try {
                const config = JSON.parse(data.files["app.json"]);
                dispatch({ type: "file", id: data.id, name: "app.json", value: JSON.stringify({ ...config, title: reply.previewTitle }, null, 2) });
                setTool("preview");
                setDockOpen(true);
            } catch { setNotice("Fix app.json before changing the sample headline."); }
        }
        if (reply.resolveAttention) setSessions((current) => ({
            ...current,
            [projectId]: (current[projectId] ?? []).map((entry) => entry.id === id ? { ...entry, state: "idle" } : entry),
        }));
        setTerminalHistory((current) => ({ ...current, [id]: [...(current[id] ?? []).slice(-15), ["prompt", `› ${command}`], ["muted", reply.answer]] }));
    };

    // The one place a prompt turns into a change. Two beats, like the real run.
    const send = (prompt) => {
        const text = prompt.trim();
        if (!text || run) return;
        const targetId = projectId;
        addTurn(targetId, { role: "you", text: text.slice(0, 300) });
        setRun("Reading the sample project…");
        setTool("chat");
        setDockOpen(true);
        timers.current.push(setTimeout(() => setRun("Preparing your demo change…"), 600));
        timers.current.push(
            setTimeout(() => {
                const result = makeChange(data, text);
                if (result.value) dispatch({ type: "file", id: data.id, name: "app.json", value: result.value });
                addTurn(targetId, { role: "agent", text: result.text });
                setNotice(result.value ? "Preview updated. Review the change when you are ready." : "");
                clearTimers();
                setRun(null);
            }, 1500),
        );
    };

    const stop = () => {
        clearTimers();
        setRun(null);
        addTurn(projectId, { role: "agent", text: "Stopped. Nothing was written." });
    };

    const keep = () => {
        dispatch({ type: "keep", id: data.id });
        setNotice("Kept. Your sample workspace is back in sync.");
    };

    const discard = () => {
        dispatch({ type: "discard", id: data.id });
        setNotice("Discarded. The sample is back to where it started.");
    };

    const writeFile = (name, value) => dispatch({ type: "file", id: data.id, name, value });
    const clearTurns = () => setTurnsByProject((current) => ({ ...current, [projectId]: [] }));

    return {
        mode, setMode, preferences, updatePreferences, phone, setPhone,
        project, projects, openProject, newProject,
        sessionId, setSessionId, closeSession, startAgent, zoomedId, toggleZoom, pausedIds, togglePause, terminalHistory, runTerminalCommand,
        sidebarOpen, setSidebarOpen,
        tool, setTool, dockOpen, setDockOpen, dockWidth, setDockWidth, size, setSize,
        file, setFile, data, writeFile, changed,
        turns, run, setNotice, send, stop, keep, discard, clearTurns,
        agent,
        // The hero's hidden live region speaks for whichever mode you are in.
        notice: (mode === "agent" && agent.notice) || notice,
    };
}
