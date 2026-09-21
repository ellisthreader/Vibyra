import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { guessPlatform, platformLogo } from '../ui/hostIdentity';
import { useReducedMotion } from '../ui/useReducedMotion';
import type { NearbyComputer } from './discoveryTypes';
import { ApprovalDisplay, type ConnectionStage } from './ApprovalDisplay';
import { FoundMachine } from './FoundMachine';

export interface MachineFrame { x: number; y: number; width: number; height: number }
export interface HandoffOrigin { machine: MachineFrame; container: { x: number; y: number } }
const Handoff = createContext<{ report: (frame: MachineFrame, stage: ConnectionStage) => void } | undefined>(undefined);
export const useHandoffTarget = () => useContext(Handoff);

/** A settled copy of the found laptop crosses between measured slots. The new
 * screen mounts immediately, so animation never delays the real handshake. */
export function ComputerHandoff({ computer, origin, children }: {
  computer: NearbyComputer; origin?: HandoffOrigin; children: ReactNode;
}) {
  const still = useReducedMotion();
  const [stage, setStage] = useState<ConnectionStage>('connecting');
  const [target, setTarget] = useState<MachineFrame>();
  const [done, setDone] = useState(!origin || still);
  const progress = useRef(new Animated.Value(!origin || still ? 1 : 0)).current;
  const motion = useRef({ rise: new Animated.Value(1), lid: new Animated.Value(1), settle: new Animated.Value(1) }).current;
  const measured = useRef<MachineFrame | undefined>(undefined);
  const report = useRef((frame: MachineFrame, next: ConnectionStage) => {
    const previous = measured.current;
    // Rotation or a changed text size invalidates the original destination.
    if (previous && (Math.abs(previous.x - frame.x) > 1 || Math.abs(previous.y - frame.y) > 1 || Math.abs(previous.width - frame.width) > 1)) {
      progress.setValue(1); setDone(true);
    }
    measured.current = frame;
    setTarget(previous => previous ?? frame); setStage(next);
  }).current;
  useEffect(() => {
    if (done) return;
    if (still) { progress.setValue(1); setDone(true); return; }
    // A missing/unmounted layout must never leave connection controls invisible.
    if (!target) {
      const fallback = setTimeout(() => { progress.setValue(1); setDone(true); }, 500);
      return () => clearTimeout(fallback);
    }
    const animation = Animated.timing(progress, { toValue: 1, duration: 760,
      easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: true, isInteraction: false });
    animation.start(({ finished }) => { if (finished) setDone(true); });
    return () => animation.stop();
  }, [done, progress, still, target]);
  const from = origin?.machine;
  const local = origin?.container;
  const moving = !done && from && local;
  // Stage reports can arrive during native motion. Keep these driver nodes stable
  // so a React render cannot reattach them with a stale JS-side progress value.
  const contentOpacity = useMemo(() => progress.interpolate({
    inputRange: [0, 0.2, 0.6, 1], outputRange: [0, 0, 1, 1], extrapolate: 'clamp' }), [progress]);
  const screenOpacity = useMemo(() => progress.interpolate({
    inputRange: [0, 0.3, 0.85, 1], outputRange: [0, 0, 1, 1], extrapolate: 'clamp' }), [progress]);
  const travel = useMemo(() => [
    { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, target && from ? target.x - from.x : 0] }) },
    { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, target && from ? target.y - from.y : 0] }) },
    { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, target && from ? target.width / from.width : 1] }) },
  ], [from, progress, target]);
  const logo = platformLogo(computer.platform ?? guessPlatform(computer.name, computer.host));
  return <View style={s.frame}>
    <Handoff.Provider value={moving ? { report } : undefined}>
      <Animated.View style={[s.frame, { opacity: done ? 1 : contentOpacity }]}>
        {children}
      </Animated.View>
    </Handoff.Provider>
    {moving && <Animated.View testID="connection-handoff" pointerEvents="none" accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants" aria-hidden style={[s.floating, {
        left: from.x - local.x, top: from.y - local.y, width: from.width, height: from.height,
        transformOrigin: '0% 0%', transform: travel,
      }]}>
      <FoundMachine width={from.width} motion={motion} logo={logo}
        screenOpacity={screenOpacity}
        screen={<ApprovalDisplay key={stage} stage={stage} scale={from.width / 252} />} />
    </Animated.View>}
  </View>;
}
const s = StyleSheet.create({ frame: { flex: 1 }, floating: { position: 'absolute' } });
