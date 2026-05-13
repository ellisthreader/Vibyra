const authKey = "vibyra.desktop.auth";
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
  if (desktopAuthUser()) document.body.classList.add("desktop-authenticated");
  bindDesktopAuth();
  setAuthMode(authMode);
}

function bindDesktopAuth() {
  authNodes.showEmail?.addEventListener("click", () => {
    authNodes.form.classList.toggle("open");
    authNodes.showEmail.querySelector("strong").textContent = authNodes.form.classList.contains("open")
      ? "Hide email form"
      : "Continue with email";
    clearAuthError();
  });
  document.querySelectorAll("[data-auth-social]").forEach((button) => {
    button.addEventListener("click", () => completeDesktopAuth({
      email: `${button.dataset.authSocial}@vibyra.local`,
      method: button.dataset.authSocial,
      name: button.dataset.authSocial === "apple" ? "Apple User" : "Google User"
    }));
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

function submitDesktopEmailAuth(event) {
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
  completeDesktopAuth({ email, method: "email", name: name || email.split("@")[0] || "Vibyra User" });
}

function completeDesktopAuth(user) {
  localStorage.setItem(authKey, JSON.stringify({
    email: user.email,
    method: user.method,
    name: user.name,
    signedInAt: new Date().toISOString()
  }));
  document.body.classList.add("desktop-authenticated");
  clearAuthError();
  if (typeof render === "function") render();
}

function desktopAuthUser() {
  try {
    return JSON.parse(localStorage.getItem(authKey) || "null");
  } catch {
    return null;
  }
}

function desktopSignOut() {
  localStorage.removeItem(authKey);
  document.body.classList.remove("desktop-authenticated");
  authNodes.form?.classList.remove("open");
  authNodes.showEmail.querySelector("strong").textContent = "Continue with email";
  setAuthMode("signup");
}

function validateAuthForm() {
  const emailOk = authNodes.email.value.trim().length > 3;
  const passwordOk = authNodes.password.value.length >= 6;
  const nameOk = authMode === "login" || authNodes.name.value.trim().length > 0;
  authNodes.submit.disabled = !(emailOk && passwordOk && nameOk);
}

function showAuthError(message) {
  authNodes.error.textContent = message;
  authNodes.error.classList.add("visible");
}

function clearAuthError() {
  authNodes.error.textContent = "";
  authNodes.error.classList.remove("visible");
}
