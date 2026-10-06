import { useState } from "react";
import { apiRequest } from "../api.js";

export function twoFactorInstruction(challenge) {
  if (challenge.method === "sms") return `Enter the text message code sent to ${challenge.destination}.`;
  if (challenge.method === "email") return `Enter the email code sent to ${challenge.destination}.`;
  return "Enter the code from your authenticator app, or a recovery code.";
}

export default function TwoFactorDelivery({ challenge, busy }) {
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  if (!["sms", "email"].includes(challenge.method)) return null;
  const send = async () => {
    setSending(true); setMessage("");
    try {
      await apiRequest('/api/auth/login/2fa/code', { body: { challengeId: challenge.challengeId, send: true } });
      setMessage("Code sent. Wait a minute before requesting another.");
    } catch (error) { setMessage(error.message); }
    finally { setSending(false); }
  };
  return <div>
    <button className="portal-button" type="button" disabled={busy || sending} onClick={send}>{sending ? "Sending…" : challenge.codeSent ? "Resend code" : "Send code"}</button>
    {message && <p role="status">{message}</p>}
  </div>;
}
