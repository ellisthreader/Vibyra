import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, BackHandler, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { arrived, detent } from '../ui/haptics';
import { useBreath } from '../ui/motion';
import type { WorkspaceModel } from '../ui/types';
import { useReducedMotion } from '../ui/useReducedMotion';
import { CoachCard } from './CoachCard';
import { Spotlight } from './Spotlight';
import { TourPreviewPage } from './TourPreviewPage';
import { cardWidthFor, holeFor, placeCard } from './tourLayout';
import type { Rect } from './tourLayout';
import { move } from './tourMotion';
import { sceneSteps } from './tourSteps';
import type { TargetStep, TourScene, TourStep } from './tourSteps';
import { useTargetStops } from './useTargetStops';

type Stop = { step: TourStep; rect: Rect | null };
const num = () => new Animated.Value(0);

/**
 * The walkthrough. On the real home the app stays on screen, dimmed, with one lit
 * window over each real control; then the same card carries on over the real New
 * terminal and computer-setup screens. One card, one spotlight and one set of dots
 * run the whole way: the window and card glide between stops, the words fade, and a
 * sample screen eases in as the dimming eases out — nothing cuts. Everything moves on
 * the native driver; Reduce Motion lands each change at rest.
 */
export function TourStage({ steps, workspace, onClose }: { steps: TargetStep[]; workspace: WorkspaceModel; onClose(): void }) {
  const { colors, dark } = useTheme();
  const reduced = useReducedMotion();
  const screen = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const root = useRef<View>(null);
  const targets = useTargetStops(steps, root, screen, onClose);
  const flow = useMemo<Stop[] | null>(() => targets && [...targets, ...sceneSteps.map(step => ({ step, rect: null }))], [targets]);
  const m = useRef({ hole: { x: num(), y: num(), w: num(), h: num() }, show: num(), cardIn: num(), cardX: num(), cardY: num(),
    content: new Animated.Value(1), scene: num() }).current;
  const pulse = useBreath(!reduced, 2400);
  const [index, setIndex] = useState(0);
  const [worded, setWorded] = useState(0);
  const [cardHeight, setCardHeight] = useState(0);
  const [sceneOn, setSceneOn] = useState(false);
  const seen = useRef({ hole: false, card: false });
  const leaving = useRef(false);
  const lastScene = useRef<TourScene>('terminal');

  const at = flow ? Math.min(index, flow.length - 1) : 0;
  const stop = flow?.[at];
  const rect = stop?.rect ?? null;
  const hole = useMemo(() => rect ? holeFor(rect, screen) : null, [rect, screen]);
  const inScene = Boolean(stop && !stop.rect);
  if (stop?.step.kind === 'scene') lastScene.current = stop.step.scene;
  const cardWidth = cardWidthFor(screen.width);
  const place = useMemo(() => placeCard({ rect, screen, insets, cardWidth, cardHeight: cardHeight || 190 }),
    [rect, screen, insets, cardWidth, cardHeight]);

  // The lit window glides to each control; over a sample screen the dimming waits for the screen to arrive, then goes.
  useEffect(() => {
    if (!flow) return;
    const first = !seen.current.hole;
    seen.current.hole = true;
    if (hole) {
      move(m.hole.x, hole.x, first || reduced); move(m.hole.y, hole.y, first || reduced);
      move(m.hole.w, hole.width, first || reduced); move(m.hole.h, hole.height, first || reduced);
      move(m.show, 1, reduced, first ? 420 : 300);
    } else move(m.show, 0, reduced, 80, 300);
  }, [flow, hole, reduced, m]);

  // The card glides beside its control, or docks at the top over a sample screen; on the first stop it rises in after the dimming.
  useEffect(() => {
    if (!flow || !cardHeight) return;
    const first = !seen.current.card;
    seen.current.card = true;
    move(m.cardX, place.x, first || reduced); move(m.cardY, place.y, first || reduced);
    if (first) move(m.cardIn, 1, reduced, 420, 200);
  }, [flow, cardHeight, place.x, place.y, reduced, m]);

  // The words fade out, swap, and fade in, while the card is already on its way.
  useEffect(() => {
    m.content.stopAnimation();
    if (reduced || worded === at) { setWorded(at); m.content.setValue(1); return; }
    Animated.timing(m.content, { toValue: 0, duration: 90, useNativeDriver: true }).start(({ finished }) => {
      if (!finished) return;
      setWorded(at);
      move(m.content, 1, false, 280);
    });
  }, [at, reduced, m]); // eslint-disable-line react-hooks/exhaustive-deps

  // A sample screen rises in first; the dimming behind it leaves once it is opaque. Going back, the dimming returns first.
  useEffect(() => {
    if (!flow) return;
    if (inScene) {
      setSceneOn(true);
      move(m.scene, 1, reduced, 260, 40);
    } else {
      m.scene.stopAnimation();
      Animated.timing(m.scene, { toValue: 0, duration: reduced ? 0 : 240, delay: reduced ? 0 : 140, useNativeDriver: true })
        .start(({ finished }) => { if (finished) setSceneOn(false); });
    }
  }, [inScene, flow, reduced, m]);

  useEffect(() => {
    if (stop) AccessibilityInfo.announceForAccessibility(`${stop.step.title}. Step ${at + 1} of ${flow!.length}.`);
  }, [at]); // eslint-disable-line react-hooks/exhaustive-deps

  const leave = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    if (reduced) return onClose();
    const out = (value: Animated.Value, duration: number) => Animated.timing(value, { toValue: 0, duration, useNativeDriver: true });
    Animated.parallel([out(m.show, 220), out(m.cardIn, 180), out(m.scene, 220)]).start(() => onClose());
  }, [reduced, onClose, m]);
  const next = () => {
    if (!flow || leaving.current) return;
    if (at >= flow.length - 1) { arrived(); return leave(); }
    detent();
    setIndex(at + 1);
  };
  const back = () => {
    if (at === 0) return;
    detent();
    setIndex(at - 1);
  };
  // Tapping inside the lit window moves on; the dimmed rest of the screen does nothing.
  const tap = (event: GestureResponderEvent) => {
    const { locationX: x, locationY: y } = event.nativeEvent;
    if (hole && x >= hole.x && x <= hole.x + hole.width && y >= hole.y && y <= hole.y + hole.height) next();
  };
  const exit = useRef(leave);
  useEffect(() => { exit.current = leave; });
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { exit.current(); return true; });
    return () => sub.remove();
  }, []);

  const lift = useMemo(() => m.cardIn.interpolate({ inputRange: [0, 1], outputRange: [22, 0] }), [m]);
  const sceneLift = useMemo(() => m.scene.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }), [m]);
  const cardY = useMemo(() => Animated.add(m.cardY, lift), [m, lift]);
  const wording = flow ? flow[Math.min(worded, flow.length - 1)].step : null;
  return <View ref={root} collapsable={false} accessibilityViewIsModal onAccessibilityEscape={leave}
    style={[StyleSheet.absoluteFill, s.root]}>
    {flow && wording && <>
      <Pressable accessible={false} importantForAccessibility="no" onPress={tap} style={StyleSheet.absoluteFill} />
      <Spotlight hole={m.hole} show={m.show} pulse={reduced ? null : pulse} screen={screen}
        base={dark ? '#000000' : '#0A0E18'} alpha={dark ? 0.72 : 0.56} ring={colors.accent} />
      {sceneOn && <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background, opacity: m.scene,
        transform: [{ translateY: sceneLift }] }]}>
        <TourPreviewPage stage={lastScene.current} workspace={workspace} instant={reduced} onExit={leave}
          top={place.y + (cardHeight || 190) + 12} />
      </Animated.View>}
      <Animated.View pointerEvents="box-none" style={[s.slot, { width: cardWidth, opacity: m.cardIn,
        transform: [{ translateX: m.cardX }, { translateY: cardY }] }]}>
        <CoachCard copy={wording} index={at} count={flow.length} content={m.content} instant={reduced}
          pointer={place.side ? { side: place.side, x: place.pointerX } : null}
          onLayout={event => setCardHeight(Math.round(event.nativeEvent.layout.height))}
          onBack={back} onNext={next} onSkip={leave} />
      </Animated.View>
    </>}
  </View>;
}

const s = StyleSheet.create({
  root: { zIndex: 60 },
  slot: { position: 'absolute', left: 0, top: 0 },
});
