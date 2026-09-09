export interface VibesProduct { id: string; plan: string | null; credits: number; pence: number; kind: 'subscription' | 'topup' }
/** Backend-owned plan limits. `maxProjects: null` means no limit. */
export interface VibesEntitlements { maxProjects: number | null; concurrentReplies: number; fullCatalogue: boolean; remoteAccess: boolean }
export interface VibesWallet {
  chatEnabled?: boolean;
  version: 1; available: number; held: number; total: number; paidAvailable: number;
  plan: string; paidUntil: string | null; trialChatsRemaining: number;
  accountToken: string; consented: boolean; verified: boolean; purchasesEnabled: boolean; products: VibesProduct[];
  entitlements: VibesEntitlements; planEntitlements: Record<string, VibesEntitlements>;
  remoteAccessLive: boolean; usedProjects: number;
}
export interface VibesModel {
  id: string; name: string; family: string; trial: boolean; available: boolean;
  inputPerMillion: number | null; outputPerMillion: number | null;
  // Curated models carry these; live catalogue models do not.
  tier?: 'best' | 'newest' | 'fast' | 'value'; released?: string | null; blurb?: string;
}
export interface VibesChat { id: string; title: string; trial_slot: number | null; trial_used: number; host_id?: string | null; project_id?: string | null; binding?: string | null }
export interface VibesTool { id: string; expiresAt: number; operation: 'read_file' | 'list_files' | 'write_file'; arguments: { path: string; content?: string; expectedSha256?: string }; decision: string | null; result: Record<string, unknown> | null }
export interface VibesTurn {
  id: string; chatId: string; model: string; status: 'queued' | 'running' | 'waiting' | 'reconciling' | 'completed' | 'failed' | 'cancelled';
  tools?: VibesTool[];
  prompt: string; response: string | null; error: string | null; reserved: number; charged: number; createdAt: string;
}
export interface VibesQuote { quote: string; maxCredits: number; estimatedCredits: number; model: string; expiresAt: number }
export interface VibesApi {
  wallet(): Promise<VibesWallet>; consent(): Promise<void>; models(): Promise<VibesModel[]>;
  chats(): Promise<VibesChat[]>; createChat(id: string, title: string): Promise<VibesChat[]>;
  quote(chatId: string, text: string, model: string): Promise<VibesQuote>;
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
