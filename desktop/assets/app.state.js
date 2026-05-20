const emptyState = { machineName: "Vibyra Desktop", pairCode: "------", pairedDevice: null, pendingPair: null, latestPreview: null, events: [], projects: [], connectionUrls: [] };
const pages = [
  { key: "chat", label: "Chat", icon: "chat" },
  { key: "terminals", label: "Terminals", icon: "terminal" },
  { key: "projects", label: "Projects", icon: "folder" },
  { key: "dashboard", label: "Builds", icon: "pulse" },
  { key: "profile", label: "Profile", icon: "user", hidden: true }
];
const suggestions = [
  { title: "Fix a bug", description: "Find and resolve issues", icon: "tool", prompt: "Find and fix the main bug in this project." },
  { title: "Explain code", description: "Understand the project", icon: "document", prompt: "Explain the structure of this project and the key files I should know about." },
  { title: "Refactor code", description: "Improve code quality", icon: "code", prompt: "Refactor this project and improve the code quality." },
  { title: "Write tests", description: "Add coverage", icon: "play", prompt: "Find the most useful tests to add for this project." }
];
const projectFilterModes = ["All", "Desktop", "Phone"];
const chatModelGroups = [
  { title: "", options: [{ key: "auto", label: "Auto", provider: "auto" }] },
  { title: "Claude Models", options: [{ badge: "New", key: "claude-opus-4", label: "Claude Opus 4", provider: "claude" }, { key: "claude-sonnet-4", label: "Claude Sonnet 4", provider: "claude" }, { key: "claude-3-5-haiku", label: "Claude Haiku 3.5", provider: "claude" }] },
  { title: "OpenAI models", options: [{ badge: "New", key: "gpt-5.5", label: "GPT-5.5", provider: "openai" }, { key: "gpt-5.4", label: "GPT-5.4", provider: "openai" }, { key: "gpt-5.4-mini", label: "GPT-5.4 Mini", provider: "openai" }, { key: "gpt-5-codex", label: "GPT-5 Codex", provider: "openai" }] },
  { title: "Gemini Models", options: [{ badge: "New", key: "gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "gemini" }, { key: "gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "gemini" }, { key: "gemini-2.0-flash", label: "Gemini 2.0 Flash", provider: "gemini" }] }
];
const chatModels = chatModelGroups.flatMap((group) => group.options);
const chatEfforts = [{ value: "low", label: "Low", short: "Low", hint: "Fast" }, { value: "medium", label: "Medium", short: "Med", hint: "Balanced" }, { value: "high", label: "High", short: "High", hint: "Deeper" }, { value: "xhigh", label: "Extra high", short: "X-Hi", hint: "Maximum" }];
const planTiers = [
  { key: "free", name: "Free", price: "£0", monthlyCredits: 50, annualCredits: 50, dailyCap: 5, agents: 0, projects: 1, modelAccess: "Budget models", perks: ["Budget AI models", "1 active project", "Community access"] },
  { key: "starter", name: "Starter", price: "£19/mo", annualPrice: "£190/yr", monthlyCredits: 500, annualCredits: 550, dailyCap: 100, agents: 1, projects: 1, modelAccess: "All models", perks: ["500 monthly credits", "All AI models", "1 active project, 1 agent"] },
  { key: "builder", name: "Builder", price: "£49/mo", annualPrice: "£490/yr", monthlyCredits: 1800, annualCredits: 1980, dailyCap: 360, agents: 2, projects: 3, modelAccess: "All models", badge: "Popular", perks: ["1,800 monthly credits", "All premium models", "3 projects, 2 agents"] },
  { key: "pro", name: "Pro", price: "£99/mo", annualPrice: "£990/yr", monthlyCredits: 4500, annualCredits: 4950, dailyCap: 900, agents: 4, projects: 10, modelAccess: "All models", perks: ["4,500 monthly credits", "Priority routing", "10 projects, 4 agents"] }
];
const modelTiers = { auto: "budget", "gpt-5.5": "premium", "gpt-5.4": "balanced", "gpt-5.4-mini": "budget", "gpt-5.4-nano": "budget", "gpt-5-codex": "premium", "claude-opus-4": "premium", "claude-sonnet-4": "balanced", "claude-3-5-haiku": "budget", "gemini-2.5-pro": "premium", "gemini-2.5-flash": "budget", "gemini-2.0-flash": "budget" };
const planAllowedTiers = { free: ["free", "budget"], starter: ["free", "budget", "balanced", "premium"], builder: ["free", "budget", "balanced", "premium"], pro: ["free", "budget", "balanced", "premium"] };
const chatAttachmentPrimaryActions = [
  { kind: "files", icon: "paperclip", label: "Files", hint: "Attach local files" },
  { kind: "folder", icon: "folder", label: "Folder", hint: "Attach folder names" }
];
const chatAttachmentTools = [];
const chatSlashCommands = [
  { id: "open", slash: "/open", icon: "folder", label: "Open folder", description: "Choose desktop project context" },
  { id: "new", slash: "/new", icon: "edit", label: "New chat", description: "Start fresh" },
  { id: "clear", slash: "/clear", icon: "trash", label: "Clear chat", description: "Remove messages" },
  { id: "help", slash: "/help", icon: "help", label: "Help", description: "List commands" }
];
const chatSkills = [
  { id: "plan", slash: "/plan", icon: "calendar", label: "Plan", description: "Make an implementation plan", mode: "chat", promptPrefix: "Make a concise implementation plan for this request. Do not edit files or apply changes yet. Explain the key steps, risks, and verification path." },
  { id: "debug", slash: "/debug", icon: "tool", label: "Debug", description: "Find the root cause", mode: "chat" },
  { id: "review", slash: "/review", icon: "search", label: "Review", description: "Review code for risks", mode: "chat", promptPrefix: "Review this code/change set. Prioritize bugs, regressions, security or data-loss risks, and missing tests. Put findings first with concrete file references when possible." },
  { id: "explain", slash: "/explain", icon: "document", label: "Explain", description: "Explain code or project context", mode: "chat" },
  { id: "fix", slash: "/fix", icon: "bolt", label: "Fix", description: "Apply a targeted fix", mode: "chat" },
  { id: "refactor", slash: "/refactor", icon: "code", label: "Refactor", description: "Clean up readability", mode: "chat" }
];
window.vibyraDesktopChatConfig = { chatModelGroups, chatModels, chatEfforts, chatSkills };
const storedPage = localStorage.getItem("vibyra.desktop.page");
const desktopChatsKey = "vibyra.desktop.recentChats";
const activeChatKey = "vibyra.desktop.activeChat";
const railCollapsedKey = "vibyra.desktop.railCollapsed";
let currentState = emptyState;
let activePage = pages.some((page) => page.key === storedPage) ? storedPage : "dashboard";
let projectQuery = "";
let projectFilter = "All";
let posting = false;
let recentChats = loadDesktopChats();
let activeChatId = localStorage.getItem(activeChatKey) || "";
let chatMessages = activeChatId ? messagesForChat(activeChatId) : [];
let chatAttachments = [];
let chatDraft = localStorage.getItem("vibyra.desktop.chatDraft") || "";
let chatSending = false;
let chatNotice = null;
let activeChatTool = "";
let activeChatSkill = "";
let selectedChatModel = chatModels.some((model) => model.key === localStorage.getItem("vibyra.desktop.chatModel")) ? localStorage.getItem("vibyra.desktop.chatModel") : "auto";
let reasoningEffort = chatEfforts.some((effort) => effort.value === localStorage.getItem("vibyra.desktop.reasoningEffort")) ? localStorage.getItem("vibyra.desktop.reasoningEffort") : "medium";
let railCollapsed = localStorage.getItem(railCollapsedKey) === "true";
let openChatMenu = "";
let modelMenuGroup = "";
let topbarChatMenuOpen = false;
let topbarAccountMenuOpen = false;
let selectedProjectId = localStorage.getItem("vibyra.desktop.project") || "";
let openedPairRequestId = "";
let tokenModalView = "profile";
