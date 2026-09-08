export interface BridgeHandle { post(message: unknown): void }
export interface BridgeProps { onMessage(message: unknown): void }
