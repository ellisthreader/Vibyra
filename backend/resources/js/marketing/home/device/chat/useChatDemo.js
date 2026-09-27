import { useCallback, useEffect, useRef, useState } from "react";
import { sampleChats, chatReply, chatTitle } from "./chatData.js";

// Chat Mode's own state. A detached conversation: no project, no folders, no
// terminals. Sending answers on a short delay so the thread behaves, without
// ever claiming a model is really running.
export function useChatDemo() {
    const [chats, setChats] = useState(sampleChats);
    const [chatId, setChatId] = useState(sampleChats[0].id);
    const [access, setAccess] = useState("plan");
    const [thinking, setThinking] = useState(false);
    const timers = useRef([]);
    const nextId = useRef(20);

    const clearTimers = useCallback(() => {
        timers.current.forEach(clearTimeout);
        timers.current = [];
    }, []);

    useEffect(() => clearTimers, [clearTimers]);

    const chat = chats.find((entry) => entry.id === chatId) ?? chats[0];

    const openChat = (id) => {
        clearTimers();
        setThinking(false);
        setChatId(id);
    };

    const newChat = () => {
        clearTimers();
        setThinking(false);
        const id = `c${nextId.current}`;
        nextId.current += 1;
        setChats((current) => [{ id, title: "", turns: [] }, ...current]);
        setChatId(id);
    };

    const appendTurn = (id, turn) =>
        setChats((current) =>
            current.map((entry) => (entry.id === id ? { ...entry, turns: [...entry.turns, turn] } : entry)),
        );

    const sendChat = (prompt) => {
        const text = prompt.trim();
        if (!text || thinking) return;
        const id = chat.id;
        setChats((current) =>
            current.map((entry) =>
                entry.id === id
                    ? {
                          ...entry,
                          title: entry.title || chatTitle(text),
                          turns: [...entry.turns, { role: "you", text: text.slice(0, 300) }],
                      }
                    : entry,
            ),
        );
        setThinking(true);
        timers.current.push(
            setTimeout(() => {
                appendTurn(id, { role: "agent", text: chatReply(text) });
                clearTimers();
                setThinking(false);
            }, 900),
        );
    };

    const stopChat = () => {
        clearTimers();
        setThinking(false);
    };

    return { chats, chat, chatId, openChat, newChat, sendChat, stopChat, thinking, access, setAccess };
}
