function initDesktopAuth() {
  const session = desktopAuthSession();
  if (session?.token && session.user) {
    const restoredPage = typeof activePage !== "undefined" && pages.some((page) => page.key === activePage) ? activePage : "dashboard";
    localStorage.setItem("vibyra.desktop.page", restoredPage);
    if (typeof activePage !== "undefined") activePage = restoredPage;
    syncDesktopSession(session.token)
      .then(() => {
        document.body.classList.add("desktop-authenticated");
        if (typeof render === "function") render();
      })
      .catch((error) => {
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
    button.addEventListener("click", () => beginDesktopSocialAuth(button.dataset.authSocial));
  });
  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.addEventListener("click", () => setAuthMode(button.dataset.authMode));
  });
  document.querySelectorAll("[data-auth-link]").forEach((button) => {
    button.addEventListener("click", () => {
      const path = button.dataset.authLink === "terms" ? "/legal/terms" : "/legal/privacy";
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
