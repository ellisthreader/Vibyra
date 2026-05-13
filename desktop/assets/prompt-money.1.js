const STORAGE_KEY = "codex-prompt-money-tracker";
const state = loadState();

const promptInput = document.getElementById("promptInput");
const estimateDisplay = document.getElementById("estimateDisplay");
const totalDisplay = document.getElementById("totalDisplay");
const countDisplay = document.getElementById("countDisplay");
const longestDisplay = document.getElementById("longestDisplay");
const lastDisplay = document.getElementById("lastDisplay");
const averageDisplay = document.getElementById("averageDisplay");
const historyList = document.getElementById("historyList");
const emptyState = document.getElementById("emptyState");
const lengthDisplay = document.getElementById("lengthDisplay");

document.getElementById("addPromptButton").addEventListener("click", addPrompt);
document.getElementById("clearInputButton").addEventListener("click", () => {
  promptInput.value = "";
  renderEstimate();
});
document.getElementById("resetAllButton").addEventListener("click", resetAll);
promptInput.addEventListener("input", renderEstimate);

renderEstimate();
render();

function addPrompt() {
  const text = promptInput.value.trim();
  if (!text) return;

  const amount = calculatePromptMoney(text.length);
  state.total = roundMoney(state.total + amount);
  state.count += 1;
  state.lastEarned = amount;
  state.longest = Math.max(state.longest, text.length);
  state.history.unshift({
    id: Date.now(),
    length: text.length,
    amount,
    preview: text.slice(0, 84),
    createdAt: new Date().toLocaleString()
  });
  state.history = state.history.slice(0, 8);

  saveState();
  promptInput.value = "";
  renderEstimate();
  render();
}

function resetAll() {
  state.total = 0;
  state.count = 0;
  state.lastEarned = 0;
  state.longest = 0;
  state.history = [];
  saveState();
  render();
  renderEstimate();
}

function renderEstimate() {
  const length = promptInput.value.trim().length;
  estimateDisplay.textContent = formatMoney(calculatePromptMoney(length));
  lengthDisplay.textContent = `${length} character${length === 1 ? "" : "s"}`;
}

function render() {
  totalDisplay.textContent = formatMoney(state.total);
  countDisplay.textContent = String(state.count);
  longestDisplay.textContent = String(state.longest);
  lastDisplay.textContent = formatMoney(state.lastEarned);
  averageDisplay.textContent = formatMoney(state.count ? state.total / state.count : 0);

  historyList.innerHTML = "";
  emptyState.hidden = state.history.length > 0;

  state.history.forEach((entry) => {
    const item = document.createElement("div");
    item.className = "history-item";
    item.innerHTML = `
      <div class="history-top">
        <strong>${escapeHtml(entry.preview || "Prompt")}</strong>
        <span class="history-money">${formatMoney(entry.amount)}</span>
      </div>
      <div class="history-meta">${entry.length} chars · ${escapeHtml(entry.createdAt)}</div>
    `;
    historyList.appendChild(item);
  });
}

function calculatePromptMoney(length) {
  if (length <= 80) return 0.1;
  if (length <= 220) {
    const ratio = (length - 81) / 139;
    return roundMoney(0.5 + Math.max(0, ratio) * 0.5);
  }

  const ratio = Math.min(1, (length - 221) / 479);
  return roundMoney(1 + Math.max(0, ratio));
}

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function formatMoney(value) {
  return `£${roundMoney(value).toFixed(2)}`;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return baseState();
    return { ...baseState(), ...JSON.parse(raw) };
  } catch {
    return baseState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function baseState() {
  return {
    total: 0,
    count: 0,
    lastEarned: 0,
    longest: 0,
    history: []
  };
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
