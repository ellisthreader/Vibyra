export interface IntegrationProvider {
  id: string;
  provider: string;
  name: string;
  description: string;
  ready: boolean;
}
export interface IntegrationConnection {
  id: string;
  service: string;
  label: string;
  environment: string;
  status: string;
  assigned: boolean;
}
export interface IntegrationSnapshot {
  providers: IntegrationProvider[];
  connections: IntegrationConnection[];
}
export interface IntegrationRequest {
  operation: "list" | "start" | "poll" | "cancel" | "grant" | "disconnect" | "check";
  service?: string;
  shop?: string;
  id?: string;
  enabled?: boolean;
}
