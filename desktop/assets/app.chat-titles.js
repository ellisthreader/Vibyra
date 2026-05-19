(() => {
  const starts = [
    "How can I help",
    "What should we build",
    "What are we making",
    "What can we improve",
    "What should we fix",
    "What needs attention",
    "Where should we start",
    "What are we exploring",
    "What should we design",
    "What should we clean up",
    "What should we rethink",
    "What should we test",
    "What should we polish",
    "What are we planning",
    "What should we review",
    "What idea are we shaping"
  ];
	  const endings = [
	    "today?",
	    "this {part}?",
	    "right now?",
	    "next?",
	    "together?",
    "in this project?",
    "for your app?",
    "before we continue?",
	    "while we are here?",
	    "for this {part}?",
	    "to get moving?",
	    "to make this better?",
	    "for the next update?"
  ];
  const greetings = [
    "Hello {name}, what should we build?",
    "Hi {name}, how can I help today?",
    "Ready when you are, {name}.",
    "Good {part}, {name}. What is next?",
    "Let's build something useful, {name}.",
    "What are we improving today, {name}?",
    "What needs a hand, {name}?",
    "Where should we begin, {name}?",
    "What are we making better, {name}?",
    "What should we work on, {name}?"
  ];
  const titles = starts.flatMap((start) => endings.map((ending) => `${start} ${ending}`)).concat(greetings);
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
    if (!name && title.includes("{name}")) return "How can I help today?";
    return title.replaceAll("{name}", name).replaceAll("{part}", part);
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
