import { apiRequest } from "./api.js";

// Roadmap Part 11. Every call answers 404 while its server flag is off; callers read that as "draw nothing".
export const developerApi = {
  overview: () => apiRequest("/web-api/developer"),
  createKey: (body) => apiRequest("/web-api/developer/keys", { body }),
  revokeKey: (id) => apiRequest(`/web-api/developer/keys/${id}`, { method: "DELETE" }),
  createWebhook: (body) => apiRequest("/web-api/developer/webhooks", { body }),
  pauseWebhook: (id, paused) => apiRequest(`/web-api/developer/webhooks/${id}/pause`, { body: { paused } }),
  deleteWebhook: (id) => apiRequest(`/web-api/developer/webhooks/${id}`, { method: "DELETE" }),
  deliveries: (id) => apiRequest(`/web-api/developer/webhooks/${id}/deliveries`),
  activity: (before) => apiRequest("/web-api/account/activity" + (before ? `?before=${encodeURIComponent(before)}` : "")),
};
