export function userFacingAgentError(message: string) {
  const lower = message.toLowerCase();

  if (lower.includes("http 401") || lower.includes("401 unauthorized") || lower.includes("api key")) {
    return "I could not start the desktop AI run because the desktop OpenRouter key is missing or invalid. Check `OPENROUTER_API_KEY` in `backend/.env`, then restart the backend.";
  }
  if (lower.includes("http 502") || lower.includes("bad gateway")) {
    return "The desktop AI service failed while starting the run. Check the Vibyra Desktop/backend logs, then try again.";
  }
  if (lower.includes("already running")) {
    return "A desktop AI run is already in progress. Wait for it to finish before sending another build prompt.";
  }
  if (lower.includes("duplicate") || lower.includes("already sent")) {
    return "That exact prompt was just sent. Change the prompt a little before running it again.";
  }
  if (lower.includes("cooldown") || lower.includes("please wait")) {
    return message;
  }
  if (lower.includes("failed to fetch") || lower.includes("could not reach")) {
    return "I could not reach Vibyra from the app. Check that the backend and desktop bridge are running on your LAN, then try again.";
  }
  if (lower.includes("not enough credits") || lower.includes("out of free credits") || lower.includes("out of credits")) {
    return "You're out of credits for this request. Open Account → Billing to top up or upgrade your plan.";
  }
  if (lower.includes("daily ai usage cap")) {
    return "You've hit today's AI usage cap. The cap resets every 24 hours, or upgrade your plan for a higher cap.";
  }
  if (lower.includes("plan does not include this model")) {
    return "Your current plan doesn't include this model. Pick a model included in your plan, or upgrade in Account → Billing.";
  }
  return message;
}
