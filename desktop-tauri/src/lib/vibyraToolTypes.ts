/** One thing the Vibyra assistant can do to the application. */
export interface VibyraTool {
  name: string;
  description: string;
  /** JSON Schema for the arguments, as OpenAI expects it. */
  parameters: Record<string, unknown>;
  /** True when running it changes the workspace, so it asks first. */
  changes: boolean;
}
