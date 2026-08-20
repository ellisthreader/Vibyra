export interface ProviderPixelLogo {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}

export declare const PROVIDER_PIXEL_LOGOS: Record<string, unknown>;
export declare function decodeProviderPixelLogo(provider: string): ProviderPixelLogo | null;
