export const encode = (value) => JSON.stringify(value, null, 2);
export function validateConfig(text) {
    let value;
    try { value = JSON.parse(text); } catch { return "Enter valid JSON before saving."; }
    if (!value || typeof value !== "object") return "The app needs a configuration object.";
    if (typeof value.title !== "string" || !value.title.trim() || value.title.length > 80) return "Title must be 1–80 characters.";
    if (!["light", "dark"].includes(value.theme)) return 'Theme must be "light" or "dark".';
    if (typeof value.summary !== "boolean") return "Summary must be true or false.";
    if (!Array.isArray(value.habits) || value.habits.length < 1 || value.habits.length > 12) return "Add between 1 and 12 habits.";
    if (value.habits.some((habit) => !habit || typeof habit.name !== "string" || !habit.name.trim() || habit.name.length > 60 || typeof habit.done !== "boolean")) return "Each habit needs a name (1–60 characters) and a true/false done value.";
    return null;
}
export function createProject(id, name) {
    const files = {
        "app.json": encode({ title: "Small steps. Good things.", theme: "light", summary: false,
            habits: [{ name: "A little movement", done: true }, { name: "Stay hydrated", done: false }] }),
        "README.md": `# ${name}\n\nA little better, every day.\n\nA sample habit tracker. Edit app.json to change the live preview.`,
    };
    return { id, name, files, baseline: { ...files }, provider: "claude", notes: "Keep the design calm. Make small, thoughtful changes.",
        messages: [{ role: "agent", text: "Welcome to your sample workspace. Try a prompt below, then explore the preview and changes." }], logs: ["Sample terminal ready. Type help to see the available commands."], commits: 0 };
}
export const initialProjects = () => [createProject("orbit", "Orbit"), createProject("weekend", "Weekend project")];
export function projectReducer(projects, action) {
    if (action.type === "reset") return initialProjects();
    if (action.type === "create") return [...projects, createProject(action.id, action.name)];
    return projects.map((project) => {
        if (project.id !== action.id) return project;
        if (action.type === "patch") return { ...project, ...action.patch };
        if (action.type === "file") return { ...project, files: { ...project.files, [action.name]: action.value }, drafts: { ...project.drafts, [action.name]: undefined } };
        if (action.type === "message") return { ...project, messages: [...project.messages.slice(-39), action.message] };
        if (action.type === "log") return { ...project, logs: [...project.logs.slice(-79), action.text] };
        if (action.type === "keep") return { ...project, baseline: { ...project.files }, commits: project.commits + 1 };
        if (action.type === "discard") return { ...project, files: { ...project.baseline }, drafts: {} };
        return project;
    });
}
export function makeChange(project, prompt) {
    const config = JSON.parse(project.files["app.json"]);
    const lower = prompt.toLowerCase();
    if (/\b(dark|light)\b/.test(lower)) {
        config.theme = /\bdark\b/.test(lower) ? "dark" : "light";
    } else if (/summary|progress/.test(lower)) {
        config.summary = !/remove|hide/.test(lower);
    } else if (/rename|title/.test(lower)) {
        const title = prompt.match(/["“]([^"”]+)["”]/)?.[1];
        if (!title || title.length > 80) return { text: 'Try: Rename the title to "Make time for you" (up to 80 characters).' };
        config.title = title;
    } else if (/add|reading|meditat/.test(lower)) {
        if (config.habits.length >= 12) return { text: "This sample supports up to 12 habits. Edit or remove one in app.json first." };
        const name = prompt.match(/["“]([^"”]+)["”]/)?.[1] || (/meditat/.test(lower) ? "A moment of calm" : /read/.test(lower) ? "Read a few pages" : null);
        if (!name || name.length > 60) return { text: 'Try: Add a habit called "Go for a walk" (up to 60 characters).' };
        if (config.habits.some((habit) => habit.name.toLowerCase() === name.toLowerCase())) return { text: "That habit is already in the preview. Try a different name." };
        config.habits.push({ name, done: false });
    } else {
        return { text: 'This demo understands theme changes, a weekly summary, adding a named habit, and renaming the title. Try a suggested prompt. For open-ended AI work, use the desktop app.' };
    }
    const value = encode(config);
    return value === project.files["app.json"] ? { text: "That change is already in place. Open the preview to try it." }
        : { value, text: "Updated app.json in your sample workspace. Try the preview, then review and keep or discard the change." };
}
export function checkProject(project) {
    const config = JSON.parse(project.files["app.json"]);
    const results = [
        ["App configuration is valid", !validateConfig(project.files["app.json"])],
        ["Habit names are unique", new Set(config.habits.map((habit) => habit.name.trim().toLowerCase())).size === config.habits.length],
        ["Project readme has content", project.files["README.md"].trim().length > 0],
    ];
    return results.map(([label, pass]) => `${pass ? "PASS" : "FAIL"}  ${label}`).join("\n");
}
