const authKey = "vibyra.desktop.auth";
const installKey = "vibyra.desktop.install";
let authMode = "signup";
const authNodes = {
  email: document.getElementById("desktop-auth-email"),
  error: document.getElementById("desktop-auth-error"),
  form: document.getElementById("desktop-email-auth"),
  name: document.getElementById("desktop-auth-name"),
  password: document.getElementById("desktop-auth-password"),
  showEmail: document.getElementById("show-email-auth"),
  submit: document.getElementById("desktop-auth-submit")
};

initDesktopAuth();

function initDesktopAuth() {
  const session = desktopAuthSession();
  if (session?.token && session.user) {
    localStorage.setItem("vibyra.desktop.page", "dashboard");
    if (typeof activePage !== "undefined") activePage = "dashboard";
    document.body.classList.add("desktop-authenticated");
    syncDesktopSession(session.token).catch((error) => {
      showAuthError(error instanceof Error ? error.message : "Desktop could not verify this Vibyra account session.");
    });
  }
  bindDesktopAuth();
  setAuthMode(authMode);
}

function bindDesktopAuth() {
  authNodes.showEmail?.addEventListener("click", () => {
    authNodes.form.classList.toggle("open");
    document.getElementById("desktop-auth")?.classList.toggle("email-open", authNodes.form.classList.contains("open"));
    authNodes.showEmail.querySelector("strong").textContent = authNodes.form.classList.contains("open")
      ? "Hide email form"
      : "Continue with email";
    clearAuthError();
  });
  document.querySelectorAll("[data-auth-social]").forEach((button) => {
    button.addEventListener("click", () => {
      showAuthError("Use email on desktop so Vibyra can match this computer to the same signed-in phone account.");
    });
  });
  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.addEventListener("click", () => setAuthMode(button.dataset.authMode));
  });
  document.querySelectorAll("[data-auth-link]").forEach((button) => {
    button.addEventListener("click", () => {
      const path = button.dataset.authLink === "terms" ? "/terms" : "/privacy";
      window.open(`https://vibyra.app${path}`, "_blank", "noopener");
    });
  });
  [authNodes.email, authNodes.name, authNodes.password].forEach((input) => input?.addEventListener("input", validateAuthForm));
  authNodes.form?.addEventListener("submit", submitDesktopEmailAuth);
  document.addEventListener("click", (event) => {
    const logout = event.target.closest?.('[data-setting="Log out"]');
    if (logout) {
      event.preventDefault();
      desktopSignOut();
    }
  }, true);
}

function setAuthMode(mode) {
  authMode = mode === "login" ? "login" : "signup";
  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.authMode === authMode);
  });
  authNodes.name.style.display = authMode === "signup" ? "" : "none";
  authNodes.password.autocomplete = authMode === "login" ? "current-password" : "new-password";
  authNodes.submit.textContent = authMode === "signup" ? "Create account" : "Log in";
  clearAuthError();
  validateAuthForm();
}

async function submitDesktopEmailAuth(event) {
  event.preventDefault();
  const email = authNodes.email.value.trim();
  const password = authNodes.password.value;
  const name = authNodes.name.value.trim();
  if (email.length <= 3 || !email.includes("@")) {
    showAuthError("Enter a valid email address.");
    return;
  }
  if (password.length < 6) {
    showAuthError("Password must be at least 6 characters.");
    return;
  }
  if (authMode === "signup" && !name) {
    showAuthError("Enter your name to create an account.");
    return;
  }
  authNodes.submit.disabled = true;
  authNodes.submit.textContent = authMode === "signup" ? "Creating..." : "Logging in...";
  try {
    const result = await requestAppAuth(authMode === "signup" ? "/api/auth/signup" : "/api/auth/login", {
      email,
      installId: desktopInstallId(),
      ...(authMode === "signup" ? { name } : {}),
      password
    });
    await completeDesktopAuth(result.token, result.user);
  } catch (error) {
    showAuthError(error instanceof Error ? error.message : "Could not sign in to Vibyra.");
  } finally {
    validateAuthForm();
    authNodes.submit.textContent = authMode === "signup" ? "Create account" : "Log in";
  }
}

async function completeDesktopAuth(token, user) {
  if (!token || !user?.id) throw new Error("Vibyra did not return a valid account session.");
  const syncedUser = await syncDesktopSession(token);
  localStorage.setItem("vibyra.desktop.page", "dashboard");
  storeDesktopAuthSession(token, syncedUser || user);
  if (typeof activePage !== "undefined") activePage = "dashboard";
  document.body.classList.add("desktop-authenticated");
  clearAuthError();
  if (typeof render === "function") render();
}

function desktopAuthUser() {
  return desktopAuthSession()?.user || null;
}

