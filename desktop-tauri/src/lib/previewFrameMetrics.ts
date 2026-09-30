import type { PreviewDevice } from '../previewTypes';

/** Screen stays at exact CSS dimensions; fit transforms only the outer chassis. */
export function previewFrameMetrics(device: PreviewDevice, width: number, height: number, landscape: boolean) {
  const kind = device.kind;
  const legacy = device.key === 'iphone-se' || device.key === 'iphone-se-3';
  const bezel = kind === 'phone' || kind === 'foldable' ? 10 : kind === 'tablet' ? 22 : 13;
  const border = ['phone', 'foldable', 'tablet'].includes(kind) ? 2 : 3;
  const bezelX = legacy && landscape ? 64 : bezel;
  const bezelY = legacy && !landscape ? 64 : bezel;
  const shellWidth = width + (bezelX + border) * 2;
  const shellHeight = height + (bezelY + border) * 2;
  const extraWidth = kind === 'laptop' ? 74 : 0;
  const extraHeight = kind === 'laptop' ? 38 : kind === 'desktop' ? 82 : kind === 'tv' ? 54 : 0;
  return { bezel, bezelX, bezelY, shellWidth, shellHeight, legacy,
    outerWidth: shellWidth + extraWidth, outerHeight: shellHeight + extraHeight, offsetX: extraWidth / 2 };
}
