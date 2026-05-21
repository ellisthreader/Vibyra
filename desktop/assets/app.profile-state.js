let profileFocus = "";
const profileSectionKey = "vibyra.desktop.profileSection";
const profilePrefsKey = "vibyra.desktop.profilePreferences";
let profileActiveSection = localStorage.getItem(profileSectionKey) || "general";
let profileReferral = null;
let profileReferralLoading = false;
let profileReferralError = "";
let profileCopiedCode = false;
let profileFormMessage = "";
let profileFormBusy = false;
let profileDeleteBusy = false;
let profileDeleteMessage = "";
let profileDeleteOpen = false;
let profileSessions = [];
let profileSessionsError = "";
let profileSessionsLoaded = false;
let profileSessionsLoading = false;
let profileSessionBusyId = "";
let profileSessionMenuId = "";
let profileLogoutAllBusy = false;

const desktopPreferenceDefaults = {
  appearance: "auto",
  callName: "",
  chatFont: "vibyra-sans",
  customInstructions: "",
  language: "English",
  notifications: {
    buildUpdates: true,
    chatReplies: true,
    codeNotifications: true,
    dispatchMessages: false,
    emailUpdates: false,
    permissionRequests: true,
    productUpdates: false,
    responseCompletions: true
  },
  improveVibyra: false,
  desktopLock: false,
  workOther: "",
  workType: "other"
};
const profileLanguages = ["English", "Espanol", "Francais", "Deutsch", "Japanese", "Chinese", "Portuguese"];
const profileAppearanceOptions = [
  { key: "auto", title: "Auto", detail: "Match this computer when supported", icon: "contrast" },
  { key: "dark", title: "Dark", detail: "Vibyra signature desktop look", icon: "moon" },
  { key: "light", title: "Light", detail: "Saved for compatible desktop themes", icon: "sun" }
];
const profileWorkOptions = [
  { key: "software", label: "Software and product" },
  { key: "design", label: "Design and creative" },
  { key: "founder", label: "Founder or operator" },
  { key: "student", label: "Student or researcher" },
  { key: "other", label: "Other" }
];
const profileChatFontOptions = [
  { key: "vibyra-sans", label: "Vibyra Sans" },
  { key: "vibyra-serif", label: "Vibyra Serif" },
  { key: "system", label: "System" },
  { key: "mono", label: "Mono" }
];
const profileFaqs = [
  { q: "What are credits?", a: "Credits cover AI usage across desktop chats, builds, and connected Vibyra workflows." },
  { q: "How do I connect another device?", a: "Use Devices to show the pairing code, then approve only devices you recognize." },
  { q: "Where are my projects stored?", a: "Project metadata is shown in Vibyra; source files stay in the local folders you choose." },
  { q: "Can I change my plan?", a: "Use Billing to open checkout or the billing portal for your current membership." }
];

function setProfileFocus(focus) {
  profileFocus = focus || "";
  if (profileFocus === "preferences") profileActiveSection = "preferences";
}

function profileSections() {
  return [
    { key: "general", icon: "user", label: "General" },
    { key: "account", icon: "card", label: "Account" },
    { key: "billing", icon: "bolt", label: "Billing" },
    { key: "usage", icon: "pulse", label: "Usage" },
    { key: "devices", icon: "desktop", label: "Devices" },
    { key: "privacy", icon: "lock", label: "Privacy" },
    { key: "preferences", icon: "palette", label: "Preferences" },
    { key: "support", icon: "help", label: "Support" }
  ];
}

function desktopPreferences() {
  try {
    const parsed = JSON.parse(localStorage.getItem(profilePrefsKey) || "{}");
    return { ...desktopPreferenceDefaults, ...parsed, notifications: { ...desktopPreferenceDefaults.notifications, ...(parsed.notifications || {}) } };
  } catch {
    return { ...desktopPreferenceDefaults, notifications: { ...desktopPreferenceDefaults.notifications } };
  }
}

function saveDesktopPreferences(next) {
  localStorage.setItem(profilePrefsKey, JSON.stringify(next));
  applyDesktopPreferences(next);
}

function applyDesktopPreferences(next = desktopPreferences()) {
  if (!document.body) return;
  document.body.dataset.desktopTheme = next.appearance || "auto";
  document.body.dataset.chatFont = next.chatFont || "vibyra-sans";
}

function desktopProfileContext() {
  const prefs = desktopPreferences();
  const work = prefs.workType === "other" && prefs.workOther ? prefs.workOther : profileWorkOptions.find((item) => item.key === prefs.workType)?.label || "";
  return {
    callName: String(prefs.callName || "").trim(),
    customInstructions: String(prefs.customInstructions || "").trim(),
    work
  };
}

function profileAccountMeta() {
  const account = currentAccount();
  const user = typeof desktopAuthUser === "function" ? desktopAuthUser() : null;
  const tier = currentPlanTier();
  const cycle = account.planBillingCycle === "annual" ? "annual" : "monthly";
  const allowance = Number(account.monthlyCredits || (cycle === "annual" ? tier.annualCredits : tier.monthlyCredits));
  const used = Number(account.creditsUsed ?? 0);
  const pct = allowance > 0 ? Math.min(100, Math.max(0, Math.round((used / allowance) * 100))) : 0;
  return {
    account,
    avatarSrc: accountImageUrl(user, account),
    allowance,
    burstCap: Number(account.burstCreditsCap || 0),
    burstUsed: Number(account.burstCreditsUsed || 0),
    cycle,
    email: account.email || "",
    name: account.name || "Desktop account",
    pct,
    planLabel: `${tier.name}${cycle === "annual" && tier.key !== "free" ? " annual" : ""}`,
    tier,
    used,
    weeklyCap: Number(account.weeklyCreditsCap || 0),
    weeklyUsed: Number(account.weeklyCreditsUsed || 0)
  };
}

function profileAvatar(meta, size = "large") {
  const cls = size === "small" ? "profile-nav-avatar" : "profile-detail-avatar";
  return meta.avatarSrc
    ? `<img class="${cls}" src="${escapeAttribute(meta.avatarSrc)}" alt="" />`
    : `<span class="${cls} ${cls}--initials" aria-hidden="true">${escapeHtml(accountInitials(meta.name))}</span>`;
}

if (document.body) {
  applyDesktopPreferences();
} else {
  document.addEventListener("DOMContentLoaded", () => applyDesktopPreferences(), { once: true });
}
