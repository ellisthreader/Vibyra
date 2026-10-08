import type { HubConnection, McpPreset } from '../../../../mobile/src/agents/v2/connectionsModel.ts';
import { integrationBrand, integrationBrands } from '../../../../mobile/src/integrations/integrationBrands';
import { connectionBrand, presetBrand } from '../../../../mobile/src/integrations/presetBrands';
import type { Brand } from '../../../../mobile/src/ui/brands';

/** `Monday.com` / `google-calendar` → the key a mark is stored under. */
const markKey = (id: string) => id.trim().toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '');

/**
 * The mark for an id, drawn by the same code as the phone: the integrations' own marks first, then the
 * popular MCP servers' (`presetBrands`, Simple Icons), then a name-only brand: callers draw the neutral
 * tile and an initial, never an invented logo. An MCP account shares the generic server mark.
 */
export function markFor(id: string, label?: string): Brand {
  if (id.startsWith('mcp_')) return integrationBrand('mcp');
  const key = markKey(id);
  return integrationBrands[key] ?? presetBrand({ id: key, name: label ?? id, url: '' });
}

/** A connected account's mark; an MCP server added from a preset (same address host) wears that preset's. */
export const accountMark = (c: HubConnection, presets: McpPreset[]): Brand => connectionBrand(c, presets);

/** A preset's mark: its id, name or address names the brand; anything else is the neutral tile. */
export const presetMark = (p: Pick<McpPreset, 'id' | 'name' | 'url'>): Brand => presetBrand(p);

const channel = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
/** A glyph in a dark brand colour and no tile of its own cannot be seen on a dark tile (Slack's aubergine). */
export function needsLightTile(brand: Brand): boolean {
  const hex = /^#([0-9a-f]{6})$/i.exec(brand.color ?? '')?.[1];
  if (brand.tile || !hex) return false;
  const [r, g, b] = [0, 2, 4].map(i => channel(parseInt(hex.slice(i, i + 2), 16)));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! < 0.1;
}
