import { useCallback, useEffect, useRef, useState } from "react";
import { teammates as startingTeammates, threads as startingThreads, newTeammates, replyTo, firstHello } from "./agentData.js";

// Sample Agent state; replies are local and no model runs.
export function useAgentDemo() {
    const [list, setList] = useState(startingTeammates);
    const [threads, setThreads] = useState(startingThreads);
    const [selectedId, setSelectedId] = useState(startingTeammates[0].id);
    const [unread, setUnread] = useState(() => startingTeammates.filter((entry) => entry.unread).map((entry) => entry.id));
    const [typing, setTyping] = useState([]);
    const [query, setQuery] = useState("");
    const [listOpen, setListOpen] = useState(false);
    const [notice, setNotice] = useState("");
    const [profile, setProfile] = useState(null);
    const [archivedView, setArchivedView] = useState(false);
    const [skillsOpen, setSkillsOpen] = useState(false);
    const [skills, setSkills] = useState([]);
    const timers = useRef([]);
    const added = useRef(0);

    useEffect(() => () => timers.current.forEach(({ timer }) => clearTimeout(timer)), []);

    const append = useCallback((id, message) => {
        setThreads((current) => ({ ...current, [id]: [...(current[id] ?? []), message].slice(-24) }));
    }, []);

    const touch = (id) =>
        setList((current) => current.map((entry) => (entry.id === id ? { ...entry, time: "Now" } : entry)));

    const replyLater = (id, text, delay = 900) => {
        setTyping((current) => [...current, id]);
        const timer = setTimeout(() => {
                setTyping((current) => current.filter((entry) => entry !== id));
                append(id, { from: "them", text });
                timers.current = timers.current.filter((entry) => entry.timer !== timer);
            }, delay);
        timers.current.push({ owner: id, timer });
    };

    const open = (id) => {
        setSelectedId(id);
        setProfile(null);
        setUnread((current) => current.filter((entry) => entry !== id));
        setListOpen(false);
        setNotice("");
    };

    const teammate = list.find((entry) => entry.id === selectedId) ?? list[0];

    const send = (prompt, files = []) => {
        const text = prompt.trim().slice(0, 4000);
        if (!text || typing.includes(teammate.id)) return;
        append(teammate.id, { from: "you", text });
        files.forEach((file) => append(teammate.id, { kind: "file", from: "you", name: file.name, meta: `${Math.max(1, Math.round(file.size / 1024))} KB · sample attachment` }));
        touch(teammate.id);
        replyLater(teammate.id, replyTo(text, teammate));
    };

    const stop = () => {
        timers.current.filter((entry) => entry.owner === teammate.id).forEach(({ timer }) => clearTimeout(timer));
        timers.current = timers.current.filter((entry) => entry.owner !== teammate.id);
        setTyping((current) => current.filter((id) => id !== teammate.id));
        append(teammate.id, { from: "them", text: "Task stopped." });
    };

    const decide = (decisionId, approved) => {
        const owner = Object.keys(threads).find((id) =>
            threads[id].some((message) => message.id === decisionId && !message.answer),
        );
        if (!owner) return;
        setThreads((current) => ({
            ...current,
            [owner]: current[owner].map((message) =>
                message.id === decisionId ? { ...message, answer: approved ? "approved" : "denied" } : message,
            ),
        }));
        touch(owner);
        setNotice("Sample decision recorded. No external action was run.");
        replyLater(owner, "Decision recorded in this sample. The website did not run the action.", 700);
    };

    const canAdd = true;

    const addTeammate = () => {
        if (!canAdd) return;
        setProfile("new");
        setListOpen(false);
    };

    const saveProfile = (fields) => {
        if (profile !== "new") {
            setList((current) => current.map((entry) => entry.id === profile ? { ...entry, ...fields } : entry));
            setSkills((current) => current.map((skill) => ({ ...skill, teammateIds:
                fields.skillIds.includes(skill.id) ? [...new Set([...skill.teammateIds, profile])] : skill.teammateIds.filter((id) => id !== profile),
            })));
            setProfile(null);
            setNotice("Sample teammate updated.");
            return;
        }
        added.current += 1;
        const id = `new${added.current}`;
        setList((current) => [
            { id, ...fields, face: fields.face || newTeammates.face, place: "~/projects/orbit", time: "Now" },
            ...current,
        ]);
        setThreads((current) => ({
            ...current,
            [id]: [
                { kind: "stamp", text: "Now" },
                { from: "them", text: firstHello },
            ],
        }));
        setSkills((current) => current.map((skill) => ({ ...skill, teammateIds:
            fields.skillIds.includes(skill.id) ? [...new Set([...skill.teammateIds, id])] : skill.teammateIds,
        })));
        setQuery("");
        setSelectedId(id);
        setProfile(null);
        setListOpen(false);
        setNotice("Sample teammate added. Tell it what to look after.");
    };

    const archiveProfile = () => {
        const item = list.find((entry) => entry.id === profile);
        if (!item) return;
        setList((current) => current.map((entry) => entry.id === profile ? { ...entry, archived: !entry.archived } : entry));
        setArchivedView(!item.archived);
        setProfile(null);
        setNotice(item.archived ? "Sample teammate restored." : "Sample teammate archived.");
    };

    const saveSkill = (skill) => {
        setSkills((current) => [skill, ...current.filter((item) => item.id !== skill.id)]);
        setList((current) => current.map((entry) => ({ ...entry, skillIds:
            skill.teammateIds.includes(entry.id) ? [...new Set([...(entry.skillIds ?? []), skill.id])] :
                (entry.skillIds ?? []).filter((id) => id !== skill.id),
        })));
    };

    const toggleArchived = () => {
        setArchivedView((current) => !current);
        setQuery("");
        setProfile(null);
        setListOpen(true);
    };

    const isWaiting = (id) =>
        (threads[id] ?? []).some((message) => message.kind === "decision" && !message.answer);

    const previewOf = (id) => {
        const last = [...(threads[id] ?? [])].reverse().find((message) => message.text && message.kind !== "stamp");
        if (!last) return "";
        return last.from === "you" ? `You: ${last.text}` : last.text;
    };

    const decisions = Object.values(threads).flatMap((thread) =>
        thread.filter((message) => message.kind === "decision" && !message.answer),
    );

    const search = query.trim().toLowerCase();
    const shown = list.filter((entry) => Boolean(entry.archived) === archivedView &&
        (!search || `${entry.name} ${entry.brief ?? ""}`.toLowerCase().includes(search)));

    return {
        teammates: shown,
        allTeammates: list,
        teammate,
        thread: threads[teammate.id] ?? [],
        typing: typing.includes(teammate.id),
        unread,
        query,
        setQuery,
        open,
        send,
        stop,
        decide,
        decisions,
        addTeammate,
        canAdd,
        profile,
        setProfile,
        saveProfile,
        archiveProfile,
        archivedView,
        hasArchived: list.some((entry) => entry.archived),
        toggleArchived,
        skillsOpen,
        setSkillsOpen,
        skills,
        setSkills,
        saveSkill,
        openSettings: () => { setProfile("settings"); setListOpen(false); },
        isWaiting,
        previewOf,
        listOpen,
        setListOpen,
        notice,
        setNotice,
    };
}
