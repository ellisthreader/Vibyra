import type { Brand } from '../../../../mobile/src/ui/brands';
import { markFor, needsLightTile } from './brandMark';

/** What sits inside a mark tile: the drawn glyph, else the first letter of the service's name. */
function MarkGlyph({ brand, size, label }: { brand: Brand; size: number; label?: string }) {
  if (!brand.path && !brand.paths?.length) return <>{(label || brand.name).trim().slice(0, 1).toUpperCase()}</>;
  return (
    <svg viewBox="0 0 24 24" width={size - 8} height={size - 8}>
      {brand.path ? <path d={brand.path} fill={brand.color ?? 'currentColor'} /> : null}
      {brand.paths?.map(p => <path key={p.d} d={p.d} fill={p.fill} />)}
    </svg>
  );
}

/**
 * A provider's own mark (`markFor`: the phone's marks, then the preset marks), drawn inline so it works
 * offline in both themes. A service with no mark gets the neutral tile and the first letter of `label`.
 * `brand` overrides the lookup, e.g. an MCP account wearing the mark of the preset it was added from.
 */
export function HubMark({ id, size = 24, label, brand: given }: { id: string; size?: number; label?: string; brand?: Brand }) {
  const brand = given ?? markFor(id, label);
  return (
    <span className={`hub-mark${needsLightTile(brand) ? ' hub-mark--lift' : ''}`} style={{ width: size, height: size, background: brand.tile }} aria-hidden="true">
      <MarkGlyph brand={brand} size={size} label={label} />
    </span>
  );
}
