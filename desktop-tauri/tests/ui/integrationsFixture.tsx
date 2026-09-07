import "@fontsource-variable/inter";
import { createRoot } from "react-dom/client";
import { AgentIntegrationsButton } from "../../src/components/integrations/AgentIntegrationsButton";
import "../../src/styles/tokens.css";
import "../../src/styles/base.css";
import "../../src/styles/base-controls.css";
import "../../src/styles/controls.css";
import "../../src/styles/modals.css";
import type { IntegrationConnection } from "../../src/components/integrations/types";

// ?dormant is a release that shipped before Vibyra registered any provider:
// nothing is connectable, so the header must offer nothing at all.
const dormant = new URLSearchParams(location.search).has("dormant");
const providers = [
  ["gmail", "google", "Gmail", "Read recent email subjects and previews"],
  ["google-calendar", "google", "Google Calendar", "Read upcoming events"],
  ["google-drive", "google", "Google Drive", "Find file names and links"],
  ["outlook", "microsoft", "Outlook", "Read recent email subjects and previews"],
  ["microsoft-calendar", "microsoft", "Microsoft Calendar", "Read upcoming events"],
  ["onedrive", "microsoft", "OneDrive", "List files and folders"],
  ["stripe", "stripe", "Stripe", "Review recent payments"],
  ["shopify", "shopify", "Shopify", "Review products and recent orders"],
  ["github", "github", "GitHub", "List public repositories"],
].map(([id, provider, name, description]) => ({ id, provider, name, description, ready: !dormant }));
const connections: IntegrationConnection[] = dormant ? [] : [{ id: "connection-a", service: "gmail", label: "ellis@example.test", environment: "live", status: "connected", assigned: false }];
const qa = { calls: [] as any[], fail: "", status: "pending", providers, connections };
(window as any).qa = qa;
(window as any).__TAURI_INTERNALS__ = { invoke: async (_command: string, args: any) => {
  const r = args.request;
  qa.calls.push(r);
  if (qa.fail === r.operation) throw new Error("Network unavailable. Please retry.");
  if (r.operation === "list") return { providers: [...providers], connections: connections.map((c) => ({...c})) };
  if (r.operation === "start") { await new Promise(resolve => setTimeout(resolve, 150)); return { attemptId: "attempt-a" }; }
  if (r.operation === "poll") return { status: qa.status };
  if (r.operation === "grant") connections.find((c) => c.id === r.id)!.assigned = r.enabled;
  if (r.operation === "disconnect") connections.splice(connections.findIndex((c) => c.id === r.id), 1);
  return { ok: true };
} };
createRoot(document.getElementById("root")!).render(<div className="app"><div className="shell" style={{padding: 30}}>
  <h2>Release teammate</h2><AgentIntegrationsButton agentId="agent-a" agentName="Release" />
  <button>Other workspace action</button>
</div></div>);
