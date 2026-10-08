import type { ProjectKind } from '../../../lib/projectTemplateTypes';
import { ProjectKindIcon } from './ProjectKindIcon';
import { STACK_BRANDS } from './stackBrands';

/** WCAG relative luminance of a `#rrggbb`, for deciding whether a mark can be
 *  seen at all on the ground it is about to be drawn on. */
function luminance(hex: string): number {
  const channel = (start: number) => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/**
 * A stack's own mark at the head of its row, drawn straight onto the row. There
 * is no tile behind it: a rounded square under every logo added a small panel
 * to a list that already has rows, and the marks are stronger without one.
 *
 * A mark keeps its own colour only where that colour can be seen against the
 * ground it now sits on. Express, Django, Expo, Angular, Bevy and Anthropic are
 * near-black by design, and JavaScript's yellow is near-white; with no tile
 * there is nothing to lift either off the theme's own background. Those follow
 * the theme's ink on the side where they would disappear — which is how their
 * owners draw them there anyway. The class is decided from the colour itself,
 * so a stack added to the catalog needs no second list updating.
 */
export function StackMark({ templateId, kind, size = 26 }: {
  templateId: string; kind: ProjectKind; size?: number;
}) {
  const brand = STACK_BRANDS[templateId];
  if (!brand) {
    return <span className="np-mark np-mark--kind" style={{ width: size, height: size }}>
      <ProjectKindIcon kind={kind} size={size * 0.92} />
    </span>;
  }
  if (!brand.path && !brand.paths) {
    return <span className="np-mark np-mark--initial" style={{ width: size, height: size, fontSize: size * 0.7 }}>
      {brand.name.charAt(0)}
    </span>;
  }
  const light = brand.color ? luminance(brand.color) : null;
  const tone = light === null ? 'np-mark--ink'
    : light < 0.06 ? 'np-mark--deep'
    : light > 0.7 ? 'np-mark--pale' : '';
  return <span className={`np-mark ${tone}`}
    style={{ width: size, height: size, ...(brand.color ? { ['--brand' as string]: brand.color } : {}) }}>
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {brand.paths
        ? brand.paths.map(part => <path key={part.fill} d={part.d} fill={part.fill} />)
        : <path d={brand.path!} fill="currentColor" />}
    </svg>
  </span>;
}
