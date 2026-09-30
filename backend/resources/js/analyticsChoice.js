import "../css/analytics-choice.css";
import { initWebsiteTracking, setWebsiteTrackingChoice, trackCurrentPage } from "./websiteTracking.js";

let current = { choice: "unknown", can_link: false };

function token() {
  return document.querySelector('meta[name="csrf-token"]')?.content ?? "";
}

async function update(choice) {
  const response = await fetch("/web-api/analytics/consent", { method: "PUT", credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-CSRF-TOKEN": token(), Accept: "application/json" },
    body: JSON.stringify({ choice, policy_version: 1 }) });
  if (!response.ok) throw new Error("Your choice could not be saved. Please try again.");
  return response.json();
}

function openChoice() {
  if (document.querySelector(".analytics-choice")) return;
  const opener = document.activeElement;
  const panel = document.createElement("section");
  panel.className = "analytics-choice";
  panel.tabIndex = -1;
  panel.setAttribute("aria-label", "Website analytics choice");
  panel.innerHTML = `<p class="analytics-choice__eyebrow">YOUR CHOICE</p>
    <h2>Help us improve Vibyra?</h2>
    <p>With your permission, we count visits, named links and downloads, and time spent on pages. We do not record prompts, typing, or page contents. <a href="/legal/privacy">Privacy details</a></p>
    <label class="analytics-choice__linked"><input type="checkbox" ${current.choice === "linked" ? "checked" : ""} ${current.can_link ? "" : "disabled"} />
      <span>Connect my usage to my Vibyra account <small>${current.can_link ? "Optional. Helps us understand use across visits." : "Sign in to enable this option."}</small></span></label>
    <p class="analytics-choice__error" role="alert" hidden></p>
    <div class="analytics-choice__actions">
      <button type="button" data-choice="declined">Decline</button>
      <button type="button" data-choice="aggregate">Allow analytics</button>
    </div>`;
  panel.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-choice]");
    if (!button) return;
    const wasAllowed = ["aggregate", "linked"].includes(current.choice);
    const choice = button.dataset.choice === "declined" ? "declined"
      : panel.querySelector("input[type=checkbox]").checked ? "linked" : "aggregate";
    panel.querySelectorAll("button").forEach((item) => { item.disabled = true; });
    try {
      current = await update(choice);
      setWebsiteTrackingChoice(current.choice);
      panel.remove();
      if (!wasAllowed && choice !== "declined") trackCurrentPage();
      if (opener instanceof HTMLElement && opener !== document.body) opener.focus();
      if (new URLSearchParams(location.search).get("analytics") === "choices") history.replaceState(null, "", location.pathname);
    } catch (error) {
      const message = panel.querySelector(".analytics-choice__error");
      message.textContent = error.message;
      message.hidden = false;
      panel.querySelectorAll("button").forEach((item) => { item.disabled = false; });
    }
  });
  document.body.append(panel);
  panel.focus();
}

export async function initAnalyticsChoice() {
  if (location.pathname === "/owner" || location.pathname === "/owner/login") return;
  initWebsiteTracking();
  document.addEventListener("click", (event) => {
    if (!event.target.closest("[data-analytics-choices]")) return;
    event.preventDefault();
    openChoice();
  });
  try {
    const response = await fetch("/web-api/analytics/consent", { credentials: "same-origin", headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Consent unavailable");
    current = await response.json();
    setWebsiteTrackingChoice(current.choice);
    if (current.choice === "unknown" || new URLSearchParams(location.search).get("analytics") === "choices") openChoice();
  } catch {
    setWebsiteTrackingChoice("unknown");
    openChoice();
  }
}
