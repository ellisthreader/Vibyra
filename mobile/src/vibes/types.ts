export interface VibesProduct { id: string; plan: string | null; credits: number; pence: number; kind: 'subscription' | 'topup' }
/** OpenRouter's reasoning vocabulary, exactly as the provider accepts it. */
export type Effort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
/** One model's normalized reasoning ladder; `efforts` is ascending. */
export interface Reasoning { efforts: Effort[]; defaultEffort: Effort | null; mandatory: boolean }
/** Backend-owned plan limits. `maxProjects: null` means no limit. */
export interface VibesEntitlements { maxProjects: number | null; concurrentReplies: number; fullCatalogue: boolean; remoteAccess: boolean;
  // How fast the plan may spend, as the two rolling windows `UsageWindows` enforces.
  sessionCredits: number; weekCredits: number }
/**
 * One rolling usage window as the backend measures it. `span` and `unit` are the
 * window's own length, published rather than assumed, so "5 hours" becoming "6"
 * is a config change and not a client release.
 *
 * `resetsAt` is when the oldest spend inside the window ages out of it, which is
 * the first moment any headroom returns. It is null when the window is empty.
 */
export interface VibesWindow { unit: 'hours' | 'days'; span: number; used: number; limit: number; resetsAt: string | null }
export interface VibesLimits { session: VibesWindow; week: VibesWindow }
export interface VibesWallet {
  chatEnabled?: boolean;
  /** Guests prove trial eligibility at creation instead of by verifying email. */
  guest?: boolean;
  version: 1; available: number; held: number; total: number; paidAvailable: number;
  plan: string; paidUntil: string | null; trialChatsRemaining: number;
  // The trial as the backend defines it, so nothing on the phone keeps its own
  // copy of a number the server enforces. `null` means an older backend did not
  // send it, and every reader words itself without a figure rather than guessing.
  trialCredits: number | null; trialChats: number | null; trialChatCredits: number | null;
  accountToken: string; consented: boolean; verified: boolean; purchasesEnabled: boolean; products: VibesProduct[];
  entitlements: VibesEntitlements; planEntitlements: Record<string, VibesEntitlements>;
  remoteAccessLive: boolean; usedProjects: number;
  // Null on a backend that publishes no windows. A meter is then not drawn at
  // all, because "0 of 0" reads as "you have no allowance" rather than as
  // "we have not been told".
  limits: VibesLimits | null;
}
export interface VibesModel {
  id: string; name: string; family: string; trial: boolean; available: boolean;
  inputPerMillion: number | null; outputPerMillion: number | null;
  // Curated models carry these; live catalogue models do not.
  tier?: 'best' | 'newest' | 'fast' | 'value'; released?: string | null; blurb?: string;
  // The reasoning ladder this model publishes on OpenRouter. Absent, or empty,
  // means its thinking cannot be steered and no effort is sent for it.
  reasoning?: Reasoning; created?: number | null;
  /** Whether it can see a photo. The server refuses a photo for a model that cannot. */
  vision?: boolean;
}
/** A photo or file uploaded for a message; `kind` is how the model receives it. */
export interface VibesAttachment { id: string; kind: 'image' | 'pdf' | 'text'; name: string; bytes: number }
/** A local file about to be uploaded. `file` is the browser's own File; the phone sends by `uri`. */
export interface AttachmentSource { uri: string; name: string; mimeType: string; file?: Blob }
export interface VibesChat { id: string; title: string; trial_slot: number | null; trial_used: number; host_id?: string | null; project_id?: string | null; binding?: string | null }
export const PROJECT_OPERATIONS = ['read_file', 'list_files', 'write_file', 'search_files'] as const;
export type ProjectOperation = (typeof PROJECT_OPERATIONS)[number];
/** `path` names a file or folder; `search_files` names a query instead and carries no path. */
export interface ProjectToolArguments { path?: string; content?: string; expectedSha256?: string; query?: string }
/**
 * One tool call inside a turn. A project call names a file and is answered by this
 * phone. An integration call carries `integration` and was answered by the
 * server against a connected account, so it arrives already decided, with one
 * line describing what it did and without the account data behind it.
 */
