import { openAiAccountCredential, openAiHeaders } from "./providerAccounts.mjs";

const OPENAI_API_URL = "https://api.openai.com/v1";

export async function sendOpenAiProviderChat(payload, fetchImpl = fetch) {
  const credential = openAiAccountCredential();
  if (!credential) throw httpError(401, "Connect an OpenAI account before using provider tokens.");

  const model = openAiModel(payload.model);
  const body = {
    model,
    input: promptInput(payload),
    ...(supportsReasoning(model) ? { reasoning: { effort: reasoningEffort(payload.reasoningEffort) } } : {})
  };

  const response = await fetchImpl(`${OPENAI_API_URL}/responses`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...openAiHeaders(credential)
    },
    body: JSON.stringify(body)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw httpError(response.status || 500, result?.error?.message || result?.message || "OpenAI could not complete this request.");
  return {
    ok: true,
    reply: responseText(result) || "OpenAI returned an empty response.",
    title: "",
    model,
    modelKey: payload.model || model,
    creditCost: null,
    creditsBalance: null,
    app: null,
    user: null,
    providerBilling: "openai"
  };
}

function promptInput(payload) {
  const history = Array.isArray(payload.history) ? payload.history : [];
  const rows = history
    .filter((item) => item && ["assistant", "user"].includes(item.role) && String(item.text || "").trim())
    .map((item) => `${item.role === "assistant" ? "Assistant" : "User"}: ${String(item.text).slice(0, 1200)}`);
  rows.push(`User: ${payload.prompt}`);
  return rows.join("\n\n");
}

function responseText(result) {
  if (typeof result?.output_text === "string") return result.output_text.trim();
  const chunks = [];
  for (const item of Array.isArray(result?.output) ? result.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (typeof content?.text === "string") chunks.push(content.text);
    }
  }
  return chunks.join("\n").trim();
}

function openAiModel(model) {
  const key = String(model || "").trim();
  if (!key || key === "auto") return "gpt-5.1";
  return key.toLowerCase().startsWith("openai/") ? key.slice(7) : key;
}

function supportsReasoning(model) {
  const key = String(model || "").toLowerCase();
  return key.startsWith("gpt-5") || /^o\d/.test(key);
}

function reasoningEffort(value) {
  const effort = String(value || "medium").toLowerCase();
  return effort === "xhigh" ? "high" : ["low", "medium", "high"].includes(effort) ? effort : "medium";
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
