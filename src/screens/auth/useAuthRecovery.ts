import { useEffect, useState } from "react";
import { Linking } from "react-native";
import { appApiRequest } from "../../utils/appApi";
import { parseAuthRecoveryDeepLink } from "./authRecoveryDeepLink";

export function useAuthRecovery({
  email,
  setEmail
}: {
  email: string;
  setEmail: (value: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"forgot" | "reset" | null>(null);
  const [message, setMessage] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");

  useEffect(() => {
    function receive(url: string | null) {
      const parsed = parseAuthRecoveryDeepLink(url);
      if (!parsed) return;
      setEmail(parsed.email);
      setToken(parsed.token);
      setMode("reset");
      setMessage("");
    }
    void Linking.getInitialURL().then(receive);
    const subscription = Linking.addEventListener("url", (event) => receive(event.url));
    return () => subscription.remove();
  }, [setEmail]);

  async function submit() {
    if (!mode) return;
    setBusy(true);
    setMessage("");
    try {
      const result = mode === "forgot"
        ? await appApiRequest<{ message: string }>("/api/auth/password/forgot", {
            method: "POST",
            body: JSON.stringify({ email: email.trim() })
          })
        : await appApiRequest<{ message: string }>("/api/auth/password/reset", {
            method: "POST",
            body: JSON.stringify({
              email: email.trim(),
              password,
              passwordConfirmation: password,
              token
            })
          });
      setMessage(result.message);
      if (mode === "reset") {
        setPassword("");
        setToken("");
        setMode(null);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update your password.");
    } finally {
      setBusy(false);
    }
  }

  async function resendVerification() {
    setBusy(true);
    try {
      const result = await appApiRequest<{ message: string }>("/api/auth/email/resend", {
        method: "POST",
        body: JSON.stringify({ email: email.trim() })
      });
      return result.message;
    } finally {
      setBusy(false);
    }
  }

  return {
    busy,
    close: () => setMode(null),
    message,
    mode,
    openForgot: () => {
      setMessage("");
      setMode("forgot");
    },
    password,
    resendVerification,
    setPassword,
    setToken,
    submit,
    token
  };
}