export interface VibesTool {
  id: string; expiresAt: number; operation: string; decision: string | null;
  approval?: { state: string; fingerprint: string; arguments: Record<string, unknown>; answer: 'allow' | 'decline' | null } | null;
  integration?: string | null; summary?: string | null;
  arguments?: ProjectToolArguments; result?: Record<string, unknown> | null;
}
export type ProjectTool = VibesTool & { arguments: ProjectToolArguments; operation: ProjectOperation };
/** Narrows to the calls this phone is responsible for answering. */
export const isProjectTool = (tool: VibesTool): tool is ProjectTool =>
  !tool.integration && (PROJECT_OPERATIONS as readonly string[]).includes(tool.operation) && Boolean(tool.arguments);
export interface VibesTurn {
  id: string; chatId: string; model: string; status: 'queued' | 'running' | 'waiting' | 'reconciling' | 'completed' | 'failed' | 'cancelled';
  finishReason?: string | null;
  progress?: { phase: string; sequence: number; observedAt: string; assessment: { label: string } | null } | null;
  tools?: VibesTool[];
  attachments?: VibesAttachment[];
  /** What this reply saved to or removed from Settings > Memory; null when it changed nothing. */
  memory?: VibesTurnMemory | null;
  prompt: string; response: string | null; error: string | null; reserved: number; charged: number; createdAt: string;
}
export interface VibesTurnMemory { saved?: { id: string; text: string }[]; forgotten?: string[]; full?: boolean }
/**
 * `auto` is present only when the model sent was 'auto': it names the model the
 * router chose and why, so the composer can show a decision the person did not
 * make. `model` and `effort` already carry that decision; this is what lets it be
 * worded rather than inferred from an id.
 */
export interface VibesAutoChoice { reason: string; name: string }
export interface VibesQuote { smartAuto?: boolean; quote: string; maxCredits: number; estimatedCredits: number; model: string; expiresAt: number;
  effort?: Effort | null; auto?: VibesAutoChoice | null;
  /** The integrations actually attached and priced, which is not always the ones asked for. */
  integrations?: string[] }
export interface VibesApi {
  prepareAuto?(id: string, quote: string): Promise<{ id: string; state: string }>;
  autoPreparation?(id: string): Promise<{ id: string; state: string; quote?: VibesQuote }>;
  guest?: {
    restore(token: string | null): void;
    create(installId: string, deviceToken?: string): Promise<{ token: string; wallet: VibesWallet }>;
  };
  wallet(): Promise<VibesWallet>; consent(): Promise<void>; models(): Promise<VibesModel[]>;
  chats(): Promise<VibesChat[]>; createChat(id: string, title: string): Promise<VibesChat[]>;
  // The effort is a request, not a promise: the server validates it against the
  // model's own ladder and the quote reports back the effort it actually priced.
  // `integrations` are the connectors named in the message. The server keeps only the
  // ones this account has really connected and reports back which it attached.
  // `attachments` are uploaded first; the quote prices them and the turn carries them.
  quote(chatId: string, text: string, model: string, effort?: Effort | null, integrations?: string[], attachments?: string[]): Promise<VibesQuote>;
  upload?(source: AttachmentSource): Promise<VibesAttachment>;
  submit(id: string, quote: string): Promise<VibesTurn>; turn(id: string): Promise<VibesTurn>;
  turns(chatId: string): Promise<VibesTurn[]>; cancel(id: string): Promise<void>;
  purchase(transactionId: string, productId: string): Promise<VibesWallet>;
  attach?(chatId: string, hostId: string, projectId: string, binding: string): Promise<void>;
  toolResult?(toolId: string, decision: 'allow' | 'decline', result: Record<string, unknown>): Promise<void>;
}
export interface StoreProduct { id: string; displayPrice: string }
export interface StoreTransaction { transactionId: string; productId: string; accountToken?: string }
export interface PurchaseBridge {
  addListener?(event: 'transactionsChanged', listener: () => void): { remove(): void };
  products(ids: string[]): Promise<StoreProduct[]>;
  buy(id: string, accountToken: string): Promise<StoreTransaction | null>;
  restore(): Promise<StoreTransaction[]>;
  pending(): Promise<StoreTransaction[]>;
  finish(id: string): Promise<void>;
}
export const activeTurn = (t: VibesTurn) => ['queued', 'running', 'waiting', 'reconciling'].includes(t.status);
