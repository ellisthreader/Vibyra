import { IntegrationsBlock } from "./IntegrationsBlock";
import { ConnectionsHubBlock } from "./ConnectionsHubBlock";

export function SettingsServicesPane() {
  return <section className="settings-integrations"><IntegrationsBlock /><ConnectionsHubBlock /></section>;
}
