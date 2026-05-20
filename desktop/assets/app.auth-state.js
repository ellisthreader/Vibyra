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
