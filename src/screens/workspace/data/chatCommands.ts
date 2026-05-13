import type { Ionicons } from "@expo/vector-icons";

export type ChatCommandKind = "help" | "open" | "clear" | "new" | "test";

export type ChatCommand = {
  id: string;
  slash: string;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  kind: ChatCommandKind;
};

export const chatCommands: ChatCommand[] = [
  {
    id: "open",
    slash: "/open",
    label: "Open folder",
    description: "Browse and open a project folder",
    icon: "folder-open-outline",
    kind: "open"
  },
  {
    id: "new",
    slash: "/new",
    label: "New chat",
    description: "Start a fresh conversation",
    icon: "create-outline",
    kind: "new"
  },
  {
    id: "clear",
    slash: "/clear",
    label: "Clear chat",
    description: "Remove messages from this chat",
    icon: "trash-outline",
    kind: "clear"
  },
  {
    id: "test",
    slash: "/test",
    label: "Open preview",
    description: "Run this project's preview",
    icon: "play-circle-outline",
    kind: "test"
  },
  {
    id: "help",
    slash: "/help",
    label: "Help",
    description: "List the available chat commands",
    icon: "help-circle-outline",
    kind: "help"
  }
];

export const chatCommandHelpReply = [
  "Here are the chat commands you can use:",
  "",
  "• **/open** — Browse and open a project folder",
  "• **/test** — Open this project's preview",
  "• **/new** — Start a fresh conversation",
  "• **/clear** — Remove messages from this chat",
  "• **/help** — Show this list again",
  "",
  "Type **/** in the composer at any time to see commands and AI skills."
].join("\n");

export function matchChatCommand(text: string): { command: ChatCommand; args: string } | null {
  const match = text.trim().match(/^\/(\w+)(?:\s+([\s\S]*))?$/);
  if (!match) return null;
  const id = match[1].toLowerCase();
  const command = chatCommands.find((c) => c.id === id);
  if (!command) return null;
  return { command, args: (match[2] ?? "").trim() };
}

export function filterChatCommands(query: string): ChatCommand[] {
  const q = query.toLowerCase();
  if (!q) return chatCommands;
  return chatCommands.filter((c) =>
    c.id.toLowerCase().includes(q)
    || c.label.toLowerCase().includes(q)
    || c.slash.toLowerCase().includes(`/${q}`)
  );
}
