import { apiRequest } from "./api.js";

// Roadmap Part 13 (Teams). Every call answers 404 while TEAMS_ENABLED is off; callers read that as "draw nothing".
const team = "/web-api/team";
export const teamApi = {
  overview: () => apiRequest(team),
  create: (name) => apiRequest(team, { body: { name } }),
  rename: (name) => apiRequest(team, { method: "PATCH", body: { name } }),
  leave: () => apiRequest(`${team}/leave`, { body: {} }),
  remove: (id) => apiRequest(`${team}/members/${id}`, { method: "DELETE" }),
  setRole: (id, role) => apiRequest(`${team}/members/${id}`, { method: "PATCH", body: { role } }),
  transfer: (memberId) => apiRequest(`${team}/transfer`, { body: { memberId } }),
  defaultCap: (tokens) => apiRequest(`${team}/cap`, { method: "PUT", body: { tokens } }),
  memberCap: (id, tokens) => apiRequest(`${team}/members/${id}/cap`, { method: "PUT", body: { tokens } }),
  invite: (email, role) => apiRequest(`${team}/invitations`, { body: { email, role } }),
  revoke: (id) => apiRequest(`${team}/invitations/${id}`, { method: "DELETE" }),
  preview: (token) => apiRequest(`${team}/invitations/preview`, { body: { token } }),
  accept: (token) => apiRequest(`${team}/invitations/accept`, { body: { token } }),
  saveSso: (body) => apiRequest(`${team}/sso`, { method: "PUT", body }),
  verifySso: () => apiRequest(`${team}/sso/verify`, { body: {} }),
  enableSso: (enabled, requireSso) => apiRequest(`${team}/sso/enable`, { body: { enabled, requireSso } }),
  removeSso: () => apiRequest(`${team}/sso`, { method: "DELETE" }),
  ssoAvailable: () => apiRequest("/web-api/auth/sso"),
  ssoStart: (email) => apiRequest("/web-api/auth/sso/start", { body: { email } }),
};
