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
      deviceName: desktopAuthDeviceName(),
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
  if (typeof resetProfileSessions === "function") resetProfileSessions();
  if (typeof activePage !== "undefined") activePage = "dashboard";
  document.body.classList.add("desktop-authenticated");
  clearAuthError();
  if (typeof render === "function") render();
}

function desktopAuthDeviceName() {
  return currentState?.machineName || "Vibyra Desktop";
}
