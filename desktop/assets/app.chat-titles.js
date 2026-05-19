(() => {
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
    "Desktop ready{nameSuffix}.",
    "Chat is ready{nameSuffix}.",
    "Vibyra is here{nameSuffix}."
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
  const titles = greetings.flatMap((greeting) => notes.map((note) => `${greeting} ${note}`));
  const key = "vibyra.desktop.chatTitleRotation";
  const day = new Date().toISOString().slice(0, 10);
  const daySeed = Array.from(day).reduce((total, char) => total + char.charCodeAt(0), 0);
  let opens = 0;

  try {
    const state = JSON.parse(localStorage.getItem(key) || "null");
    opens = state?.day === day ? Number(state.opens || 0) + 1 : 1;
    localStorage.setItem(key, JSON.stringify({ day, opens }));
  } catch {
    opens = 1;
  }

  const index = (daySeed + opens * 37) % titles.length;
  const name = firstName();
  const part = dayPart();
  window.vibyraChatTitleCount = titles.length;
  window.vibyraChatEmptyTitle = () => personalize(titles[index] || "How can I help today?");

  function personalize(title) {
    return title
      .replaceAll("{nameSuffix}", name ? `, ${name}` : "")
      .replaceAll("{part}", part);
  }

  function firstName() {
    try {
      const session = JSON.parse(localStorage.getItem("vibyra.desktop.auth") || "null");
      return String(session?.user?.name || "").trim().split(/\s+/)[0] || "";
    } catch {
      return "";
    }
  }

  function dayPart() {
    const hour = new Date().getHours();
    if (hour < 12) return "morning";
    if (hour < 17) return "afternoon";
    return "evening";
  }
})();
