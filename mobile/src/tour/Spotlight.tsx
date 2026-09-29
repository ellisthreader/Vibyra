import { useMemo } from 'react';
import { Animated, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { HOLE_RADIUS as R } from './tourLayout';
import type { Size } from './tourLayout';

/** The lit window's four numbers, all on the native driver. */
export interface Hole { x: Animated.Value; y: Animated.Value; w: Animated.Value; h: Animated.Value }

const RING = 2;
/** Pieces overlap by a pixel so no seam shows between them while the window moves. */
const O = 1;
const A = Animated;
const corners = [
  { sx: 1, sy: 1, right: false, bottom: false },
  { sx: -1, sy: 1, right: true, bottom: false },
  { sx: 1, sy: -1, right: false, bottom: true },
  { sx: -1, sy: -1, right: true, bottom: true },
];

/**
 * The dimmed app with one lit window cut out of it, and a thin ring around that
 * window. Nothing here is laid out as it moves: the dim is four solid panels and four
 * rounded corner pieces, the ring four bars and four arcs, and each is only ever
 * translated or stretched along one axis. That keeps the glide between controls on the
 * native thread, so it stays smooth while the phone is mounting the next screen.
 * The dim's pieces are opaque and the whole is faded as a group, so where they
 * overlap they never double up dark.
 */
export function Spotlight({ hole, show, pulse, screen, base, alpha, ring }: {
  hole: Hole; show: Animated.Value; pulse: Animated.Value | null; screen: Size;
  base: string; alpha: number; ring: string;
}) {
  const big = Math.max(screen.width, screen.height) * 2;
  const g = useMemo(() => {
    const right = A.add(hole.x, hole.w);
    const bottom = A.add(hole.y, hole.h);
    return {
      right, bottom,
      rightEdge: A.subtract(right, R), bottomEdge: A.subtract(bottom, R),
      midX: A.subtract(A.add(hole.x, A.multiply(hole.w, 0.5)), 0.5),
      midY: A.subtract(A.add(hole.y, A.multiply(hole.h, 0.5)), 0.5),
      wide: A.add(hole.w, 2 * O), tall: A.add(hole.h, 2 * O),
      barWide: A.add(hole.w, 2 * O - 2 * R), barTall: A.add(hole.h, 2 * O - 2 * R),
      ringRight: A.subtract(right, RING), ringBottom: A.subtract(bottom, RING),
    };
  }, [hole]);
  const width = screen.width + 240;
  const glow = pulse ? A.multiply(show, pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.72] })) : show;

  const panel = (extra: object, ...transform: object[]) =>
    ({ style: [s.piece, { backgroundColor: base }, extra, { transform }] });
  const bar = (extra: object, ...transform: object[]) =>
    ({ style: [s.piece, { backgroundColor: ring }, extra, { transform }] });

  return <>
    <A.View pointerEvents="none" needsOffscreenAlphaCompositing style={[StyleSheet.absoluteFill, { opacity: A.multiply(show, alpha) }]}>
      <A.View {...panel({ left: -120, width, height: big }, { translateY: A.subtract(hole.y, big) })} />
      <A.View {...panel({ left: -120, width, height: big }, { translateY: g.bottom })} />
      <A.View {...panel({ width: big, height: 1 }, { translateX: A.subtract(hole.x, big) }, { translateY: g.midY }, { scaleY: g.tall })} />
      <A.View {...panel({ width: big, height: 1 }, { translateX: g.right }, { translateY: g.midY }, { scaleY: g.tall })} />
      {corners.map(({ sx, sy, right, bottom }) => <A.View key={`c${sx}${sy}`} style={[s.piece, { width: R + O, height: R + O,
        transform: [{ translateX: right ? g.rightEdge : A.subtract(hole.x, O) }, { translateY: bottom ? g.bottomEdge : A.subtract(hole.y, O) },
          { scaleX: sx }, { scaleY: sy }] }]}>
        <Svg width={R + O} height={R + O}>
          <Path d={`M0 0 H${R + O} V${O} A${R} ${R} 0 0 0 ${O} ${R + O} H0 Z`} fill={base} />
        </Svg>
      </A.View>)}
    </A.View>
    <A.View pointerEvents="none" needsOffscreenAlphaCompositing style={[StyleSheet.absoluteFill, { opacity: glow }]}>
      <A.View {...bar({ width: 1, height: RING }, { translateX: g.midX }, { translateY: hole.y }, { scaleX: g.barWide })} />
      <A.View {...bar({ width: 1, height: RING }, { translateX: g.midX }, { translateY: g.ringBottom }, { scaleX: g.barWide })} />
      <A.View {...bar({ width: RING, height: 1 }, { translateX: hole.x }, { translateY: g.midY }, { scaleY: g.barTall })} />
      <A.View {...bar({ width: RING, height: 1 }, { translateX: g.ringRight }, { translateY: g.midY }, { scaleY: g.barTall })} />
      {corners.map(({ sx, sy, right, bottom }) => <A.View key={`r${sx}${sy}`} style={[s.piece, { width: R, height: R,
        transform: [{ translateX: right ? g.rightEdge : hole.x }, { translateY: bottom ? g.bottomEdge : hole.y },
          { scaleX: sx }, { scaleY: sy }] }]}>
        <Svg width={R} height={R}>
          <Path d={`M${RING / 2} ${R} A${R - RING / 2} ${R - RING / 2} 0 0 1 ${R} ${RING / 2}`} stroke={ring} strokeWidth={RING} fill="none" />
        </Svg>
      </A.View>)}
    </A.View>
  </>;
}

const s = StyleSheet.create({
  piece: { position: 'absolute', left: 0, top: 0 },
});
