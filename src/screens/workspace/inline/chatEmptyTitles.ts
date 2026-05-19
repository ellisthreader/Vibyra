const greetings = [
  "Hello{nameSuffix}.",
  "Hi{nameSuffix}.",
  "Hey{nameSuffix}.",
  "Welcome back{nameSuffix}.",
  "Good {part}{nameSuffix}.",
  "Nice to see you{nameSuffix}.",
  "Ready when you are{nameSuffix}.",
  "I'm here{nameSuffix}.",
  "Vibyra is ready{nameSuffix}.",
  "Back in Vibyra{nameSuffix}.",
  "Workspace ready{nameSuffix}.",
  "All set{nameSuffix}.",
  "Welcome{nameSuffix}.",
  "Chat is ready{nameSuffix}."
];

const notes = [
  "Ready to help.",
  "Send a task.",
  "Start anywhere.",
  "Pick a project.",
  "Tell me what you need.",
  "Drop in an idea.",
  "Let's begin.",
  "Your chat is open.",
  "Share the next step.",
  "I'm ready.",
  "Bring the context.",
  "Start fresh.",
  "Ask anything.",
  "Message to begin."
];

let opens = 0;

export function chatEmptyTitle(name: string) {
  opens += 1;
  const titles = greetings.flatMap((greeting) => notes.map((note) => `${greeting} ${note}`));
  const day = new Date().toISOString().slice(0, 10);
  const daySeed = Array.from(day).reduce((total, char) => total + char.charCodeAt(0), 0);
  const title = titles[(daySeed + opens * 37) % titles.length] ?? "How can I help today?";
  return title
    .replaceAll("{nameSuffix}", firstName(name) ? `, ${firstName(name)}` : "")
    .replaceAll("{part}", dayPart());
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || "";
}

function dayPart() {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}
