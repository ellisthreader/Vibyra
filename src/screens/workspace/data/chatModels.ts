import { ChatModelOption } from "../types";

export const chatModelGroups: Array<{ title: string; options: ChatModelOption[] }> = [
  {
    title: "",
    options: [{ key: "auto", label: "Auto", provider: "auto" }]
  },
  {
    title: "Claude Models",
    options: [
      { badge: "New", key: "claude-opus-4", label: "Claude Opus 4", locked: true, provider: "claude" },
      { key: "claude-sonnet-4", label: "Claude Sonnet 4", locked: true, provider: "claude" },
      { key: "claude-3-5-haiku", label: "Claude Haiku 3.5", provider: "claude" }
    ]
  },
  {
    title: "OpenAI models",
    options: [
      { badge: "New", key: "gpt-5.5", label: "GPT-5.5", locked: true, provider: "openai", modelKey: "gpt-5.5" },
      { key: "gpt-5.4", label: "GPT-5.4", locked: true, provider: "openai", modelKey: "gpt-5.4" },
      { key: "gpt-5.4-mini", label: "GPT-5.4 Mini", provider: "openai", modelKey: "gpt-5.4-mini" },
      { key: "gpt-5-codex", label: "GPT-5 Codex", locked: true, provider: "openai", modelKey: "gpt-5-codex" }
    ]
  },
  {
    title: "Gemini Models",
    options: [
      { badge: "New", key: "gemini-2.5-pro", label: "Gemini 2.5 Pro", locked: true, provider: "gemini" },
      { key: "gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "gemini" },
      { key: "gemini-2.0-flash", label: "Gemini 2.0 Flash", provider: "gemini" }
    ]
  }
];

export const chatModelOptions = chatModelGroups.flatMap((group) => group.options);

export const providerLogoSources = {
  gemini: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/Google_Gemini_icon_2025.svg/250px-Google_Gemini_icon_2025.svg.png",
  openai: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/OpenAI_logo_2025_%28symbol%29.svg/250px-OpenAI_logo_2025_%28symbol%29.svg.png"
};
