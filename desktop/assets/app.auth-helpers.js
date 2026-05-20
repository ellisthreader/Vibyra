function desktopSignOut() {
  fetch("/desktop/session/clear", { method: "POST" }).catch(() => {});
  localStorage.removeItem(authKey);
  document.body.classList.remove("desktop-authenticated");
  if (typeof renderTopbar === "function") renderTopbar();
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