function desktopAuthSession() {
  try {
    return JSON.parse(localStorage.getItem(authKey) || "null");
  } catch {
    return null;
  }
}

function storeDesktopAuthSession(token, user) {
  if (!token || !user?.id) return;
  const session = desktopAuthSession() || {};
  localStorage.setItem(authKey, JSON.stringify({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      plan: user.plan || "free",
      planBillingCycle: user.planBillingCycle || "monthly",
      planRenewsAt: user.planRenewsAt || null,
      creditsBalance: Number(user.creditsBalance) || 0,
      creditsUsed: Number(user.creditsUsed) || 0,
      monthlyCredits: Number(user.monthlyCredits) || 0,
      dailyCreditsUsed: Number(user.dailyCreditsUsed) || 0,
      dailyCreditsCap: Number(user.dailyCreditsCap) || 0,
      weeklyCreditsUsed: Number(user.weeklyCreditsUsed) || 0,
      weeklyCreditsCap: Number(user.weeklyCreditsCap) || 0,
      allowedModelTiers: Array.isArray(user.allowedModelTiers) ? user.allowedModelTiers : undefined,
      level: user.level || user.levelProgress || null,
      profileImageUri: user.profileImageUri || user.profileImageUrl || user.avatarUrl || user.avatar || ""
    },
    signedInAt: session.signedInAt || new Date().toISOString()
  }));
}

async function refreshDesktopAccountSession() {
  const token = desktopAuthSession()?.token;
  return token ? syncDesktopSession(token) : null;
}

async function startDesktopBillingCheckout(plan, cycle = "monthly") {
  const planKey = String(plan || "starter").toLowerCase();
  if (!["starter", "builder", "pro"].includes(planKey)) return;
  await requestDesktopBilling("/api/billing/checkout", { kind: "subscription", plan: planKey, cycle });
}

async function openDesktopBillingPortal() {
  await requestDesktopBilling("/api/billing/portal", {});
}

async function requestDesktopBilling(endpoint, payload) {
  const token = desktopAuthSession()?.token;
  if (!token) {
    showAuthError("Log in again to manage membership.");
    return;
  }
  try {
    const response = await fetch(`${appApiBaseUrl()}${endpoint}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.ok === false || !result?.url) {
      throw new Error(result?.error || result?.message || "Could not open billing.");
    }
    window.open(result.url, "_blank", "noopener");
  } catch (error) {
    showAuthError(error instanceof Error ? error.message : "Could not open billing.");
  }
}

function desktopSignOut() {
  fetch("/desktop/session/clear", { method: "POST" }).catch(() => {});
  localStorage.removeItem(authKey);
  document.body.classList.remove("desktop-authenticated");
  document.getElementById("token-modal")?.classList.remove("open");
  authNodes.form?.classList.remove("open");
  document.getElementById("desktop-auth")?.classList.remove("email-open");
  if (authNodes.password) authNodes.password.value = "";
  authNodes.showEmail.querySelector("strong").textContent = "Continue with email";
  setAuthMode("signup");
}

function validateAuthForm() {
  const emailOk = authNodes.email.value.trim().length > 3;
  const passwordOk = authNodes.password.value.length >= 6;
  const nameOk = authMode === "login" || authNodes.name.value.trim().length > 0;
  authNodes.submit.disabled = !(emailOk && passwordOk && nameOk);
}

async function requestAppAuth(endpoint, payload) {
  const response = await fetch(`${appApiBaseUrl()}${endpoint}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || result.message || "Could not sign in to Vibyra.");
  return result;
}

async function syncDesktopSession(token) {
  const response = await fetch("/desktop/session", {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`
    }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    localStorage.removeItem(authKey);
    document.body.classList.remove("desktop-authenticated");
    throw new Error(result.error || "Desktop could not verify this Vibyra account session.");
  }
  if (result?.user) {
    storeDesktopAuthSession(token, result.user);
    if (typeof currentState !== "undefined") {
      currentState = { ...currentState, desktopAccount: result.user };
    }
  }
  return result?.user || null;
}

function appApiBaseUrl() {
  const configured = window.VIBYRA_API_URL || localStorage.getItem("vibyra.api.url");
  if (configured) return String(configured).replace(/\/+$/, "");
  return `${window.location.protocol}//${window.location.hostname || "127.0.0.1"}:8000`;
}

function desktopInstallId() {
  let id = localStorage.getItem(installKey);
  if (!id) {
    id = `desktop-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(installKey, id);
  }
  return id;
}

function showAuthError(message) {
  authNodes.error.textContent = message;
  authNodes.error.classList.add("visible");
}

function clearAuthError() {
  authNodes.error.textContent = "";
  authNodes.error.classList.remove("visible");
}
