import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable,
  StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OnboardingHeaderBackdrop } from '../onboarding/OnboardingHeaderBackdrop';
import { useTheme } from '../theme';
import { Icon } from '../ui/primitives';

// Content mounted with the sheet holds its own entrance this long, so it rises once the sheet has
// mostly landed instead of moving inside a sheet that is still moving.
const OPENING_DELAY = 170;
const SheetDelay = createContext(0);
export const useSheetDelay = () => useContext(SheetDelay);

// One presentation on every platform: the page behind dims (and, given `presented`, eases back),
// the sheet springs up, and every way out — close, swipe down, back, finishing — plays it in reverse.
// The native pageSheet slid in differently on iOS and web and vanished in a frame on web.
export function ConnectionModal({ children, onClose, presented }: {
  children: (dismiss: () => void) => ReactNode; onClose: () => void; presented?: Animated.Value;
}) {
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wide = Platform.OS === 'web' && width >= 600;
  const own = useRef(new Animated.Value(0)).current;
  const shown = presented ?? own;
  const drag = useRef(new Animated.Value(0)).current;
  const [delay, setDelay] = useState(OPENING_DELAY);
  const reduced = useRef(false);
  const closing = useRef(false);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().catch(() => false).then(value => {
      if (!active) return;
      reduced.current = value;
      if (value) { shown.setValue(1); setDelay(0); return; }
      Animated.spring(shown, { toValue: 1, damping: 28, stiffness: 260, mass: 1, useNativeDriver: true,
        restDisplacementThreshold: 0.001, restSpeedThreshold: 0.001 }).start(() => { if (active) setDelay(0); });
    });
    return () => { active = false; };
  }, [shown]);
  const dismiss = () => {
    if (closing.current) return;
    closing.current = true;
    const done = () => { shown.setValue(0); close.current(); };
    if (reduced.current) { done(); return; }
    Animated.timing(shown, { toValue: 0, duration: 260, easing: Easing.in(Easing.cubic), useNativeDriver: true })
      .start(done);
  };
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;
  // Pulling the handle strip down follows the finger; far or fast enough closes, otherwise it springs back.
  const pull = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, move) => move.dy > 4 && Math.abs(move.dy) > Math.abs(move.dx),
    onPanResponderMove: (_, move) => drag.setValue(Math.max(0, move.dy)),
    onPanResponderRelease: (_, move) => {
      if (move.dy > 110 || move.vy > 0.9) dismissRef.current();
      else Animated.spring(drag, { toValue: 0, damping: 24, stiffness: 300, useNativeDriver: true }).start();
    },
    onPanResponderTerminate: () => Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start(),
  })).current;
  const pulled = drag.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolateLeft: 'clamp' });
  const scrim = Animated.multiply(shown, drag.interpolate({ inputRange: [0, height], outputRange: [1, 0.2], extrapolate: 'clamp' }));
  const motion = wide ? {
    opacity: shown,
    transform: [{ translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) },
      { scale: shown.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }],
  } : { transform: [{ translateY: Animated.add(shown.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }), pulled) }] };
  // The sheet runs past the bottom edge so a spring's last few points never open a gap under it.
  const frame = wide ? [s.wide, { height: Math.min(height - 48, 800) }]
    : [s.sheet, { top: Math.max(insets.top, 12) + 8, paddingBottom: insets.bottom + overscan }];
  return <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={dismiss}>
    <View style={[s.overlay, wide && s.centred]}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim, opacity: scrim }]}>
        {wide && <Pressable accessible={false} style={StyleSheet.absoluteFill} onPress={dismiss} />}
      </Animated.View>
      <Animated.View accessibilityViewIsModal role={Platform.OS === 'web' ? 'dialog' : undefined}
        aria-label="Connect your computer" aria-modal style={[s.frame, { backgroundColor: colors.background }, frame, motion]}>
        {/* The onboarding pages' drifting light, so the sheet reads as the next page of the same story. */}
        <View pointerEvents="none" style={s.backdrop}><OnboardingHeaderBackdrop /></View>
        <View style={s.navigation} {...(wide ? {} : pull.panHandlers)}>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden
            style={[s.handle, { backgroundColor: colors.border }]} />
          <Pressable accessibilityRole="button" accessibilityLabel="Close Connect your computer" onPress={dismiss}
            style={({ pressed }) => [s.closeTarget, { opacity: pressed ? 0.55 : 1 }]}>
            <View style={[s.close, { backgroundColor: colors.elevated }]}><Icon name="close" size={19} color={colors.muted} /></View>
          </Pressable>
        </View>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <SheetDelay.Provider value={delay}>{children(dismiss)}</SheetDelay.Provider>
        </KeyboardAvoidingView>
      </Animated.View>
    </View>
  </Modal>;
}
const overscan = 48;
const s = StyleSheet.create({
  overlay: { flex: 1 }, centred: { alignItems: 'center', justifyContent: 'center' },
  frame: { width: '100%', overflow: 'hidden' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: -overscan, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', alignItems: 'center' },
  wide: { maxWidth: 480, borderRadius: 32 },
  navigation: { height: 52, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 36, height: 5, borderRadius: 3, alignSelf: 'center' },
  closeTarget: { position: 'absolute', right: 16, top: 4, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  close: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});
